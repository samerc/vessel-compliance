import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Layers } from 'lucide-react'
import { Quotation, Vessel, QuotationVessel } from '../../../../shared/types'

const EMPTY_NEW_VESSEL = { name: '', imoNumber: '', builtYear: '', rebuiltYear: '', grossTonnage: '', flag: '', vesselType: '', classification: '', callSign: '' }

export default function VesselTab({ quotation, vessels, showSuccess, showError, isLight, onVesselsChanged }: { quotation: Quotation; vessels: Vessel[]; showSuccess: (m: string) => void; showError: (m: string) => void; isLight?: boolean; onVesselsChanged?: () => void }) {
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [showAddForm, setShowAddForm] = useState(false)
    const [addMode, setAddMode] = useState<'existing' | 'new' | 'fleet'>('existing')
    const [selectedVesselId, setSelectedVesselId] = useState('')
    const [vesselSearch, setVesselSearch] = useState('')
    const [vesselDropdownOpen, setVesselDropdownOpen] = useState(false)
    const [newData, setNewData] = useState(EMPTY_NEW_VESSEL)
    const [flagDropdownOpen, setFlagDropdownOpen] = useState(false)
    const [classDropdownOpen, setClassDropdownOpen] = useState(false)
    const [typeDropdownOpen, setTypeDropdownOpen] = useState(false)
    const [flagStatesLocal, setFlagStatesLocal] = useState<any[]>([])
    const [classSocietiesLocal, setClassSocietiesLocal] = useState<any[]>([])
    const [vesselTypesLocal, setVesselTypesLocal] = useState<any[]>([])
    const [availableFleets, setAvailableFleets] = useState<{ id: string; name: string; vesselCount: number }[]>([])
    const [fleetSearch, setFleetSearch] = useState('')
    const [addingFleet, setAddingFleet] = useState(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const qv = await window.api.getQuotationVessels(quotation.id)
        setQVessels(Array.isArray(qv) ? qv : [])
        const [fs, cs, vt] = await Promise.all([
            window.api.getFlagStates().catch(() => []),
            window.api.getClassificationSocieties().catch(() => []),
            window.api.getVesselTypes().catch(() => [])
        ])
        setFlagStatesLocal(Array.isArray(fs) ? fs : [])
        setClassSocietiesLocal(Array.isArray(cs) ? cs : [])
        setVesselTypesLocal(Array.isArray(vt) ? vt : [])
    }

    const nextLabel = (list: QuotationVessel[]) => `V${list.length + 1}`

    const handleAddExisting = async () => {
        if (!selectedVesselId) return
        try {
            const vLabel = nextLabel(qVessels)
            const v = vessels.find(vv => vv.id === selectedVesselId)
            const flagStates: any[] = await window.api.getFlagStates().catch(() => [])
            const flagName = v?.flagStateId ? (flagStates.find((f: any) => f.id === v.flagStateId)?.name || '') : ''
            await window.api.addQuotationVessel({
                quotationId: quotation.id,
                vesselId: selectedVesselId,
                vesselLabel: vLabel,
                order: qVessels.length,
                name: v?.name,
                imoNumber: v?.imoNumber,
                builtYear: v?.builtYear,
                rebuiltYear: v?.rebuiltYear,
                grossTonnage: v?.grossTonnage,
                flag: flagName,
                vesselType: v?.vesselType,
                classification: v?.classificationSociety,
                callSign: v?.callSign
            })

            // Auto-load vessel assureds into the quotation, sorted by role order from settings
            const [vassureds, allEntities, existingQAssureds, assuredRoles] = await Promise.all([
                window.api.getVesselAssureds(selectedVesselId),
                window.api.getEntities(),
                window.api.getQuotationAssureds(quotation.id),
                window.api.getAssuredRoles()
            ])
            const roleOrder = new Map((Array.isArray(assuredRoles) ? assuredRoles : []).map((r: any, idx: number) => [r.name?.toLowerCase(), r.order ?? idx]))
            const existingEntityIds = new Set(existingQAssureds.map(a => a.entityId).filter(Boolean))
            const toAdd = vassureds
                .filter(va => !existingEntityIds.has(va.entityId))
                .sort((a, b) => (roleOrder.get(a.role?.toLowerCase()) ?? 999) - (roleOrder.get(b.role?.toLowerCase()) ?? 999))
            for (let i = 0; i < toAdd.length; i++) {
                const va = toAdd[i]
                const entity = allEntities.find(e => e.id === va.entityId)
                if (entity) {
                    await window.api.addQuotationAssured({
                        quotationId: quotation.id,
                        entityId: va.entityId,
                        name: entity.name,
                        role: va.role || undefined,
                        vesselLabel: vLabel,
                        order: existingQAssureds.length + i
                    })
                }
            }

            setSelectedVesselId('')
            setVesselSearch('')
            setNewData(EMPTY_NEW_VESSEL)
            setShowAddForm(false)
            showSuccess(`Vessel added${toAdd.length > 0 ? ` — ${toAdd.length} assured(s) loaded` : ''}`)
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add vessel') }
    }

    const handleAddNew = async () => {
        if (!newData.name.trim()) return
        try {
            await window.api.addQuotationVessel({
                quotationId: quotation.id,
                vesselLabel: nextLabel(qVessels),
                order: qVessels.length,
                name: newData.name,
                imoNumber: newData.imoNumber || undefined,
                builtYear: newData.builtYear ? parseInt(newData.builtYear) : undefined,
                rebuiltYear: newData.rebuiltYear ? parseInt(newData.rebuiltYear) : undefined,
                grossTonnage: newData.grossTonnage ? parseFloat(newData.grossTonnage) : undefined,
                flag: newData.flag || undefined,
                vesselType: newData.vesselType || undefined,
                classification: newData.classification || undefined,
                callSign: newData.callSign || undefined
            })
            setNewData(EMPTY_NEW_VESSEL)
            setShowAddForm(false)
            showSuccess('Vessel added')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add vessel') }
    }

    const handleDelete = async (id: string) => {
        await window.api.deleteQuotationVessel(id)
        showSuccess('Vessel removed')
        loadData()
    }

    const loadFleets = async () => {
        const fleets = await window.api.getFleets().catch(() => [])
        const fleetsArr = Array.isArray(fleets) ? fleets : []
        const withCounts = fleetsArr.map(f => ({
            id: f.id,
            name: f.name,
            vesselCount: vessels.filter(v => v.fleetId === f.id && v.isActive).length
        })).filter(f => f.vesselCount > 0)
        setAvailableFleets(withCounts)
    }

    const handleAddFleet = async (fleetId: string) => {
        const fleet = availableFleets.find(f => f.id === fleetId)
        if (!fleet) return
        setAddingFleet(true)
        try {
            const fleetVessels = vessels.filter(v => v.fleetId === fleetId && v.isActive)
            const existingVesselIds = new Set(qVessels.map(qv => qv.vesselId).filter(Boolean) as string[])
            const newVessels = fleetVessels.filter(v => !existingVesselIds.has(v.id))

            if (newVessels.length === 0) {
                showError('All vessels from this fleet are already added')
                setAddingFleet(false)
                return
            }

            const flagStates: any[] = await window.api.getFlagStates().catch(() => [])
            const [allEntities, existingQAssureds, assuredRoles] = await Promise.all([
                window.api.getEntities(),
                window.api.getQuotationAssureds(quotation.id),
                window.api.getAssuredRoles()
            ])
            const roleOrder = new Map((Array.isArray(assuredRoles) ? assuredRoles : []).map((r: any, idx: number) => [r.name?.toLowerCase(), r.order ?? idx]))

            let currentCount = qVessels.length
            let totalAssuredsAdded = 0
            let currentAssuredCount = existingQAssureds.length
            const existingEntityIds = new Set(existingQAssureds.map(a => a.entityId).filter(Boolean))

            for (const v of newVessels) {
                const vLabel = `V${currentCount + 1}`
                const flagName = v.flagStateId ? (flagStates.find((f: any) => f.id === v.flagStateId)?.name || '') : ''
                await window.api.addQuotationVessel({
                    quotationId: quotation.id,
                    vesselId: v.id,
                    vesselLabel: vLabel,
                    order: currentCount,
                    name: v.name,
                    imoNumber: v.imoNumber,
                    builtYear: v.builtYear,
                    rebuiltYear: v.rebuiltYear,
                    grossTonnage: v.grossTonnage,
                    flag: flagName,
                    vesselType: v.vesselType,
                    classification: v.classificationSociety,
                    callSign: v.callSign
                })

                // Auto-load vessel assureds
                const vassureds = await window.api.getVesselAssureds(v.id).catch(() => [])
                const toAdd = (Array.isArray(vassureds) ? vassureds : [])
                    .filter(va => !existingEntityIds.has(va.entityId))
                    .sort((a, b) => (roleOrder.get(a.role?.toLowerCase()) ?? 999) - (roleOrder.get(b.role?.toLowerCase()) ?? 999))
                for (let i = 0; i < toAdd.length; i++) {
                    const va = toAdd[i]
                    const entity = allEntities.find(e => e.id === va.entityId)
                    if (entity) {
                        await window.api.addQuotationAssured({
                            quotationId: quotation.id,
                            entityId: va.entityId,
                            name: entity.name,
                            role: va.role || undefined,
                            vesselLabel: vLabel,
                            order: currentAssuredCount + i
                        })
                        existingEntityIds.add(va.entityId)
                        totalAssuredsAdded++
                    }
                }
                currentAssuredCount += toAdd.length
                currentCount++
            }

            setShowAddForm(false)
            setFleetSearch('')
            showSuccess(`Added ${newVessels.length} vessel${newVessels.length > 1 ? 's' : ''} from ${fleet.name}${totalAssuredsAdded > 0 ? ` — ${totalAssuredsAdded} assured(s) loaded` : ''}`)
            loadData()
        } catch (err: any) {
            showError(err.message || 'Failed to add fleet vessels')
        } finally {
            setAddingFleet(false)
        }
    }

    const handleMoveVessel = async (vesselId: string, direction: 'up' | 'down') => {
        const idx = qVessels.findIndex(v => v.id === vesselId)
        if (idx < 0) return
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= qVessels.length) return

        const newVessels = [...qVessels]
        const temp = newVessels[idx]
        newVessels[idx] = newVessels[swapIdx]
        newVessels[swapIdx] = temp

        // Reorder and relabel
        const orderedIds = newVessels.map(v => v.id)
        await window.api.reorderQuotationVessels(orderedIds)
        for (let i = 0; i < newVessels.length; i++) {
            const newLabel = `V${i + 1}`
            if (newVessels[i].vesselLabel !== newLabel) {
                await window.api.updateQuotationVessel(newVessels[i].id, { vesselLabel: newLabel })
            }
        }
        loadData()
        if (onVesselsChanged) onVesselsChanged()
    }

    const alreadyAdded = new Set(qVessels.map(v => v.vesselId).filter(Boolean) as string[])
    const availableVessels = vessels.filter(v => !alreadyAdded.has(v.id))

    return (
        <div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Add vessels from the database or enter details manually. Vessel information will appear in the quotation document.
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Vessels ({qVessels.length})</h3>
                {!showAddForm && (
                    <button onClick={() => setShowAddForm(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                        <Plus size={14} /> Add Vessel
                    </button>
                )}
            </div>

            {showAddForm && (
                <div style={{ padding: '16px', borderRadius: '10px', border: '1px solid var(--glass-border)', marginBottom: '20px', background: 'rgba(0,210,255,0.03)' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                        <button onClick={() => setAddMode('existing')} className={addMode === 'existing' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>From Registry</button>
                        <button onClick={() => { setAddMode('fleet'); loadFleets() }} className={addMode === 'fleet' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: '0.8rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}><Layers size={13} /> Add Fleet</button>
                        <button onClick={() => setAddMode('new')} className={addMode === 'new' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>New Vessel</button>
                    </div>
                    {addMode === 'fleet' ? (
                        <div>
                            <div style={{ position: 'relative', maxWidth: '400px', marginBottom: '10px' }}>
                                <input
                                    type="text"
                                    value={fleetSearch}
                                    onChange={e => setFleetSearch(e.target.value)}
                                    placeholder="Search fleets..."
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                                />
                            </div>
                            <div style={{ maxHeight: '220px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                                {(() => {
                                    const q = fleetSearch.toLowerCase()
                                    const filtered = availableFleets.filter(f => f.name.toLowerCase().includes(q))
                                    if (filtered.length === 0) return (
                                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                            {availableFleets.length === 0 ? 'No fleets with active vessels found' : 'No fleets match your search'}
                                        </div>
                                    )
                                    return filtered.map(f => (
                                        <div
                                            key={f.id}
                                            onClick={() => !addingFleet && handleAddFleet(f.id)}
                                            style={{ padding: '10px 14px', cursor: addingFleet ? 'wait' : 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--table-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s', opacity: addingFleet ? 0.6 : 1 }}
                                            onMouseEnter={e => { if (!addingFleet) e.currentTarget.style.background = isLight ? 'rgba(0,150,200,0.06)' : 'rgba(0,210,255,0.06)' }}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <span style={{ fontWeight: 600 }}>{f.name}</span>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(0,210,255,0.1)', padding: '2px 8px', borderRadius: '10px' }}>{f.vesselCount} vessel{f.vesselCount !== 1 ? 's' : ''}</span>
                                        </div>
                                    ))
                                })()}
                            </div>
                            <div style={{ marginTop: '10px' }}>
                                <button onClick={() => { setShowAddForm(false); setFleetSearch('') }} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                            </div>
                        </div>
                    ) : addMode === 'existing' ? (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                                <input
                                    type="text"
                                    value={vesselSearch}
                                    onChange={e => { setVesselSearch(e.target.value); setVesselDropdownOpen(true); setSelectedVesselId('') }}
                                    onFocus={() => setVesselDropdownOpen(true)}
                                    onBlur={() => setTimeout(() => setVesselDropdownOpen(false), 200)}
                                    placeholder="Search vessel by name or IMO..."
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                                />
                                {vesselDropdownOpen && (() => {
                                    const q = vesselSearch.toLowerCase()
                                    const filtered = q ? availableVessels.filter(v => v.name.toLowerCase().includes(q) || v.imoNumber.toLowerCase().includes(q)) : availableVessels
                                    return filtered.length > 0 ? (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', maxHeight: '220px', overflowY: 'auto', background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)', borderRadius: '8px', zIndex: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                                            {filtered.slice(0, 20).map(v => (
                                                <div key={v.id} onClick={() => { setSelectedVesselId(v.id); setVesselSearch(`${v.name} (IMO: ${v.imoNumber})`); setVesselDropdownOpen(false) }}
                                                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--table-border)', transition: 'background 0.15s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,150,200,0.06)' : 'rgba(0,210,255,0.06)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    <span style={{ fontWeight: 600 }}>{v.name}</span>
                                                    <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '0.8rem' }}>IMO: {v.imoNumber}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null
                                })()}
                            </div>
                            <button onClick={handleAddExisting} disabled={!selectedVesselId} className="btn-primary" style={{ fontSize: '0.82rem' }}>Add</button>
                            <button onClick={() => { setShowAddForm(false); setVesselSearch(''); setVesselDropdownOpen(false) }} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                        </div>
                    ) : (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '600px', marginBottom: '12px' }}>
                                {([
                                    ['name', 'Name *', 'text', true],
                                    ['imoNumber', 'IMO Number', 'text', false],
                                    ['builtYear', 'Built Year', 'number', false],
                                    ['rebuiltYear', 'Rebuilt Year', 'number', false],
                                    ['grossTonnage', 'Gross Tonnage', 'number', false],
                                    ['callSign', 'Call Sign', 'text', false]
                                ] as [keyof typeof EMPTY_NEW_VESSEL, string, string, boolean][]).map(([field, label, type, upper]) => (
                                    <div key={field}>
                                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{label}</label>
                                        <input
                                            type={type}
                                            value={newData[field]}
                                            onChange={e => setNewData(p => ({ ...p, [field]: upper ? e.target.value.toUpperCase() : e.target.value }))}
                                            style={{ width: '100%', ...(upper ? { textTransform: 'uppercase' } : {}) }}
                                        />
                                    </div>
                                ))}
                                {/* Flag combobox */}
                                <div style={{ position: 'relative' }}>
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Flag</label>
                                    <input
                                        type="text"
                                        value={newData.flag}
                                        onChange={e => { setNewData(p => ({ ...p, flag: e.target.value })); setFlagDropdownOpen(true) }}
                                        onFocus={() => setFlagDropdownOpen(true)}
                                        onBlur={() => setTimeout(() => setFlagDropdownOpen(false), 150)}
                                        placeholder="Search flag states..."
                                        style={{ width: '100%' }}
                                    />
                                    {flagDropdownOpen && (() => {
                                        const q = newData.flag.toLowerCase()
                                        const filtered = flagStatesLocal.filter((f: any) =>
                                            f.name?.toLowerCase().includes(q) || f.iso3Code?.toLowerCase().includes(q)
                                        ).slice(0, 10)
                                        return filtered.length > 0 ? (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '2px', maxHeight: '200px', overflowY: 'auto', background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--input-border)', borderRadius: '8px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                                                {filtered.map((f: any) => (
                                                    <div key={f.id} onMouseDown={() => { setNewData(p => ({ ...p, flag: f.name })); setFlagDropdownOpen(false) }}
                                                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--table-border)' }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,150,200,0.06)' : 'rgba(0,210,255,0.06)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        {f.name}{f.iso3Code ? <span style={{ color: 'var(--text-secondary)', marginLeft: '6px', fontSize: '0.8rem' }}>({f.iso3Code})</span> : null}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null
                                    })()}
                                </div>
                                {/* Vessel Type combobox */}
                                <div style={{ position: 'relative' }}>
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Vessel Type</label>
                                    <input
                                        type="text"
                                        value={newData.vesselType}
                                        onChange={e => { setNewData(p => ({ ...p, vesselType: e.target.value })); setTypeDropdownOpen(true) }}
                                        onFocus={() => setTypeDropdownOpen(true)}
                                        onBlur={() => setTimeout(() => setTypeDropdownOpen(false), 150)}
                                        placeholder="Search vessel types..."
                                        style={{ width: '100%' }}
                                    />
                                    {typeDropdownOpen && (() => {
                                        const q = newData.vesselType.toLowerCase()
                                        const filtered = vesselTypesLocal.filter((t: any) =>
                                            t.name?.toLowerCase().includes(q)
                                        ).slice(0, 10)
                                        return filtered.length > 0 ? (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '2px', maxHeight: '200px', overflowY: 'auto', background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--input-border)', borderRadius: '8px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                                                {filtered.map((t: any) => (
                                                    <div key={t.id} onMouseDown={() => { setNewData(p => ({ ...p, vesselType: t.name })); setTypeDropdownOpen(false) }}
                                                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--table-border)' }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,150,200,0.06)' : 'rgba(0,210,255,0.06)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        {t.name}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null
                                    })()}
                                </div>
                                {/* Classification combobox */}
                                <div style={{ position: 'relative' }}>
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Classification</label>
                                    <input
                                        type="text"
                                        value={newData.classification}
                                        onChange={e => { setNewData(p => ({ ...p, classification: e.target.value })); setClassDropdownOpen(true) }}
                                        onFocus={() => setClassDropdownOpen(true)}
                                        onBlur={() => setTimeout(() => setClassDropdownOpen(false), 150)}
                                        placeholder="Search classification societies..."
                                        style={{ width: '100%' }}
                                    />
                                    {classDropdownOpen && (() => {
                                        const q = newData.classification.toLowerCase()
                                        const filtered = classSocietiesLocal.filter((c: any) =>
                                            c.name?.toLowerCase().includes(q)
                                        ).slice(0, 10)
                                        return filtered.length > 0 ? (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '2px', maxHeight: '200px', overflowY: 'auto', background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--input-border)', borderRadius: '8px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                                                {filtered.map((c: any) => (
                                                    <div key={c.id} onMouseDown={() => { setNewData(p => ({ ...p, classification: c.name })); setClassDropdownOpen(false) }}
                                                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--table-border)' }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,150,200,0.06)' : 'rgba(0,210,255,0.06)')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        {c.name}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null
                                    })()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={handleAddNew} className="btn-primary" style={{ fontSize: '0.82rem' }}>Add Vessel</button>
                                <button onClick={() => { setShowAddForm(false); setNewData(EMPTY_NEW_VESSEL) }} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {qVessels.length === 0 && !showAddForm && (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>No vessels added yet. Click "Add Vessel" to begin.</p>
            )}

            {qVessels.map(qv => {
                const reg = qv.vesselId ? vessels.find(v => v.id === qv.vesselId) : null
                const name = reg?.name || qv.name || '(unnamed)'
                const imo = reg?.imoNumber || qv.imoNumber
                const built = reg?.builtYear || qv.builtYear
                const rebuilt = reg?.rebuiltYear || qv.rebuiltYear
                const gt = reg?.grossTonnage || qv.grossTonnage
                const vtype = reg?.vesselType || qv.vesselType
                const classif = reg?.classificationSociety || qv.classification
                return (
                    <div key={qv.id} style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--table-border)', marginBottom: '10px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        {qVessels.length > 1 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                                <button onClick={() => handleMoveVessel(qv.id, 'up')} disabled={qVessels.indexOf(qv) === 0} className="btn-secondary" style={{ padding: '2px', opacity: qVessels.indexOf(qv) === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleMoveVessel(qv.id, 'down')} disabled={qVessels.indexOf(qv) === qVessels.length - 1} className="btn-secondary" style={{ padding: '2px', opacity: qVessels.indexOf(qv) === qVessels.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                            </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '38px', height: '38px', borderRadius: '8px', background: 'rgba(0,210,255,0.12)', color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace', flexShrink: 0 }}>
                            {qv.vesselLabel}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', textTransform: 'uppercase' }}>{name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                                {imo && <span>IMO: {imo}</span>}
                                {built && <span>Built: {rebuilt ? `${built}/${rebuilt}` : built}</span>}
                                {gt && <span>GT: {Number(gt).toLocaleString()}</span>}
                                {vtype && <span>Type: {vtype}</span>}
                                {classif && <span>Class: {classif}</span>}
                                {reg && <span style={{ color: 'var(--accent-primary)', fontSize: '0.7rem' }}>● From registry</span>}
                            </div>
                        </div>
                        <button onClick={() => handleDelete(qv.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px', flexShrink: 0 }}><Trash2 size={16} /></button>
                    </div>
                )
            })}

            {quotation.quotationTypeCode === 'C' && (
                <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--input-border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input type="checkbox" checked={quotation.anyOtherVessel || false}
                            onChange={e => {
                                window.api.updateQuotation(quotation.id, { anyOtherVessel: e.target.checked } as any)
                            }} />
                        Any other vessel(s) to be agreed by Insurers in advance
                    </label>
                </div>
            )}
        </div>
    )
}
