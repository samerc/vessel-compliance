import { useState, useEffect } from 'react'
import { Quotation, QuotationInstalment, QuotationPIAlternative, QuotationHullAlternative, QuotationVessel, PISectionTexts, InstalmentDefaults, PremiumTextTemplate, HullClause, QuotationAgreedValueOption, WarSettings } from '../../../../shared/types'
import RichTextEditor from '../RichTextEditor'
import { stripHtml } from '../../utils/htmlToPdfText'
import { ALT_COLORS } from './shared'

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
    const loadInstalments = async () => { setInstalments(await window.api.getQuotationInstalments(quotation.id)) }
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

    const updateVesselPremium = async (vesselId: string, amount: number | null) => {
        await window.api.updateQuotationVessel(vesselId, { premiumAmount: amount as any })
        setQVessels(prev => prev.map(v => v.id === vesselId ? { ...v, premiumAmount: amount || undefined } : v))
        // Sync total to quotation
        const newTotal = qVessels.reduce((sum, v) => sum + (v.id === vesselId ? (amount || 0) : (v.premiumAmount || 0)), 0)
        setQ(p => ({ ...p, premiumAmount: newTotal || undefined }))
        updateField('premiumAmount', newTotal || null)
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
                                const s2Prem = v.warSection2Premium ?? Math.round(s2Amount * s2Rate / 100 * 100) / 100
                                return (
                                    <div key={v.id} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px' }}>{vName}</div>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: '80px' }}>Section 1:</span>
                                            <input type="number" value={v.warSection1Premium ?? (s1Prem || '')} onChange={e => setQVessels(prev => prev.map(qv => qv.id === v.id ? { ...qv, warSection1Premium: parseFloat(e.target.value) || undefined } : qv))} onBlur={e => window.api.updateQuotationVessel(v.id, { warSection1Premium: parseFloat(e.target.value) || null } as any)} placeholder={`Auto: ${s1Prem.toLocaleString()}`} style={{ width: '140px', fontSize: '0.85rem', textAlign: 'right' }} />
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: '80px' }}>Section 2:</span>
                                            <input type="number" value={v.warSection2Premium ?? (s2Prem || '')} onChange={e => setQVessels(prev => prev.map(qv => qv.id === v.id ? { ...qv, warSection2Premium: parseFloat(e.target.value) || undefined } : qv))} onBlur={e => window.api.updateQuotationVessel(v.id, { warSection2Premium: parseFloat(e.target.value) || null } as any)} placeholder={`Auto: ${s2Prem.toLocaleString()}`} style={{ width: '140px', fontSize: '0.85rem', textAlign: 'right' }} />
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>
                                    {quotation.quotationTypeCode === 'H' && quotation.ivEnabled ? 'Section A (H&M)' : quotation.quotationTypeCode === 'H' ? 'H&M' : premiumLabel}
                                </label>
                                <input type="number" value={quotation.premiumAmount || ''} onChange={e => setQ(p => ({ ...p, premiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('premiumAmount', parseFloat(e.target.value) || null)} placeholder="Amount" style={{ flex: 1, maxWidth: '200px' }} />
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                            </div>
                            {quotation.quotationTypeCode === 'H' && quotation.ivEnabled && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Section B (IV)</label>
                                    <input type="number" value={quotation.ivPremiumAmount || ''} onChange={e => setQ(p => ({ ...p, ivPremiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('ivPremiumAmount', parseFloat(e.target.value) || null)} placeholder="Amount" style={{ flex: 1, maxWidth: '200px' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
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
                        const s2Prem = v.warSection2Premium ?? Math.round(s2Amount * s2Rate / 100 * 100) / 100
                        return (
                            <div key={v.id} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px' }}>{vName}</div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: '80px' }}>Section 1:</span>
                                    <input type="number" value={v.warSection1Premium ?? (s1Prem || '')} onChange={e => setQVessels(prev => prev.map(qv => qv.id === v.id ? { ...qv, warSection1Premium: parseFloat(e.target.value) || undefined } : qv))} onBlur={e => window.api.updateQuotationVessel(v.id, { warSection1Premium: parseFloat(e.target.value) || null } as any)} placeholder={`Auto: ${s1Prem.toLocaleString()}`} style={{ width: '140px', fontSize: '0.85rem', textAlign: 'right' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: '80px' }}>Section 2:</span>
                                    <input type="number" value={v.warSection2Premium ?? (s2Prem || '')} onChange={e => setQVessels(prev => prev.map(qv => qv.id === v.id ? { ...qv, warSection2Premium: parseFloat(e.target.value) || undefined } : qv))} onBlur={e => window.api.updateQuotationVessel(v.id, { warSection2Premium: parseFloat(e.target.value) || null } as any)} placeholder={`Auto: ${s2Prem.toLocaleString()}`} style={{ width: '140px', fontSize: '0.85rem', textAlign: 'right' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Multi-vessel: per-vessel premium table (standard, non-war-excess) */}
            {isMultiVessel && !(quotation.quotationTypeCode === 'W' && quotation.warExcessEnabled) && (
                <div style={{ marginBottom: '16px' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '600px', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--table-border)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>Vessel</th>
                                <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>{premiumLabel} ({currency})</th>
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
                                        {hasDiscount && <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{vPrem > 0 ? vPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>}
                                    </tr>
                                )
                            })}
                            <tr style={{ fontWeight: 700 }}>
                                <td style={{ padding: '8px 10px' }}>Total</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{technicalPremium > 0 ? technicalPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
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
            )}

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

            {/* Instalment Schedule */}
            {instalments.length > 0 && (
                <div style={{ marginBottom: '20px', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
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

            {/* Additional premium instructions */}
            <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Additional premium instructions</label>
                <RichTextEditor value={quotation.premiumAdditionalText || ''} onChange={val => { setQ(p => ({ ...p, premiumAdditionalText: val })); updateField('premiumAdditionalText', val) }} minHeight={60} maxWidth="600px" showFontSize showAlignment showLineSpacing />
            </div>

        </div>
    )
}

