import { useState, useEffect } from 'react'
import { Search, User, Ship, ChevronRight, Shield, Building2 } from 'lucide-react'
import { Entity, Vessel, VesselAssured, EntityUBO } from '../../../shared/types'

export default function EntityDirectory() {
    const [entities, setEntities] = useState<Entity[]>([])
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [vesselAssureds, setVesselAssureds] = useState<VesselAssured[]>([])
    const [entityUBOs, setEntityUBOs] = useState<EntityUBO[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const [e, v, va, eu] = await Promise.all([
            window.api.getEntities(),
            window.api.getVessels(),
            window.api.getVesselAssureds(),
            window.api.getEntityUBOs()
        ])
        setEntities(e)
        setVessels(v)
        setVesselAssureds(va)
        setEntityUBOs(eu)
    }

    const filteredEntities = entities.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const getAssociatedVessels = (entityId: string) => {
        // 1. Check direct assured roles
        const directLinks = vesselAssureds.filter(va => va.entityId === entityId)

        // 2. Check UBO roles (Find assureds this entity is a UBO for)
        const parentAssuredIds = entityUBOs
            .filter(eu => eu.uboEntityId === entityId)
            .map(eu => eu.assuredEntityId)

        const indirectLinks = vesselAssureds.filter(va => parentAssuredIds.includes(va.entityId))

        const vesselIds = new Set([...directLinks.map(l => l.vesselId), ...indirectLinks.map(l => l.vesselId)])

        return vessels.filter(v => vesselIds.has(v.id)).map(v => {
            const roles = directLinks.filter(l => l.vesselId === v.id).map(l => l.role)
            const viaAssureds = indirectLinks.filter(l => l.vesselId === v.id).map(l => {
                const assured = entities.find(e => e.id === l.entityId)
                return `${assured?.name} (${l.role})`
            })
            return { ...v, roles, viaAssureds }
        })
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Entity Directory</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Search for Assureds and UBOs to see their vessel associations.</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '32px', alignItems: 'start' }}>
                {/* Left Side: Search & List */}
                <div className="glass-card" style={{ padding: '0', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 200px)' }}>
                    <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ position: 'relative' }}>
                            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={18} />
                            <input
                                type="text"
                                placeholder="Search names..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px',
                                    padding: '10px 10px 10px 40px',
                                    color: 'white'
                                }}
                            />
                        </div>
                    </div>
                    <div style={{ overflowY: 'auto' }}>
                        {filteredEntities.map(entity => (
                            <div
                                key={entity.id}
                                onClick={() => setSelectedEntity(entity)}
                                style={{
                                    padding: '16px 20px',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    cursor: 'pointer',
                                    background: selectedEntity?.id === entity.id ? 'rgba(0, 210, 255, 0.1)' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    transition: 'var(--transition)'
                                }}
                                className="hover-effect"
                            >
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.05)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--accent-primary)'
                                }}>
                                    {entity.type === 'company' ? <Building2 size={18} /> : <User size={18} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '600' }}>{entity.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{getAssociatedVessels(entity.id).length} Vessels</span>
                                        {entity.identifier && <span style={{ color: 'var(--accent-primary)' }}>{entity.identifier}</span>}
                                    </div>
                                </div>
                                <ChevronRight size={18} opacity={0.3} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Side: Details */}
                <div style={{ minHeight: '400px' }}>
                    {selectedEntity ? (
                        <div className="fade-in">
                            <div className="glass-card" style={{ padding: '32px', marginBottom: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '8px' }}>
                                    <div style={{
                                        width: '64px',
                                        height: '64px',
                                        borderRadius: '16px',
                                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white'
                                    }}>
                                        {selectedEntity.type === 'company' ? <Building2 size={32} /> : <User size={32} />}
                                    </div>
                                    <div>
                                        <h2 style={{ fontSize: '2rem' }}>{selectedEntity.name}</h2>
                                        <p style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                                            {selectedEntity.type} {selectedEntity.identifier ? `• ${selectedEntity.identifier}` : ''}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Ship size={20} color="var(--accent-primary)" /> Associated Vessels
                            </h3>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                                {getAssociatedVessels(selectedEntity.id).map(vessel => (
                                    <div key={vessel.id} className="glass-card" style={{ padding: '20px' }}>
                                        <div style={{ fontWeight: '600', fontSize: '1.2rem', marginBottom: '4px' }}>{vessel.name}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>IMO: {vessel.imoNumber}</div>

                                        {vessel.roles.length > 0 && (
                                            <div style={{ marginBottom: '12px' }}>
                                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Direct Role</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {vessel.roles.map((r, i) => (
                                                        <span key={i} style={{ background: 'rgba(0, 210, 255, 0.1)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid rgba(0, 210, 255, 0.2)' }}>
                                                            {r}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {vessel.viaAssureds.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Via Assured (UBO)</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {vessel.viaAssureds.map((r, i) => (
                                                        <span key={i} style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                                            {r}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {getAssociatedVessels(selectedEntity.id).length === 0 && (
                                    <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>
                                        No vessels found for this entity.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>
                            <Shield size={64} style={{ marginBottom: '20px', opacity: 0.2 }} />
                            <h3>Select an entity to view details</h3>
                            <p>All vessels where this entity is an Assured or a UBO will be listed here.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
