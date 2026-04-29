import { useState, useEffect, useRef } from 'react'
import { Quotation, QuotationInstalment, QuotationPIAlternative, QuotationHullAlternative, QuotationVessel, PISectionTexts, InstalmentDefaults, PremiumTextTemplate, HullClause, QuotationAgreedValueOption, WarSettings } from '../../../../shared/types'
import RichTextEditor from '../RichTextEditor'
import { stripHtml } from '../../utils/htmlToPdfText'
import { ALT_COLORS } from './shared'

/** Parse periodText to extract number of months. Returns null if unparseable. */
function parsePeriodMonths(text: string | undefined): number | null {
    if (!text) return null
    const t = text.toLowerCase().trim()
    // "12 months", "6 months from...", "3 months"
    const monthsMatch = t.match(/(\d+)\s*months?/)
    if (monthsMatch) return parseInt(monthsMatch[1])
    // "1 year", "2 years", "1 year 3 months"
    const yearMonthMatch = t.match(/(\d+)\s*years?\s*(?:(?:and\s*)?(\d+)\s*months?)?/)
    if (yearMonthMatch) {
        const years = parseInt(yearMonthMatch[1])
        const months = yearMonthMatch[2] ? parseInt(yearMonthMatch[2]) : 0
        return years * 12 + months
    }
    return null
}

export default function PremiumTab({ quotation, updateField, setQ, getEffectiveText }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean; getEffectiveText: (key: keyof PISectionTexts) => string }) {
    const [instalments, setInstalments] = useState<QuotationInstalment[]>([])
    const [instalmentDefaults, setInstalmentDefaults] = useState<InstalmentDefaults>({})
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [hullAlternatives, setHullAlternatives] = useState<QuotationHullAlternative[]>([])
    const [hullClauses, setHullClauses] = useState<HullClause[]>([])
    const [piAlternatives, setPiAlternatives] = useState<QuotationPIAlternative[]>([])
    const [ncbTemplates, setNcbTemplates] = useState<PremiumTextTemplate[]>([])
    const [upccTemplates, setUpccTemplates] = useState<PremiumTextTemplate[]>([])
    const [valueOptions, setValueOptions] = useState<QuotationAgreedValueOption[]>([])
    const [warSettings, setWarSettings] = useState<WarSettings | null>(null)
    const [lolOptions, setLolOptions] = useState<{ id: string; label: string | null; amount: number; currency: string; premiumAmount: number | null; order: number }[]>([])

    useEffect(() => {
        loadInstalments()
        loadVessels()
        window.api.piGetInstalmentDefaults().then(d => setInstalmentDefaults(d || {}))
        window.api.premiumGetTextTemplates().then(res => {
            const all = Array.isArray(res) ? res : []
            setNcbTemplates(all.filter(t => t.type === 'ncb'))
            setUpccTemplates(all.filter(t => t.type === 'upcc'))
        }).catch(() => {})
        if (quotation.quotationTypeCode === 'H') {
            window.api.hullGetQuotationAlternatives(quotation.id).then(a => setHullAlternatives(Array.isArray(a) ? a : []))
            window.api.hullGetClauses().then(c => setHullClauses(Array.isArray(c) ? c : []))
            window.api.hullGetAgreedValueOptions(quotation.id).then(o => setValueOptions(Array.isArray(o) ? o : [])).catch(() => {})
        }
        if (quotation.quotationTypeCode === 'P') {
            window.api.piGetQuotationAlternatives(quotation.id).then(a => setPiAlternatives(Array.isArray(a) ? a : []))
            window.api.lolGetOptions(quotation.id).then(o => setLolOptions(Array.isArray(o) ? o : [])).catch(() => {})
        }
        if (quotation.quotationTypeCode === 'W') {
            window.api.warGetSettings().then(s => { if (s && !(s as any).error) setWarSettings(s) }).catch(() => {})
        }
    }, [])
    const loadInstalments = async () => {
        const insts = await window.api.getQuotationInstalments(quotation.id)
        if (Array.isArray(insts) && insts.length === 0 && (quotation.numInstalments || 1) >= 1) {
            // Auto-create instalment records on first load
            await handleSaveInstalments(quotation.numInstalments || 1)
            return
        }
        setInstalments(insts)
    }
    const loadVessels = async () => { setQVessels(await window.api.getQuotationVessels(quotation.id)) }

    const updateAlternativePremium = async (altId: string, amount: number | null) => {
        await window.api.hullUpdateQuotationAlternative(altId, { premiumAmount: amount })
        setHullAlternatives(prev => prev.map(a => a.id === altId ? { ...a, premiumAmount: amount || undefined } : a))
        // Sync total to quotation
        const newTotal = hullAlternatives.reduce((sum, a) => sum + (a.id === altId ? (amount || 0) : (a.premiumAmount || 0)), 0)
        setQ(p => ({ ...p, premiumAmount: newTotal || undefined }))
        updateField('premiumAmount', newTotal || null)
    }

    const updatePIAlternativePremium = async (altId: string, amount: number | null) => {
        await window.api.piUpdateQuotationAlternative(altId, { premiumAmount: amount })
        setPiAlternatives(prev => prev.map(a => a.id === altId ? { ...a, premiumAmount: amount || undefined } : a))
    }

    const getDefaultDays = (count: number, index: number): number | undefined => {
        // 1: [0]  2: [0,180]  3: [0,120,240]  4: [0,90,180,270]  12: [0,30,60,...]
        const knownDefaults: Record<number, number[]> = {
            1: [0],
            2: [0, 180],
            3: [0, 120, 240],
            4: [0, 90, 180, 270],
            12: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
        }
        return knownDefaults[count]?.[index]
    }

    const handleSaveInstalments = async (count: number) => {
        const adminDays = instalmentDefaults[String(count)]
        const countChanged = count !== instalments.length
        const insts: { instalmentNumber: number; daysFromInception: number }[] = []
        for (let i = 0; i < count; i++) {
            if (countChanged) {
                // Count changed — always use admin defaults or hardcoded defaults
                insts.push({
                    instalmentNumber: i + 1,
                    daysFromInception: adminDays?.[i] ?? getDefaultDays(count, i) ?? 0
                })
            } else {
                // Count unchanged — preserve existing values
                const existing = instalments.find(inst => inst.instalmentNumber === i + 1)
                insts.push({
                    instalmentNumber: i + 1,
                    daysFromInception: existing?.daysFromInception ?? adminDays?.[i] ?? getDefaultDays(count, i) ?? 0
                })
            }
        }
        await window.api.setQuotationInstalments(quotation.id, insts)
        loadInstalments()

        // Auto-set non-refundable default based on instalment count
        if (!quotation.nonRefundableType) {
            if (count > 1) {
                setQ(p => ({ ...p, nonRefundableType: 'first_instalment', nonRefundablePercent: undefined }))
                updateField('nonRefundableType', 'first_instalment')
                updateField('nonRefundablePercent', null)
            } else {
                setQ(p => ({ ...p, nonRefundableType: 'percentage', nonRefundablePercent: 25 }))
                updateField('nonRefundableType', 'percentage')
                updateField('nonRefundablePercent', 25)
            }
        } else if (quotation.nonRefundableType === 'first_instalment' && count <= 1) {
            // Switch to percentage if only 1 instalment
            setQ(p => ({ ...p, nonRefundableType: 'percentage', nonRefundablePercent: 25 }))
            updateField('nonRefundableType', 'percentage')
            updateField('nonRefundablePercent', 25)
        }
    }

    // Pro-rata: auto-detect from periodText
    const isCargo = quotation.quotationTypeCode === 'C'
    const proRataDetectRan = useRef(false)
    useEffect(() => {
        if (isCargo || proRataDetectRan.current) return
        proRataDetectRan.current = true
        const months = parsePeriodMonths(quotation.periodText)
        if (months !== null && months < 12 && !quotation.isProRata) {
            setQ(p => ({ ...p, isProRata: true, proRataMonths: months }))
            updateField('isProRata', true)
            updateField('proRataMonths', months)
        } else if (months !== null && months >= 12 && quotation.isProRata && !quotation.annualPremiumAmount) {
            setQ(p => ({ ...p, isProRata: false }))
            updateField('isProRata', false)
        }
    }, [quotation.periodText])

    const proRataMonths = Math.max(0, quotation.proRataMonths || parsePeriodMonths(quotation.periodText) || 0)
    const computeProRata = (annual: number) => proRataMonths > 0 ? Math.round(annual / 12 * proRataMonths * 100) / 100 : 0

    const hasDiscount = quotation.ncbEnabled || quotation.upccEnabled
    const ncbType = quotation.ncbDiscountType || 'percentage'
    const ncbPct = quotation.ncbDiscountPercent || 0
    const ncbFixedAmt = quotation.ncbDiscountAmount || 0
    const upccType = quotation.upccDiscountType || 'percentage'
    const upccPct = quotation.upccDiscountPercent || 0
    const upccFixedAmt = quotation.upccDiscountAmount || 0
    const isMultiVessel = qVessels.length >= 2
    const technicalPremium = isMultiVessel
        ? qVessels.reduce((sum, v) => sum + (v.premiumAmount || 0), 0)
        : (quotation.premiumAmount || 0)
    const ncbDeduction = ncbType === 'amount' ? ncbFixedAmt : technicalPremium * ncbPct / 100
    const afterNcb = technicalPremium - ncbDeduction
    const upccDeduction = upccType === 'amount' ? upccFixedAmt : afterNcb * upccPct / 100
    const payablePremium = afterNcb - upccDeduction
    const premiumLabel = hasDiscount ? 'Technical Premium' : 'Premium'
    const currency = quotation.premiumCurrency || 'USD'

    const updateVesselPremium = async (vesselId: string, amount: number | null, field: string = 'premiumAmount') => {
        await window.api.updateQuotationVessel(vesselId, { [field]: amount } as any)
        setQVessels(prev => prev.map(v => v.id === vesselId ? { ...v, [field]: amount || undefined } : v))
        if (field === 'premiumAmount') {
            // Sync total to quotation
            const newTotal = qVessels.reduce((sum, v) => sum + (v.id === vesselId ? (amount || 0) : (v.premiumAmount || 0)), 0)
            setQ(p => ({ ...p, premiumAmount: newTotal || undefined }))
            updateField('premiumAmount', newTotal || null)
        }
    }

    const updateInstalment = async (index: number, field: string, value: any) => {
        const updated = [...instalments]
        ;(updated[index] as any)[field] = value
        await window.api.setQuotationInstalments(quotation.id, updated.map(i => ({
            instalmentNumber: i.instalmentNumber,
            daysFromInception: i.daysFromInception
        })))
        setInstalments(updated)
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Premium</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Configure premium amounts, discounts, instalments, and non-refundable terms.
            </p>

            {/* Single vessel: premium inputs */}
            {!isMultiVessel && (
                <div style={{ marginBottom: '16px' }}>
                    {/* P&I with multiple alternatives: per-alternative premium */}
                    {quotation.quotationTypeCode === 'P' && piAlternatives.length > 1 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            {piAlternatives.map((alt, idx) => {
                                const accentColor = ALT_COLORS[idx % ALT_COLORS.length]
                                return (
                                    <div key={alt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', borderLeft: `3px solid ${accentColor}` }}>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: accentColor, minWidth: '140px', whiteSpace: 'nowrap' }}>
                                            {alt.label || `Alt ${idx + 1}`}
                                        </label>
                                        <input type="number" value={alt.premiumAmount || ''} onChange={e => setPiAlternatives(prev => prev.map(a => a.id === alt.id ? { ...a, premiumAmount: parseFloat(e.target.value) || undefined } : a))} onBlur={e => updatePIAlternativePremium(alt.id, parseFloat(e.target.value) || null)} placeholder={premiumLabel} style={{ flex: 1, maxWidth: '200px' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                    </div>
                                )
                            })}
                        </div>
                    ) :
                    /* P&I with LOL alternatives (no full PI alternatives): per-LOL-option premium */
                    quotation.quotationTypeCode === 'P' && lolOptions.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            {lolOptions.map((opt, idx) => {
                                const accentColor = ALT_COLORS[idx % ALT_COLORS.length]
                                return (
                                    <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', borderLeft: `3px solid ${accentColor}` }}>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: accentColor, minWidth: '140px', whiteSpace: 'nowrap' }}>
                                            {opt.label || `Alternative ${idx + 1}`}
                                            <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: '0.72rem', marginLeft: '6px' }}>
                                                ({opt.currency} {opt.amount?.toLocaleString()})
                                            </span>
                                        </label>
                                        <input type="number" value={opt.premiumAmount ?? ''}
                                            onChange={e => setLolOptions(prev => prev.map(o => o.id === opt.id ? { ...o, premiumAmount: e.target.value ? parseFloat(e.target.value) : null } : o))}
                                            onBlur={e => window.api.lolUpdateOption(opt.id, { premiumAmount: e.target.value ? parseFloat(e.target.value) : null })}
                                            placeholder={premiumLabel} style={{ flex: 1, maxWidth: '200px' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{opt.currency || currency} p.a.</span>
                                    </div>
                                )
                            })}
                        </div>
                    ) :
                    /* Hull with multiple alternatives or per-vessel mode: per-alternative/vessel premium */
                    quotation.quotationTypeCode === 'H' && (hullAlternatives.length > 1 || hullAlternatives.some(a => a.vesselScopeId)) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            {hullAlternatives.map((alt, idx) => {
                                const clause = hullClauses.find(c => c.id === alt.hullClauseId)
                                const vessel = alt.vesselScopeId ? qVessels.find(v => v.id === alt.vesselScopeId) : null
                                const altColors = ['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']
                                const accentColor = altColors[idx % altColors.length]
                                const label = vessel
                                    ? `${(vessel.name || vessel.vesselLabel).toUpperCase()}${clause ? ` (${clause.code})` : ''}`
                                    : `Alt ${idx + 1}${clause ? ` (${clause.code})` : ''}`
                                return (
                                    <div key={alt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', borderLeft: `3px solid ${accentColor}` }}>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: accentColor, minWidth: '140px', whiteSpace: 'nowrap' }}>
                                            {label}
                                        </label>
                                        <input type="number" value={alt.premiumAmount || ''} onChange={e => setHullAlternatives(prev => prev.map(a => a.id === alt.id ? { ...a, premiumAmount: parseFloat(e.target.value) || undefined } : a))} onBlur={e => updateAlternativePremium(alt.id, parseFloat(e.target.value) || null)} placeholder={premiumLabel} style={{ flex: 1, maxWidth: '200px' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                    </div>
                                )
                            })}
                            {quotation.ivEnabled && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Increased Value</label>
                                    <input type="number" value={quotation.ivPremiumAmount || ''} onChange={e => setQ(p => ({ ...p, ivPremiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('ivPremiumAmount', parseFloat(e.target.value) || null)} placeholder={premiumLabel} style={{ flex: 1, maxWidth: '200px' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                </div>
                            )}
                        </div>
                    ) : valueOptions.length > 0 ? (
                        /* Value options replace Section A — each option has its own premium */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            {valueOptions.map((opt, idx) => (
                                <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px', whiteSpace: 'nowrap' }}>
                                        {opt.label || `Option ${idx + 1}`}
                                        <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: '0.72rem', marginLeft: '6px' }}>
                                            ({opt.currency} {opt.amount?.toLocaleString()})
                                        </span>
                                    </label>
                                    <input type="number" value={opt.premiumAmount ?? ''}
                                        onChange={e => setValueOptions(prev => prev.map(o => o.id === opt.id ? { ...o, premiumAmount: e.target.value ? parseFloat(e.target.value) : null } : o))}
                                        onBlur={e => window.api.hullUpdateAgreedValueOption(opt.id, { premiumAmount: e.target.value ? parseFloat(e.target.value) : null })}
                                        placeholder="Premium" style={{ flex: 1, maxWidth: '200px' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{opt.currency || currency} p.a.</span>
                                </div>
                            ))}
                            {quotation.quotationTypeCode === 'H' && quotation.ivEnabled && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Section B (IV)</label>
                                    <input type="number" value={quotation.ivPremiumAmount || ''} onChange={e => setQ(p => ({ ...p, ivPremiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('ivPremiumAmount', parseFloat(e.target.value) || null)} placeholder="Amount" style={{ flex: 1, maxWidth: '200px' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                </div>
                            )}
                        </div>
                    ) :
                    /* War with P&I Excess: per-vessel Section 1 + Section 2 premiums */
                    quotation.quotationTypeCode === 'W' && quotation.warExcessEnabled ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            {qVessels.map((v) => {
                                const vName = (v.name || v.vesselLabel).toUpperCase()
                                const s1Rate = quotation.premiumRate ?? warSettings?.defaultRate ?? 0
                                const s2Rate = quotation.warExcessRate ?? warSettings?.defaultExcessRate ?? 0
                                const s1Amount = v.agreedValue || quotation.agreedValue || 0
                                const s2Amount = v.warExcessAmount ?? quotation.warExcessAmount ?? 0
                                const s1Prem = v.warSection1Premium ?? Math.round(s1Amount * s1Rate / 100 * 100) / 100
                                const s2Prem = v.warSection2Premium ?? Math.round((s2Amount - s1Amount) * s2Rate / 100 * 100) / 100
                                return (
                                    <div key={v.id} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px' }}>{vName}</div>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: '80px' }}>Section 1:</span>
                                            <input type="number" value={v.warSection1Premium ?? (s1Prem || '')} onChange={e => setQVessels(prev => prev.map(qv => qv.id === v.id ? { ...qv, warSection1Premium: parseFloat(e.target.value) || undefined } : qv))} onBlur={e => window.api.updateQuotationVessel(v.id, { warSection1Premium: parseFloat(e.target.value) || null } as any)} placeholder={`Auto: ${s1Prem.toLocaleString()}`} style={{ width: '140px', fontSize: '0.85rem', textAlign: 'right' }} />
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                            {v.previousSection1Premium != null && <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>Previous: {currency} {v.previousSection1Premium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: '80px' }}>Section 2:</span>
                                            <input type="number" value={v.warSection2Premium ?? (s2Prem || '')} onChange={e => setQVessels(prev => prev.map(qv => qv.id === v.id ? { ...qv, warSection2Premium: parseFloat(e.target.value) || undefined } : qv))} onBlur={e => window.api.updateQuotationVessel(v.id, { warSection2Premium: parseFloat(e.target.value) || null } as any)} placeholder={`Auto: ${s2Prem.toLocaleString()}`} style={{ width: '140px', fontSize: '0.85rem', textAlign: 'right' }} />
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                            {v.previousSection2Premium != null && <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>Previous: {currency} {v.previousSection2Premium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : quotation.quotationTypeCode === 'C' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '80px' }}>Rate (%)</label>
                                <input type="number" step="0.0001" value={quotation.premiumRate ?? ''} onChange={e => {
                                    const rate = parseFloat(e.target.value) || undefined
                                    const insVal = quotation.insuredValueAmount || 0
                                    const calcPrem = rate && insVal ? Math.round(insVal * rate / 100 * 100) / 100 : undefined
                                    setQ(p => ({ ...p, premiumRate: rate, premiumAmount: calcPrem }))
                                }} onBlur={e => {
                                    const rate = parseFloat(e.target.value) || null
                                    updateField('premiumRate', rate)
                                    const insVal = quotation.insuredValueAmount || 0
                                    const calcPrem = rate && insVal ? Math.round(insVal * rate / 100 * 100) / 100 : null
                                    updateField('premiumAmount', calcPrem)
                                }} placeholder="e.g. 0.15" style={{ flex: 1, maxWidth: '140px' }} />
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', opacity: 0.6 }}>%</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '80px' }}>Premium</label>
                                <input type="number" value={quotation.premiumAmount || ''} onChange={e => setQ(p => ({ ...p, premiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('premiumAmount', parseFloat(e.target.value) || null)} placeholder="Calculated from rate" style={{ flex: 1, maxWidth: '200px' }} />
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency}</span>
                                {quotation.insuredValueAmount && quotation.premiumRate ? (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7 }}>({quotation.premiumRate}% of {currency} {quotation.insuredValueAmount.toLocaleString()})</span>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            {quotation.isProRata ? (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Annual Premium</label>
                                        <input type="number" value={quotation.annualPremiumAmount ?? ''} onChange={e => {
                                            const annual = parseFloat(e.target.value) || undefined
                                            const proRata = annual ? computeProRata(annual) : undefined
                                            setQ(p => ({ ...p, annualPremiumAmount: annual, premiumAmount: proRata }))
                                        }} onBlur={e => {
                                            const annual = parseFloat(e.target.value) || null
                                            updateField('annualPremiumAmount', annual)
                                            const proRata = annual ? computeProRata(annual) : null
                                            updateField('premiumAmount', proRata)
                                        }} placeholder="Full year amount" style={{ flex: 1, maxWidth: '200px' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                                            <label style={{ fontSize: '0.72rem', color: 'var(--danger)', whiteSpace: 'nowrap' }}>Previous:</label>
                                            <input type="number" value={quotation.previousPremiumAmount ?? ''} onChange={e => setQ(p => ({ ...p, previousPremiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('previousPremiumAmount', parseFloat(e.target.value) || null)} placeholder="—" style={{ width: '120px', fontSize: '0.78rem', color: 'var(--danger)' }} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', background: 'rgba(0,170,200,0.04)' }}>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Pro-Rata Premium</label>
                                        <input type="number" value={quotation.premiumAmount || ''} onChange={e => setQ(p => ({ ...p, premiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('premiumAmount', parseFloat(e.target.value) || null)} placeholder="Calculated" style={{ flex: 1, maxWidth: '200px' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency}</span>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7 }}>({proRataMonths} months)</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Period (months):</label>
                                        <input type="number" step="0.5" value={quotation.proRataMonths ?? ''} onChange={e => {
                                            const m = parseFloat(e.target.value) || undefined
                                            setQ(p => ({ ...p, proRataMonths: m }))
                                        }} onBlur={e => {
                                            const m = parseFloat(e.target.value) || null
                                            updateField('proRataMonths', m)
                                            if (m && quotation.annualPremiumAmount) {
                                                const proRata = Math.round(quotation.annualPremiumAmount / 12 * m * 100) / 100
                                                setQ(p => ({ ...p, premiumAmount: proRata }))
                                                updateField('premiumAmount', proRata)
                                            }
                                        }} style={{ width: '70px', padding: '4px 8px', fontSize: '0.82rem' }} />
                                        <button onClick={() => { setQ(p => ({ ...p, isProRata: false })); updateField('isProRata', false) }} style={{ fontSize: '0.72rem', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Disable pro-rata</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>
                                            {quotation.quotationTypeCode === 'H' && quotation.ivEnabled ? 'Section A (H&M)' : quotation.quotationTypeCode === 'H' ? 'H&M' : premiumLabel}
                                        </label>
                                        <input type="number" value={quotation.premiumAmount || ''} onChange={e => setQ(p => ({ ...p, premiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('premiumAmount', parseFloat(e.target.value) || null)} placeholder="Amount" style={{ flex: 1, maxWidth: '200px' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                                            <label style={{ fontSize: '0.72rem', color: 'var(--danger)', whiteSpace: 'nowrap' }}>Previous:</label>
                                            <input type="number" value={quotation.previousPremiumAmount ?? ''} onChange={e => setQ(p => ({ ...p, previousPremiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('previousPremiumAmount', parseFloat(e.target.value) || null)} placeholder="—" style={{ width: '120px', fontSize: '0.78rem', color: 'var(--danger)' }} />
                                        </div>
                                    </div>
                                    {quotation.quotationTypeCode === 'H' && quotation.ivEnabled && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Section B (IV)</label>
                                            <input type="number" value={quotation.ivPremiumAmount || ''} onChange={e => setQ(p => ({ ...p, ivPremiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('ivPremiumAmount', parseFloat(e.target.value) || null)} placeholder="Amount" style={{ flex: 1, maxWidth: '200px' }} />
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                        </div>
                                    )}
                                    <button onClick={() => { setQ(p => ({ ...p, isProRata: true, proRataMonths: parsePeriodMonths(quotation.periodText) || undefined })); updateField('isProRata', true); updateField('proRataMonths', parsePeriodMonths(quotation.periodText) || null) }} style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', alignSelf: 'flex-start' }}>Enable pro-rata premium</button>
                                </>
                            )}
                        </div>
                    )}

                </div>
            )}

            {/* Instalments (always visible) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '16px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Instalments</label>
                <input type="number" min={1} max={12} value={quotation.numInstalments || 1}
                    onChange={e => {
                        const raw = e.target.value
                        if (raw === '') { setQ(p => ({ ...p, numInstalments: undefined as any })); return }
                        const v = Math.max(1, Math.min(12, parseInt(raw) || 1))
                        setQ(p => ({ ...p, numInstalments: v }))
                        updateField('numInstalments', v)
                        handleSaveInstalments(v)
                    }}
                    style={{ width: '80px' }}
                />
            </div>

            {/* Instalment Schedule (right after count) */}
            {instalments.length > 0 && (
                <div style={{ marginBottom: '16px', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Instalment Schedule</h4>
                    {instalments.map((inst, i) => (
                        <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, width: '30px' }}>#{inst.instalmentNumber}</span>
                            <input type="number" value={inst.daysFromInception} onChange={e => updateInstalment(i, 'daysFromInception', parseInt(e.target.value) || 0)} style={{ width: '80px', padding: '4px 6px' }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>days from inception</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Multi-vessel: war excess per-vessel Section 1 + Section 2 */}
            {isMultiVessel && quotation.quotationTypeCode === 'W' && quotation.warExcessEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                    {qVessels.map((v) => {
                        const vName = (v.name || v.vesselLabel).toUpperCase()
                        const s1Rate = quotation.premiumRate ?? warSettings?.defaultRate ?? 0
                        const s2Rate = quotation.warExcessRate ?? warSettings?.defaultExcessRate ?? 0
                        const s1Amount = v.agreedValue || quotation.agreedValue || 0
                        const s2Amount = v.warExcessAmount ?? quotation.warExcessAmount ?? 0
                        const s1Prem = v.warSection1Premium ?? Math.round(s1Amount * s1Rate / 100 * 100) / 100
                        const s2Prem = v.warSection2Premium ?? Math.round((s2Amount - s1Amount) * s2Rate / 100 * 100) / 100
                        return (
                            <div key={v.id} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px' }}>{vName}</div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: '80px' }}>Section 1:</span>
                                    <input type="number" value={v.warSection1Premium ?? (s1Prem || '')} onChange={e => setQVessels(prev => prev.map(qv => qv.id === v.id ? { ...qv, warSection1Premium: parseFloat(e.target.value) || undefined } : qv))} onBlur={e => window.api.updateQuotationVessel(v.id, { warSection1Premium: parseFloat(e.target.value) || null } as any)} placeholder={`Auto: ${s1Prem.toLocaleString()}`} style={{ width: '140px', fontSize: '0.85rem', textAlign: 'right' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                    {v.previousSection1Premium != null && <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>Previous: {currency} {v.previousSection1Premium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: '80px' }}>Section 2:</span>
                                    <input type="number" value={v.warSection2Premium ?? (s2Prem || '')} onChange={e => setQVessels(prev => prev.map(qv => qv.id === v.id ? { ...qv, warSection2Premium: parseFloat(e.target.value) || undefined } : qv))} onBlur={e => window.api.updateQuotationVessel(v.id, { warSection2Premium: parseFloat(e.target.value) || null } as any)} placeholder={`Auto: ${s2Prem.toLocaleString()}`} style={{ width: '140px', fontSize: '0.85rem', textAlign: 'right' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                    {v.previousSection2Premium != null && <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>Previous: {currency} {v.previousSection2Premium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Multi-vessel: per-vessel premium table (standard, non-war-excess) */}
            {isMultiVessel && !(quotation.quotationTypeCode === 'W' && quotation.warExcessEnabled) && (() => {
                return (
                <div style={{ marginBottom: '16px' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '700px', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--table-border)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>Vessel</th>
                                <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>{premiumLabel} ({currency})</th>
                                <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--danger)', fontWeight: 500 }}>Previous</th>
                                {hasDiscount && <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>Payable ({currency})</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {qVessels.map(v => {
                                const vPrem = v.premiumAmount || 0
                                const vNcbDed = ncbType === 'amount' ? ncbFixedAmt : vPrem * ncbPct / 100
                                const vAfterNcb = vPrem - vNcbDed
                                const vUpccDed = upccType === 'amount' ? upccFixedAmt : vAfterNcb * upccPct / 100
                                const vPayable = vAfterNcb - vUpccDed
                                return (
                                    <tr key={v.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 600, textTransform: 'uppercase' }}>{v.name || v.vesselLabel}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                            <input type="number" value={v.premiumAmount || ''} onChange={e => setQVessels(prev => prev.map(pv => pv.id === v.id ? { ...pv, premiumAmount: parseFloat(e.target.value) || undefined } : pv))} onBlur={e => updateVesselPremium(v.id, parseFloat(e.target.value) || null)} style={{ width: '130px', padding: '3px 6px', textAlign: 'right' }} />
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                            <input type="number" value={v.previousPremium ?? ''} onChange={e => setQVessels(prev => prev.map(pv => pv.id === v.id ? { ...pv, previousPremium: parseFloat(e.target.value) || undefined } : pv))} onBlur={e => updateVesselPremium(v.id, parseFloat(e.target.value) || null, 'previousPremium')} placeholder="—" style={{ width: '100px', padding: '3px 6px', textAlign: 'right', fontSize: '0.78rem', color: 'var(--danger)' }} />
                                        </td>
                                        {hasDiscount && <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{vPrem > 0 ? vPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>}
                                    </tr>
                                )
                            })}
                            <tr style={{ fontWeight: 700 }}>
                                <td style={{ padding: '8px 10px' }}>Total</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{technicalPremium > 0 ? technicalPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                                <td />
                                {hasDiscount && <td style={{ padding: '8px 10px', textAlign: 'right' }}>{technicalPremium > 0 ? payablePremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>}
                            </tr>
                        </tbody>
                    </table>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Instalments</label>
                        <input type="number" min={1} max={12} value={quotation.numInstalments || 1}
                            onChange={e => {
                                const v = parseInt(e.target.value) || 1
                                setQ(p => ({ ...p, numInstalments: v }))
                                updateField('numInstalments', v)
                                handleSaveInstalments(v)
                            }}
                            style={{ width: '80px' }}
                        />
                    </div>
                </div>
            )})()}

            {/* Payable Premium summary (single vessel only) */}
            {!isMultiVessel && hasDiscount && technicalPremium > 0 && (() => {
                const computePayable = (tech: number) => {
                    const nd = ncbType === 'amount' ? ncbFixedAmt : tech * ncbPct / 100
                    const an = tech - nd
                    const ud = upccType === 'amount' ? upccFixedAmt : an * upccPct / 100
                    return an - ud
                }
                const discountLabel = (quotation.ncbEnabled ? (ncbType === 'amount' ? `NCB ${currency} ${ncbFixedAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `NCB ${ncbPct}%`) : '') + (quotation.ncbEnabled && quotation.upccEnabled ? ' + ' : '') + (quotation.upccEnabled ? (upccType === 'amount' ? `UPCC ${currency} ${upccFixedAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `UPCC ${upccPct}%`) : '')
                const hullMultiAlt = quotation.quotationTypeCode === 'H' && (hullAlternatives.length > 1 || hullAlternatives.some(a => a.vesselScopeId))
                const piMultiAlt = quotation.quotationTypeCode === 'P' && piAlternatives.length > 1
                const anyMultiAlt = hullMultiAlt || piMultiAlt || valueOptions.length > 0
                const altColors = ['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']
                const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                return (
                    <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(0, 210, 255, 0.06)', border: '1px solid rgba(0, 210, 255, 0.15)' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: anyMultiAlt ? '8px' : '0' }}>
                            Payable Premium ({discountLabel})
                        </div>
                        {valueOptions.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {valueOptions.map((opt, idx) => (
                                    <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>
                                            {opt.label || `Option ${idx + 1}`}
                                        </span>
                                        <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{currency} {fmt(computePayable(opt.premiumAmount || 0))}</span>
                                    </div>
                                ))}
                                {quotation.ivEnabled && quotation.ivPremiumAmount != null && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Increased Value</span>
                                        <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{currency} {fmt(computePayable(quotation.ivPremiumAmount || 0))}</span>
                                    </div>
                                )}
                            </div>
                        ) : piMultiAlt ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {piAlternatives.map((alt, idx) => (
                                    <div key={alt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: altColors[idx % altColors.length], minWidth: '140px' }}>
                                            {alt.label || `Alt ${idx + 1}`}
                                        </span>
                                        <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{currency} {fmt(computePayable(alt.premiumAmount || 0))}</span>
                                    </div>
                                ))}
                            </div>
                        ) : hullMultiAlt ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {hullAlternatives.map((alt, idx) => {
                                    const clause = hullClauses.find(c => c.id === alt.hullClauseId)
                                    const vessel = alt.vesselScopeId ? qVessels.find(v => v.id === alt.vesselScopeId) : null
                                    const altLabel = vessel
                                        ? `${(vessel.name || vessel.vesselLabel).toUpperCase()}${clause ? ` (${clause.code})` : ''}`
                                        : `Alt ${idx + 1}${clause ? ` (${clause.code})` : ''}`
                                    return (
                                        <div key={alt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: altColors[idx % altColors.length], minWidth: '140px' }}>
                                                {altLabel}
                                            </span>
                                            <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{currency} {fmt(computePayable(alt.premiumAmount || 0))}</span>
                                        </div>
                                    )
                                })}
                                {quotation.ivEnabled && quotation.ivPremiumAmount != null && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Increased Value</span>
                                        <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{currency} {fmt(computePayable(quotation.ivPremiumAmount || 0))}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{currency} {fmt(payablePremium)}</span>
                        )}
                    </div>
                )
            })()}

            {/* Discounts: NCB and UPCC */}
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div style={{ padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)', flex: '1 1 260px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '8px' }}>
                        <input type="checkbox" checked={quotation.ncbEnabled} onChange={e => {
                            const enabling = e.target.checked
                            setQ(p => ({ ...p, ncbEnabled: enabling }))
                            updateField('ncbEnabled', enabling)
                            if (enabling && !quotation.ncbText) {
                                const def = getEffectiveText('ncbDefaultText')
                                if (def) { setQ(p => ({ ...p, ncbText: def })); updateField('ncbText', def) }
                            }
                        }} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                        <span style={{ fontWeight: 600 }}>No Claims Bonus (NCB)</span>
                    </label>
                    {quotation.ncbEnabled && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input type="radio" name="ncbType" checked={ncbType === 'percentage'} onChange={() => { setQ(p => ({ ...p, ncbDiscountType: 'percentage' })); updateField('ncbDiscountType', 'percentage') }} style={{ accentColor: 'var(--accent-primary)' }} />
                                    Percentage
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input type="radio" name="ncbType" checked={ncbType === 'amount'} onChange={() => { setQ(p => ({ ...p, ncbDiscountType: 'amount' })); updateField('ncbDiscountType', 'amount') }} style={{ accentColor: 'var(--accent-primary)' }} />
                                    Fixed Amount
                                </label>
                            </div>
                            {ncbType === 'percentage' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem' }}>Discount:</span>
                                    <input type="number" min={0} max={100} step={0.1} value={quotation.ncbDiscountPercent || ''} onChange={e => setQ(p => ({ ...p, ncbDiscountPercent: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('ncbDiscountPercent', parseFloat(e.target.value) || null)} style={{ width: '70px', padding: '3px 6px' }} />
                                    <span style={{ fontSize: '0.8rem' }}>%</span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem' }}>Amount:</span>
                                    <span style={{ fontSize: '0.8rem' }}>{currency}</span>
                                    <input type="number" min={0} step={0.01} value={quotation.ncbDiscountAmount || ''} onChange={e => setQ(p => ({ ...p, ncbDiscountAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('ncbDiscountAmount', parseFloat(e.target.value) || null)} style={{ width: '120px', padding: '3px 6px' }} />
                                </div>
                            )}
                            <div style={{ marginBottom: '6px' }}>
                                    <select
                                        value=""
                                        onChange={e => {
                                            const tpl = ncbTemplates.find(t => t.id === e.target.value)
                                            if (tpl) {
                                                setQ(p => ({ ...p, ncbText: tpl.text }))
                                                updateField('ncbText', tpl.text)
                                            }
                                        }}
                                        style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.84rem', width: '100%' }}
                                    >
                                        <option value="">{ncbTemplates.length > 0 ? 'Load from template...' : 'No templates — create in Quotation Settings → NCB / UPCC'}</option>
                                        {ncbTemplates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            <RichTextEditor value={quotation.ncbText || ''} onChange={val => { setQ(p => ({ ...p, ncbText: val })); updateField('ncbText', val) }} placeholder="NCB terms text..." minHeight={120} showFontSize showFontFamily showAlignment showLineSpacing />
                        </div>
                    )}
                </div>
                <div style={{ padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)', flex: '1 1 260px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '8px' }}>
                        <input type="checkbox" checked={quotation.upccEnabled} onChange={e => {
                            const enabling = e.target.checked
                            setQ(p => ({ ...p, upccEnabled: enabling }))
                            updateField('upccEnabled', enabling)
                            if (enabling && !quotation.upccText) {
                                const def = getEffectiveText('upccDefaultText')
                                if (def) { setQ(p => ({ ...p, upccText: def })); updateField('upccText', def) }
                            }
                        }} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                        <span style={{ fontWeight: 600 }}>Upfront Continuity (UPCC)</span>
                    </label>
                    {quotation.upccEnabled && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input type="radio" name="upccType" checked={upccType === 'percentage'} onChange={() => { setQ(p => ({ ...p, upccDiscountType: 'percentage' })); updateField('upccDiscountType', 'percentage') }} style={{ accentColor: 'var(--accent-primary)' }} />
                                    Percentage
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input type="radio" name="upccType" checked={upccType === 'amount'} onChange={() => { setQ(p => ({ ...p, upccDiscountType: 'amount' })); updateField('upccDiscountType', 'amount') }} style={{ accentColor: 'var(--accent-primary)' }} />
                                    Fixed Amount
                                </label>
                            </div>
                            {upccType === 'percentage' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem' }}>Discount:</span>
                                    <input type="number" min={0} max={100} step={0.1} value={quotation.upccDiscountPercent || ''} onChange={e => setQ(p => ({ ...p, upccDiscountPercent: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('upccDiscountPercent', parseFloat(e.target.value) || null)} style={{ width: '70px', padding: '3px 6px' }} />
                                    <span style={{ fontSize: '0.8rem' }}>%</span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem' }}>Amount:</span>
                                    <span style={{ fontSize: '0.8rem' }}>{currency}</span>
                                    <input type="number" min={0} step={0.01} value={quotation.upccDiscountAmount || ''} onChange={e => setQ(p => ({ ...p, upccDiscountAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('upccDiscountAmount', parseFloat(e.target.value) || null)} style={{ width: '120px', padding: '3px 6px' }} />
                                </div>
                            )}
                            <div style={{ marginBottom: '6px' }}>
                                    <select
                                        value=""
                                        onChange={e => {
                                            const tpl = upccTemplates.find(t => t.id === e.target.value)
                                            if (tpl) {
                                                setQ(p => ({ ...p, upccText: tpl.text }))
                                                updateField('upccText', tpl.text)
                                            }
                                        }}
                                        style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.84rem', width: '100%' }}
                                    >
                                        <option value="">{upccTemplates.length > 0 ? 'Load from template...' : 'No templates — create in Quotation Settings → NCB / UPCC'}</option>
                                        {upccTemplates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            <RichTextEditor value={quotation.upccText || ''} onChange={val => { setQ(p => ({ ...p, upccText: val })); updateField('upccText', val) }} placeholder="UPCC terms text..." minHeight={120} showFontSize showFontFamily showAlignment showLineSpacing />
                        </div>
                    )}
                </div>
            </div>

            {/* Instalment Schedule moved up — right after count input */}

            {/* Non-refundable option — below instalment schedule */}
            <div style={{ marginBottom: '20px', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '10px' }}>Non-Refundable</h4>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input type="radio" name="nonRefundable" checked={!quotation.nonRefundableType} onChange={() => { setQ(p => ({ ...p, nonRefundableType: null, nonRefundablePercent: undefined })); updateField('nonRefundableType', null); updateField('nonRefundablePercent', null) }} style={{ accentColor: 'var(--accent-primary)' }} />
                        None
                    </label>
                    {(quotation.numInstalments || 1) > 1 && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                            <input type="radio" name="nonRefundable" checked={quotation.nonRefundableType === 'first_instalment'} onChange={() => {
                                const defaultText = quotation.sectionTextsOverride?.nonRefundableFirstText ?? getEffectiveText('nonRefundableFirstText')
                                setQ(p => ({ ...p, nonRefundableType: 'first_instalment', nonRefundablePercent: undefined, sectionTextsOverride: { ...(p.sectionTextsOverride || {}), nonRefundableFirstText: p.sectionTextsOverride?.nonRefundableFirstText || defaultText } }))
                                updateField('nonRefundableType', 'first_instalment')
                                updateField('nonRefundablePercent', null)
                                if (!quotation.sectionTextsOverride?.nonRefundableFirstText) {
                                    const override = { ...(quotation.sectionTextsOverride || {}), nonRefundableFirstText: defaultText }
                                    updateField('sectionTextsOverride', override)
                                }
                            }} style={{ accentColor: 'var(--accent-primary)' }} />
                            1st instalment is non-refundable
                        </label>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input type="radio" name="nonRefundable" checked={quotation.nonRefundableType === 'percentage'} onChange={() => {
                            const defaultText = quotation.sectionTextsOverride?.nonRefundablePercentText ?? getEffectiveText('nonRefundablePercentText')
                            setQ(p => ({ ...p, nonRefundableType: 'percentage', nonRefundablePercent: quotation.nonRefundablePercent || 25, sectionTextsOverride: { ...(p.sectionTextsOverride || {}), nonRefundablePercentText: p.sectionTextsOverride?.nonRefundablePercentText || defaultText } }))
                            updateField('nonRefundableType', 'percentage')
                            if (!quotation.nonRefundablePercent) updateField('nonRefundablePercent', 25)
                            if (!quotation.sectionTextsOverride?.nonRefundablePercentText) {
                                const override = { ...(quotation.sectionTextsOverride || {}), nonRefundablePercentText: defaultText }
                                updateField('sectionTextsOverride', override)
                            }
                        }} style={{ accentColor: 'var(--accent-primary)' }} />
                        Percentage of premium
                    </label>
                    {quotation.nonRefundableType === 'percentage' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input type="number" min={0} max={100} step={0.1} value={quotation.nonRefundablePercent || ''} onChange={e => setQ(p => ({ ...p, nonRefundablePercent: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('nonRefundablePercent', parseFloat(e.target.value) || null)} style={{ width: '70px', padding: '3px 6px' }} />
                            <span style={{ fontSize: '0.8rem' }}>%</span>
                        </div>
                    )}
                </div>
                {quotation.nonRefundableType && (
                    <div style={{ marginTop: '10px' }}>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Non-refundable sentence (appears in export after 1st instalment)</label>
                        <textarea
                            value={quotation.nonRefundableType === 'first_instalment'
                                ? stripHtml(quotation.sectionTextsOverride?.nonRefundableFirstText ?? getEffectiveText('nonRefundableFirstText'))
                                : stripHtml(quotation.sectionTextsOverride?.nonRefundablePercentText ?? getEffectiveText('nonRefundablePercentText')).replace(/\{percent\}/g, String(quotation.nonRefundablePercent || '___'))
                            }
                            onChange={e => {
                                const key = quotation.nonRefundableType === 'first_instalment' ? 'nonRefundableFirstText' : 'nonRefundablePercentText'
                                const override = { ...(quotation.sectionTextsOverride || {}), [key]: e.target.value }
                                setQ(p => ({ ...p, sectionTextsOverride: override }))
                            }}
                            onBlur={e => {
                                const key = quotation.nonRefundableType === 'first_instalment' ? 'nonRefundableFirstText' : 'nonRefundablePercentText'
                                const override = { ...(quotation.sectionTextsOverride || {}), [key]: e.target.value }
                                updateField('sectionTextsOverride', override)
                            }}
                            style={{ width: '100%', maxWidth: '600px', minHeight: '40px', resize: 'vertical', fontSize: '0.82rem', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                        />
                        {quotation.nonRefundableType === 'percentage' && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Use {'{percent}'} as placeholder for the percentage value</div>
                        )}
                    </div>
                )}
            </div>

            {/* Outstanding premium notice */}
            <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', marginBottom: quotation.outstandingPremiumEnabled ? '10px' : '0' }}>
                    <input type="checkbox" checked={quotation.outstandingPremiumEnabled || false}
                        onChange={async e => {
                            const enabled = e.target.checked
                            setQ(p => ({ ...p, outstandingPremiumEnabled: enabled }))
                            updateField('outstandingPremiumEnabled', enabled)
                            if (enabled && !quotation.outstandingPremiumText) {
                                try {
                                    // Check quotation standard texts first, then policy settings, then hardcoded default
                                    const [globalTexts, policyRaw] = await Promise.all([
                                        window.api.piGetSectionTexts(),
                                        window.api.getSetting('policyExportSettings')
                                    ])
                                    const qDefault = (Array.isArray(globalTexts) ? globalTexts : []).find((t: any) => t.key === 'outstandingPremiumDefaultText')?.value
                                    const pDefault = policyRaw ? JSON.parse(policyRaw).outstandingPremiumDefaultText : null
                                    const text = qDefault || pDefault || 'All outstanding premium to be settled prior inception'
                                    setQ(p => ({ ...p, outstandingPremiumText: text }))
                                    updateField('outstandingPremiumText', text)
                                } catch {}
                            }
                        }}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }} />
                    Outstanding premium notice
                </label>
                {quotation.outstandingPremiumEnabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input type="text" value={quotation.outstandingPremiumText || ''} onChange={e => setQ(p => ({ ...p, outstandingPremiumText: e.target.value }))} onBlur={e => updateField('outstandingPremiumText', e.target.value)} placeholder="All outstanding premium to be settled prior inception" style={{ width: '100%', maxWidth: '600px' }} />
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                <input type="checkbox" checked={quotation.outstandingPremiumBold !== false} onChange={e => { setQ(p => ({ ...p, outstandingPremiumBold: e.target.checked })); updateField('outstandingPremiumBold', e.target.checked) }} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                                Bold
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                <input type="checkbox" checked={quotation.outstandingPremiumUnderline !== false} onChange={e => { setQ(p => ({ ...p, outstandingPremiumUnderline: e.target.checked })); updateField('outstandingPremiumUnderline', e.target.checked) }} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                                Underline
                            </label>
                        </div>
                    </div>
                )}
            </div>

            {/* Full premium in case of loss */}
            {!isCargo && (
            <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', marginBottom: quotation.fullPremiumLossEnabled ? '10px' : '0' }}>
                    <input type="checkbox" checked={quotation.fullPremiumLossEnabled || false}
                        onChange={async e => {
                            const enabled = e.target.checked
                            setQ(p => ({ ...p, fullPremiumLossEnabled: enabled }))
                            updateField('fullPremiumLossEnabled', enabled)
                            if (enabled && !quotation.fullPremiumLossText) {
                                try {
                                    const [globalTexts, policyRaw] = await Promise.all([
                                        window.api.piGetSectionTexts(),
                                        window.api.getSetting('policyExportSettings')
                                    ])
                                    const qDefault = (Array.isArray(globalTexts) ? globalTexts : []).find((t: any) => t.key === 'fullPremiumLossDefaultText')?.value
                                    const pDefault = policyRaw ? JSON.parse(policyRaw).fullPremiumLossDefaultText : null
                                    const text = qDefault || pDefault || 'Full annual premium payable in case of loss.'
                                    setQ(p => ({ ...p, fullPremiumLossText: text }))
                                    updateField('fullPremiumLossText', text)
                                } catch {}
                            }
                        }}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }} />
                    Full premium in case of loss
                </label>
                {quotation.fullPremiumLossEnabled && (
                    <input type="text" value={quotation.fullPremiumLossText || ''} onChange={e => setQ(p => ({ ...p, fullPremiumLossText: e.target.value }))} onBlur={e => updateField('fullPremiumLossText', e.target.value)} placeholder="Full annual premium payable in case of loss." style={{ width: '100%', maxWidth: '600px' }} />
                )}
            </div>
            )}

            {/* Additional premium instructions */}
            <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Additional premium instructions</label>
                <RichTextEditor value={quotation.premiumAdditionalText || ''} onChange={val => { setQ(p => ({ ...p, premiumAdditionalText: val })); updateField('premiumAdditionalText', val) }} minHeight={60} maxWidth="600px" showFontSize showAlignment showLineSpacing />
            </div>

        </div>
    )
}

