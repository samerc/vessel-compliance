import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, X, Pencil, Save, Search, Download } from 'lucide-react'
import { Quotation, PISubjectivity, QuotationSubjectivity, QuotationVessel, DocumentType, Entity } from '../../../../shared/types'
import { resolveEffectivePolicyExpiry } from '../../utils/policyUtils'
import VesselScopeChips from '../VesselScopeChips'

export default function SubjectivitiesTab({ quotation, showSuccess, isLight }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
    const [items, setItems] = useState<QuotationSubjectivity[]>([])
    const [masterList, setMasterList] = useState<PISubjectivity[]>([])
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [newText, setNewText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [showMasterPicker, setShowMasterPicker] = useState(false)
    const [subjectivityDays, setSubjectivityDays] = useState(quotation.subjectivityDays ?? 0)
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [scopeAutoDetected, setScopeAutoDetected] = useState(false)
    const autoPopulateRan = useRef(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [subjs, masters, dts, qv] = await Promise.all([
            window.api.getQuotationSubjectivities(quotation.id),
            window.api.getPISubjectivities(),
            window.api.getDocumentTypes(),
            window.api.getQuotationVessels(quotation.id)
        ])
        const safeSubjs = Array.isArray(subjs) ? subjs : []
        const safeMasters = Array.isArray(masters) ? masters : []
        const safeDts = Array.isArray(dts) ? dts : []
        // Filter masters by quotation type scope
        const typeCode = quotation.quotationTypeCode?.toLowerCase() === 'h' ? 'hull' : quotation.quotationTypeCode?.toLowerCase() === 'w' ? 'war' : quotation.quotationTypeCode?.toLowerCase() === 'c' ? 'cargo' : 'pi'
        const filteredMasters = safeMasters.filter(m => !m.typeScope || m.typeScope === 'all' || m.typeScope.split(',').includes(typeCode))
        setItems(safeSubjs)
        setMasterList(filteredMasters)
        setDocTypes(safeDts)
        setQVessels(Array.isArray(qv) ? qv : [])

        // Auto-populate on first load if no subjectivities yet (skip for War — subjectivities not included by default)
        if (!autoPopulateRan.current && safeSubjs.length === 0 && filteredMasters.length > 0 && quotation.quotationTypeCode !== 'W') {
            autoPopulateRan.current = true
            await autoPopulate(filteredMasters, safeDts)
        }
    }

    const autoPopulate = async (masters: PISubjectivity[], dts: DocumentType[]) => {
        if (masters.length === 0) return
        try {
            const qVessels: QuotationVessel[] = await window.api.getQuotationVessels(quotation.id)
            const linkedVessels = qVessels.filter(qv => qv.vesselId)
            const hasRealVessel = linkedVessels.length > 0

            const toAdd: PISubjectivity[] = []

            if (!hasRealVessel) {
                // No vessel in DB — add all master subjectivities
                toAdd.push(...masters)
            } else {
                // Check each vessel's doc status
                const missingDocTypeIds = new Set<string>()

                for (const qv of linkedVessels) {
                    const vesselDocs = await window.api.getVesselDocuments(qv.vesselId!)
                    const vesselDocMap = new Map(vesselDocs.map((d: any) => [d.documentTypeId || d.document_type_id, d]))

                    // Check required doc types only — optional docs are excluded from auto-populate
                    for (const dt of dts) {
                        if (!dt.required) continue
                        const doc = vesselDocMap.get(dt.id)
                        if (!doc || !doc.filePath) {
                            missingDocTypeIds.add(dt.id)
                            continue
                        }
                        // For annual types — check if expiring soon (P&I policy logic)
                        if (dt.annualRenewal) {
                            try {
                                const policies = await window.api.getVesselDynamicPolicies(qv.vesselId!)
                                const effectiveExpiry = resolveEffectivePolicyExpiry(policies) || doc.expiryDate
                                if (effectiveExpiry) {
                                    const daysLeft = Math.ceil((new Date(effectiveExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                                    if (daysLeft <= 60) missingDocTypeIds.add(dt.id)
                                }
                            } catch { /* skip policy check errors */ }
                        }
                    }
                }

                // Also check assured entity documents
                try {
                    const qAssureds = await window.api.getQuotationAssureds(quotation.id)
                    const allEntities = await window.api.getEntities()
                    const edTypesRaw = await window.api.getEntityDocumentTypes()
                    const edDocsRaw = await window.api.getEntityDocuments()
                    const activeEdTypes = (Array.isArray(edTypesRaw) ? edTypesRaw : []).filter((t: any) => t.isActive && t.isRequired)
                    const allEdDocs = Array.isArray(edDocsRaw) ? edDocsRaw : []
                    for (const qa of (Array.isArray(qAssureds) ? qAssureds : [])) {
                        if (!qa.entityId) continue
                        const entity = allEntities.find((e: any) => e.id === qa.entityId)
                        if (!entity) continue
                        for (const edt of activeEdTypes.filter((t: any) => t.entityScope === 'both' || t.entityScope === entity.type)) {
                            if (!allEdDocs.some((d: any) => d.entityId === entity.id && d.documentTypeId === edt.id && d.filePath)) {
                                missingDocTypeIds.add(`entity:${edt.id}`)
                            }
                        }
                    }
                } catch { /* ignore entity doc check errors */ }

                // Add master subjectivities whose linked doc types overlap with missing/expiring
                for (const m of masters) {
                    const shouldAdd = !m.docTypeIds || m.docTypeIds.length === 0 ||
                        m.docTypeIds.some(dtId => missingDocTypeIds.has(dtId))
                    if (shouldAdd) toAdd.push(m)
                }
            }

            // Insert the items
            let order = 0
            for (const m of toAdd) {
                await window.api.addQuotationSubjectivity({
                    quotationId: quotation.id,
                    piSubjectivityId: m.id,
                    text: m.text,
                    isAutoPopulated: true,
                    order: order++
                })
            }

            // Reload after auto-populate
            const refreshed = await window.api.getQuotationSubjectivities(quotation.id)
            const safeRefreshed = Array.isArray(refreshed) ? refreshed : []
            setItems(safeRefreshed)

            // Auto-detect vessel scopes when 2+ vessels
            if (qVessels.length >= 2 && safeRefreshed.length > 0) {
                try {
                    const scopes = await autoSetSubjectivityScopes(safeRefreshed, qVessels, masters)
                    const withScopes = safeRefreshed.map(s => ({ ...s, vesselScope: scopes[s.id] !== undefined ? scopes[s.id] : s.vesselScope }))
                    setItems(withScopes)
                    for (const s of withScopes) {
                        if (scopes[s.id] !== undefined) {
                            await window.api.updateQuotationSubjectivity(s.id, { vesselScope: scopes[s.id] })
                        }
                    }
                    setScopeAutoDetected(true)
                } catch { /* scope detection is best-effort */ }
            }
        } catch (err) {
            console.error('Auto-populate subjectivities error:', err)
        }
    }

    const handleAddCustom = async () => {
        if (!newText.trim()) return
        await window.api.addQuotationSubjectivity({
            quotationId: quotation.id,
            text: newText.trim(),
            isCustom: true,
            order: items.length
        })
        setNewText('')
        showSuccess('Custom subjectivity added')
        loadData()
    }

    const handleAddFromMaster = async (m: PISubjectivity) => {
        if (items.some(i => i.piSubjectivityId === m.id)) return
        await window.api.addQuotationSubjectivity({
            quotationId: quotation.id,
            piSubjectivityId: m.id,
            text: m.text,
            order: m.order ?? items.length
        })
        showSuccess('Added from master')
        // Re-sort all items by master order
        await resortByMasterOrder()
    }

    const resortByMasterOrder = async () => {
        const refreshed = await window.api.getQuotationSubjectivities(quotation.id)
        const safeItems = Array.isArray(refreshed) ? refreshed : []
        // Build order map from master list
        const masterOrderMap = new Map(masterList.map(m => [m.id, m.order ?? 999]))
        // Sort: master items by their settings order, custom items at end
        safeItems.sort((a, b) => {
            const aOrder = a.piSubjectivityId ? (masterOrderMap.get(a.piSubjectivityId) ?? 999) : 9999
            const bOrder = b.piSubjectivityId ? (masterOrderMap.get(b.piSubjectivityId) ?? 999) : 9999
            return aOrder - bOrder
        })
        // Save the new order
        for (let i = 0; i < safeItems.length; i++) {
            if (safeItems[i].order !== i) {
                await window.api.updateQuotationSubjectivity(safeItems[i].id, { order: i })
            }
        }
        setItems(safeItems.map((s, i) => ({ ...s, order: i })))
    }

    const handleUpdate = async () => {
        if (!editingId || !editText.trim()) return
        await window.api.updateQuotationSubjectivity(editingId, { text: editText.trim() })
        setEditingId(null)
        loadData()
    }

    const handleDelete = async (id: string) => {
        await window.api.deleteQuotationSubjectivity(id)
        loadData()
    }

    const handleMove = async (idx: number, dir: -1 | 1) => {
        const arr = [...items]
        const targetIdx = idx + dir
        if (targetIdx < 0 || targetIdx >= arr.length) return
        ;[arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]]
        setItems(arr)
        for (let i = 0; i < arr.length; i++) {
            await window.api.updateQuotationSubjectivity(arr[i].id, { order: i })
        }
    }

    const updateSubjectivityScope = async (id: string, scope: string[] | null) => {
        setItems(prev => prev.map(s => s.id === id ? { ...s, vesselScope: scope } : s))
        await window.api.updateQuotationSubjectivity(id, { vesselScope: scope })
    }

    const autoSetSubjectivityScopes = async (
        subjs: QuotationSubjectivity[],
        vessels: QuotationVessel[],
        allSubjDefs: PISubjectivity[]
    ): Promise<Record<string, string[] | null>> => {
        const scopes: Record<string, string[] | null> = {}

        // Pre-fetch all entities once for entity doc checks
        let allEntities: Entity[] = []
        try {
            const ents = await window.api.getEntities()
            allEntities = Array.isArray(ents) ? ents : []
        } catch { /* ignore */ }

        // Load entity document data
        let scopeEdTypes: any[] = []
        let scopeEdDocs: any[] = []
        try {
            const [edtRaw, eddRaw] = await Promise.all([window.api.getEntityDocumentTypes(), window.api.getEntityDocuments()])
            scopeEdTypes = (Array.isArray(edtRaw) ? edtRaw : []).filter((t: any) => t.isActive && t.isRequired)
            scopeEdDocs = Array.isArray(eddRaw) ? eddRaw : []
        } catch { /* ignore */ }

        // Pre-fetch vessel docs and assureds per vessel
        const vesselDocsMap = new Map<string, any[]>()
        const vesselAssuredsMap = new Map<string, any[]>()
        for (const qv of vessels) {
            if (!qv.vesselId) continue
            try {
                const [docs, assureds] = await Promise.all([
                    window.api.getVesselDocuments(qv.vesselId),
                    window.api.getVesselAssureds(qv.vesselId)
                ])
                vesselDocsMap.set(qv.vesselId, Array.isArray(docs) ? docs : [])
                vesselAssuredsMap.set(qv.vesselId, Array.isArray(assureds) ? assureds : [])
            } catch { /* ignore */ }
        }

        for (const subj of subjs) {
            const def = allSubjDefs.find(s => s.id === subj.piSubjectivityId)
            if (!def || !def.docTypeIds || def.docTypeIds.length === 0) {
                scopes[subj.id] = null // no doc mapping — applies to all
                continue
            }

            const entityDocTypeIds = def.docTypeIds.filter(id => id.startsWith('entity:'))
            const vesselDocTypeIds = def.docTypeIds.filter(id => !id.startsWith('entity:'))
            const needsVessels: string[] = []

            for (const qv of vessels) {
                if (!qv.vesselId) {
                    // Manual vessel — always needs the subjectivity
                    needsVessels.push(qv.id)
                    continue
                }

                const vesselDocs = vesselDocsMap.get(qv.vesselId) || []
                let vesselHasAll = true

                // Check vessel document types
                for (const dtId of vesselDocTypeIds) {
                    const hasDoc = vesselDocs.some((d: any) => (d.documentTypeId || d.document_type_id) === dtId && d.filePath)
                    if (!hasDoc) { vesselHasAll = false; break }
                }

                // Check entity documents dynamically
                if (vesselHasAll && entityDocTypeIds.length > 0) {
                    const assureds = vesselAssuredsMap.get(qv.vesselId) || []
                    for (const assured of assureds) {
                        if (!assured.entityId) continue
                        const entity = allEntities.find(e => e.id === assured.entityId)
                        if (!entity) continue
                        for (const eid of entityDocTypeIds) {
                            const edtId = eid.startsWith('entity:') ? eid.slice(7) : null
                            if (edtId) {
                                const edt = scopeEdTypes.find((t: any) => t.id === edtId)
                                if (edt && (edt.entityScope === 'both' || edt.entityScope === entity.type)) {
                                    if (!scopeEdDocs.some((d: any) => d.entityId === entity.id && d.documentTypeId === edtId && d.filePath)) {
                                        vesselHasAll = false; break
                                    }
                                }
                            }
                        }
                        if (!vesselHasAll) break
                    }
                }

                if (!vesselHasAll) needsVessels.push(qv.id)
            }

            // If all vessels need it → null (all). If none need it → null (keep for all, user can remove).
            if (needsVessels.length === vessels.length || needsVessels.length === 0) {
                scopes[subj.id] = null
            } else {
                scopes[subj.id] = needsVessels
            }
        }

        return scopes
    }

    const handleAutoDetectScopes = async () => {
        if (qVessels.length < 2) {
            showSuccess('Auto-detect requires 2 or more vessels')
            return
        }
        try {
            const scopes = await autoSetSubjectivityScopes(items, qVessels, masterList)
            const updated = items.map(s => ({ ...s, vesselScope: scopes[s.id] !== undefined ? scopes[s.id] : s.vesselScope }))
            setItems(updated)
            for (const s of updated) {
                if (scopes[s.id] !== undefined) {
                    await window.api.updateQuotationSubjectivity(s.id, { vesselScope: scopes[s.id] })
                }
            }
            setScopeAutoDetected(true)
            showSuccess('Vessel scopes auto-detected from uploaded documents')
        } catch (err) {
            console.error('Auto-detect scopes error:', err)
        }
    }

    const handleRePopulate = async () => {
        if (masterList.length === 0) {
            showSuccess('No master subjectivities configured — add them in Quotation Settings first')
            return
        }
        // Remove all non-custom items (auto-populated + old items without flag), then re-run
        const nonCustomItems = items.filter(i => !i.isCustom)
        for (const item of nonCustomItems) {
            await window.api.deleteQuotationSubjectivity(item.id)
        }
        await autoPopulate(masterList, docTypes)
        showSuccess('Re-populated from vessel documents')
    }

    const addedMasterIds = new Set(items.filter(i => i.piSubjectivityId).map(i => i.piSubjectivityId))
    const availableMasters = masterList.filter(m => !addedMasterIds.has(m.id))

    const inputStyle = { padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.85rem', width: '100%' }

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Subjectivities</h3>
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', background: 'var(--table-header-bg)', color: 'var(--text-secondary)' }}>{items.length}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    {qVessels.length >= 2 && items.length > 0 && (
                        <button onClick={handleAutoDetectScopes} className="btn-secondary" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Search size={14} /> Auto-detect Scopes
                        </button>
                    )}
                    {availableMasters.length > 0 && (
                        <button onClick={() => setShowMasterPicker(!showMasterPicker)} className="btn-secondary" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Plus size={14} /> From Master
                        </button>
                    )}
                    <button onClick={handleRePopulate} className="btn-secondary" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Download size={14} /> Re-populate
                    </button>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--table-border)' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Documents to be provided</span>
                <input
                    type="number" min={0}
                    value={subjectivityDays}
                    onChange={e => {
                        const v = Math.max(0, parseInt(e.target.value) || 0)
                        setSubjectivityDays(v)
                        window.api.updateQuotation(quotation.id, { subjectivityDays: v } as any).catch(() => {})
                    }}
                    style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--input-bg, transparent)', color: 'var(--text-primary)', fontSize: '0.85rem', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {subjectivityDays === 0 ? 'days (0 = prior inception)' : 'days prior inception'}
                </span>
            </div>

            {/* Master picker dropdown */}
            {showMasterPicker && availableMasters.length > 0 && (
                <div style={{ marginBottom: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: isLight ? '#f0faff' : 'rgba(0, 210, 255, 0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Select from master list:</span>
                        <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.72rem' }} onClick={async () => {
                            for (const m of availableMasters) {
                                if (items.some(i => i.piSubjectivityId === m.id)) continue
                                // Skip if all linked doc types are non-required (optional)
                                if (m.docTypeIds && m.docTypeIds.length > 0 && m.docTypeIds.every(id => {
                                    const dt = docTypes.find(d => d.id === id)
                                    return dt && !dt.required
                                })) continue
                                await window.api.addQuotationSubjectivity({ quotationId: quotation.id, piSubjectivityId: m.id, text: m.text, order: m.order ?? items.length })
                            }
                            showSuccess('All subjectivities added')
                            await resortByMasterOrder()
                            setShowMasterPicker(false)
                        }}>Select All</button>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{availableMasters.length} available</span>
                    </div>
                    {availableMasters.map(m => (
                        <div key={m.id} onClick={() => { handleAddFromMaster(m); setShowMasterPicker(false) }} style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '0.82rem', cursor: 'pointer', marginBottom: '4px', border: '1px solid var(--table-border)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0, 210, 255, 0.08)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            {m.text}
                            {m.docTypeIds && m.docTypeIds.length > 0 && (
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                                    ({m.docTypeIds.map(dtId => docTypes.find(d => d.id === dtId)?.name).filter(Boolean).join(', ')})
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Item list */}
            {items.map((item, idx) => (
                <div key={item.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {editingId === item.id ? (
                            <div style={{ flex: 1, display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <input value={editText} onChange={e => setEditText(e.target.value)} style={{ ...inputStyle, flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') handleUpdate(); if (e.key === 'Escape') setEditingId(null) }} autoFocus />
                                <button onClick={handleUpdate} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><Save size={12} /></button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><X size={12} /></button>
                            </div>
                        ) : (
                            <>
                                <span style={{ flex: 1, fontSize: '0.85rem' }}>
                                    {item.text}
                                    {item.isAutoPopulated && <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', marginLeft: '6px' }}>(auto)</span>}
                                    {item.isCustom && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>(custom)</span>}
                                    {scopeAutoDetected && item.vesselScope && item.vesselScope.length > 0 && <span style={{ fontSize: '0.68rem', color: '#44cc88', marginLeft: '4px' }}>(scope auto-detected)</span>}
                                </span>
                                <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleMove(idx, 1)} disabled={idx === items.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><ChevronDown size={14} /></button>
                                <button onClick={() => { setEditingId(item.id); setEditText(item.text) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><Pencil size={14} /></button>
                                <button onClick={() => handleDelete(item.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                            </>
                        )}
                    </div>
                    <div style={{ paddingLeft: '30px' }}>
                        <VesselScopeChips vessels={qVessels} vesselScope={item.vesselScope} onChange={scope => updateSubjectivityScope(item.id, scope)} />
                    </div>
                </div>
            ))}

            {/* Custom add */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <input type="text" value={newText} onChange={e => setNewText(e.target.value)} placeholder="Add custom subjectivity..." style={inputStyle} onKeyDown={e => { if (e.key === 'Enter') handleAddCustom() }} />
                <button onClick={handleAddCustom} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', flexShrink: 0 }}><Plus size={14} /> Add</button>
            </div>
        </div>
    )
}

