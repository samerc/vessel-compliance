import { useState, useEffect, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { Quotation, QuotationExcludedCountry, QuotationVessel, PISectionTexts, TradingWarrantyTemplate, TradingCustomText } from '../../../../shared/types'
import RichTextEditor from '../RichTextEditor'
import { stripHtml } from '../../utils/htmlToPdfText'
interface TradingIntro { id: string; quotationId: string; text: string; vesselScope: string[] | null; order: number }

export default function TradingTab({ quotation, showSuccess, updateField, setQ, getEffectiveText }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; getEffectiveText: (key: keyof PISectionTexts) => string }) {
    const [countries, setCountries] = useState<QuotationExcludedCountry[]>([])
    const [templates, setTemplates] = useState<TradingWarrantyTemplate[]>([])
    const [customTexts, setCustomTexts] = useState<TradingCustomText[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [tradingIntros, setTradingIntros] = useState<TradingIntro[]>([])
    const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null) // null = all vessels
    const initRef = useRef(false)
    const [newCountryName, setNewCountryName] = useState('')
    const [newCountryType, setNewCountryType] = useState<'excluded' | 'ddq'>('excluded')

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [qc, masterCountries, tpls, custTexts, qv, intros] = await Promise.all([
            window.api.getQuotationExcludedCountries(quotation.id),
            window.api.piGetTradingExcludedCountries(),
            window.api.piGetTradingWarrantyTemplates(),
            window.api.piGetTradingCustomTexts(),
            window.api.getQuotationVessels(quotation.id),
            window.api.tradingGetIntros(quotation.id)
        ])
        setQVessels(Array.isArray(qv) ? qv : [])
        setTradingIntros(Array.isArray(intros) ? intros : [])
        setCustomTexts(Array.isArray(custTexts) ? custTexts : [])
        setTemplates(Array.isArray(tpls) ? tpls : [])
        // Deduplicate by name+listType (legacy data may have duplicates)
        const seen = new Set<string>()
        const deduped = qc.filter(c => {
            const key = `${c.name}|${c.listType}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
        if (deduped.length < qc.length) {
            await window.api.setQuotationExcludedCountries(quotation.id, deduped.map(c => ({ name: c.name, listType: c.listType })))
            const refreshed = await window.api.getQuotationExcludedCountries(quotation.id)
            setCountries(refreshed)
            return
        }
        setCountries(qc)
        if (qc.length === 0 && masterCountries.length > 0 && !initRef.current) {
            initRef.current = true
            const typeCode = quotation.quotationTypeCode || 'P'
            // Filter master countries by exclude_types: null = all types, otherwise check type code
            const typeFiltered = masterCountries.filter((c: any) => {
                if (!c.excludeTypes) return true // null = applies to all types
                return c.excludeTypes.split(',').includes(typeCode)
            })
            // Check for type-specific default excluded countries (legacy app_settings override)
            let countriesToSet: { name: string; listType: string }[] = typeFiltered
            try {
                const typeDefaultsRaw = await window.api.getSetting(`default_excluded_countries_${typeCode}`)
                if (typeDefaultsRaw) {
                    const typeDefaults: { name: string; listType: string }[] = JSON.parse(typeDefaultsRaw)
                    if (typeDefaults.length > 0) {
                        countriesToSet = typeDefaults
                    }
                }
            } catch {}
            // Fallback: For Hull type with no type-specific defaults, use Israel + DDQ only
            if (countriesToSet === typeFiltered && typeCode === 'H') {
                countriesToSet = typeFiltered.filter(c => c.listType === 'ddq' || c.name.toLowerCase() === 'israel')
            }
            await window.api.setQuotationExcludedCountries(quotation.id, countriesToSet.map(c => ({ name: c.name, listType: c.listType })))
            const refreshed = await window.api.getQuotationExcludedCountries(quotation.id)
            setCountries(refreshed)
        }
    }

    const removeCountry = async (id: string) => {
        const updated = countries.filter(c => c.id !== id)
        setCountries(updated)
        await window.api.setQuotationExcludedCountries(quotation.id, updated.map(c => ({ name: c.name, listType: c.listType })))
    }

    const addCountry = async () => {
        if (!newCountryName.trim()) return
        const updated = [...countries, { id: '', quotationId: quotation.id, name: newCountryName.trim(), listType: newCountryType }]
        await window.api.setQuotationExcludedCountries(quotation.id, updated.map(c => ({ name: c.name, listType: c.listType })))
        setNewCountryName('')
        showSuccess('Country added')
        loadData()
    }

    const toggle = (field: string, val: boolean) => {
        setQ(p => ({ ...p, [field]: val }))
        updateField(field, val)
    }

    const excluded = countries.filter(c => c.listType === 'excluded')
    const ddq = countries.filter(c => c.listType === 'ddq')

    const sectionStyle = { padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '12px' }
    const checkboxStyle = { width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Trading Warranty</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Configure trading warranties including excluded countries and DDQ requirements.
            </p>

            {/* Custom Mode Toggle */}
            <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                    type="checkbox"
                    checked={!!quotation.tradingCustomMode}
                    onChange={e => { toggle('tradingCustomMode', e.target.checked) }}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                />
                <div>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Use custom wording</span>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                        Replaces standard numbered paragraphs (excluded countries, DDQ, Israel) with custom text
                    </p>
                </div>
            </div>

            {/* Trading Warranty Text (intro — hidden when custom wording is active) */}
            {!quotation.tradingCustomMode && <div style={sectionStyle}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Trading Warranty Text</label>

                {/* Vessel selector for multi-vessel quotations */}
                {qVessels.length >= 2 && (
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <button onClick={() => setSelectedVesselId(null)}
                            style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: selectedVesselId === null ? 700 : 400, border: selectedVesselId === null ? '2px solid var(--accent-primary)' : '1px solid var(--glass-border)', background: selectedVesselId === null ? 'rgba(0,210,255,0.08)' : 'transparent', color: selectedVesselId === null ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                            All Vessels
                        </button>
                        {qVessels.map(v => {
                            const hasOverride = tradingIntros.some(ti => ti.vesselScope && ti.vesselScope.includes(v.id))
                            return (
                                <button key={v.id} onClick={() => setSelectedVesselId(v.id)}
                                    style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: selectedVesselId === v.id ? 700 : 400, border: selectedVesselId === v.id ? '2px solid var(--accent-primary)' : hasOverride ? '1.5px solid rgba(0,210,255,0.4)' : '1px solid var(--glass-border)', background: selectedVesselId === v.id ? 'rgba(0,210,255,0.08)' : hasOverride ? 'rgba(0,210,255,0.03)' : 'transparent', color: selectedVesselId === v.id ? 'var(--accent-primary)' : hasOverride ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                                    {v.vesselLabel} {(v.name || '').toUpperCase()}
                                    {hasOverride && <span style={{ marginLeft: '4px', fontSize: '0.65rem' }}>●</span>}
                                </button>
                            )
                        })}
                    </div>
                )}

                {templates.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                        <select
                            value=""
                            onChange={e => {
                                const tpl = templates.find(t => t.id === e.target.value)
                                if (!tpl) return
                                if (selectedVesselId) {
                                    // Apply template to per-vessel override
                                    const existing = tradingIntros.find(ti => ti.vesselScope && ti.vesselScope.includes(selectedVesselId))
                                    if (existing) {
                                        window.api.tradingUpdateIntro(existing.id, { text: tpl.text }).then(() => loadData())
                                    } else {
                                        window.api.tradingAddIntro({ quotationId: quotation.id, text: tpl.text, vesselScope: [selectedVesselId] }).then(() => loadData())
                                    }
                                } else {
                                    setQ(p => ({ ...p, tradingWarrantyIntro: '' }))
                                    setTimeout(() => {
                                        setQ(p => ({ ...p, tradingWarrantyIntro: tpl.text }))
                                        updateField('tradingWarrantyIntro', tpl.text)
                                    }, 0)
                                }
                            }}
                            style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.84rem', width: '100%' }}
                        >
                            <option value="">Load from template...</option>
                            {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Editor: quotation-level intro or per-vessel override */}
                {selectedVesselId ? (() => {
                    const existing = tradingIntros.find(ti => ti.vesselScope && ti.vesselScope.includes(selectedVesselId))
                    const vesselName = qVessels.find(v => v.id === selectedVesselId)?.name || ''
                    return (
                        <div>
                            {!existing && (
                                <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Using shared text. </span>
                                    <button onClick={async () => {
                                        await window.api.tradingAddIntro({ quotationId: quotation.id, text: quotation.tradingWarrantyIntro || '', vesselScope: [selectedVesselId] })
                                        loadData()
                                        showSuccess(`Override created for ${vesselName.toUpperCase()}`)
                                    }} className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.75rem' }}>Create Override</button>
                                </div>
                            )}
                            {existing && (
                                <>
                                    <RichTextEditor
                                        value={existing.text}
                                        onChange={val => {
                                            setTradingIntros(prev => prev.map(ti => ti.id === existing.id ? { ...ti, text: val } : ti))
                                            window.api.tradingUpdateIntro(existing.id, { text: val })
                                        }}
                                        placeholder={`Trading warranty text for ${vesselName.toUpperCase()}...`}
                                        minHeight={80}
                                        showFontSize showAlignment showLineSpacing
                                    />
                                    <button onClick={async () => {
                                        await window.api.tradingDeleteIntro(existing.id)
                                        loadData()
                                        showSuccess(`Override removed — ${vesselName.toUpperCase()} will use shared text`)
                                    }} className="btn-secondary" style={{ marginTop: '6px', padding: '4px 10px', fontSize: '0.72rem', color: 'var(--danger)' }}>
                                        Remove Override
                                    </button>
                                </>
                            )}
                        </div>
                    )
                })() : (
                    <RichTextEditor
                        value={quotation.tradingWarrantyIntro || ''}
                        onChange={val => { setQ(p => ({ ...p, tradingWarrantyIntro: val })); updateField('tradingWarrantyIntro', val) }}
                        placeholder="Enter the trading warranty text..."
                        minHeight={80}
                        showFontSize showAlignment showLineSpacing
                    />
                )}
            </div>}

            {!quotation.tradingCustomMode && <>
            {/* Section B: DDQ Countries List */}
            <div style={sectionStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '10px' }}>
                    <input type="checkbox" checked={quotation.tradingShowDdqList} onChange={e => toggle('tradingShowDdqList', e.target.checked)} style={checkboxStyle} />
                    <span style={{ fontWeight: 600 }}>DDQ Countries List</span>
                </label>
                {quotation.tradingShowDdqList && (
                    <>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                            Standard text uses <code>{'{ddq_countries}'}</code> variable. Countries managed below.
                        </p>
                        <div style={{ fontSize: '0.82rem', padding: '8px 12px', borderRadius: '6px', background: 'var(--table-header-bg)', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                            {stripHtml(getEffectiveText('ddqCountriesIntro') || 'Due Diligence Questionnaire required for trading with the following countries:')
                                .replace(/\{ddq_countries\}/g, ddq.map(c => c.name).join(', ') || '(none)')}
                        </div>
                    </>
                )}
            </div>

            {/* Section C: Trading Warranties for DDQ Countries */}
            <div style={sectionStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '4px' }}>
                    <input type="checkbox" checked={quotation.tradingShowDdqWarranties} onChange={e => toggle('tradingShowDdqWarranties', e.target.checked)} style={checkboxStyle} />
                    <span style={{ fontWeight: 600 }}>DDQ Trading Conditions</span>
                </label>
                {quotation.tradingShowDdqWarranties && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                        Uses the &quot;Trading Conditions&quot; standard text from settings.
                    </p>
                )}
            </div>

            {/* Section D: Israel Exclusion */}
            <div style={sectionStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '4px' }}>
                    <input type="checkbox" checked={quotation.tradingShowIsrael} onChange={e => toggle('tradingShowIsrael', e.target.checked)} style={checkboxStyle} />
                    <span style={{ fontWeight: 600 }}>Israel Exclusion</span>
                </label>
                {quotation.tradingShowIsrael && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                        Uses the &quot;Israel Exclusion&quot; standard text from settings.
                    </p>
                )}
            </div>

            {/* Section E: Custom Exclusion Text (not for P&I) */}
            {quotation.quotationTypeCode !== 'P' && <div style={sectionStyle}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Custom Trading Section (optional)</label>
                {templates.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                        <select
                            value=""
                            onChange={e => {
                                const tpl = templates.find(t => t.id === e.target.value)
                                if (tpl) {
                                    setQ(p => ({ ...p, tradingCustomText: tpl.text }))
                                    updateField('tradingCustomText', tpl.text)
                                }
                            }}
                            style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.84rem', width: '100%' }}
                        >
                            <option value="">Load from template...</option>
                            {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>
                )}
                <RichTextEditor
                    value={quotation.tradingCustomText || ''}
                    onChange={val => { setQ(p => ({ ...p, tradingCustomText: val })); updateField('tradingCustomText', val) }}
                    placeholder="Add custom trading exclusion or condition text..."
                    minHeight={60}
                    showFontSize showAlignment showLineSpacing
                />
            </div>}

            {/* Country Management */}
            <h4 style={{ fontSize: '0.95rem', marginTop: '20px', marginBottom: '10px' }}>Country Lists</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Countries are pre-populated from settings. You can add/remove countries per quotation.</p>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
                <input
                    type="text"
                    value={newCountryName}
                    onChange={e => setNewCountryName(e.target.value)}
                    placeholder="Add country (e.g. Occupied Ukraine)..."
                    style={{ flex: 1, maxWidth: '300px' }}
                    onKeyDown={e => { if (e.key === 'Enter') addCountry() }}
                />
                <select value={newCountryType} onChange={e => setNewCountryType(e.target.value as any)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }}>
                    <option value="excluded">Excluded</option>
                    <option value="ddq">DDQ</option>
                </select>
                <button onClick={addCountry} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}><Plus size={14} /> Add</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: 'var(--danger)' }}>Excluded Countries ({excluded.length})</h4>
                    {excluded.map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--table-border)', marginBottom: '4px' }}>
                            <span style={{ flex: 1, fontSize: '0.83rem' }}>{c.name}</span>
                            <button onClick={() => removeCountry(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><X size={12} /></button>
                        </div>
                    ))}
                </div>
                <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#ffb400' }}>DDQ Required Countries ({ddq.length})</h4>
                    {ddq.map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--table-border)', marginBottom: '4px' }}>
                            <span style={{ flex: 1, fontSize: '0.83rem' }}>{c.name}</span>
                            <button onClick={() => removeCountry(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><X size={12} /></button>
                        </div>
                    ))}
                </div>
            </div>
            </>}

            {quotation.tradingCustomMode && (
                <div style={sectionStyle}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Custom Trading Wording</label>
                    {customTexts.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                            <select
                                value=""
                                onChange={e => {
                                    const ct = customTexts.find(t => t.id === e.target.value)
                                    if (ct) {
                                        setQ(p => ({ ...p, tradingCustomWording: ct.text }))
                                        updateField('tradingCustomWording', ct.text)
                                    }
                                }}
                                style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.84rem', width: '100%' }}
                            >
                                <option value="">Load from template...</option>
                                {customTexts.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <RichTextEditor
                        value={quotation.tradingCustomWording || ''}
                        onChange={val => { setQ(p => ({ ...p, tradingCustomWording: val })); updateField('tradingCustomWording', val) }}
                        placeholder="Enter custom trading warranty wording..."
                        minHeight={100}
                        showFontSize showAlignment showLineSpacing
                    />
                </div>
            )}
        </div>
    )
}
