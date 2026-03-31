import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, X, RefreshCw } from 'lucide-react'
import { Quotation, AssuredRole, Entity, QuotationAssured, QuotationAssuredGroup, QuotationVessel, Vessel } from '../../../../shared/types'
import { useTheme } from '../../contexts/ThemeContext'

export default function InsuredTab({ quotation, vessels: _vessels = [], showSuccess, showError, updateField }: { quotation: Quotation; vessels?: Vessel[]; showSuccess: (m: string) => void; showError: (m: string) => void; updateField: (f: string, v: any) => void }) {
    void _vessels
    const { theme } = useTheme()
    const isLight = theme === 'light'
    const [assureds, setAssureds] = useState<QuotationAssured[]>([])
    const [roles, setRoles] = useState<AssuredRole[]>([])
    const [entities, setEntities] = useState<Entity[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [groups, setGroups] = useState<QuotationAssuredGroup[]>([])
    const [newName, setNewName] = useState('')
    const [newRole, setNewRole] = useState('')
    const [newEntityId, setNewEntityId] = useState('')
    const [newVesselLabel, setNewVesselLabel] = useState('')
    const [newGroupId, setNewGroupId] = useState('')
    const [showNewRoleInput, setShowNewRoleInput] = useState(false)
    const [newRoleName, setNewRoleName] = useState('')
    const [newGroupName, setNewGroupName] = useState('')
    const [coInputValue, setCoInputValue] = useState(quotation.coName || '')
    const [showCoDropdown, setShowCoDropdown] = useState(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [a, r, e, qv, g] = await Promise.all([
            window.api.getQuotationAssureds(quotation.id),
            window.api.getAssuredRoles(),
            window.api.getEntities(),
            window.api.getQuotationVessels(quotation.id),
            window.api.getQuotationAssuredGroups(quotation.id)
        ])
        setAssureds(Array.isArray(a) ? a : [])
        setRoles(Array.isArray(r) ? r : [])
        setEntities(Array.isArray(e) ? e : [])
        setQVessels(Array.isArray(qv) ? qv : [])
        setGroups(Array.isArray(g) ? g : [])
    }

    const handleAddAssured = async () => {
        if (!newName.trim()) return
        try {
            await window.api.addQuotationAssured({
                quotationId: quotation.id,
                entityId: newEntityId || undefined,
                name: newName,
                role: newRole || undefined,
                vesselLabel: newVesselLabel || undefined,
                groupId: newGroupId || undefined,
                order: assureds.length
            })
            setNewName(''); setNewRole(''); setNewEntityId(''); setNewVesselLabel(''); setNewGroupId('')
            showSuccess('Assured added')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add assured') }
    }

    const handleCreateRole = async () => {
        if (!newRoleName.trim()) return
        try {
            const created = await window.api.addAssuredRole({ name: newRoleName.trim() })
            await loadData()
            setNewRole(created.name)
            setNewRoleName('')
            setShowNewRoleInput(false)
            showSuccess('Role created')
        } catch (err: any) { showError(err.message || 'Failed to create role') }
    }

    const handleDeleteAssured = async (id: string) => {
        await window.api.deleteQuotationAssured(id)
        showSuccess('Assured removed')
        loadData()
    }

    const handleUpdateVesselLabel = async (id: string, label: string) => {
        await window.api.updateQuotationAssured(id, { vesselLabel: label || undefined })
        loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...assureds]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setAssureds(newOrder)
        await window.api.reorderQuotationAssureds(newOrder.map(a => a.id))
    }

    const handleAddGroup = async (defaultName?: string) => {
        const name = defaultName || newGroupName.trim()
        if (!name) return
        try {
            const result = await window.api.addQuotationAssuredGroup(quotation.id, name)
            if (result && !(result as any).error) {
                setGroups(prev => [...prev, result])
                setNewGroupName('')
                showSuccess('Group added')
            } else {
                showError('Failed to add group')
            }
        } catch (err: any) { showError(err.message || 'Failed to add group') }
    }

    const handleChangeGroup = async (assuredId: string, groupId: string | null) => {
        await window.api.updateQuotationAssured(assuredId, { groupId: groupId || undefined })
        loadData()
    }

    const saveCoName = (val: string) => updateField('coName', val || null)

    const coFiltered = entities.filter(e =>
        coInputValue.length > 0 && e.name.toLowerCase().includes(coInputValue.toLowerCase())
    ).slice(0, 8)

    const renderAssuredRow = (a: QuotationAssured, _idx: number) => {
        const i = assureds.indexOf(a)
        return (
            <div key={a.id} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                {groups.length > 0 && (
                    <select value={a.groupId || ''} onChange={e => handleChangeGroup(a.id, e.target.value || null)}
                        style={{ padding: '3px 6px', borderRadius: '5px', fontSize: '0.72rem', background: 'rgba(0,210,255,0.08)', color: 'var(--accent-primary)', border: '1px solid rgba(0,210,255,0.2)', maxWidth: '100px' }}>
                        <option value="">—</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                )}
                {qVessels.length > 1 && quotation.quotationTypeCode !== 'C' && (
                    <select
                        value={a.vesselLabel || ''}
                        onChange={e => handleUpdateVesselLabel(a.id, e.target.value)}
                        style={{ padding: '3px 6px', borderRadius: '5px', fontSize: '0.75rem', fontWeight: 700, background: 'rgba(0,210,255,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(0,210,255,0.3)', minWidth: '52px' }}
                    >
                        <option value="">—</option>
                        {qVessels.map(v => <option key={v.id} value={v.vesselLabel}>{v.vesselLabel}</option>)}
                    </select>
                )}
                <span style={{ fontWeight: 600, flex: 1 }}>{a.name}</span>
                {a.role && <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '8px', background: 'rgba(0, 210, 255, 0.1)', color: 'var(--accent-primary)' }}>{a.role}</span>}
                <div style={{ display: 'flex', gap: '2px' }}>
                    <button onClick={() => handleMove(i, 'up')} disabled={i === 0} className="btn-secondary" style={{ padding: '4px', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                    <button onClick={() => handleMove(i, 'down')} disabled={i === assureds.length - 1} className="btn-secondary" style={{ padding: '4px', opacity: i === assureds.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                    <button onClick={() => handleDeleteAssured(a.id)} className="btn-secondary" style={{ padding: '4px', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </div>
            </div>
        )
    }

    return (
        <div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Define the insured parties. Set the C/O Broker if applicable, then add assureds in the order they should appear in the quotation.
            </p>
            {/* c/o Broker */}
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>C/O (Broker)</h3>
            <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '28px' }}>
                <input
                    type="text"
                    value={coInputValue}
                    onChange={e => { setCoInputValue(e.target.value); setShowCoDropdown(true) }}
                    onBlur={() => { setTimeout(() => setShowCoDropdown(false), 150); saveCoName(coInputValue) }}
                    onFocus={() => { if (coInputValue) setShowCoDropdown(true) }}
                    placeholder="Broker / c/o — type to search entities or enter free text"
                    style={{ width: '100%', border: '1px solid var(--input-border)' }}
                />
                {showCoDropdown && coFiltered.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)', borderRadius: '6px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', maxHeight: '200px', overflowY: 'auto' }}>
                        {coFiltered.map(e => (
                            <div
                                key={e.id}
                                onMouseDown={() => { setCoInputValue(e.name); setShowCoDropdown(false); saveCoName(e.name) }}
                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--table-border)' }}
                                onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(0,210,255,0.08)')}
                                onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                            >
                                {e.name} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({e.type})</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Assured Groups — collapsed by default, auto-expands when groups exist */}
            {groups.length > 0 ? (
                <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Groups</span>
                    </div>
                    {groups.map((g, i) => (
                        <div key={g.id} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '18px' }}>{i + 1}.</span>
                            <input value={g.name} onChange={e => setGroups(prev => prev.map(gg => gg.id === g.id ? { ...gg, name: e.target.value } : gg))}
                                onBlur={e => window.api.updateQuotationAssuredGroup(g.id, { name: e.target.value })}
                                style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }} />
                            <button onClick={async () => { await window.api.deleteQuotationAssuredGroup(g.id); showSuccess('Group deleted'); loadData() }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}><Trash2 size={14} /></button>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
                        <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && newGroupName.trim()) { handleAddGroup() } }}
                            placeholder="Add group..."
                            style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: '1px dashed var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
                        <button onClick={() => handleAddGroup()} disabled={!newGroupName.trim()} className="btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Plus size={12} />
                        </button>
                    </div>
                </div>
            ) : (
                <button onClick={async () => {
                    const result = await window.api.addQuotationAssuredGroup(quotation.id, 'ASSURED')
                    if (result && !(result as any).error) {
                        setGroups([result])
                        showSuccess('Group added — assign assureds to groups using the dropdown')
                    }
                }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.78rem', padding: '0 0 14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Plus size={12} /> Organize into groups (e.g. Assured / Co-Assured)
                </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Assureds</h3>
                <button onClick={() => { loadData(); showSuccess('Assured details refreshed') }} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', padding: '5px 10px' }} title="Refresh assured details">
                    <RefreshCw size={13} /> Refresh
                </button>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <select
                    value={newEntityId}
                    onChange={e => {
                        setNewEntityId(e.target.value)
                        const ent = entities.find(x => x.id === e.target.value)
                        if (ent) setNewName(ent.name)
                    }}
                    style={{ padding: '8px 12px', borderRadius: '8px', minWidth: '180px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                >
                    <option value="">Select entity or type manually</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.name} ({e.type})</option>)}
                </select>
                <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Assured name"
                    style={{ flex: 1, minWidth: '160px' }}
                />
                {showNewRoleInput ? (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={newRoleName}
                            onChange={e => setNewRoleName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleCreateRole() }}
                            placeholder="New role name"
                            style={{ width: '140px', border: '1px solid var(--input-border)' }}
                            autoFocus
                        />
                        <button onClick={handleCreateRole} className="btn-primary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>Save</button>
                        <button onClick={() => { setShowNewRoleInput(false); setNewRoleName('') }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}><X size={14} /></button>
                    </div>
                ) : (
                    <select
                        value={newRole}
                        onChange={e => { if (e.target.value === '__new__') { setShowNewRoleInput(true); setNewRole('') } else setNewRole(e.target.value) }}
                        style={{ padding: '8px 12px', borderRadius: '8px', minWidth: '140px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                    >
                        <option value="">Role</option>
                        {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                        <option value="__new__">+ Create new role…</option>
                    </select>
                )}
                {qVessels.length > 0 && (
                    <select
                        value={newVesselLabel}
                        onChange={e => setNewVesselLabel(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                    >
                        <option value="">All vessels</option>
                        {qVessels.map(v => <option key={v.id} value={v.vesselLabel}>{v.vesselLabel}</option>)}
                    </select>
                )}
                {groups.length > 0 && (
                    <select value={newGroupId} onChange={e => setNewGroupId(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}>
                        <option value="">No group</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                )}
                <button onClick={handleAddAssured} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
            </div>

            <div style={{ marginTop: '14px' }}>
                {groups.length > 0 ? (
                    /* Group-based view */
                    <>
                        {groups.map(g => {
                            const groupAssureds = assureds.filter(a => a.groupId === g.id)
                            return (
                                <div key={g.id} style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-primary)', letterSpacing: '0.05em', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid var(--table-border)' }}>
                                        {g.name}
                                    </div>
                                    {groupAssureds.map((a, i) => renderAssuredRow(a, i))}
                                    {groupAssureds.length === 0 && (
                                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '4px 0' }}>No assureds in this group.</p>
                                    )}
                                </div>
                            )
                        })}
                        {assureds.filter(a => !a.groupId).length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid var(--table-border)' }}>
                                    Ungrouped
                                </div>
                                {assureds.filter(a => !a.groupId).map((a, i) => renderAssuredRow(a, i))}
                            </div>
                        )}
                    </>
                ) : qVessels.length > 1 ? (
                    /* Vessel-based view (multi-vessel, no groups) */
                    <>
                        {qVessels.map(qv => {
                            const vesselAssureds = assureds.filter(a => a.vesselLabel === qv.vesselLabel)
                            if (vesselAssureds.length === 0) return null
                            return (
                                <div key={qv.id} style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-primary)', letterSpacing: '0.05em', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid var(--table-border)' }}>
                                        {qv.vesselLabel} — {(qv.name || qv.vesselLabel).toUpperCase()}
                                    </div>
                                    {vesselAssureds.map((a, i) => renderAssuredRow(a, i))}
                                </div>
                            )
                        })}
                        {assureds.filter(a => !a.vesselLabel).length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid var(--table-border)' }}>
                                    All Vessels
                                </div>
                                {assureds.filter(a => !a.vesselLabel).map((a, i) => renderAssuredRow(a, i))}
                            </div>
                        )}
                    </>
                ) : (
                    /* Flat list (single vessel, no groups) */
                    assureds.map((a, i) => renderAssuredRow(a, i))
                )}
                {assureds.length === 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>No assureds added yet. Add manually or go to the Vessel tab to import from a vessel.</p>}
            </div>
        </div>
    )
}
