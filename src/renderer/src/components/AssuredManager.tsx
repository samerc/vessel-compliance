import { useState, useEffect } from 'react'
import { Trash2, Users, UserPlus, UserCheck, ChevronDown, ChevronUp, Check, Building2, User, Shield, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react'
import { Vessel, Entity, AssuredRole, VesselAssured, EntityUBO } from '../../../shared/types'
import { OfacService } from '../services/OfacService'

interface AssuredManagerProps {
    vessel: Vessel
}

export default function AssuredManager({ vessel }: AssuredManagerProps) {
    const [entities, setEntities] = useState<Entity[]>([])
    const [roles, setRoles] = useState<AssuredRole[]>([])
    const [vesselAssureds, setVesselAssureds] = useState<VesselAssured[]>([])
    const [entityUBOs, setEntityUBOs] = useState<EntityUBO[]>([])

    const [showAddForm, setShowAddForm] = useState(false)
    const [newName, setNewName] = useState('')
    const [newType, setNewType] = useState<'company' | 'person'>('company')
    const [newRole, setNewRole] = useState('')
    const [newIdentifier, setNewIdentifier] = useState('')
    const [expandedAssuredId, setExpandedAssuredId] = useState<string | null>(null)
    const [newUBOName, setNewUBOName] = useState('')
    const [newUBOType, setNewUBOType] = useState<'company' | 'person'>('person')
    const [newUBOIdentifier, setNewUBOIdentifier] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [newPhone, setNewPhone] = useState('')
    const [newUBOEmail, setNewUBOEmail] = useState('')
    const [newUBOPhone, setNewUBOPhone] = useState('')

    const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
    const [selectedUBOId, setSelectedUBOId] = useState<string | null>(null)

    useEffect(() => {
        loadData()
    }, [vessel.id])

    const loadData = async () => {
        try {
            const [e, r, va, eu] = await Promise.all([
                window.api.getEntities(),
                window.api.getAssuredRoles(),
                window.api.getVesselAssureds(vessel.id),
                window.api.getEntityUBOs()
            ])
            setEntities(e || [])
            setRoles(r || [])
            setVesselAssureds(va || [])
            setEntityUBOs(eu || [])
        } catch (error) {
            console.error('Failed to load assured data:', error)
        }
    }

    const matchingEntities = entities.filter(ent =>
        newName && ent.name.toLowerCase().includes(newName.toLowerCase())
    )

    const matchingUBOs = entities.filter(ent =>
        newUBOName && ent.name.toLowerCase().includes(newUBOName.toLowerCase())
    )

    const handleAddAssured = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName.trim() || !newRole.trim()) return

        let entityId = selectedEntityId

        if (!entityId) {
            // Check OFAC list
            const scanResult = await OfacService.checkSanctions(newName)

            const entity = await window.api.addEntity({
                name: newName,
                type: newType,
                identifier: newIdentifier,
                email: newEmail,
                phone: newPhone,
                ofacCheckedAt: scanResult.timestamp,
                ofacMatchFound: scanResult.matchFound,
                ofacStatus: scanResult.status
            })
            entityId = entity.id
        }

        // Auto-register role if it doesn't exist
        const roleExists = roles.some(r => r.name.toLowerCase() === newRole.trim().toLowerCase())
        if (!roleExists) {
            await window.api.addAssuredRole({ name: newRole.trim() })
        }

        await window.api.addVesselAssured({
            vesselId: vessel.id,
            entityId: entityId,
            role: newRole
        })

        setNewName('')
        setNewRole('')
        setNewIdentifier('')
        setNewEmail('')
        setNewPhone('')
        setNewType('company')
        setSelectedEntityId(null)
        setShowAddForm(false)
        loadData()
    }

    const handleAddUBO = async (assuredEntityId: string) => {
        if (!newUBOName.trim()) return

        let entityId = selectedUBOId

        if (!entityId) {
            // Check OFAC list
            const scanResult = await OfacService.checkSanctions(newUBOName)

            const entity = await window.api.addEntity({
                name: newUBOName,
                type: newUBOType,
                identifier: newUBOIdentifier,
                email: newUBOEmail,
                phone: newUBOPhone,
                ofacCheckedAt: scanResult.timestamp,
                ofacMatchFound: scanResult.matchFound,
                ofacStatus: scanResult.status
            })
            entityId = entity.id
        }

        await window.api.addEntityUBO({
            assuredEntityId,
            uboEntityId: entityId
        })

        setNewUBOName('')
        setNewUBOType('person')
        setNewUBOIdentifier('')
        setNewUBOEmail('')
        setNewUBOPhone('')
        setSelectedUBOId(null)
        loadData()
    }

    const handleDeleteAssured = async (id: string) => {
        if (confirm('Remove this assured from this vessel?')) {
            await window.api.deleteVesselAssured(id)
            loadData()
        }
    }

    const handleDeleteUBO = async (assuredEntityId: string, uboEntityId: string) => {
        await window.api.deleteEntityUBO({ assuredEntityId, uboEntityId })
        loadData()
    }

    const handleUploadPassport = async (e: React.DragEvent, entityId: string) => {
        e.preventDefault()
        e.stopPropagation()

        const files = e.dataTransfer.files
        if (files.length === 0) return
        const file = files[0]

        const filePath = window.api.getFilePath(file)
        if (!filePath) {
            alert('Could not retrieve file path')
            return
        }

        await window.api.updateEntity(entityId, { passportFilePath: filePath })
        loadData()
    }
    const handleOfacRecheck = async (entity: Entity) => {
        const result = await OfacService.checkSanctions(entity.name)
        await window.api.updateEntity(entity.id, {
            ofacCheckedAt: result.timestamp,
            ofacMatchFound: result.matchFound,
            ofacStatus: result.status
        })
        loadData()
    }

    const OfacBadge = ({ entity }: { entity: Entity }) => {
        const isMatch = entity.ofacStatus === 'MATCH'
        const isError = entity.ofacStatus === 'ERROR'
        const isPending = !entity.ofacStatus || entity.ofacStatus === 'PENDING'

        const config = {
            background: isPending ? 'rgba(255, 255, 255, 0.05)' : (isError ? 'rgba(255, 153, 0, 0.1)' : (isMatch ? 'rgba(255, 77, 77, 0.1)' : 'rgba(0, 255, 136, 0.1)')),
            border: isPending ? '1px solid rgba(255, 255, 255, 0.1)' : (isError ? '1px solid rgba(255, 153, 0, 0.3)' : (isMatch ? '1px solid rgba(255, 77, 77, 0.3)' : '1px solid rgba(0, 255, 136, 0.3)')),
            color: isPending ? 'var(--text-secondary)' : (isError ? '#ff9900' : (isMatch ? '#ff4d4d' : '#00ff88')),
            text: isPending ? 'NOT CHECKED' : (isError ? 'CHECK FAILED' : (isMatch ? 'MATCH FOUND' : 'OFAC CLEARED')),
            icon: isPending ? <Shield size={12} opacity={0.5} /> : (isError ? <Shield size={12} /> : (isMatch ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />))
        }

        return (
            <div
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    background: config.background,
                    border: config.border,
                    color: config.color,
                    cursor: 'default'
                }}
                title={isError ? 'API request failed. Click refresh to try again.' : `Last checked: ${entity.ofacCheckedAt ? new Date(entity.ofacCheckedAt).toLocaleString() : 'Never'}`}
            >
                {config.icon}
                <span style={{ whiteSpace: 'nowrap' }}>{config.text}</span>
                <RefreshCw
                    size={10}
                    style={{ marginLeft: '4px', cursor: 'pointer', opacity: 0.6 }}
                    className="hover-spin"
                    onClick={(e) => { e.stopPropagation(); handleOfacRecheck(entity); }}
                />
            </div>
        )
    }

    return (
        <section className="fade-in" style={{ marginTop: '32px' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={20} color="var(--accent-primary)" /> Assureds & UBOs
                </h3>
                <button
                    onClick={() => { setShowAddForm(!showAddForm); setSelectedEntityId(null); }}
                    className="btn-primary"
                    style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                    {showAddForm ? 'Cancel' : <><UserPlus size={16} /> Add Assured</>}
                </button>
            </header>

            {showAddForm && (
                <div className="glass-card" style={{ padding: '24px', marginBottom: '24px', border: '1px solid var(--accent-primary)' }}>
                    <form onSubmit={handleAddAssured}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div style={{ position: 'relative' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Entity Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => { setNewName(e.target.value); setSelectedEntityId(null); }}
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '8px' }}
                                    placeholder="Type name to find or create..."
                                    required
                                />

                                {newName && !selectedEntityId && matchingEntities.length > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        right: 0,
                                        zIndex: 100,
                                        marginTop: '4px',
                                        padding: '8px',
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        background: '#1a1d21', // Solid dark background
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                                    }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '8px', padding: '4px' }}>Existing matches (Click to select):</div>
                                        {matchingEntities.map(ent => (
                                            <div
                                                key={ent.id}
                                                onClick={() => { setSelectedEntityId(ent.id); setNewName(ent.name); }}
                                                style={{ padding: '8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                className="hover-effect"
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {ent.type === 'company' ? <Building2 size={14} opacity={0.5} /> : <User size={14} opacity={0.5} />}
                                                    <span>{ent.name}</span>
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>{ent.identifier ? `[${ent.identifier}]` : '(ID: ' + ent.id.slice(0, 4) + ')'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {selectedEntityId && (
                                    <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Check size={14} /> Linked to existing entity
                                    </div>
                                )}
                            </div>

                            {!selectedEntityId && (
                                <>
                                    <div style={{ display: 'flex', gap: '20px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Distinguishing Identifier (Optional)</label>
                                            <input
                                                type="text"
                                                value={newIdentifier}
                                                onChange={e => setNewIdentifier(e.target.value)}
                                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '8px' }}
                                                placeholder="e.g. Greek Branch, ID Number..."
                                            />
                                        </div>
                                        <div style={{ width: '140px' }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Entity Type</label>
                                            <select
                                                value={newType}
                                                onChange={e => setNewType(e.target.value as any)}
                                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '8px' }}
                                            >
                                                <option value="company" style={{ background: '#1a1d21' }}>Company</option>
                                                <option value="person" style={{ background: '#1a1d21' }}>Person</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Email</label>
                                            <input
                                                type="email"
                                                value={newEmail}
                                                onChange={e => setNewEmail(e.target.value)}
                                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '8px' }}
                                                placeholder="contact@entity.com"
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Phone</label>
                                            <input
                                                type="text"
                                                value={newPhone}
                                                onChange={e => setNewPhone(e.target.value)}
                                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '8px' }}
                                                placeholder="+123..."
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'flex-end' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Role on Vessel</label>
                                <input
                                    list="role-suggestions"
                                    type="text"
                                    value={newRole}
                                    onChange={e => setNewRole(e.target.value)}
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '8px' }}
                                    placeholder="Select or type role..."
                                    required
                                />
                                <datalist id="role-suggestions">
                                    {roles.map(r => <option key={r.id} value={r.name} />)}
                                </datalist>
                            </div>
                            <button type="submit" className="btn-primary" style={{ padding: '10px 32px' }}>
                                {selectedEntityId ? 'Link Existing Assured' : 'Register & Add New Assured'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '16px' }}>Assured Name</th>
                            <th style={{ padding: '16px' }}>Role</th>
                            <th style={{ padding: '16px' }}>UBOs</th>
                            <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {vesselAssureds.map(va => {
                            const entity = entities.find(e => e.id === va.entityId)
                            const ubos = entityUBOs
                                .filter(u => u.assuredEntityId === va.entityId)
                                .map(u => entities.find(e => e.id === u.uboEntityId))
                                .filter(Boolean)

                            const isExpanded = expandedAssuredId === va.id

                            return (
                                <React.Fragment key={va.id}>
                                    <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {entity?.type === 'company' ? <Building2 size={16} opacity={0.5} /> : <User size={16} opacity={0.5} />}
                                                <div>
                                                    <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {entity?.name}
                                                        {entity && <OfacBadge entity={entity} />}
                                                    </div>
                                                    {entity?.identifier && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{entity.identifier}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <span style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>{va.role}</span>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <button
                                                onClick={() => setExpandedAssuredId(isExpanded ? null : va.id)}
                                                style={{ background: 'transparent', color: 'var(--accent-primary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                {ubos.length} UBO(s) {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </button>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <button onClick={() => handleDeleteAssured(va.id)} style={{ background: 'transparent', color: 'var(--danger)' }} title="Remove Assured">
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr style={{ background: 'rgba(0, 0, 0, 0.1)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td colSpan={4} style={{ padding: '16px 32px' }}>
                                                <div style={{ padding: '16px', borderLeft: '2px solid var(--accent-primary)', background: 'rgba(255,255,255,0.02)' }}>
                                                    <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <UserCheck size={16} /> Ultimate Beneficial Owners (UBOs)
                                                    </h4>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: '12px', marginBottom: '12px' }}>
                                                        <div style={{ position: 'relative' }}>
                                                            <input
                                                                type="text"
                                                                value={newUBOName}
                                                                onChange={e => { setNewUBOName(e.target.value); setSelectedUBOId(null); }}
                                                                placeholder="UBO Name..."
                                                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '8px 10px', color: 'white', fontSize: '0.85rem' }}
                                                            />
                                                            {newUBOName && !selectedUBOId && matchingUBOs.length > 0 && (
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    top: '100%',
                                                                    left: 0,
                                                                    right: 0,
                                                                    zIndex: 100,
                                                                    marginTop: '4px',
                                                                    padding: '8px',
                                                                    maxHeight: '150px',
                                                                    overflowY: 'auto',
                                                                    background: '#1a1d21',
                                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                                    borderRadius: '8px',
                                                                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                                                                }}>
                                                                    {matchingUBOs.map(ent => (
                                                                        <div
                                                                            key={ent.id}
                                                                            onClick={() => { setSelectedUBOId(ent.id); setNewUBOName(ent.name); }}
                                                                            style={{ padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                                            className="hover-effect"
                                                                        >
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                {ent.type === 'company' ? <Building2 size={12} opacity={0.5} /> : <User size={12} opacity={0.5} />}
                                                                                <span>{ent.name}</span>
                                                                            </div>
                                                                            <span style={{ color: 'var(--accent-primary)' }}>{ent.identifier || ent.id.slice(0, 4)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            {!selectedUBOId && (
                                                                <input
                                                                    type="text"
                                                                    value={newUBOIdentifier}
                                                                    onChange={e => setNewUBOIdentifier(e.target.value)}
                                                                    placeholder="UBO Identifier..."
                                                                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '8px 10px', color: 'white', fontSize: '0.85rem' }}
                                                                />
                                                            )}
                                                            {selectedUBOId && <div style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--success)' }}><Check size={14} /> Linked</div>}
                                                        </div>
                                                        {!selectedUBOId ? (
                                                            <select
                                                                value={newUBOType}
                                                                onChange={e => setNewUBOType(e.target.value as any)}
                                                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '0.85rem' }}
                                                            >
                                                                <option value="company">Company</option>
                                                                <option value="person">Person</option>
                                                            </select>
                                                        ) : <div />}
                                                        <button onClick={() => handleAddUBO(va.entityId)} className="btn-secondary" style={{ padding: '0 20px', fontSize: '0.8rem' }}>
                                                            {selectedUBOId ? 'Link' : 'New'}
                                                        </button>
                                                    </div>

                                                    {!selectedUBOId && (
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                                            <input
                                                                type="email"
                                                                value={newUBOEmail}
                                                                onChange={e => setNewUBOEmail(e.target.value)}
                                                                placeholder="UBO Email..."
                                                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '8px 10px', color: 'white', fontSize: '0.85rem' }}
                                                            />
                                                            <input
                                                                type="text"
                                                                value={newUBOPhone}
                                                                onChange={e => setNewUBOPhone(e.target.value)}
                                                                placeholder="UBO Phone..."
                                                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '8px 10px', color: 'white', fontSize: '0.85rem' }}
                                                            />
                                                        </div>
                                                    )}

                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                                        {ubos.map(ubo => (
                                                            <div
                                                                key={ubo!.id}
                                                                style={{
                                                                    background: 'rgba(255,255,255,0.05)',
                                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                                    borderRadius: '12px',
                                                                    padding: '8px 12px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '8px',
                                                                    minWidth: '200px'
                                                                }}
                                                            >
                                                                {ubo!.type === 'company' ? <Building2 size={14} opacity={0.5} /> : <User size={14} opacity={0.5} />}
                                                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{ubo!.name}</span>
                                                                        <OfacBadge entity={ubo!} />
                                                                    </div>
                                                                    {ubo!.identifier && <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>{ubo!.identifier}</span>}
                                                                    {ubo!.type === 'person' && (
                                                                        <div
                                                                            onDragOver={(e) => e.preventDefault()}
                                                                            onDrop={(e) => handleUploadPassport(e, ubo!.id)}
                                                                            style={{
                                                                                fontSize: '0.7rem',
                                                                                marginTop: '4px',
                                                                                padding: '4px 6px',
                                                                                borderRadius: '4px',
                                                                                background: ubo!.passportFilePath ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255,255,255,0.05)',
                                                                                border: '1px dashed rgba(255,255,255,0.2)',
                                                                                cursor: ubo!.passportFilePath ? 'pointer' : 'default'
                                                                            }}
                                                                            onClick={() => ubo!.passportFilePath && window.api.fsOpen(ubo!.passportFilePath)}
                                                                        >
                                                                            {ubo!.passportFilePath ? '📄 ID/Passport (Click to view)' : '📎 Drop ID/Passport here'}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <button onClick={() => handleDeleteUBO(va.entityId, ubo!.id)} style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '2px' }} className="hover-danger">
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                        {ubos.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No UBOs listed.</div>}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

import React from 'react'
