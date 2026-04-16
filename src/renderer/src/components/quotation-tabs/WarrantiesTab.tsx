import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, X, Pencil, Save, Upload, Search, Check } from 'lucide-react'
import { Quotation, PIWarranty, PIWarrantyTag, PIWarrantySet, QuotationCustomWarranty, QuotationPIAlternative, QuotationVessel, PISectionTexts } from '../../../../shared/types'
import { useTheme } from '../../contexts/ThemeContext'
import RichTextEditor from '../RichTextEditor'
import VesselScopeChips from '../VesselScopeChips'
import { AlternativeScopeChips, ALT_COLORS } from './shared'

export default function WarrantiesTab({ quotation, showSuccess, showError, updateField, setQ, getEffectiveText, piAlternatives = [], selectedPIAltId = null }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; getEffectiveText: (key: keyof PISectionTexts) => string; piAlternatives?: QuotationPIAlternative[]; selectedPIAltId?: string | null }) {
    const altStyle = (altId: string | null | undefined): React.CSSProperties => {
        if (piAlternatives.length < 2 || !selectedPIAltId) return {}
        const matches = !altId || altId === selectedPIAltId
        if (matches) return { borderLeft: `3px solid ${ALT_COLORS[piAlternatives.findIndex(a => a.id === selectedPIAltId) % ALT_COLORS.length]}` }
        const otherIdx = piAlternatives.findIndex(a => a.id === altId)
        return { borderLeft: `3px dashed ${ALT_COLORS[otherIdx >= 0 ? otherIdx % ALT_COLORS.length : 0]}40` }
    }
    const [allWarranties, setAllWarranties] = useState<PIWarranty[]>([])
    const [tags, setTags] = useState<PIWarrantyTag[]>([])
    const [warrantySets, setWarrantySets] = useState<PIWarrantySet[]>([])
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [warrantyVesselScopes, setWarrantyVesselScopes] = useState<Record<string, string[] | null>>({})
    const [warrantyAltIds, setWarrantyAltIds] = useState<Record<string, string | null>>({})
    const [customWarranties, setCustomWarranties] = useState<QuotationCustomWarranty[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [activeTab, setActiveTab] = useState<string>('all')
    const [newCustomText, setNewCustomText] = useState('')
    const [editingCustomId, setEditingCustomId] = useState<string | null>(null)
    const [editCustomText, setEditCustomText] = useState('')
    const [showImportModal, setShowImportModal] = useState(false)
    const [importText, setImportText] = useState('')
    const [importedItems, setImportedItems] = useState<string[]>([])
    const [showTexts, setShowTexts] = useState(false)
    const defaultsApplied = useRef(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [all, allTags, sets, selectedRows, custom, qv] = await Promise.all([
            window.api.piGetWarranties(),
            window.api.piGetWarrantyTags(),
            window.api.piGetWarrantySets(),
            window.api.getQuotationWarranties(quotation.id),
            window.api.getQuotationCustomWarranties(quotation.id),
            window.api.getQuotationVessels(quotation.id)
        ])
        setQVessels(Array.isArray(qv) ? qv : [])
        const safeAll = Array.isArray(all) ? all : []
        const safeTags = Array.isArray(allTags) ? allTags : []
        const safeSets = Array.isArray(sets) ? sets : []
        const loadError = !Array.isArray(selectedRows) && selectedRows && (selectedRows as any).error
        const safeSelectedRows = Array.isArray(selectedRows) ? selectedRows : []
        const safeSelected = safeSelectedRows.map((r: any) => r.piWarrantyId)
        const scopes: Record<string, string[] | null> = {}
        const altIds: Record<string, string | null> = {}
        for (const r of safeSelectedRows) {
            if (r.vesselScope) scopes[r.piWarrantyId] = r.vesselScope
            altIds[r.piWarrantyId] = r.alternativeId || null
        }
        const safeCustom = Array.isArray(custom) ? custom : []
        setAllWarranties(safeAll)
        setTags(safeTags)
        setWarrantySets(safeSets)
        setSelectedIds(safeSelected)
        setWarrantyVesselScopes(scopes)
        setWarrantyAltIds(altIds)
        setCustomWarranties(safeCustom)

        // Apply default-selected sets on first load if quotation has no warranties yet
        // Skip if load failed (error from safeHandle) to avoid destructive re-application
        if (!defaultsApplied.current && !loadError && safeSelected.length === 0 && safeSets.length > 0) {
            defaultsApplied.current = true
            // Filter by quotation type scope so P&I warranties don't auto-apply to hull quotations
            const tc = quotation.quotationTypeCode?.toLowerCase() === 'h' ? 'hull' : quotation.quotationTypeCode?.toLowerCase() === 'w' ? 'war' : 'pi'
            const scopeValid = new Set(safeAll.filter(w => !w.typeScope || w.typeScope === 'all' || w.typeScope === tc).map(w => w.id))
            const defaultIds: string[] = []
            for (const ws of safeSets) {
                if (ws.defaultSelected && ws.warrantyIds) {
                    for (const wid of ws.warrantyIds) {
                        if (!defaultIds.includes(wid) && scopeValid.has(wid)) defaultIds.push(wid)
                    }
                }
            }
            // Sort by master list order so warranties appear in the configured sequence
            const masterOrder = new Map(safeAll.map((w, idx) => [w.id, idx]))
            defaultIds.sort((a, b) => (masterOrder.get(a) ?? 999) - (masterOrder.get(b) ?? 999))
            if (defaultIds.length > 0) {
                setSelectedIds(defaultIds)
                await window.api.setQuotationWarranties(quotation.id, defaultIds)
            }
        } else {
            defaultsApplied.current = true
        }
    }

    const saveSelected = async (ids: string[]) => {
        setSelectedIds(ids)
        await window.api.setQuotationWarranties(quotation.id, ids)
    }

    // Sort warranty IDs by their position in the master list
    const sortByMasterOrder = (ids: string[]) => {
        const masterOrder = new Map(allWarranties.map((w, idx) => [w.id, idx]))
        return [...ids].sort((a, b) => (masterOrder.get(a) ?? 999) - (masterOrder.get(b) ?? 999))
    }

    const toggle = async (id: string) => {
        const newIds = selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : sortByMasterOrder([...selectedIds, id])
        await saveSelected(newIds)
    }

    const selectAllInTab = async () => {
        const tabWarranties = getTabWarranties()
        const newIds = [...selectedIds]
        for (const w of tabWarranties) {
            if (!newIds.includes(w.id)) newIds.push(w.id)
        }
        await saveSelected(sortByMasterOrder(newIds))
    }

    const deselectAllInTab = async () => {
        const tabWarranties = getTabWarranties()
        const tabIds = new Set(tabWarranties.map(w => w.id))
        await saveSelected(selectedIds.filter(id => !tabIds.has(id)))
    }

    const applySet = async (setId: string) => {
        const ws = warrantySets.find(s => s.id === setId)
        if (!ws?.warrantyIds) return
        const newIds = [...selectedIds]
        for (const wid of ws.warrantyIds) {
            if (!newIds.includes(wid)) newIds.push(wid)
        }
        await saveSelected(sortByMasterOrder(newIds))
        showSuccess(`Applied "${ws.name}"`)
    }

    const dragWarrantyRef = useRef<number | null>(null)
    const handleWarrantyDragStart = (globalIdx: number) => { dragWarrantyRef.current = globalIdx }
    const handleWarrantyDrop = async (targetIdx: number) => {
        const fromIdx = dragWarrantyRef.current
        dragWarrantyRef.current = null
        if (fromIdx === null || fromIdx === targetIdx) return
        const newIds = [...selectedIds]
        const [moved] = newIds.splice(fromIdx, 1)
        newIds.splice(targetIdx, 0, moved)
        await saveSelected(newIds)
    }

    const updateWarrantyScope = async (piWarrantyId: string, scope: string[] | null) => {
        setWarrantyVesselScopes(prev => ({ ...prev, [piWarrantyId]: scope }))
        await window.api.updateQuotationWarrantyVesselScope(quotation.id, piWarrantyId, scope)
    }

    const updateWarrantyAltId = async (piWarrantyId: string, altId: string | null) => {
        const rows = await window.api.getQuotationWarranties(quotation.id)
        const row = (Array.isArray(rows) ? rows : []).find((r: any) => r.piWarrantyId === piWarrantyId)
        if (row) {
            await window.api.updateQuotationItemAlternativeId('quotation_warranties', row.id, altId)
            setWarrantyAltIds(prev => ({ ...prev, [piWarrantyId]: altId }))
        }
    }

    const updateCustomWarrantyAltId = async (id: string, altId: string | null) => {
        await window.api.updateQuotationItemAlternativeId('quotation_custom_warranties', id, altId)
        setCustomWarranties(prev => prev.map(cw => cw.id === id ? { ...cw, alternativeId: altId } : cw))
    }

    const updateCustomWarrantyScope = async (id: string, scope: string[] | null) => {
        setCustomWarranties(prev => prev.map(cw => cw.id === id ? { ...cw, vesselScope: scope } : cw))
        await window.api.updateQuotationCustomWarranty(id, { vesselScope: scope })
    }

    const addCustom = async () => {
        if (!newCustomText.trim()) return
        const result = await window.api.addQuotationCustomWarranty({ quotationId: quotation.id, text: newCustomText.trim(), order: customWarranties.length })
        if (result && (result as any).error) {
            showError((result as any).message || 'Failed to add custom warranty')
            return
        }
        setNewCustomText('')
        showSuccess('Custom warranty added')
        loadData()
    }

    const saveCustomEdit = async (id: string) => {
        await window.api.updateQuotationCustomWarranty(id, { text: editCustomText })
        setEditingCustomId(null)
        loadData()
    }

    const deleteCustom = async (id: string) => {
        await window.api.deleteQuotationCustomWarranty(id)
        loadData()
    }

    const moveCustom = async (index: number, direction: 'up' | 'down') => {
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= customWarranties.length) return
        const newOrder = [...customWarranties]
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setCustomWarranties(newOrder)
        await window.api.reorderQuotationCustomWarranties(newOrder.map(c => c.id))
    }

    const parseImportText = () => {
        const lines = importText.split('\n').map(l => l.replace(/^[\s•\-–—\*\d+\.\)]+/, '').trim()).filter(l => l.length > 0)
        setImportedItems(lines)
    }

    const confirmImport = async () => {
        let order = customWarranties.length
        for (const text of importedItems) {
            await window.api.addQuotationCustomWarranty({ quotationId: quotation.id, text, order: order++ })
        }
        showSuccess(`Imported ${importedItems.length} warranties`)
        setShowImportModal(false)
        setImportText('')
        setImportedItems([])
        loadData()
    }

    // Filter warranties by quotation type scope
    const typeCode = quotation.quotationTypeCode?.toLowerCase() === 'h' ? 'hull' : quotation.quotationTypeCode?.toLowerCase() === 'w' ? 'war' : 'pi'
    const visibleWarranties = allWarranties.filter(w => !w.typeScope || w.typeScope === 'all' || w.typeScope === typeCode)

    const getTabWarranties = () => {
        if (activeTab === 'all') return visibleWarranties
        if (activeTab === 'untagged') return visibleWarranties.filter(w => !(w.tagIds || []).length && !w.isCargoRelated)
        const tag = tags.find(t => t.id === activeTab)
        const isCargoTag = tag && tag.name.toLowerCase() === 'cargo'
        return visibleWarranties.filter(w => (w.tagIds || []).includes(activeTab) || (isCargoTag && w.isCargoRelated))
    }

    const tabWarranties = getTabWarranties()
    const selectedSet = new Set(selectedIds)
    const tabAllSelected = tabWarranties.length > 0 && tabWarranties.every(w => selectedSet.has(w.id))
    const tabNoneSelected = tabWarranties.every(w => !selectedSet.has(w.id))
    const tabSelectedCount = tabWarranties.filter(w => selectedSet.has(w.id)).length
    const hasCargoTag = tags.some(t => t.name.toLowerCase() === 'cargo')
    const untaggedCount = visibleWarranties.filter(w => !(w.tagIds || []).length && !(hasCargoTag && w.isCargoRelated)).length
    const ckStyle = { width: '16px', height: '16px', accentColor: 'var(--accent-primary)', marginTop: '2px' }

    // Two-panel layout state
    const { theme } = useTheme()
    const isLight = theme === 'light'
    const [searchTerm, setSearchTerm] = useState('')
    const [collapsedSetGroups, setCollapsedSetGroups] = useState<Set<string>>(new Set())

    const toggleSetCollapse = (setId: string) => {
        setCollapsedSetGroups(prev => {
            const next = new Set(prev)
            if (next.has(setId)) next.delete(setId)
            else next.add(setId)
            return next
        })
    }

    const filteredTabWarranties = searchTerm.trim()
        ? tabWarranties.filter(w => w.text.toLowerCase().includes(searchTerm.toLowerCase()))
        : tabWarranties

    const getAppliedSets = () => {
        const result: { set: PIWarrantySet; startIdx: number; endIdx: number; idsInSelected: string[] }[] = []
        for (const ws of warrantySets) {
            if (!ws.warrantyIds?.length) continue
            // Order by position in selectedIds, not set order
            const setIdsInSelected = selectedIds.filter(wid => ws.warrantyIds!.includes(wid))
            if (setIdsInSelected.length === 0) continue
            const firstIdx = selectedIds.indexOf(setIdsInSelected[0])
            const lastIdx = selectedIds.indexOf(setIdsInSelected[setIdsInSelected.length - 1])
            result.push({ set: ws, startIdx: firstIdx, endIdx: lastIdx, idsInSelected: setIdsInSelected })
        }
        return result.sort((a, b) => a.startIdx - b.startIdx)
    }

    const appliedSets = getAppliedSets()
    const appliedSetWarrantyIds = new Set(appliedSets.flatMap(as => as.idsInSelected))

    // Loose items: selected but not in any applied set
    const looseSelectedIds = selectedIds.filter(id => !appliedSetWarrantyIds.has(id))

    const isSetFullyApplied = (ws: PIWarrantySet) => {
        if (!ws.warrantyIds?.length) return false
        return ws.warrantyIds.every(wid => selectedIds.includes(wid))
    }

    const removeSetWarranties = async (setId: string) => {
        const ws = warrantySets.find(s => s.id === setId)
        if (!ws?.warrantyIds) return
        const toRemove = new Set(ws.warrantyIds)
        await saveSelected(selectedIds.filter(id => !toRemove.has(id)))
    }

    const moveSetGroup = async (setId: string, direction: 'up' | 'down') => {
        // Build a lookup: warrantyId → setId for all applied sets
        const idToSet = new Map<string, string>()
        for (const as of appliedSets) {
            for (const wid of as.idsInSelected) idToSet.set(wid, as.set.id)
        }

        // Build block list: each entry is a set block or a single loose item
        const blocks: { ids: string[]; setId?: string }[] = []
        const processedSets = new Set<string>()
        for (const id of selectedIds) {
            const belongsToSet = idToSet.get(id)
            if (belongsToSet) {
                if (processedSets.has(belongsToSet)) continue // Already added this set's block
                processedSets.add(belongsToSet)
                const as = appliedSets.find(s => s.set.id === belongsToSet)
                if (as) blocks.push({ ids: [...as.idsInSelected], setId: belongsToSet })
            } else {
                blocks.push({ ids: [id] })
            }
        }

        const blockIdx = blocks.findIndex(b => b.setId === setId)
        if (blockIdx < 0) return
        const swapIdx = direction === 'up' ? blockIdx - 1 : blockIdx + 1
        if (swapIdx < 0 || swapIdx >= blocks.length) return
        ;[blocks[blockIdx], blocks[swapIdx]] = [blocks[swapIdx], blocks[blockIdx]]
        await saveSelected(blocks.flatMap(b => b.ids))
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Warranties</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Select warranties from the master list. Apply sets for quick selection. Reorder using arrows.
            </p>

            {allWarranties.length === 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '16px' }}>No warranties defined. Add them in Settings.</p>}

            {allWarranties.length > 0 && (
                <div style={{ display: 'flex', border: '1px solid var(--table-border)', borderRadius: '8px', height: '500px', overflow: 'hidden' }}>

                    {/* ═══════ Left Panel: Available ═══════ */}
                    <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid var(--table-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 10px 0', flexShrink: 0 }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Available</div>

                            {/* Search */}
                            <div style={{ position: 'relative', marginBottom: '8px' }}>
                                <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', opacity: 0.5 }} />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    placeholder="Search..."
                                    style={{ width: '100%', padding: '5px 8px 5px 26px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                />
                            </div>

                            {/* Sets section */}
                            {warrantySets.length > 0 && (
                                <div style={{ marginBottom: '6px' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '4px' }}>Sets</div>
                                    {warrantySets.map(ws => {
                                        const fullyApplied = isSetFullyApplied(ws)
                                        return (
                                            <div key={ws.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 6px', borderRadius: '4px', marginBottom: '2px', background: fullyApplied ? 'rgba(0, 200, 100, 0.06)' : 'transparent' }}>
                                                <span style={{ flex: 1, fontSize: '0.76rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {ws.name}
                                                </span>
                                                {ws.defaultSelected && (
                                                    <span style={{ fontSize: '0.58rem', padding: '0px 4px', borderRadius: '3px', background: 'rgba(0, 200, 100, 0.12)', color: isLight ? '#007a3d' : '#00c864', fontWeight: 600, whiteSpace: 'nowrap' }}>DEFAULT</span>
                                                )}
                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', background: 'rgba(0,210,255,0.08)', padding: '0px 5px', borderRadius: '8px', whiteSpace: 'nowrap' }}>{ws.warrantyIds?.length || 0}</span>
                                                {fullyApplied ? (
                                                    <span style={{ fontSize: '0.68rem', color: isLight ? '#007a3d' : '#00c864', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                        <Check size={10} /> Applied
                                                    </span>
                                                ) : (
                                                    <button onClick={() => applySet(ws.id)} style={{ background: 'transparent', border: '1px solid var(--accent-primary)', borderRadius: '4px', padding: '1px 8px', fontSize: '0.68rem', cursor: 'pointer', color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}>Apply</button>
                                                )}
                                            </div>
                                        )
                                    })}
                                    <div style={{ borderBottom: '1px solid var(--table-border)', margin: '6px 0' }} />
                                </div>
                            )}

                            {/* Tag filter chips */}
                            <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                <button onClick={() => setActiveTab('all')} style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.68rem', cursor: 'pointer', background: activeTab === 'all' ? 'rgba(0,210,255,0.12)' : 'transparent', border: `1px solid ${activeTab === 'all' ? 'var(--accent-primary)' : 'var(--table-border)'}`, color: activeTab === 'all' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                                    All ({visibleWarranties.length})
                                </button>
                                {tags.map(tag => {
                                    const isCargoTag = tag.name.toLowerCase() === 'cargo'
                                    const matchesTag = (w: PIWarranty) => (w.tagIds || []).includes(tag.id) || (isCargoTag && w.isCargoRelated)
                                    const count = visibleWarranties.filter(matchesTag).length
                                    return (
                                        <button key={tag.id} onClick={() => setActiveTab(tag.id)} style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.68rem', cursor: 'pointer', background: activeTab === tag.id ? 'rgba(0,210,255,0.12)' : 'transparent', border: `1px solid ${activeTab === tag.id ? 'var(--accent-primary)' : 'var(--table-border)'}`, color: activeTab === tag.id ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                                            {tag.name} ({count})
                                        </button>
                                    )
                                })}
                                {untaggedCount > 0 && (
                                    <button onClick={() => setActiveTab('untagged')} style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.68rem', cursor: 'pointer', background: activeTab === 'untagged' ? 'rgba(0,210,255,0.12)' : 'transparent', border: `1px solid ${activeTab === 'untagged' ? 'var(--accent-primary)' : 'var(--table-border)'}`, color: activeTab === 'untagged' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                                        Other ({untaggedCount})
                                    </button>
                                )}
                            </div>

                            {/* Select / Deselect toolbar */}
                            {tabWarranties.length > 0 && (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                                    <button onClick={selectAllInTab} disabled={tabAllSelected} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.68rem', color: 'var(--accent-primary)', padding: '0', opacity: tabAllSelected ? 0.3 : 1 }}>Select All</button>
                                    <span style={{ color: 'var(--table-border)' }}>|</span>
                                    <button onClick={deselectAllInTab} disabled={tabNoneSelected} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.68rem', color: 'var(--accent-primary)', padding: '0', opacity: tabNoneSelected ? 0.3 : 1 }}>Deselect</button>
                                    <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{tabSelectedCount}/{tabWarranties.length}</span>
                                </div>
                            )}
                        </div>

                        {/* Available warranties list */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px 6px' }}>
                            {filteredTabWarranties.map(w => {
                                const isSelected = selectedSet.has(w.id)
                                return (
                                    <label key={w.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', opacity: isSelected ? 0.5 : 1, background: isSelected ? 'rgba(0, 200, 100, 0.04)' : 'transparent' }}>
                                        {isSelected ? (
                                            <Check size={14} style={{ color: isLight ? '#007a3d' : '#00c864', marginTop: '2px', flexShrink: 0 }} onClick={(e) => { e.preventDefault(); toggle(w.id) }} />
                                        ) : (
                                            <input type="checkbox" checked={false} onChange={() => toggle(w.id)} style={ckStyle} />
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: '0.78rem', whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>{w.text}</span>
                                            {activeTab === 'all' && (
                                                <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '1px' }}>
                                                    {w.isCargoRelated && <span style={{ fontSize: '0.58rem', padding: '0px 4px', borderRadius: '3px', background: 'rgba(255,180,0,0.15)', color: '#ffb400' }}>Cargo</span>}
                                                    {(w.tagIds || []).map(tid => {
                                                        const tag = tags.find(t => t.id === tid)
                                                        return tag ? <span key={tid} style={{ fontSize: '0.58rem', padding: '0px 4px', borderRadius: '3px', background: 'rgba(0,210,255,0.1)', color: 'var(--accent-primary)' }}>{tag.name}</span> : null
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                )
                            })}
                            {filteredTabWarranties.length === 0 && tabWarranties.length > 0 && (
                                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.76rem', padding: '8px', textAlign: 'center' }}>No matches for &ldquo;{searchTerm}&rdquo;</p>
                            )}
                            {tabWarranties.length === 0 && allWarranties.length > 0 && (
                                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.76rem', padding: '8px' }}>No warranties in this category.</p>
                            )}
                        </div>
                    </div>

                    {/* ═══════ Right Panel: Selected ═══════ */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 10px 6px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Selected</span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', background: 'rgba(0,210,255,0.1)', padding: '1px 8px', borderRadius: '10px' }}>
                                {selectedIds.length + customWarranties.length}
                            </span>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 10px' }}>
                            {selectedIds.length === 0 && customWarranties.length === 0 && (
                                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.78rem', padding: '20px 0', textAlign: 'center' }}>No warranties selected yet. Use the left panel to add warranties.</p>
                            )}

                            {/* Set groups */}
                            {appliedSets.map((as, asIdx) => {
                                const isCollapsed = collapsedSetGroups.has(as.set.id)
                                return (
                                    <div key={as.set.id} style={{ marginBottom: '6px', borderRadius: '6px', border: '1px solid var(--table-border)', overflow: 'hidden' }}>
                                        {/* Set group header */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', background: 'rgba(0,210,255,0.05)', cursor: 'pointer' }} onClick={() => toggleSetCollapse(as.set.id)}>
                                            <ChevronDown size={13} style={{ color: 'var(--text-secondary)', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, flex: 1 }}>{as.set.name}</span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', background: 'rgba(0,210,255,0.1)', padding: '0px 6px', borderRadius: '8px' }}>{as.idsInSelected.length}</span>
                                            <div style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
                                                <button onClick={() => moveSetGroup(as.set.id, 'up')} disabled={asIdx === 0 && as.startIdx === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: asIdx === 0 && as.startIdx === 0 ? 0.2 : 0.6, lineHeight: 1 }} title="Move group up"><ChevronUp size={12} /></button>
                                                <button onClick={() => moveSetGroup(as.set.id, 'down')} disabled={as.endIdx >= selectedIds.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: as.endIdx >= selectedIds.length - 1 ? 0.2 : 0.6, lineHeight: 1 }} title="Move group down"><ChevronDown size={12} /></button>
                                                <button onClick={() => removeSetWarranties(as.set.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--danger)', opacity: 0.6, lineHeight: 1 }} title="Remove all from this set"><X size={12} /></button>
                                            </div>
                                        </div>
                                        {/* Set warranties */}
                                        {!isCollapsed && as.idsInSelected.map((wid) => {
                                            const w = allWarranties.find(aw => aw.id === wid)
                                            if (!w) return null
                                            const globalIdx = selectedIds.indexOf(wid)
                                            return (
                                                <div key={wid} draggable onDragStart={() => handleWarrantyDragStart(globalIdx)} onDragOver={e => e.preventDefault()} onDrop={() => handleWarrantyDrop(globalIdx)} style={{ borderTop: '1px solid var(--table-border)', ...altStyle(warrantyAltIds[wid]) }}>
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 8px', fontSize: '0.78rem' }}>
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', minWidth: '20px', textAlign: 'right' }}>{globalIdx + 1}.</span>
                                                        <span style={{ cursor: 'grab', color: 'var(--text-secondary)', opacity: 0.4, fontSize: '0.7rem', flexShrink: 0 }} title="Drag to reorder">⠿</span>
                                                        <span style={{ flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>{w.text}</span>
                                                        <button onClick={() => toggle(wid)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '1px', opacity: 0.6 }} title="Remove"><X size={12} /></button>
                                                    </div>
                                                    <VesselScopeChips vessels={qVessels} vesselScope={warrantyVesselScopes[wid]} onChange={scope => updateWarrantyScope(wid, scope)} />
                                                    <AlternativeScopeChips alternatives={piAlternatives} currentAltId={warrantyAltIds[wid] || null} onChangeAltId={altId => updateWarrantyAltId(wid, altId)} />
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            })}

                            {/* Loose items (not in any set) */}
                            {looseSelectedIds.length > 0 && (
                                <div style={{ marginBottom: '6px' }}>
                                    {appliedSets.length > 0 && (
                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', padding: '4px 0 2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Individual</div>
                                    )}
                                    <div style={{ borderRadius: '6px', border: '1px solid var(--table-border)', overflow: 'hidden' }}>
                                        {looseSelectedIds.map((id, li) => {
                                            const w = allWarranties.find(aw => aw.id === id)
                                            if (!w) return null
                                            const globalIdx = selectedIds.indexOf(id)
                                            return (
                                                <div key={id} draggable onDragStart={() => handleWarrantyDragStart(globalIdx)} onDragOver={e => e.preventDefault()} onDrop={() => handleWarrantyDrop(globalIdx)} style={{ borderTop: li > 0 ? '1px solid var(--table-border)' : 'none', background: li % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'), ...altStyle(warrantyAltIds[id]) }}>
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 8px', fontSize: '0.78rem' }}>
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', minWidth: '20px', textAlign: 'right' }}>{globalIdx + 1}.</span>
                                                        <span style={{ cursor: 'grab', color: 'var(--text-secondary)', opacity: 0.4, fontSize: '0.7rem', flexShrink: 0 }} title="Drag to reorder">⠿</span>
                                                        <span style={{ flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>{w.text}</span>
                                                        <button onClick={() => toggle(id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '1px', opacity: 0.6 }} title="Remove"><X size={12} /></button>
                                                    </div>
                                                    <VesselScopeChips vessels={qVessels} vesselScope={warrantyVesselScopes[id]} onChange={scope => updateWarrantyScope(id, scope)} />
                                                    <AlternativeScopeChips alternatives={piAlternatives} currentAltId={warrantyAltIds[id] || null} onChangeAltId={altId => updateWarrantyAltId(id, altId)} />
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Custom warranties */}
                            {customWarranties.length > 0 && (
                                <div style={{ marginBottom: '6px' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', padding: '4px 0 2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Custom</div>
                                    <div style={{ borderRadius: '6px', border: '1px solid var(--table-border)', overflow: 'hidden' }}>
                                        {customWarranties.map((cw, i) => {
                                            const globalNum = selectedIds.length + i + 1
                                            return (
                                                <div key={cw.id} style={{ borderTop: i > 0 ? '1px solid var(--table-border)' : 'none', background: i % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'), ...altStyle(cw.alternativeId) }}>
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '4px 8px', fontSize: '0.78rem' }}>
                                                        <span style={{ color: 'var(--accent-primary)', fontSize: '0.7rem', minWidth: '20px', textAlign: 'right' }}>{globalNum}.</span>
                                                        {editingCustomId === cw.id ? (
                                                            <>
                                                                <textarea value={editCustomText} onChange={e => setEditCustomText(e.target.value)} style={{ flex: 1, minHeight: '32px', resize: 'vertical', fontSize: '0.78rem', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                                                                <button onClick={() => saveCustomEdit(cw.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '2px' }}><Save size={12} /></button>
                                                                <button onClick={() => setEditingCustomId(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><X size={12} /></button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div style={{ display: 'flex', gap: '1px', flexDirection: 'column' }}>
                                                                    <button onClick={() => moveCustom(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === 0 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronUp size={10} /></button>
                                                                    <button onClick={() => moveCustom(i, 'down')} disabled={i === customWarranties.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === customWarranties.length - 1 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronDown size={10} /></button>
                                                                </div>
                                                                <span style={{ flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>{cw.text}</span>
                                                                <span style={{ fontSize: '0.58rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0,210,255,0.1)', color: 'var(--accent-primary)', whiteSpace: 'nowrap', alignSelf: 'center' }}>Custom</span>
                                                                <button onClick={() => { setEditingCustomId(cw.id); setEditCustomText(cw.text) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '1px', opacity: 0.6 }}><Pencil size={10} /></button>
                                                                <button onClick={() => deleteCustom(cw.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '1px', opacity: 0.6 }}><Trash2 size={10} /></button>
                                                            </>
                                                        )}
                                                    </div>
                                                    <VesselScopeChips vessels={qVessels} vesselScope={cw.vesselScope} onChange={scope => updateCustomWarrantyScope(cw.id, scope)} />
                                                    <AlternativeScopeChips alternatives={piAlternatives} currentAltId={cw.alternativeId || null} onChangeAltId={altId => updateCustomWarrantyAltId(cw.id, altId)} />
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Add custom + import */}
                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'flex-end' }}>
                                <textarea value={newCustomText} onChange={e => { setNewCustomText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} placeholder="Add a custom warranty..." rows={1} style={{ flex: 1, minHeight: '30px', maxHeight: '200px', resize: 'none', fontSize: '0.78rem', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', overflow: 'auto' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCustom() } }} />
                                <button onClick={addCustom} className="btn-primary" style={{ padding: '5px 10px', fontSize: '0.72rem' }} title="Add custom warranty"><Plus size={12} /></button>
                                <button onClick={() => setShowImportModal(true)} className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.72rem' }} title="Bulk import"><Upload size={12} /></button>
                            </div>

                            {/* Standard Texts (collapsible) */}
                            <div style={{ marginTop: '12px', borderTop: '1px solid var(--table-border)', paddingTop: '8px' }}>
                                <button onClick={() => setShowTexts(!showTexts)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', width: '100%', textAlign: 'left' }}>
                                    <ChevronDown size={14} style={{ color: 'var(--text-secondary)', transform: showTexts ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Standard Texts</span>
                                </button>
                                {showTexts && (
                                    <div style={{ paddingLeft: '20px', marginTop: '8px' }}>
                                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Breach of Warranties</label>
                                        <RichTextEditor
                                            value={quotation.sectionTextsOverride?.warrantiesBreach ?? getEffectiveText('warrantiesBreach')}
                                            onChange={val => {
                                                const override = { ...(quotation.sectionTextsOverride || {}), warrantiesBreach: val }
                                                setQ(p => ({ ...p, sectionTextsOverride: override }))
                                                updateField('sectionTextsOverride', override)
                                            }}
                                            minHeight={60}
                                            showFontSize showAlignment showLineSpacing
                                        />
                                        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '4px', marginTop: '12px', color: 'var(--text-secondary)' }}>Additional Text (after warranties, before breach)</label>
                                        <RichTextEditor
                                            value={quotation.sectionTextsOverride?.warrantiesAdditionalText ?? getEffectiveText('warrantiesAdditionalText')}
                                            onChange={val => {
                                                const override = { ...(quotation.sectionTextsOverride || {}), warrantiesAdditionalText: val }
                                                setQ(p => ({ ...p, sectionTextsOverride: override }))
                                                updateField('sectionTextsOverride', override)
                                            }}
                                            minHeight={60}
                                            showFontSize showAlignment showLineSpacing
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Import modal */}
            {showImportModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowImportModal(false)}>
                    <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '12px', padding: '24px', width: '560px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Import Warranties</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>Paste warranties with bullet points, dashes, or numbered lists. Each line becomes a separate warranty.</p>
                        <textarea
                            value={importText}
                            onChange={e => setImportText(e.target.value)}
                            placeholder="- Warranty one&#10;- Warranty two&#10;• Warranty three&#10;1. Warranty four"
                            style={{ width: '100%', minHeight: '160px', resize: 'vertical', fontSize: '0.85rem', marginBottom: '10px', padding: '10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }}
                        />
                        <button onClick={parseImportText} className="btn-secondary" style={{ marginBottom: '12px', fontSize: '0.8rem' }}>Parse</button>
                        {importedItems.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Preview ({importedItems.length} items):</label>
                                {importedItems.map((item, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--table-border)', marginBottom: '3px', fontSize: '0.8rem' }}>
                                        <span style={{ color: 'var(--text-secondary)', minWidth: '20px' }}>{i + 1}.</span>
                                        <span style={{ flex: 1 }}>{item}</span>
                                        <button onClick={() => setImportedItems(prev => prev.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0' }}><X size={12} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => { setShowImportModal(false); setImportText(''); setImportedItems([]) }} className="btn-secondary" style={{ fontSize: '0.8rem' }}>Cancel</button>
                            {importedItems.length > 0 && <button onClick={confirmImport} className="btn-primary" style={{ fontSize: '0.8rem' }}>Import {importedItems.length} Warranties</button>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
