import { useState, useEffect, useRef } from 'react'
import { Plus, ChevronUp, ChevronDown, X } from 'lucide-react'
import { Quotation, HullAgreedValueText, QuotationAgreedValueItem, QuotationVessel } from '../../../../shared/types'
import VesselScopeChips from '../VesselScopeChips'

export default function AgreedValueTab({ quotation, updateField, setQ, showError }: {
    quotation: Quotation
    updateField: (f: string, v: any) => void
    setQ: (fn: (p: Quotation) => Quotation) => void
    showSuccess: (m: string) => void
    showError: (m: string) => void
}) {
    const [items, setItems] = useState<QuotationAgreedValueItem[]>([])
    const [allTexts, setAllTexts] = useState<HullAgreedValueText[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [newText, setNewText] = useState('')
    const defaultsApplied = useRef(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [texts, existingItems, qv] = await Promise.all([
            window.api.hullGetAgreedValueTexts(),
            window.api.hullGetQuotationAgreedValueItems(quotation.id),
            window.api.getQuotationVessels(quotation.id)
        ])
        const safeTexts = Array.isArray(texts) ? texts : []
        const safeItems = Array.isArray(existingItems) ? existingItems : []
        setAllTexts(safeTexts)
        setItems(safeItems)
        setQVessels(Array.isArray(qv) ? qv : [])

        // Sync sections from master texts (fixes items saved before section was tracked)
        if (safeItems.length > 0 && safeTexts.length > 0) {
            const masterMap = new Map(safeTexts.map(t => [t.id, t.section || 'hm']))
            let needsSave = false
            const synced = safeItems.map(it => {
                if (it.hullTextId && masterMap.has(it.hullTextId)) {
                    const masterSec = masterMap.get(it.hullTextId)!
                    if ((it.section || 'hm') !== masterSec) {
                        needsSave = true
                        return { ...it, section: masterSec }
                    }
                }
                return it
            })
            if (needsSave) {
                try {
                    await window.api.hullSetQuotationAgreedValueItems(quotation.id, synced.map(it => ({ hullTextId: it.hullTextId, text: it.text, section: it.section || 'hm', vesselScope: it.vesselScope })))
                    const fresh = await window.api.hullGetQuotationAgreedValueItems(quotation.id)
                    setItems(Array.isArray(fresh) ? fresh : [])
                } catch {}
            }
        }

        // Auto-populate default texts on first load if no items exist
        if (!defaultsApplied.current && safeItems.length === 0 && safeTexts.length > 0) {
            defaultsApplied.current = true
            const defaults = safeTexts.filter(t => t.defaultSelected)
            if (defaults.length > 0) {
                const newItems = defaults.map(t => ({ hullTextId: t.id, text: t.text, section: t.section || 'hm' }))
                try {
                    await window.api.hullSetQuotationAgreedValueItems(quotation.id, newItems)
                    const fresh = await window.api.hullGetQuotationAgreedValueItems(quotation.id)
                    setItems(Array.isArray(fresh) ? fresh : [])
                } catch {}
            }
        } else {
            defaultsApplied.current = true
        }
    }

    const saveItems = async (updated: QuotationAgreedValueItem[]) => {
        try {
            await window.api.hullSetQuotationAgreedValueItems(
                quotation.id,
                updated.map(it => ({ hullTextId: it.hullTextId, text: it.text, section: it.section || 'hm', vesselScope: it.vesselScope }))
            )
            const fresh = await window.api.hullGetQuotationAgreedValueItems(quotation.id)
            setItems(Array.isArray(fresh) ? fresh : [])
        } catch (err: any) {
            showError(err.message || 'Failed to save')
        }
    }

    const addFromTemplate = async (tmpl: HullAgreedValueText) => {
        const already = items.some(it => it.hullTextId === tmpl.id)
        if (already) return
        const updated = [...items, { id: '', quotationId: quotation.id, hullTextId: tmpl.id, text: tmpl.text, section: tmpl.section || 'hm', order: items.length }]
        await saveItems(updated)
    }

    const addCustomText = async () => {
        if (!newText.trim()) return
        const updated = [...items, { id: '', quotationId: quotation.id, text: newText.trim(), section: 'hm', order: items.length }]
        await saveItems(updated)
        setNewText('')
    }

    const removeItem = async (idx: number) => {
        const updated = items.filter((_, i) => i !== idx)
        await saveItems(updated)
    }

    const updateItemText = async (idx: number, text: string) => {
        const updated = items.map((it, i) => i === idx ? { ...it, text } : it)
        setItems(updated)
    }

    const blurSave = async () => {
        await saveItems(items)
    }

    const moveItem = async (idx: number, dir: 'up' | 'down') => {
        const arr = [...items]
        const swap = dir === 'up' ? idx - 1 : idx + 1
        if (swap < 0 || swap >= arr.length) return
        ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
        await saveItems(arr)
    }

    const updateScope = async (idx: number, scope: string[] | null) => {
        const updated = items.map((it, i) => i === idx ? { ...it, vesselScope: scope } : it)
        await saveItems(updated)
    }

    const visibleItems = quotation.ivEnabled ? items : items.filter(it => it.section !== 'iv')
    const unusedTexts = allTexts
        .filter(t => !items.some(it => it.hullTextId === t.id))
        .filter(t => quotation.ivEnabled || (t.section || 'hm') !== 'iv')

    return (
        <div>
            <h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Agreed Insured Value</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 16px' }}>
                Set the agreed value and select/add text items for the Hull quotation.
            </p>

            {/* H&M Value + Currency */}
            {qVessels.length > 1 ? (
                <>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>H&M Values</label>
                            <div style={{ border: '1px solid var(--table-border)', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {qVessels.map(qv => (
                                    <div key={qv.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, minWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {qv.vesselLabel}: {qv.name || 'Unnamed'}
                                        </span>
                                        <input
                                            type="number"
                                            value={qv.agreedValue ?? ''}
                                            onChange={e => {
                                                const val = e.target.value ? Number(e.target.value) : null
                                                setQVessels(prev => prev.map(v => v.id === qv.id ? { ...v, agreedValue: val } : v))
                                            }}
                                            onBlur={async e => {
                                                const val = e.target.value ? Number(e.target.value) : null
                                                await window.api.updateQuotationVessel(qv.id, { agreedValue: val })
                                                // Sync total to quotation-level
                                                const updatedVessels = qVessels.map(v => v.id === qv.id ? { ...v, agreedValue: val } : v)
                                                const total = updatedVessels.reduce((sum, v) => sum + (v.agreedValue || 0), 0)
                                                setQ(p => ({ ...p, agreedValue: total || undefined }))
                                                updateField('agreedValue', total || null)
                                            }}
                                            placeholder="0.00"
                                            style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                ))}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid var(--table-border)', paddingTop: '8px' }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: '140px' }}>Total</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                        {(qVessels.reduce((s, v) => s + (v.agreedValue || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div style={{ maxWidth: '120px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Currency</label>
                            <input
                                type="text"
                                value={quotation.agreedValueCurrency || 'USD'}
                                onChange={e => setQ(p => ({ ...p, agreedValueCurrency: e.target.value }))}
                                onBlur={e => updateField('agreedValueCurrency', e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
                            />
                        </div>
                    </div>
                </>
            ) : (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
                    <div style={{ flex: 1, maxWidth: '250px' }}>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>H&M Value</label>
                        <input
                            type="number"
                            value={quotation.agreedValue ?? ''}
                            onChange={e => setQ(p => ({ ...p, agreedValue: e.target.value ? Number(e.target.value) : undefined }))}
                            onBlur={async e => {
                                const val = e.target.value ? Number(e.target.value) : null
                                updateField('agreedValue', val)
                                // Sync to single vessel record
                                if (qVessels.length === 1) {
                                    await window.api.updateQuotationVessel(qVessels[0].id, { agreedValue: val })
                                    setQVessels(prev => prev.map((v, i) => i === 0 ? { ...v, agreedValue: val } : v))
                                }
                            }}
                            placeholder="0.00"
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
                        />
                    </div>
                    <div style={{ maxWidth: '120px' }}>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Currency</label>
                        <input
                            type="text"
                            value={quotation.agreedValueCurrency || 'USD'}
                            onChange={e => setQ(p => ({ ...p, agreedValueCurrency: e.target.value }))}
                            onBlur={e => updateField('agreedValueCurrency', e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
                        />
                    </div>
                </div>
            )}

            {/* IV toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: quotation.ivEnabled ? '12px' : '20px' }}>
                <input type="checkbox" checked={!!quotation.ivEnabled} onChange={e => { setQ(p => ({ ...p, ivEnabled: e.target.checked })); updateField('ivEnabled', e.target.checked) }} />
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Include Increased Value (IV)</span>
            </div>

            {/* IV Value + Currency */}
            {quotation.ivEnabled && (
            qVessels.length > 1 ? (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>IV Values</label>
                        <div style={{ border: '1px solid var(--table-border)', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {qVessels.map(qv => (
                                <div key={qv.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, minWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {qv.vesselLabel}: {qv.name || 'Unnamed'}
                                    </span>
                                    <input
                                        type="number"
                                        value={qv.ivValue ?? ''}
                                        onChange={e => {
                                            const val = e.target.value ? Number(e.target.value) : null
                                            setQVessels(prev => prev.map(v => v.id === qv.id ? { ...v, ivValue: val } : v))
                                        }}
                                        onBlur={async e => {
                                            const val = e.target.value ? Number(e.target.value) : null
                                            await window.api.updateQuotationVessel(qv.id, { ivValue: val })
                                            // Sync total to quotation-level
                                            const updatedVessels = qVessels.map(v => v.id === qv.id ? { ...v, ivValue: val } : v)
                                            const total = updatedVessels.reduce((sum, v) => sum + (v.ivValue || 0), 0)
                                            setQ(p => ({ ...p, ivValue: total || undefined }))
                                            updateField('ivValue', total || null)
                                        }}
                                        placeholder="0.00"
                                        style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
                                    />
                                </div>
                            ))}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid var(--table-border)', paddingTop: '8px' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: '140px' }}>Total</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                    {(qVessels.reduce((s, v) => s + (v.ivValue || 0), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div style={{ maxWidth: '120px' }}>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Currency</label>
                        <input
                            type="text"
                            value={quotation.ivCurrency || 'USD'}
                            onChange={e => setQ(p => ({ ...p, ivCurrency: e.target.value }))}
                            onBlur={e => updateField('ivCurrency', e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
                        />
                    </div>
                </div>
            ) : (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
                <div style={{ flex: 1, maxWidth: '250px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>IV Value</label>
                    <input
                        type="number"
                        value={quotation.ivValue ?? ''}
                        onChange={e => setQ(p => ({ ...p, ivValue: e.target.value ? Number(e.target.value) : undefined }))}
                        onBlur={async e => {
                            const val = e.target.value ? Number(e.target.value) : null
                            updateField('ivValue', val)
                            // Sync to single vessel record
                            if (qVessels.length === 1) {
                                await window.api.updateQuotationVessel(qVessels[0].id, { ivValue: val })
                                setQVessels(prev => prev.map((v, i) => i === 0 ? { ...v, ivValue: val } : v))
                            }
                        }}
                        placeholder="0.00"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
                    />
                </div>
                <div style={{ maxWidth: '120px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Currency</label>
                    <input
                        type="text"
                        value={quotation.ivCurrency || 'USD'}
                        onChange={e => setQ(p => ({ ...p, ivCurrency: e.target.value }))}
                        onBlur={e => updateField('ivCurrency', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
                    />
                </div>
            </div>
            )
            )}

            {/* Template texts to add */}
            {unusedTexts.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Add from templates</label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {unusedTexts.map(t => (
                            <button key={t.id} onClick={() => addFromTemplate(t)} className="btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                                + {t.text.length > 60 ? t.text.slice(0, 60) + '…' : t.text}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Selected items */}
            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Value Text Items ({visibleItems.length})
                </label>
                {visibleItems.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', border: '1px dashed var(--table-border)', borderRadius: '8px' }}>
                        No text items yet. Add from templates above or write custom text below.
                    </div>
                ) : (
                    visibleItems.map((it, _vIdx) => {
                        const idx = items.indexOf(it)
                        return (
                        <div key={it.id || idx} style={{ marginBottom: '8px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--table-border)', background: it.hullTextId ? 'transparent' : 'rgba(160,100,255,0.04)' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '4px' }}>
                                    <button onClick={() => moveItem(idx, 'up')} disabled={idx === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-secondary)', opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                    <button onClick={() => moveItem(idx, 'down')} disabled={idx === items.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-secondary)', opacity: idx === items.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                </div>
                                <textarea
                                    value={it.text}
                                    onChange={e => updateItemText(idx, e.target.value)}
                                    onBlur={blurSave}
                                    rows={2}
                                    style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', resize: 'vertical', minHeight: '40px', fontFamily: 'inherit' }}
                                />
                                <button onClick={() => removeItem(idx)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--danger)' }}>
                                    <X size={16} />
                                </button>
                            </div>
                            {qVessels.length > 1 && (
                                <div style={{ marginTop: '6px', paddingLeft: '28px' }}>
                                    <VesselScopeChips vessels={qVessels} vesselScope={it.vesselScope} onChange={scope => updateScope(idx, scope)} />
                                </div>
                            )}
                            <div style={{ marginLeft: '28px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                {!it.hullTextId && <span style={{ fontSize: '0.7rem', color: '#a064ff' }}>(Custom)</span>}
                                {quotation.ivEnabled && (
                                    <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, background: it.section === 'iv' ? '#6464ff22' : '#ff64c822', color: it.section === 'iv' ? '#6464ff' : '#ff64c8', border: `1px solid ${it.section === 'iv' ? '#6464ff44' : '#ff64c844'}` }}>{it.section === 'iv' ? 'IV' : 'Hull'}</span>
                                )}
                            </div>
                        </div>
                        )
                    })
                )}
            </div>

            {/* Add custom text */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Add custom text</label>
                    <textarea
                        value={newText}
                        onChange={e => setNewText(e.target.value)}
                        placeholder="Enter custom agreed value text..."
                        rows={2}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                </div>
                <button onClick={addCustomText} disabled={!newText.trim()} className="btn-primary" style={{ fontSize: '0.82rem', padding: '8px 16px', marginBottom: '2px' }}>
                    <Plus size={14} /> Add
                </button>
            </div>
        </div>
    )
}

