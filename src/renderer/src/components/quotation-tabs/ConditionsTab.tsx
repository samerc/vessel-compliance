import { useState, useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { Quotation, PIClause, PIClauseSet, PIAdditionalClause, PIAdditionalClauseSet, PIWarranty, PIExclusion, QuotationPIAlternative, QuotationVessel } from '../../../../shared/types'
import VesselScopeChips from '../VesselScopeChips'
import { AlternativeScopeChips } from './shared'

export default function ConditionsTab({ quotation, showSuccess, showError, piAlternatives = [], selectedPIAltId = null }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; piAlternatives?: QuotationPIAlternative[]; selectedPIAltId?: string | null }) {
    const [subTab, setSubTab] = useState<'clauses' | 'additional'>('clauses')
    const [allClauses, setAllClauses] = useState<PIClause[]>([])
    const [clauseSets, setClauseSets] = useState<PIClauseSet[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [clauseRows, setClauseRows] = useState<{ id: string; piClauseId: string; alternativeId: string | null }[]>([])
    const [clauseVesselScopes, setClauseVesselScopes] = useState<Record<string, string[] | null>>({})
    const [clauseAltIds, setClauseAltIds] = useState<Record<string, string | null>>({})
    const [descOverrides, setDescOverrides] = useState<Record<string, string>>({})
    const [additionalClauses, setAdditionalClauses] = useState<any[]>([])
    const [allAdditional, setAllAdditional] = useState<PIAdditionalClause[]>([])
    const [additionalClauseSets, setAdditionalClauseSets] = useState<PIAdditionalClauseSet[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const additionalDefaultsApplied = useRef(false)
    const clauseDefaultsApplied = useRef(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [clauses, sets, selected, overrides, addClauses, allAdd, addSets, qv] = await Promise.all([
            window.api.piGetClauses(),
            window.api.piGetClauseSets(),
            window.api.getQuotationClauses(quotation.id),
            window.api.getQuotationClauseOverrides(quotation.id),
            window.api.getQuotationAdditionalClauses(quotation.id),
            window.api.piGetAdditionalClauses(),
            window.api.piGetAdditionalClauseSets(),
            window.api.getQuotationVessels(quotation.id)
        ])
        setAllClauses(Array.isArray(clauses) ? clauses : [])
        setClauseSets(Array.isArray(sets) ? sets : [])
        const safeSelected = Array.isArray(selected) ? selected : []
        setSelectedIds(new Set(safeSelected.map((r: any) => r.piClauseId)))
        setClauseRows(safeSelected.map((r: any) => ({ id: r.id, piClauseId: r.piClauseId, alternativeId: r.alternativeId || null })))
        setClauseVesselScopes(safeSelected.reduce((m: Record<string, string[] | null>, r: any) => { if (r.vesselScope) m[r.piClauseId] = r.vesselScope; return m }, {}))
        setClauseAltIds(safeSelected.reduce((m: Record<string, string | null>, r: any) => { m[r.piClauseId] = r.alternativeId || null; return m }, {}))
        setDescOverrides(overrides && !(overrides as any).error ? overrides : {})
        const safeAddCl = Array.isArray(addClauses) ? addClauses : []
        setAdditionalClauses(safeAddCl)
        const safeAllAdd = Array.isArray(allAdd) ? allAdd : []
        setAllAdditional(safeAllAdd)
        setAdditionalClauseSets(Array.isArray(addSets) ? addSets : [])
        setQVessels(Array.isArray(qv) ? qv : [])

        // Auto-select all active clauses on first load if none are selected
        const safeClauses = Array.isArray(clauses) ? clauses : []
        if (!clauseDefaultsApplied.current && safeSelected.length === 0 && safeClauses.length > 0) {
            clauseDefaultsApplied.current = true
            const allClauseIds = safeClauses.map((c: PIClause) => c.id)
            try {
                await window.api.setQuotationClauses(quotation.id, allClauseIds, {})
                const freshSelected = await window.api.getQuotationClauses(quotation.id)
                const safeFresh = Array.isArray(freshSelected) ? freshSelected : []
                setSelectedIds(new Set(safeFresh.map((r: any) => r.piClauseId)))
                setClauseRows(safeFresh.map((r: any) => ({ id: r.id, piClauseId: r.piClauseId, alternativeId: r.alternativeId || null })))
            } catch (err) {
                // Silently fail — user can manually select
            }
        } else {
            clauseDefaultsApplied.current = true
        }

        // Auto-add default additional clauses on first load if none exist
        if (!additionalDefaultsApplied.current && safeAddCl.length === 0 && safeAllAdd.length > 0) {
            additionalDefaultsApplied.current = true
            // Collect clause IDs from default sets + individually default-selected clauses
            const defaultSetClauseIds = new Set<string>()
            const safeAddSets = Array.isArray(addSets) ? addSets : []
            for (const s of safeAddSets) {
                if (s.defaultSelected && s.clauseIds) {
                    for (const cid of s.clauseIds) defaultSetClauseIds.add(cid)
                }
            }
            const defaults = safeAllAdd.filter(c => c.defaultSelected || defaultSetClauseIds.has(c.id))
            // Deduplicate (set clauses first, then individually selected)
            const seen = new Set<string>()
            const ordered: typeof defaults = []
            // Add set clauses in set order first
            for (const s of safeAddSets) {
                if (s.defaultSelected && s.clauseIds) {
                    for (const cid of s.clauseIds) {
                        if (!seen.has(cid)) { seen.add(cid); const c = safeAllAdd.find(x => x.id === cid); if (c) ordered.push(c) }
                    }
                }
            }
            // Then individually default-selected clauses not in any set
            for (const c of defaults) {
                if (!seen.has(c.id)) { seen.add(c.id); ordered.push(c) }
            }
            for (let i = 0; i < ordered.length; i++) {
                await window.api.addQuotationAdditionalClause({ quotationId: quotation.id, piAdditionalClauseId: ordered[i].id, order: i })
            }
            if (ordered.length > 0) {
                const freshAdd = await window.api.getQuotationAdditionalClauses(quotation.id)
                setAdditionalClauses(Array.isArray(freshAdd) ? freshAdd : [])
            }
        } else {
            additionalDefaultsApplied.current = true
        }
    }

    const toggleClause = async (clauseId: string) => {
        const hasPIAlts = piAlternatives.length >= 2
        const altId = hasPIAlts ? selectedPIAltId : null

        if (hasPIAlts && altId) {
            // Per-alternative toggle: add/remove clause row for this specific alternative
            const existingRow = clauseRows.find(r => r.piClauseId === clauseId && r.alternativeId === altId)
            try {
                if (existingRow) {
                    await window.api.deleteQuotationClause(quotation.id, clauseId, altId)
                    setClauseRows(prev => prev.filter(r => !(r.piClauseId === clauseId && r.alternativeId === altId)))
                } else {
                    const result = await window.api.addQuotationClause(quotation.id, clauseId, altId)
                    if (result && !(result as any).error) {
                        setClauseRows(prev => [...prev, { id: result.id, piClauseId: clauseId, alternativeId: altId }])
                    }
                }
                // Refresh selectedIds from all rows
                const fresh = await window.api.getQuotationClauses(quotation.id)
                const safeFresh = Array.isArray(fresh) ? fresh : []
                setSelectedIds(new Set(safeFresh.map((r: any) => r.piClauseId)))
                setClauseRows(safeFresh.map((r: any) => ({ id: r.id, piClauseId: r.piClauseId, alternativeId: r.alternativeId || null })))
                setClauseAltIds(safeFresh.reduce((m: Record<string, string | null>, r: any) => { m[r.piClauseId] = r.alternativeId || null; return m }, {}))
            } catch (err: any) { showError(err.message || 'Failed') }
        } else {
            // Original bulk toggle (no alternatives or viewing "All")
            const newSet = new Set(selectedIds)
            const isDeselecting = newSet.has(clauseId)
            if (isDeselecting) newSet.delete(clauseId)
            else newSet.add(clauseId)
            setSelectedIds(newSet)
            try {
                await window.api.setQuotationClauses(quotation.id, Array.from(newSet), descOverrides)
                // When deselecting a cargo-related clause, auto-deselect cargo warranties
                const clause = allClauses.find(c => c.id === clauseId)
                if (isDeselecting && clause?.isCargoRelated) {
                    const remainingCargoClauseSelected = allClauses.some(c => c.isCargoRelated && c.id !== clauseId && newSet.has(c.id))
                    if (!remainingCargoClauseSelected) {
                        const [allWarranties, currentWarrantyRows, allExclusions, currentExclusionRows] = await Promise.all([
                            window.api.piGetWarranties(),
                            window.api.getQuotationWarranties(quotation.id),
                            window.api.piGetExclusions(),
                            window.api.getQuotationExclusions(quotation.id)
                        ])
                        const currentWarrantyIds = (Array.isArray(currentWarrantyRows) ? currentWarrantyRows : []).map((r: any) => r.piWarrantyId)
                        const cargoWarrantyIds = new Set(allWarranties.filter((w: PIWarranty) => w.isCargoRelated).map((w: PIWarranty) => w.id))
                        const filteredWarranties = currentWarrantyIds.filter((id: string) => !cargoWarrantyIds.has(id))
                        if (filteredWarranties.length < currentWarrantyIds.length) {
                            await window.api.setQuotationWarranties(quotation.id, filteredWarranties)
                            showSuccess('Cargo warranties auto-removed (no cargo clauses selected)')
                        }
                        const safeExRows = Array.isArray(currentExclusionRows) ? currentExclusionRows : []
                        const cargoExclusionIds = new Set((Array.isArray(allExclusions) ? allExclusions : []).filter((ex: PIExclusion) => ex.isCargoRelated).map((ex: PIExclusion) => ex.id))
                        const filteredExclusions = safeExRows.filter((r: any) => !r.piExclusionId || !cargoExclusionIds.has(r.piExclusionId))
                        if (filteredExclusions.length < safeExRows.length) {
                            await window.api.setQuotationExclusions(quotation.id, filteredExclusions.map((r: any) => ({ piExclusionId: r.piExclusionId, customText: r.customText })))
                            showSuccess('Cargo exclusions auto-removed (no cargo clauses selected)')
                        }
                    }
                }
            } catch (err: any) {
                showError(err.message || 'Failed to save clause selection')
            }
        }
    }

    const applySet = async (setId: string) => {
        const cs = clauseSets.find(s => s.id === setId)
        if (!cs?.clauseIds) return
        const hasPIAlts = piAlternatives.length >= 2
        const altId = hasPIAlts ? selectedPIAltId : null

        if (hasPIAlts && altId) {
            // Per-alternative: remove existing clauses for this alt, then add new set
            const existingForAlt = clauseRows.filter(r => r.alternativeId === altId)
            for (const row of existingForAlt) {
                await window.api.deleteQuotationClause(quotation.id, row.piClauseId, altId)
            }
            for (const cid of cs.clauseIds) {
                await window.api.addQuotationClause(quotation.id, cid, altId)
            }
            // Apply description overrides scoped to this alternative
            if (cs.descriptionOverrides) {
                for (const [cid, desc] of Object.entries(cs.descriptionOverrides)) {
                    if (desc) await window.api.updateQuotationClauseOverride(quotation.id, cid, desc, altId)
                }
            }
            showSuccess(`Applied "${cs.name}" to ${piAlternatives.find(a => a.id === altId)?.label || 'alternative'}`)
        } else {
            // Bulk set (no alternatives or viewing "All")
            const mergedOverrides = { ...descOverrides, ...cs.descriptionOverrides }
            setDescOverrides(mergedOverrides)
            await window.api.setQuotationClauses(quotation.id, cs.clauseIds, mergedOverrides)
            showSuccess(`Applied "${cs.name}" clause set`)
        }
        loadData()
    }

    // Resolve override key: clauseId::altId for alt-specific, clauseId for shared
    const overrideKey = (clauseId: string) => {
        if (piAlternatives.length < 2 || !selectedPIAltId) return clauseId
        return `${clauseId}::${selectedPIAltId}`
    }
    const getOverride = (clauseId: string) => {
        if (piAlternatives.length >= 2 && selectedPIAltId) return descOverrides[`${clauseId}::${selectedPIAltId}`]
        return descOverrides[clauseId]
    }

    const updateDescOverride = async (clauseId: string, desc: string) => {
        const clause = allClauses.find(c => c.id === clauseId)
        const override = desc === (clause?.description || '') ? null : desc
        const key = overrideKey(clauseId)
        if (override) {
            setDescOverrides(prev => ({ ...prev, [key]: override }))
        } else {
            setDescOverrides(prev => { const n = { ...prev }; delete n[key]; return n })
        }
        await window.api.updateQuotationClauseOverride(quotation.id, clauseId, override, piAlternatives.length >= 2 ? selectedPIAltId : undefined)
    }

    const updateClauseScope = async (piClauseId: string, scope: string[] | null) => {
        setClauseVesselScopes(prev => ({ ...prev, [piClauseId]: scope }))
        await window.api.updateQuotationClauseVesselScope(quotation.id, piClauseId, scope)
    }

    const updateClauseAltId = async (clauseId: string, altId: string | null) => {
        // Find the row id for this clause
        const selected = await window.api.getQuotationClauses(quotation.id)
        const row = (Array.isArray(selected) ? selected : []).find((r: any) => r.piClauseId === clauseId)
        if (row) {
            await window.api.updateQuotationItemAlternativeId('quotation_clauses', row.id, altId)
            setClauseAltIds(prev => ({ ...prev, [clauseId]: altId }))
        }
    }

    // For per-alternative view: determine which clauses are checked for the viewed alternative
    const isClauseCheckedForAlt = (clauseId: string): boolean => {
        if (!selectedPIAltId || piAlternatives.length < 2) return selectedIds.has(clauseId)
        // Checked if there's a row for this alt specifically, OR a shared row (null)
        return clauseRows.some(r => r.piClauseId === clauseId && (r.alternativeId === selectedPIAltId || !r.alternativeId))
    }

    const updateAdditionalClauseScope = async (id: string, scope: string[] | null) => {
        setAdditionalClauses(prev => prev.map(c => c.id === id ? { ...c, vesselScope: scope } : c))
        await window.api.updateQuotationItemVesselScope('quotation_additional_clauses', id, scope)
    }

    const updateAdditionalClauseAltId = async (id: string, altId: string | null) => {
        try {
            await window.api.updateQuotationItemAlternativeId('quotation_additional_clauses', id, altId)
            setAdditionalClauses(prev => prev.map(c => c.id === id ? { ...c, alternativeId: altId } : c))
        } catch { /* ignore */ }
    }

    const addAdditionalClause = async (clauseId: string) => {
        const clause = allAdditional.find(c => c.id === clauseId)
        if (!clause) return
        await window.api.addQuotationAdditionalClause({ quotationId: quotation.id, piAdditionalClauseId: clauseId, order: additionalClauses.length })
        showSuccess('Additional clause added')
        loadData()
    }

    const applyAdditionalSet = async (setId: string) => {
        const set = additionalClauseSets.find(s => s.id === setId)
        if (!set?.clauseIds) return
        const alreadyIds = new Set(additionalClauses.map((ac: any) => ac.piAdditionalClauseId))
        const toAdd = set.clauseIds.filter(id => !alreadyIds.has(id))
        for (let i = 0; i < toAdd.length; i++) {
            await window.api.addQuotationAdditionalClause({ quotationId: quotation.id, piAdditionalClauseId: toAdd[i], order: additionalClauses.length + i })
        }
        showSuccess(`Applied "${set.name}"`)
        loadData()
    }

    return (
        <div>
            {/* Sub-tab bar */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '2px solid var(--table-border)', paddingBottom: '0' }}>
                <button onClick={() => setSubTab('clauses')} style={{ padding: '8px 18px', fontSize: '0.88rem', fontWeight: 600, border: 'none', borderBottom: subTab === 'clauses' ? '2px solid var(--accent-primary)' : '2px solid transparent', background: 'transparent', color: subTab === 'clauses' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', marginBottom: '-2px', transition: 'color 0.15s' }}>
                    Clauses <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: '10px', background: 'rgba(0,170,200,0.1)', color: 'var(--accent-primary)', marginLeft: '6px' }}>{selectedIds.size}</span>
                </button>
                <button onClick={() => setSubTab('additional')} style={{ padding: '8px 18px', fontSize: '0.88rem', fontWeight: 600, border: 'none', borderBottom: subTab === 'additional' ? '2px solid var(--accent-primary)' : '2px solid transparent', background: 'transparent', color: subTab === 'additional' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', marginBottom: '-2px', transition: 'color 0.15s' }}>
                    Additional Clauses <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: '10px', background: 'rgba(0,170,200,0.1)', color: 'var(--accent-primary)', marginLeft: '6px' }}>{additionalClauses.length}</span>
                </button>
            </div>

            {/* Clauses sub-tab */}
            {subTab === 'clauses' && (
                <div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                        Select the P&I conditions and clauses. Use clause set presets for quick selection. Override descriptions as needed.
                    </p>
                    {clauseSets.length > 0 && (
                        <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Presets:</span>
                            {clauseSets.map(cs => (
                                <button key={cs.id} onClick={() => applySet(cs.id)} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.78rem' }}>{cs.name}</button>
                            ))}
                        </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {allClauses.map(c => {
                            const checked = isClauseCheckedForAlt(c.id)
                            return (
                            <div key={c.id} style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--table-border)', background: checked ? 'rgba(0, 210, 255, 0.05)' : 'transparent' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={checked} onChange={() => toggleClause(c.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem', minWidth: '60px' }}>Cl. {c.clauseNumber}</span>
                                    <span style={{ fontSize: '0.85rem' }}>{c.name}</span>
                                    {c.isCargoRelated && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255, 180, 0, 0.15)', color: '#ffb400' }}>Cargo</span>}
                                    {getOverride(c.id) && <span style={{ fontSize: '0.65rem', color: 'var(--accent-primary)' }}>(edited)</span>}
                                </label>
                                {checked && (c.description || getOverride(c.id)) && (
                                    <div style={{ marginTop: '6px', marginLeft: '32px' }}>
                                        <input type="text" value={getOverride(c.id) ?? c.description ?? ''} onChange={e => setDescOverrides(prev => ({ ...prev, [overrideKey(c.id)]: e.target.value }))} onBlur={e => updateDescOverride(c.id, e.target.value)} placeholder="Clause description..." style={{ width: '100%', fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                                    </div>
                                )}
                                {checked && !selectedPIAltId && (
                                    <div style={{ paddingLeft: '30px' }}>
                                        <VesselScopeChips vessels={qVessels} vesselScope={clauseVesselScopes[c.id]} onChange={scope => updateClauseScope(c.id, scope)} />
                                        <AlternativeScopeChips alternatives={piAlternatives} currentAltId={clauseAltIds[c.id] || null} onChangeAltId={altId => updateClauseAltId(c.id, altId)} />
                                    </div>
                                )}
                            </div>
                        )})}
                    </div>
                </div>
            )}

            {/* Additional Clauses sub-tab */}
            {subTab === 'additional' && (
                <div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                        Additional clauses appended after the main conditions in exports. Use presets or add individually.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {additionalClauseSets.length > 0 && (
                            <>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Presets:</span>
                                {additionalClauseSets.map(s => (
                                    <button key={s.id} onClick={() => applyAdditionalSet(s.id)} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.78rem' }}>{s.name}</button>
                                ))}
                                <span style={{ color: 'var(--table-border)', fontSize: '0.7rem' }}>|</span>
                            </>
                        )}
                        {allAdditional.length > 0 && (() => {
                            const alreadyIds = new Set(additionalClauses.map((ac: any) => ac.piAdditionalClauseId))
                            return (
                            <select onChange={e => { if (e.target.value) { addAdditionalClause(e.target.value); e.target.value = '' } }} style={{ padding: '6px 10px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)', fontSize: '0.83rem' }} value="">
                                <option value="">Add individual clause…</option>
                                {allAdditional.map(ac => {
                                    const added = alreadyIds.has(ac.id)
                                    return (
                                    <option key={ac.id} value={ac.id} disabled={added} style={added ? { color: 'var(--text-secondary)' } : undefined}>
                                        {added ? '\u2713 ' : ''}{ac.title ? `${ac.title} — ` : ''}{ac.code ? `[${ac.code}] ` : ''}{ac.text.substring(0, 70)}{ac.text.length > 70 ? '…' : ''}
                                    </option>
                                )})}
                            </select>
                        )})()}
                    </div>
                    {additionalClauses.map((ac: any) => {
                        const def = allAdditional.find(a => a.id === ac.piAdditionalClauseId)
                        const code = def?.code || ''
                        const text = ac.customText || def?.text || ''
                        return (
                            <div key={ac.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <span style={{ color: 'var(--accent-primary)', fontFamily: 'monospace', fontSize: '0.9rem', flexShrink: 0, marginTop: '1px' }}>-</span>
                                    <span style={{ flex: 1, fontSize: '0.83rem', whiteSpace: 'pre-wrap' }}>
                                        {def?.title && <span style={{ fontWeight: 600, marginRight: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>{def.title}</span>}
                                        {code && <span style={{ fontWeight: 700, marginRight: '6px', color: 'var(--text-primary)' }}>{code}</span>}
                                        {text}
                                    </span>
                                    <button onClick={async () => { await window.api.deleteQuotationAdditionalClause(ac.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px', flexShrink: 0 }}><Trash2 size={14} /></button>
                                </div>
                                <div style={{ paddingLeft: '30px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <VesselScopeChips vessels={qVessels} vesselScope={ac.vesselScope} onChange={scope => updateAdditionalClauseScope(ac.id, scope)} />
                                    {piAlternatives.length >= 2 && <AlternativeScopeChips alternatives={piAlternatives} currentAltId={ac.alternativeId || null} onChangeAltId={altId => updateAdditionalClauseAltId(ac.id, altId)} />}
                                </div>
                            </div>
                        )
                    })}
                    {additionalClauses.length === 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>No additional clauses added yet. Default clauses are auto-selected on first load.</p>}
                </div>
            )}
        </div>
    )
}
