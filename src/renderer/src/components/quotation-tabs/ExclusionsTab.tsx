import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Trash2, GripVertical, X, Pencil, Upload, AlertTriangle } from 'lucide-react'
import { Quotation, PIClause, PIExclusion, QuotationCustomExclusion, QuotationPIAlternative, QuotationVessel, Vessel } from '../../../../shared/types'
import { useTheme } from '../../contexts/ThemeContext'
import VesselScopeChips from '../VesselScopeChips'
import { AlternativeScopeChips } from './shared'

export default function ExclusionsTab({ quotation, showSuccess, piAlternatives = [], selectedPIAltId = null }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; piAlternatives?: QuotationPIAlternative[]; selectedPIAltId?: string | null }) {
    const [allExclusions, setAllExclusions] = useState<PIExclusion[]>([])
    const [selectedRows, setSelectedRows] = useState<any[]>([])
    const selectedIds = useMemo(() => {
        const altId = piAlternatives.length >= 2 ? selectedPIAltId : null
        const filtered = altId
            ? selectedRows.filter((r: any) => r.alternativeId === altId)
            : selectedRows
        return new Set(filtered.filter((r: any) => r.piExclusionId).map((r: any) => r.piExclusionId))
    }, [selectedRows, piAlternatives, selectedPIAltId])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [customExclusions, setCustomExclusions] = useState<QuotationCustomExclusion[]>([])
    const [newCustomText, setNewCustomText] = useState('')
    const [editingCustomId, setEditingCustomId] = useState<string | null>(null)
    const [editCustomText, setEditCustomText] = useState('')
    const [showImportModal, setShowImportModal] = useState(false)
    const [importText, setImportText] = useState('')
    const [allClauses, setAllClauses] = useState<PIClause[]>([])
    const [selectedClauseIds, setSelectedClauseIds] = useState<Set<string>>(new Set())
    const [vesselTypes, setVesselTypes] = useState<{ id: string; name: string }[]>([])
    const autoApplied = useRef(false)
    const dragExcRef = useRef<number | null>(null)
    const dragCustomRef = useRef<number | null>(null)
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [all, qe, qv, ce, clauses, qClauses, vesselList, vTypes] = await Promise.all([
            window.api.piGetExclusions(),
            window.api.getQuotationExclusions(quotation.id),
            window.api.getQuotationVessels(quotation.id),
            window.api.getQuotationCustomExclusions(quotation.id),
            window.api.piGetClauses(),
            window.api.getQuotationClauses(quotation.id),
            window.api.getVessels(),
            window.api.getVesselTypes()
        ])
        setVesselTypes(Array.isArray(vTypes) ? vTypes : [])
        const safeAll = Array.isArray(all) ? all : []
        setAllExclusions(safeAll)
        const safeQe = Array.isArray(qe) ? qe : []
        setSelectedRows(safeQe)
        const currentIds = new Set(safeQe.filter((e: any) => e.piExclusionId).map((e: any) => e.piExclusionId as string))
        const safeQv = Array.isArray(qv) ? qv : []
        setQVessels(safeQv)
        setCustomExclusions(Array.isArray(ce) ? ce : [])
        setAllClauses(Array.isArray(clauses) ? clauses : [])
        const safeQClauses = Array.isArray(qClauses) ? qClauses : []
        setSelectedClauseIds(new Set(safeQClauses.map((c: any) => c.piClauseId || c.pi_clause_id || c.id)))
        const safeVesselList = Array.isArray(vesselList) ? vesselList : []

        // Auto-apply vessel-type-based exclusions on first load
        if (!autoApplied.current && safeQv.length > 0) {
            autoApplied.current = true
            const vesselTypeNames = new Set<string>()
            for (const qvItem of safeQv) {
                const reg = qvItem.vesselId ? safeVesselList.find((v: Vessel) => v.id === qvItem.vesselId) : null
                const vtype = reg?.vesselType || qvItem.vesselType
                if (vtype) vesselTypeNames.add(vtype.toLowerCase())
            }
            if (vesselTypeNames.size > 0) {
                // Get vessel types to map names to IDs
                const vesselTypes = await window.api.getVesselTypes()
                const vtIds = new Set((Array.isArray(vesselTypes) ? vesselTypes : [])
                    .filter((vt: any) => vesselTypeNames.has(vt.name.toLowerCase()))
                    .map((vt: any) => vt.id))
                const toAutoSelect = safeAll.filter(ex =>
                    !currentIds.has(ex.id) &&
                    (ex.vesselTypeIds || []).some((vtId: string) => vtIds.has(vtId))
                )
                if (toAutoSelect.length > 0) {
                    for (const ex of toAutoSelect) {
                        await window.api.addQuotationExclusion(quotation.id, ex.id, null)
                    }
                    const freshQe = await window.api.getQuotationExclusions(quotation.id)
                    setSelectedRows(Array.isArray(freshQe) ? freshQe : [])
                    showSuccess(`Auto-selected ${toAutoSelect.length} vessel-type exclusion${toAutoSelect.length > 1 ? 's' : ''}`)
                }
            }
        }
    }

    // Check if any cargo clause is selected (only relevant for cargo quotations)
    const isCargo = quotation.quotationTypeCode?.toLowerCase() === 'c'
    const hasCargoClause = isCargo || allClauses.some(c => c.isCargoRelated && selectedClauseIds.has(c.id))

    // Filter: hide cargo-related exclusions from non-cargo quotations
    const visibleExclusions = allExclusions.filter(e => {
        if (e.isCargoRelated && !isCargo && !hasCargoClause) return false
        return true
    })

    const toggle = async (id: string) => {
        const altId = piAlternatives.length >= 2 ? selectedPIAltId : null
        // Find the row matching this exclusion for the CURRENT alternative only
        const row = altId
            ? selectedRows.find((r: any) => r.piExclusionId === id && r.alternativeId === altId)
            : selectedRows.find((r: any) => r.piExclusionId === id)
        if (row) {
            await window.api.deleteQuotationExclusion(row.id)
        } else {
            await window.api.addQuotationExclusion(quotation.id, id, altId)
        }
        const qe = await window.api.getQuotationExclusions(quotation.id)
        setSelectedRows(Array.isArray(qe) ? qe : [])
    }

    const handleExcDragStart = (idx: number) => { dragExcRef.current = idx }
    const handleExcDrop = async (targetIdx: number) => {
        const fromIdx = dragExcRef.current
        dragExcRef.current = null
        if (fromIdx === null || fromIdx === targetIdx) return
        const altId = piAlternatives.length >= 2 ? selectedPIAltId : null
        const filtered = altId
            ? selectedRows.filter((r: any) => r.alternativeId === altId)
            : selectedRows
        const newOrder = [...filtered]
        const [moved] = newOrder.splice(fromIdx, 1)
        newOrder.splice(targetIdx, 0, moved)
        if (altId) {
            const otherRows = selectedRows.filter((r: any) => r.alternativeId !== altId)
            setSelectedRows([...otherRows, ...newOrder])
        } else {
            setSelectedRows(newOrder)
        }
        await window.api.reorderQuotationExclusions(newOrder.map(r => r.id))
    }

    const handleCustomDragStart = (idx: number) => { dragCustomRef.current = idx }
    const handleCustomDrop = async (targetIdx: number) => {
        const fromIdx = dragCustomRef.current
        dragCustomRef.current = null
        if (fromIdx === null || fromIdx === targetIdx) return
        const newOrder = [...customExclusions]
        const [moved] = newOrder.splice(fromIdx, 1)
        newOrder.splice(targetIdx, 0, moved)
        setCustomExclusions(newOrder)
        await window.api.reorderQuotationCustomExclusions(newOrder.map(ce => ce.id))
    }

    const updateExclusionScope = async (id: string, scope: string[] | null) => {
        setSelectedRows(prev => prev.map(e => e.id === id ? { ...e, vesselScope: scope } : e))
        await window.api.updateQuotationItemVesselScope('quotation_exclusions', id, scope)
    }

    const updateExclusionAltId = async (id: string, altId: string | null) => {
        await window.api.updateQuotationItemAlternativeId('quotation_exclusions', id, altId)
        setSelectedRows(prev => prev.map(e => e.id === id ? { ...e, alternativeId: altId } : e))
    }

    const updateCustomExclusionAltId = async (id: string, altId: string | null) => {
        await window.api.updateQuotationItemAlternativeId('quotation_custom_exclusions', id, altId)
        setCustomExclusions(prev => prev.map(ce => ce.id === id ? { ...ce, alternativeId: altId } : ce))
    }

    // Custom exclusion handlers
    const addCustom = async () => {
        if (!newCustomText.trim()) return
        const altId = piAlternatives.length >= 2 ? selectedPIAltId : null
        const result = await window.api.addQuotationCustomExclusion({ quotationId: quotation.id, text: newCustomText.trim(), order: customExclusions.length })
        if (altId && result && !(result as any).error) {
            await window.api.updateQuotationItemAlternativeId('quotation_custom_exclusions', result.id, altId)
            result.alternativeId = altId
        }
        if (result && !(result as any).error) {
            setCustomExclusions(prev => [...prev, result])
            setNewCustomText('')
            showSuccess('Custom exclusion added')
        }
    }

    const saveCustomEdit = async (id: string) => {
        await window.api.updateQuotationCustomExclusion(id, { text: editCustomText })
        setEditingCustomId(null)
        setCustomExclusions(prev => prev.map(ce => ce.id === id ? { ...ce, text: editCustomText } : ce))
        showSuccess('Updated')
    }

    const deleteCustom = async (id: string) => {
        await window.api.deleteQuotationCustomExclusion(id)
        setCustomExclusions(prev => prev.filter(ce => ce.id !== id))
        showSuccess('Deleted')
    }

    const updateCustomScope = async (id: string, scope: string[] | null) => {
        setCustomExclusions(prev => prev.map(ce => ce.id === id ? { ...ce, vesselScope: scope } : ce))
        await window.api.updateQuotationItemVesselScope('quotation_custom_exclusions', id, scope)
    }

    const handleImport = async () => {
        const lines = importText.split('\n')
            .map(l => l.replace(/^[\s•\-\*\u2022\u2023\u25E6\u2043\u2219\d.)+]+/, '').trim())
            .filter(l => l.length > 0)
        if (lines.length === 0) return
        for (let i = 0; i < lines.length; i++) {
            await window.api.addQuotationCustomExclusion({ quotationId: quotation.id, text: lines[i], order: customExclusions.length + i })
        }
        showSuccess(`Imported ${lines.length} custom exclusions`)
        setImportText(''); setShowImportModal(false)
        const ce = await window.api.getQuotationCustomExclusions(quotation.id)
        setCustomExclusions(Array.isArray(ce) ? ce : [])
    }

    const customTextareaRef = useRef<HTMLTextAreaElement>(null)
    const handleCustomTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setNewCustomText(e.target.value)
        if (customTextareaRef.current) {
            customTextareaRef.current.style.height = 'auto'
            customTextareaRef.current.style.height = Math.min(customTextareaRef.current.scrollHeight, 200) + 'px'
        }
    }

    // Count hidden cargo exclusions
    const hiddenCargoCount = allExclusions.filter(e => e.isCargoRelated && !hasCargoClause).length

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Exclusions</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 12px' }}>Select exclusions for this quotation. If an exclusion applies to multiple alternatives, select it separately for each alternative.</p>

            {hiddenCargoCount > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(255, 180, 0, 0.08)', border: '1px solid rgba(255, 180, 0, 0.3)', marginBottom: '12px', fontSize: '0.82rem', color: '#ffb400', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={14} />
                    {hiddenCargoCount} cargo-related exclusion{hiddenCargoCount > 1 ? 's' : ''} hidden (no cargo clauses selected in Conditions)
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {visibleExclusions.map(e => {
                    const row = selectedRows.find((r: any) => r.piExclusionId === e.id)
                    return (
                        <div key={e.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', background: selectedIds.has(e.id) ? 'rgba(0, 210, 255, 0.05)' : 'transparent' }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggle(e.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', marginTop: '2px' }} />
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{e.text}</span>
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
                                        {e.isCargoRelated && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(255, 180, 0, 0.15)', color: '#ffb400' }}>Cargo</span>}
                                        {(e.vesselTypeIds || []).map(vtId => {
                                            const vt = vesselTypes.find(t => t.id === vtId)
                                            return vt ? <span key={vtId} style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(160, 100, 255, 0.12)', color: '#a064ff' }}>{vt.name}</span> : null
                                        })}
                                    </div>
                                </div>
                            </label>
                            {row && (
                                <div style={{ paddingLeft: '30px' }}>
                                    {qVessels.length > 1 && <VesselScopeChips vessels={qVessels} vesselScope={row.vesselScope} onChange={scope => updateExclusionScope(row.id, scope)} />}
                                    <AlternativeScopeChips alternatives={piAlternatives} currentAltId={row.alternativeId || null} onChangeAltId={altId => updateExclusionAltId(row.id, altId)} />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
            {visibleExclusions.length === 0 && allExclusions.length === 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No exclusions defined. Add them in Settings.</p>}

            {/* Selected Exclusion Order */}
            {(() => {
                const altId = piAlternatives.length >= 2 ? selectedPIAltId : null
                const orderedSelected = altId
                    ? selectedRows.filter((r: any) => r.alternativeId === altId)
                    : selectedRows
                if (orderedSelected.length < 2) return null
                return (
                    <div style={{ marginTop: '16px', borderTop: '1px solid var(--table-border)', paddingTop: '12px' }}>
                        <h4 style={{ fontSize: '0.9rem', margin: '0 0 8px', color: 'var(--text-secondary)' }}>Selected Exclusion Order</h4>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '0 0 8px' }}>Reorder exclusions as they will appear in the export.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {orderedSelected.map((row: any, i: number) => {
                                const excl = row.piExclusionId ? allExclusions.find(e => e.id === row.piExclusionId) : null
                                const text = row.customText || excl?.text || '(unknown)'
                                const shortText = text.length > 80 ? text.slice(0, 80) + '...' : text
                                return (
                                    <div key={row.id} draggable onDragStart={() => handleExcDragStart(i)} onDragOver={e => e.preventDefault()} onDrop={() => handleExcDrop(i)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '5px', background: isLight ? '#f0f2f8' : 'rgba(255,255,255,0.03)', border: '1px solid var(--table-border)', fontSize: '0.8rem', cursor: 'grab' }}>
                                        <GripVertical size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.5 }} />
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', width: '20px', textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortText}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })()}

            {/* Custom Exclusions Section */}
            <div style={{ marginTop: '24px', borderTop: '1px solid var(--table-border)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '0.95rem', margin: 0 }}>Custom Exclusions</h4>
                    <button onClick={() => setShowImportModal(true)} className="btn-secondary" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px' }}><Upload size={13} /> Import</button>
                </div>

                {customExclusions.filter(ce => {
                    if (piAlternatives.length < 2 || !selectedPIAltId) return true
                    return ce.alternativeId === selectedPIAltId
                }).map((ce, i) => (
                    <div key={ce.id} draggable={editingCustomId !== ce.id} onDragStart={() => handleCustomDragStart(i)} onDragOver={e => e.preventDefault()} onDrop={() => handleCustomDrop(i)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', background: 'rgba(0, 210, 255, 0.03)', cursor: editingCustomId === ce.id ? 'default' : 'grab' }}>
                        {editingCustomId === ce.id ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                                <textarea value={editCustomText} onChange={e => setEditCustomText(e.target.value)} style={{ flex: 1, minHeight: '40px', resize: 'none' }} />
                                <button onClick={() => saveCustomEdit(ce.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                                <button onClick={() => setEditingCustomId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <GripVertical size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.5, marginTop: '2px' }} />
                                <span style={{ flex: 1, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{ce.text}</span>
                                <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                    <button onClick={() => { setEditingCustomId(ce.id); setEditCustomText(ce.text) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)' }}><Pencil size={12} /></button>
                                    <button onClick={() => deleteCustom(ce.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                                </div>
                            </div>
                        )}
                        {editingCustomId !== ce.id && (
                            <div style={{ marginTop: '4px' }}>
                                {qVessels.length > 1 && <VesselScopeChips vessels={qVessels} vesselScope={ce.vesselScope} onChange={scope => updateCustomScope(ce.id, scope)} />}
                                <AlternativeScopeChips alternatives={piAlternatives} currentAltId={ce.alternativeId || null} onChangeAltId={altId => updateCustomExclusionAltId(ce.id, altId)} />
                            </div>
                        )}
                    </div>
                ))}

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginTop: '8px' }}>
                    <textarea ref={customTextareaRef} value={newCustomText} onChange={handleCustomTextChange} placeholder="Add custom exclusion..." style={{ flex: 1, minHeight: '36px', maxHeight: '200px', resize: 'none', fontSize: '0.85rem' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCustom() } }} />
                    <button onClick={addCustom} disabled={!newCustomText.trim()} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Plus size={14} /> Add</button>
                </div>
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowImportModal(false)}>
                    <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '12px', padding: '24px', width: '500px', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Import Custom Exclusions</h3>
                            <button onClick={() => setShowImportModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Paste exclusions (one per line). Bullets, dashes, and numbering will be stripped.</p>
                        <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste exclusions here..." style={{ width: '100%', minHeight: '200px', resize: 'vertical', marginBottom: '12px' }} />
                        {importText.trim() && (
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                {importText.split('\n').map(l => l.replace(/^[\s•\-\*\u2022\u2023\u25E6\u2043\u2219\d.)+]+/, '').trim()).filter(l => l.length > 0).length} exclusion(s) detected
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowImportModal(false)} className="btn-secondary">Cancel</button>
                            <button onClick={handleImport} className="btn-primary" disabled={!importText.trim()}>Import</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
