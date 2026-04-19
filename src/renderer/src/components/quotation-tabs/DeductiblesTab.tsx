import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, X, Pencil, Save } from 'lucide-react'
import { Quotation, PIDeductible, PITextDeductible, QuotationDeductible, QuotationTextDeductible, QuotationPIAlternative, QuotationVessel, PISectionTexts } from '../../../../shared/types'
import RichTextEditor from '../RichTextEditor'
import VesselScopeChips from '../VesselScopeChips'
import { AlternativeScopeChips, ALT_COLORS, PickerDropdown } from './shared'

export default function DeductiblesTab({ quotation, showSuccess, updateField, setQ, getEffectiveText, piAlternatives = [], selectedPIAltId = null }: { quotation: Quotation; showSuccess: (m: string) => void; showError?: (m: string) => void; isLight?: boolean; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; getEffectiveText: (key: keyof PISectionTexts) => string; piAlternatives?: QuotationPIAlternative[]; selectedPIAltId?: string | null }) {
    const altStyle = (altId: string | null | undefined): React.CSSProperties => {
        if (piAlternatives.length < 2 || !selectedPIAltId) return {}
        const matches = !altId || altId === selectedPIAltId
        if (matches) return { borderLeft: `3px solid ${ALT_COLORS[piAlternatives.findIndex(a => a.id === selectedPIAltId) % ALT_COLORS.length]}` }
        const otherIdx = piAlternatives.findIndex(a => a.id === altId)
        return { borderLeft: `3px dashed ${ALT_COLORS[otherIdx >= 0 ? otherIdx % ALT_COLORS.length : 0]}40` }
    }
    const [deductibles, setDeductibles] = useState<QuotationDeductible[]>([])
    const [masterDeductibles, setMasterDeductibles] = useState<PIDeductible[]>([])
    const [textDeds, setTextDeds] = useState<QuotationTextDeductible[]>([])
    const [masterTextDeds, setMasterTextDeds] = useState<PITextDeductible[]>([])
    const [newCustomDesc, setNewCustomDesc] = useState('')
    const [newTextTitle, setNewTextTitle] = useState('')
    const [newTextDed, setNewTextDed] = useState('')
    const [editingDescId, setEditingDescId] = useState<string | null>(null)
    const [editDescText, setEditDescText] = useState('')
    const [editingTextId, setEditingTextId] = useState<string | null>(null)
    const [editTextTitle, setEditTextTitle] = useState('')
    const [editTextContent, setEditTextContent] = useState('')
    const [showAdditionalText, setShowAdditionalText] = useState(false)
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const defaultsApplied = useRef(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [qd, md, td, mtd, qv] = await Promise.all([
            window.api.getQuotationDeductibles(quotation.id),
            window.api.piGetDeductibles(),
            window.api.getQuotationTextDeductibles(quotation.id),
            window.api.piGetTextDeductibles(),
            window.api.getQuotationVessels(quotation.id)
        ])
        const safeQd = Array.isArray(qd) ? qd : []
        const safeMd = Array.isArray(md) ? md : []
        const safeTd = Array.isArray(td) ? td : []
        const safeMtd = Array.isArray(mtd) ? mtd : []
        setDeductibles(safeQd)
        setMasterDeductibles(safeMd)
        setTextDeds(safeTd)
        setMasterTextDeds(safeMtd)
        setQVessels(Array.isArray(qv) ? qv : [])

        // Auto-include default text deductibles on first load
        if (!defaultsApplied.current && safeTd.length === 0 && safeMtd.length > 0) {
            defaultsApplied.current = true
            const defaults = safeMtd.filter(t => t.defaultIncluded)
            for (let i = 0; i < defaults.length; i++) {
                await window.api.addQuotationTextDeductible({ quotationId: quotation.id, piTextDeductibleId: defaults[i].id, title: defaults[i].title, text: defaults[i].text, order: i })
            }
            if (defaults.length > 0) {
                const freshTd = await window.api.getQuotationTextDeductibles(quotation.id)
                setTextDeds(Array.isArray(freshTd) ? freshTd : [])
            }
        } else {
            defaultsApplied.current = true
        }
    }

    const handleAddFromMaster = async (masterId: string) => {
        const master = masterDeductibles.find(m => m.id === masterId)
        if (!master) return
        await window.api.addQuotationDeductible({
            quotationId: quotation.id, piDeductibleId: masterId, title: master.title,
            description: master.description, amount: 0, currency: 'USD',
            secondaryDescription: master.hasSecondary ? master.secondaryDescription : undefined,
            order: deductibles.length
        })
        showSuccess('Deductible added'); loadData()
    }

    const addCustomDeductible = async () => {
        if (!newCustomDesc.trim()) return
        await window.api.addQuotationDeductible({
            quotationId: quotation.id, description: newCustomDesc.trim(),
            amount: 0, currency: 'USD', order: deductibles.length
        })
        setNewCustomDesc('')
        showSuccess('Custom deductible added'); loadData()
    }

    const handleUpdate = async (id: string, updates: { title?: string; amount?: number; currency?: string; secondaryAmount?: number; description?: string; vesselAmounts?: Record<string, number> | null }) => {
        await window.api.updateQuotationDeductible(id, updates)
    }

    const updateDeductibleVesselAmount = (dedId: string, vesselId: string, amount: number | undefined) => {
        setDeductibles(prev => prev.map(d => {
            if (d.id !== dedId) return d
            const va = { ...(d.vesselAmounts || {}) }
            if (amount == null) {
                delete va[vesselId]
            } else {
                va[vesselId] = amount
            }
            // If all vessel amounts are the same, collapse to single amount
            const vals = Object.values(va)
            if (vals.length === qVessels.length && vals.length > 0 && vals.every(v => v === vals[0])) {
                return { ...d, amount: vals[0], vesselAmounts: null }
            }
            return { ...d, vesselAmounts: Object.keys(va).length > 0 ? va : null }
        }))
    }

    const saveDeductibleVesselAmounts = async (dedId: string) => {
        const ded = deductibles.find(d => d.id === dedId)
        if (!ded) return
        await handleUpdate(dedId, { amount: ded.amount, vesselAmounts: ded.vesselAmounts || null })
    }

    const moveDeductible = async (index: number, direction: 'up' | 'down') => {
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= deductibles.length) return
        const newOrder = [...deductibles]
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setDeductibles(newOrder)
        await window.api.reorderQuotationDeductibles(newOrder.map(d => d.id))
    }

    const handleAddTextDed = async () => {
        if (!newTextTitle.trim() && !newTextDed.trim()) return
        await window.api.addQuotationTextDeductible({ quotationId: quotation.id, title: newTextTitle, text: newTextDed, order: textDeds.length })
        setNewTextTitle(''); setNewTextDed('')
        showSuccess('Text deductible added'); loadData()
    }

    const addTextFromMaster = async (masterId: string) => {
        const master = masterTextDeds.find(m => m.id === masterId)
        if (!master) return
        await window.api.addQuotationTextDeductible({ quotationId: quotation.id, piTextDeductibleId: master.id, title: master.title, text: master.text, order: textDeds.length })
        showSuccess('Text deductible added'); loadData()
    }

    const moveTextDed = async (index: number, direction: 'up' | 'down') => {
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= textDeds.length) return
        const newOrder = [...textDeds]
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setTextDeds(newOrder)
        await window.api.reorderQuotationTextDeductibles(newOrder.map(d => d.id))
    }

    const updateDeductibleScope = async (id: string, scope: string[] | null) => {
        setDeductibles(prev => prev.map(d => d.id === id ? { ...d, vesselScope: scope } : d))
        await window.api.updateQuotationDeductible(id, { vesselScope: scope })
    }

    const updateDeductibleAltId = async (id: string, altId: string | null) => {
        await window.api.updateQuotationItemAlternativeId('quotation_deductibles', id, altId)
        setDeductibles(prev => prev.map(d => d.id === id ? { ...d, alternativeId: altId } : d))
    }

    const updateTextDeductibleAltId = async (id: string, altId: string | null) => {
        await window.api.updateQuotationItemAlternativeId('quotation_text_deductibles', id, altId)
        setTextDeds(prev => prev.map(d => d.id === id ? { ...d, alternativeId: altId } : d))
    }

    const updateTextDeductibleScope = async (id: string, scope: string[] | null) => {
        setTextDeds(prev => prev.map(d => d.id === id ? { ...d, vesselScope: scope } : d))
        await window.api.updateQuotationTextDeductible(id, { vesselScope: scope })
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Deductibles</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 12px' }}>Configure deductible amounts and text deductibles. Each deductible can be scoped to a specific alternative.</p>

            {/* Add from settings dropdown */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <PickerDropdown
                    placeholder="Add deductible from settings..."
                    options={masterDeductibles.map(d => ({ value: d.id, label: d.title || d.description.slice(0, 80) || 'Untitled deductible' }))}
                    onSelect={handleAddFromMaster}
                />
            </div>

            {/* Deductibles list */}
            {deductibles.map((d, i) => (
                <div key={d.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', ...altStyle(d.alternativeId) }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', gap: '1px', flexDirection: 'column' }}>
                            <button onClick={() => moveDeductible(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === 0 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronUp size={12} /></button>
                            <button onClick={() => moveDeductible(i, 'down')} disabled={i === deductibles.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === deductibles.length - 1 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronDown size={12} /></button>
                        </div>
                        {d.title && <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{d.title}</span>}
                        <input type="text" defaultValue={d.currency} onBlur={e => handleUpdate(d.id, { currency: e.target.value })} style={{ width: '60px', padding: '4px 6px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                        {!(qVessels.length >= 2 && !d.vesselScope && (d.amount > 0 || d.vesselAmounts)) && (
                            <input type="number" defaultValue={d.amount} onBlur={e => handleUpdate(d.id, { amount: parseFloat(e.target.value) || 0 })} style={{ width: '120px', padding: '4px 6px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                        )}
                        {d.previousAmount != null && <span style={{ fontSize: '0.68rem', color: 'var(--danger)' }}>Prev: {d.currency} {d.previousAmount.toLocaleString()}</span>}
                        {(d.secondaryDescription || /\{currency\}|\{amount\}/.test(d.description)) && (
                            <>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>2nd:</span>
                                <input type="number" defaultValue={d.secondaryAmount || 0} onBlur={e => handleUpdate(d.id, { secondaryAmount: parseFloat(e.target.value) || 0 })} style={{ width: '120px', padding: '4px 6px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                                {d.previousSecondaryAmount != null && <span style={{ fontSize: '0.68rem', color: 'var(--danger)' }}>Prev: {d.currency} {d.previousSecondaryAmount.toLocaleString()}</span>}
                            </>
                        )}
                        {!d.piDeductibleId && <span style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 210, 255, 0.1)', color: 'var(--accent-primary)' }}>custom</span>}
                        <div style={{ flex: 1 }} />
                        <button onClick={() => { setEditingDescId(editingDescId === d.id ? null : d.id); setEditDescText(d.description) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><Pencil size={12} /></button>
                        <button onClick={async () => { await window.api.deleteQuotationDeductible(d.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                    </div>
                    {/* Per-vessel amount inputs */}
                    {qVessels.length >= 2 && !d.vesselScope && (d.amount > 0 || d.vesselAmounts) && (
                        <div style={{ paddingLeft: '24px', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Amount (per vessel):</span>
                            {qVessels.map(v => {
                                const va = d.vesselAmounts
                                const perVesselVal = va ? va[v.id] : undefined
                                const displayVal = perVesselVal ?? d.amount ?? ''
                                return (
                                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', width: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(v.name || v.vesselLabel).toUpperCase()}>
                                            {(v.name || v.vesselLabel).toUpperCase()}
                                        </span>
                                        <input
                                            type="number"
                                            value={displayVal}
                                            onChange={e => updateDeductibleVesselAmount(d.id, v.id, e.target.value ? Number(e.target.value) : undefined)}
                                            onBlur={() => saveDeductibleVesselAmounts(d.id)}
                                            placeholder="0"
                                            style={{ width: '150px', padding: '4px 8px', borderRadius: '6px', fontSize: '0.82rem', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    )}
                    {/* Description (editable) */}
                    {editingDescId === d.id ? (
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                            <textarea value={editDescText} onChange={e => setEditDescText(e.target.value)} style={{ flex: 1, minHeight: '40px', resize: 'vertical', fontSize: '0.82rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                            <button onClick={async () => { await handleUpdate(d.id, { description: editDescText }); setEditingDescId(null); setDeductibles(prev => prev.map(dd => dd.id === d.id ? { ...dd, description: editDescText } : dd)) }} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.75rem', alignSelf: 'flex-end' }}>Save</button>
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.83rem', paddingLeft: '24px', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{d.description.replace(/\{currency\}\s*\{amount\}/g, d.secondaryAmount != null ? `${d.currency} ${d.secondaryAmount.toLocaleString()}` : '___').replace(/\{currency\}/g, d.currency).replace(/\{amount\}/g, d.secondaryAmount != null ? `${d.currency} ${d.secondaryAmount.toLocaleString()}` : '___')}</div>
                    )}
                    {d.secondaryDescription && (
                        <div style={{ fontSize: '0.78rem', paddingLeft: '24px', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {d.secondaryDescription.replace(/\{currency\}\s*\{amount\}/g, d.secondaryAmount != null ? `${d.currency} ${d.secondaryAmount.toLocaleString()}` : '___').replace(/\{currency\}/g, d.currency).replace(/\{amount\}/g, d.secondaryAmount != null ? `${d.currency} ${d.secondaryAmount.toLocaleString()}` : '___')}
                        </div>
                    )}
                    <div style={{ paddingLeft: '30px' }}>
                        <VesselScopeChips vessels={qVessels} vesselScope={d.vesselScope} onChange={scope => updateDeductibleScope(d.id, scope)} />
                        <AlternativeScopeChips alternatives={piAlternatives} currentAltId={d.alternativeId || null} onChangeAltId={altId => updateDeductibleAltId(d.id, altId)} />
                    </div>
                </div>
            ))}

            {/* Add custom deductible */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', alignItems: 'flex-end' }}>
                <textarea value={newCustomDesc} onChange={e => { setNewCustomDesc(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} placeholder="Add a custom deductible..." rows={1} style={{ flex: 1, minHeight: '32px', maxHeight: '200px', resize: 'none', fontSize: '0.8rem', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', overflow: 'auto' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCustomDeductible() } }} />
                <button onClick={addCustomDeductible} className="btn-primary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} title="Add custom deductible"><Plus size={12} /></button>
            </div>

            {/* ═══ Divider ═══ */}
            <div style={{ borderTop: '2px solid var(--table-border)', margin: '18px 0 14px' }} />

            {/* Text-Based Deductibles */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h4 style={{ fontSize: '0.9rem' }}>Text Deductibles</h4>
                {masterTextDeds.length > 0 && (
                    <PickerDropdown
                        placeholder="Add from settings..."
                        fontSize="0.8rem"
                        options={masterTextDeds.map(t => ({ value: t.id, label: t.title || (t.text.slice(0, 60) + (t.text.length > 60 ? '...' : '')) }))}
                        onSelect={addTextFromMaster}
                    />
                )}
            </div>
            {textDeds.map((td, i) => (
                <div key={td.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', ...altStyle(td.alternativeId) }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <div style={{ display: 'flex', gap: '1px', flexDirection: 'column', flexShrink: 0 }}>
                            <button onClick={() => moveTextDed(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === 0 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronUp size={10} /></button>
                            <button onClick={() => moveTextDed(i, 'down')} disabled={i === textDeds.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === textDeds.length - 1 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronDown size={10} /></button>
                        </div>
                        {editingTextId === td.id ? (
                            <>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <input type="text" value={editTextTitle} onChange={e => setEditTextTitle(e.target.value)} placeholder="Title" style={{ fontSize: '0.82rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                                    <textarea value={editTextContent} onChange={e => setEditTextContent(e.target.value)} placeholder="Text content" style={{ minHeight: '50px', resize: 'vertical', fontSize: '0.82rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                                </div>
                                <button onClick={async () => { await window.api.updateQuotationTextDeductible(td.id, { title: editTextTitle, text: editTextContent }); setEditingTextId(null); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '2px' }}><Save size={12} /></button>
                                <button onClick={() => setEditingTextId(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><X size={12} /></button>
                            </>
                        ) : (
                            <>
                                <div style={{ flex: 1 }}>
                                    {td.title && <div style={{ fontSize: '0.83rem', fontWeight: 600 }}>{td.title}</div>}
                                    {td.text && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{td.text}</div>}
                                </div>
                                <button onClick={() => { setEditingTextId(td.id); setEditTextTitle(td.title || ''); setEditTextContent(td.text) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '1px', opacity: 0.6 }}><Pencil size={10} /></button>
                                <button onClick={async () => { await window.api.deleteQuotationTextDeductible(td.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={12} /></button>
                            </>
                        )}
                    </div>
                    <div style={{ paddingLeft: '30px' }}>
                        <VesselScopeChips vessels={qVessels} vesselScope={td.vesselScope} onChange={scope => updateTextDeductibleScope(td.id, scope)} />
                        <AlternativeScopeChips alternatives={piAlternatives} currentAltId={td.alternativeId || null} onChangeAltId={altId => updateTextDeductibleAltId(td.id, altId)} />
                    </div>
                </div>
            ))}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input type="text" value={newTextTitle} onChange={e => setNewTextTitle(e.target.value)} placeholder="Title..." style={{ fontSize: '0.8rem', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                    <textarea value={newTextDed} onChange={e => { setNewTextDed(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} placeholder="Text content..." rows={1} style={{ minHeight: '32px', maxHeight: '200px', resize: 'none', fontSize: '0.8rem', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', overflow: 'auto' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTextDed() } }} />
                </div>
                <button onClick={handleAddTextDed} className="btn-primary" style={{ padding: '5px 10px', fontSize: '0.75rem', alignSelf: 'flex-end' }} title="Add text deductible"><Plus size={12} /></button>
            </div>

            {/* ═══ Additional Text (collapsible) ═══ */}
            <div style={{ marginBottom: '10px' }}>
                <button onClick={() => setShowAdditionalText(!showAdditionalText)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', width: '100%', textAlign: 'left' }}>
                    <ChevronDown size={14} style={{ color: 'var(--text-secondary)', transform: showAdditionalText ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Additional Text & Standard Clauses</span>
                </button>
                {showAdditionalText && (
                    <div style={{ paddingLeft: '20px', marginTop: '8px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Additional Text (after deductibles)</label>
                        <RichTextEditor
                            value={quotation.sectionTextsOverride?.deductiblesAdditionalText ?? getEffectiveText('deductiblesAdditionalText')}
                            onChange={val => {
                                const override = { ...(quotation.sectionTextsOverride || {}), deductiblesAdditionalText: val }
                                setQ(p => ({ ...p, sectionTextsOverride: override }))
                                updateField('sectionTextsOverride', override)
                            }}
                            minHeight={60}
                            showFontSize showAlignment showLineSpacing
                        />

                        <div style={{ marginTop: '16px', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={quotation.deductibleAggregateEnabled} onChange={e => { setQ(p => ({ ...p, deductibleAggregateEnabled: e.target.checked })); updateField('deductibleAggregateEnabled', e.target.checked) }} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                                <span style={{ fontWeight: 600 }}>Aggregate Clause</span>
                            </label>
                            {quotation.deductibleAggregateEnabled && (
                                <textarea
                                    defaultValue={quotation.deductibleAggregateText ?? getEffectiveText('deductiblesAggregate')}
                                    onBlur={e => { setQ(p => ({ ...p, deductibleAggregateText: e.target.value })); updateField('deductibleAggregateText', e.target.value) }}
                                    style={{ width: '100%', marginTop: '8px', marginLeft: '24px', minHeight: '50px', resize: 'vertical', fontSize: '0.82rem', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                />
                            )}
                        </div>

                    </div>
                )}
            </div>
        </div>
    )
}
