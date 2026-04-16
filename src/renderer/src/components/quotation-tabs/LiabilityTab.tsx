import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { Quotation, QuotationSubLimit, QuotationVessel, QuotationPIAlternative, PISectionTexts } from '../../../../shared/types'
import RichTextEditor from '../RichTextEditor'
import { ALT_COLORS } from './shared'

export default function LiabilityTab({ quotation, updateField, setQ, showSuccess, getEffectiveText }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; showSuccess: (m: string) => void; showError: (m: string) => void; getEffectiveText: (key: keyof PISectionTexts) => string }) {
    const [subLimits, setSubLimits] = useState<QuotationSubLimit[]>([])
    const [templates, setTemplates] = useState<import('../../../../shared/types').PISubLimitTemplate[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [piAlts, setPiAlts] = useState<QuotationPIAlternative[]>([])
    const [lolOptions, setLolOptions] = useState<{ id: string; label: string | null; amount: number; currency: string; premiumAmount: number | null; order: number }[]>([])
    const [newText, setNewText] = useState('')
    const [newAmount, setNewAmount] = useState('')
    const [newCurrency, setNewCurrency] = useState('USD')
    const [showStandardText, setShowStandardText] = useState(false)

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const [sl, tmpl, qv] = await Promise.all([
            window.api.getQuotationSubLimits(quotation.id),
            window.api.piGetSubLimitTemplates(),
            window.api.getQuotationVessels(quotation.id)
        ])
        setSubLimits(sl)
        setTemplates(Array.isArray(tmpl) ? tmpl : [])
        setQVessels(Array.isArray(qv) ? qv : [])
        if (quotation.quotationTypeCode === 'P') {
            const [alts, lolOpts] = await Promise.all([
                window.api.piGetQuotationAlternatives(quotation.id),
                window.api.lolGetOptions(quotation.id)
            ])
            setPiAlts(Array.isArray(alts) ? alts : [])
            setLolOptions(Array.isArray(lolOpts) ? lolOpts : [])
        }
    }

    const handleAddSubLimit = async () => {
        if (!newText.trim()) return
        await window.api.addQuotationSubLimit({ quotationId: quotation.id, text: newText, amount: parseFloat(newAmount) || 0, currency: newCurrency })
        setNewText(''); setNewAmount(''); setNewCurrency('USD')
        showSuccess('Sub-limit added')
        loadData()
    }

    const applyTemplate = (templateId: string) => {
        const t = templates.find(x => x.id === templateId)
        if (!t) return
        setNewText(t.textTemplate)
        setNewCurrency(t.defaultCurrency || 'USD')
        setNewAmount('')
    }

    // Standard text with placeholders replaced
    const resolvedStandardText = (quotation.sectionTextsOverride?.limitOfLiabilityDefaultText ?? getEffectiveText('limitOfLiabilityDefaultText'))
        .replace(/\{currency\}/g, quotation.limitOfLiabilityCurrency || 'USD')
        .replace(/\{amount\}/g, quotation.limitOfLiabilityAmount ? quotation.limitOfLiabilityAmount.toLocaleString() : '___')

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Limit of Liability</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Set the limit of liability and configure sub-limits if required.
            </p>
            {piAlts.length >= 2 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px', maxWidth: '600px' }}>
                    {piAlts.map((alt, idx) => (
                        <div key={alt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', borderLeft: `3px solid ${ALT_COLORS[idx % ALT_COLORS.length]}` }}>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: ALT_COLORS[idx % ALT_COLORS.length], minWidth: '140px' }}>
                                {alt.label || `Alternative ${idx + 1}`}
                            </label>
                            <input
                                type="text"
                                value={alt.lolCurrency || quotation.limitOfLiabilityCurrency || 'USD'}
                                onChange={e => {
                                    const val = e.target.value
                                    setPiAlts(prev => prev.map(a => a.id === alt.id ? { ...a, lolCurrency: val } : a))
                                }}
                                onBlur={e => window.api.piUpdateQuotationAlternative(alt.id, { lolCurrency: e.target.value || undefined })}
                                style={{ width: '60px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem', textAlign: 'center' }}
                            />
                            <input
                                type="number"
                                value={alt.lolAmount ?? ''}
                                onChange={e => {
                                    const val = e.target.value ? parseFloat(e.target.value) : undefined
                                    setPiAlts(prev => prev.map(a => a.id === alt.id ? { ...a, lolAmount: val } : a))
                                }}
                                onBlur={e => {
                                    const val = e.target.value ? parseFloat(e.target.value) : null
                                    window.api.piUpdateQuotationAlternative(alt.id, { lolAmount: val })
                                }}
                                placeholder="LOL Amount"
                                style={{ flex: 1, maxWidth: '200px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem', textAlign: 'right' }}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', maxWidth: '600px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Currency:</span>
                        <input type="text" value={quotation.limitOfLiabilityCurrency || 'USD'} onChange={e => { setQ(p => ({ ...p, limitOfLiabilityCurrency: e.target.value })) }} onBlur={e => updateField('limitOfLiabilityCurrency', e.target.value)} style={{ width: '70px' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Amount:</span>
                        <input type="number" value={quotation.limitOfLiabilityAmount || ''} onChange={e => { setQ(p => ({ ...p, limitOfLiabilityAmount: parseFloat(e.target.value) || undefined })) }} onBlur={e => updateField('limitOfLiabilityAmount', parseFloat(e.target.value) || null)} style={{ width: '180px' }} />
                    </div>
                </div>
            )}

            {/* LOL Alternatives */}
            {quotation.quotationTypeCode === 'P' && piAlts.length < 2 && (
                <div style={{ marginBottom: '20px' }}>
                    {lolOptions.length > 0 ? (
                        <>
                            {lolOptions.map((opt, idx) => (
                                <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', borderLeft: `3px solid ${ALT_COLORS[idx % ALT_COLORS.length]}` }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: ALT_COLORS[idx % ALT_COLORS.length], minWidth: '100px' }}>
                                        {opt.label || `Alternative ${idx + 1}`}
                                    </span>
                                    <input
                                        type="text"
                                        value={opt.currency}
                                        onChange={e => setLolOptions(prev => prev.map(o => o.id === opt.id ? { ...o, currency: e.target.value } : o))}
                                        onBlur={e => window.api.lolUpdateOption(opt.id, { currency: e.target.value })}
                                        style={{ width: '55px', fontSize: '0.85rem', textAlign: 'center' }}
                                    />
                                    <input
                                        type="number"
                                        value={opt.amount || ''}
                                        onChange={e => setLolOptions(prev => prev.map(o => o.id === opt.id ? { ...o, amount: parseFloat(e.target.value) || 0 } : o))}
                                        onBlur={e => window.api.lolUpdateOption(opt.id, { amount: parseFloat(e.target.value) || 0 })}
                                        placeholder="Amount"
                                        style={{ flex: 1, maxWidth: '200px', fontSize: '0.85rem', textAlign: 'right' }}
                                    />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Premium:</span>
                                    <input
                                        type="number"
                                        value={opt.premiumAmount ?? ''}
                                        onChange={e => setLolOptions(prev => prev.map(o => o.id === opt.id ? { ...o, premiumAmount: e.target.value ? parseFloat(e.target.value) : null } : o))}
                                        onBlur={e => window.api.lolUpdateOption(opt.id, { premiumAmount: e.target.value ? parseFloat(e.target.value) : null })}
                                        placeholder="—"
                                        style={{ width: '120px', fontSize: '0.85rem', textAlign: 'right' }}
                                    />
                                    <button onClick={async () => {
                                        await window.api.lolDeleteOption(opt.id)
                                        // If only one remains after delete, remove it too and restore to primary LOL
                                        const remaining = lolOptions.filter(o => o.id !== opt.id)
                                        if (remaining.length === 1) {
                                            updateField('limitOfLiabilityAmount', remaining[0].amount)
                                            updateField('limitOfLiabilityCurrency', remaining[0].currency)
                                            setQ(q => ({ ...q, limitOfLiabilityAmount: remaining[0].amount, limitOfLiabilityCurrency: remaining[0].currency }))
                                            await window.api.lolDeleteOption(remaining[0].id)
                                        }
                                        loadData()
                                    }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}><Trash2 size={14} /></button>
                                </div>
                            ))}
                            <button
                                onClick={async () => {
                                    await window.api.lolAddOption(quotation.id, 0, quotation.limitOfLiabilityCurrency || 'USD')
                                    loadData()
                                }}
                                className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}
                            >
                                <Plus size={13} /> Add Alternative
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={async () => {
                                // Convert primary LOL to Alternative 1, create empty Alternative 2
                                const currency = quotation.limitOfLiabilityCurrency || 'USD'
                                const amount = quotation.limitOfLiabilityAmount || 0
                                await window.api.lolAddOption(quotation.id, amount, currency, 'Alternative 1')
                                await window.api.lolAddOption(quotation.id, 0, currency, 'Alternative 2')
                                loadData()
                            }}
                            className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            <Plus size={14} /> Add LOL Alternative
                        </button>
                    )}
                </div>
            )}

            {qVessels.length >= 2 && (
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                        Per-Vessel Override (leave blank to use the amount above)
                    </label>
                    {qVessels.map(v => {
                        const va = quotation.limitOfLiabilityVesselAmounts || {}
                        const vesselAmount = va[v.id]
                        return (
                            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: '24px', color: 'var(--accent-primary)' }}>{v.vesselLabel}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(v.name || v.vesselLabel).toUpperCase()}</span>
                                <input
                                    type="number"
                                    value={vesselAmount ?? ''}
                                    placeholder={quotation.limitOfLiabilityAmount?.toLocaleString() || '0'}
                                    onChange={e => {
                                        const val = e.target.value ? parseFloat(e.target.value) : undefined
                                        const updated = { ...(quotation.limitOfLiabilityVesselAmounts || {}) }
                                        if (val !== undefined) updated[v.id] = val
                                        else delete updated[v.id]
                                        const newVal = Object.keys(updated).length > 0 ? updated : null
                                        setQ(p => ({ ...p, limitOfLiabilityVesselAmounts: newVal }))
                                        updateField('limitOfLiabilityVesselAmounts', newVal)
                                    }}
                                    style={{ width: '160px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem', textAlign: 'right' }}
                                />
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Standard text preview + override */}
            <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Standard Text Preview:</div>
                <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'var(--table-header-bg)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '8px' }}
                    dangerouslySetInnerHTML={{ __html: resolvedStandardText || '<em style="color:var(--text-secondary)">No standard text configured</em>' }}
                />
                <button
                    type="button"
                    onClick={() => setShowStandardText(!showStandardText)}
                    className="btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <Pencil size={12} /> {showStandardText ? 'Hide Editor' : 'Override Standard Text'}
                    {quotation.sectionTextsOverride?.limitOfLiabilityDefaultText && <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', marginLeft: '4px' }}>(customized)</span>}
                </button>
                {showStandardText && (
                    <div style={{ marginTop: '10px' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                            Use <code>{'{amount}'}</code> and <code>{'{currency}'}</code> placeholders. Changes apply to this quotation only.
                        </div>
                        <RichTextEditor
                            value={String(quotation.sectionTextsOverride?.limitOfLiabilityDefaultText ?? getEffectiveText('limitOfLiabilityDefaultText'))}
                            onChange={val => {
                                const override = { ...(quotation.sectionTextsOverride || {}), limitOfLiabilityDefaultText: val }
                                setQ(p => ({ ...p, sectionTextsOverride: override }))
                                updateField('sectionTextsOverride', override)
                            }}
                            minHeight={60}
                            showFontSize showAlignment showLineSpacing
                        />
                        {quotation.sectionTextsOverride?.limitOfLiabilityDefaultText && (
                            <button
                                type="button"
                                onClick={() => {
                                    const override = { ...(quotation.sectionTextsOverride || {}) }
                                    delete override.limitOfLiabilityDefaultText
                                    setQ(p => ({ ...p, sectionTextsOverride: override }))
                                    updateField('sectionTextsOverride', override)
                                    showSuccess('Reset to global default')
                                }}
                                className="btn-secondary"
                                style={{ marginTop: '6px', fontSize: '0.75rem', padding: '3px 10px', color: 'var(--danger)' }}
                            >
                                Reset to Default
                            </button>
                        )}
                    </div>
                )}
            </div>

            <h4 style={{ fontSize: '0.9rem', marginBottom: '10px' }}>Sub-Limits</h4>

            {templates.length > 0 && (
                <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>From template:</span>
                    <select
                        onChange={e => { if (e.target.value) { applyTemplate(e.target.value); e.target.value = '' } }}
                        style={{ flex: 1, maxWidth: '420px', padding: '6px 10px', borderRadius: '6px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)', fontSize: '0.83rem' }}
                    >
                        <option value="">Pick a template…</option>
                        {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.defaultCurrency} — {t.textTemplate}</option>
                        ))}
                    </select>
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="text" value={newText} onChange={e => setNewText(e.target.value)} placeholder="Sub-limit description..." style={{ flex: 1, minWidth: '200px' }} />
                <input type="text" value={newCurrency} onChange={e => setNewCurrency(e.target.value)} style={{ width: '70px' }} placeholder="USD" />
                <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="Amount" style={{ width: '140px' }} />
                <button onClick={handleAddSubLimit} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
            </div>
            {subLimits.map(sl => (
                <div key={sl.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ flex: 1, fontSize: '0.85rem' }}>{sl.currency} {sl.amount.toLocaleString()} — {sl.text}</span>
                    <button onClick={async () => { await window.api.deleteQuotationSubLimit(sl.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                </div>
            ))}
        </div>
    )
}
