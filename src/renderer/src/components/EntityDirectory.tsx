import React, { useState, useEffect } from 'react'
import { Search, User, Ship, ChevronRight, Shield, Building2, ShieldCheck, ShieldAlert, RefreshCw, Loader2 } from 'lucide-react'
import { Entity, Vessel, VesselAssured, EntityUBO, SanctionsMatch } from '../../../shared/types'
import { OfacService } from '../services/OfacService'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import SanctionsModal from './SanctionsModal'

export default function EntityDirectory() {
    const [entities, setEntities] = useState<Entity[]>([])
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [vesselAssureds, setVesselAssureds] = useState<VesselAssured[]>([])
    const [entityUBOs, setEntityUBOs] = useState<EntityUBO[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
    const { showError } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    // Sanctions checking state
    const [checkingId, setCheckingId] = useState<string | null>(null)

    // Sanctions modal state
    const [sanctionsModal, setSanctionsModal] = useState<{
        show: boolean
        searchedName: string
        matches: SanctionsMatch[]
        entityId?: string
        vesselId?: string
    }>({ show: false, searchedName: '', matches: [] })

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

    const handleOfacRecheck = async (entity: Entity) => {
        setCheckingId(entity.id)
        try {
            const result = await OfacService.checkSanctions(entity.name)
            await window.api.updateEntity(entity.id, {
                ofacCheckedAt: result.timestamp,
                ofacMatchFound: result.matchFound,
                ofacStatus: result.status
            })
            loadData()

            if (result.matchFound && result.matches.length > 0) {
                setSanctionsModal({ show: true, searchedName: entity.name, matches: result.matches, entityId: entity.id })
            }
        } catch (error: any) {
            showError(error.message || 'Sanctions check failed. Please try again.')
        } finally {
            setCheckingId(null)
        }
    }

    const handleVesselOfacRecheck = async (vessel: Vessel) => {
        setCheckingId(vessel.id)
        try {
            const result = await OfacService.checkSanctions(vessel.name)
            await window.api.updateVessel(vessel.id, {
                ofacCheckedAt: result.timestamp,
                ofacMatchFound: result.matchFound,
                ofacStatus: result.status
            })
            loadData()

            if (result.matchFound && result.matches.length > 0) {
                setSanctionsModal({ show: true, searchedName: vessel.name, matches: result.matches, vesselId: vessel.id })
            }
        } catch (error: any) {
            showError(error.message || 'Sanctions check failed. Please try again.')
        } finally {
            setCheckingId(null)
        }
    }

    const handleMarkClean = async () => {
        if (sanctionsModal.entityId) {
            await window.api.updateEntity(sanctionsModal.entityId, { ofacStatus: 'CLEARED', ofacMatchFound: false })
        } else if (sanctionsModal.vesselId) {
            await window.api.updateVessel(sanctionsModal.vesselId, { ofacStatus: 'CLEARED', ofacMatchFound: false })
        }
        setSanctionsModal({ show: false, searchedName: '', matches: [] })
        loadData()
    }

    const handleConfirmMatch = async () => {
        if (sanctionsModal.entityId) {
            await window.api.updateEntity(sanctionsModal.entityId, { ofacStatus: 'MATCH', ofacMatchFound: true })
        } else if (sanctionsModal.vesselId) {
            await window.api.updateVessel(sanctionsModal.vesselId, { ofacStatus: 'MATCH', ofacMatchFound: true })
        }
        setSanctionsModal({ show: false, searchedName: '', matches: [] })
        loadData()
    }

    const handleViewPotentialMatch = async (entity?: Entity, vessel?: Vessel) => {
        const id = entity?.id || vessel?.id
        const name = entity?.name || vessel?.name || ''
        if (id) setCheckingId(id)
        try {
            const result = await OfacService.checkSanctions(name)
            if (result.matches.length > 0) {
                setSanctionsModal({
                    show: true,
                    searchedName: name,
                    matches: result.matches,
                    entityId: entity?.id,
                    vesselId: vessel?.id
                })
            }
        } catch (error: any) {
            showError(error.message || 'Failed to load sanctions data. Please try again.')
        } finally {
            setCheckingId(null)
        }
    }

    const OfacBadge = ({ entity, vessel, onRecheck }: { entity?: Entity, vessel?: Vessel, onRecheck: () => void }) => {
        const target = entity || vessel
        const isChecking = checkingId === target?.id
        const isMatch = target?.ofacStatus === 'MATCH'
        const isPotentialMatch = target?.ofacStatus === 'POTENTIAL_MATCH'
        const isError = target?.ofacStatus === 'ERROR'
        const isPending = !target?.ofacStatus || target.ofacStatus === 'PENDING'

        // Show checking state
        if (isChecking) {
            return (
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '2px 10px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        background: isLight ? 'rgba(0, 150, 200, 0.15)' : 'rgba(0, 210, 255, 0.1)',
                        border: isLight ? '1px solid rgba(0, 150, 200, 0.4)' : '1px solid rgba(0, 210, 255, 0.3)',
                        color: isLight ? '#0077a3' : '#00d2ff'
                    }}
                >
                    <Loader2 size={12} className="spinner" />
                    CHECKING...
                </div>
            )
        }

        let config: { background: string; border: string; color: string; text: string; icon: React.ReactNode }

        if (isPending) {
            config = {
                background: isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)',
                border: isLight ? '1px solid rgba(0, 0, 0, 0.15)' : '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--text-secondary)',
                text: 'NOT CHECKED',
                icon: <Shield size={12} opacity={0.5} />
            }
        } else if (isError) {
            config = {
                background: isLight ? 'rgba(200, 120, 0, 0.15)' : 'rgba(255, 153, 0, 0.1)',
                border: isLight ? '1px solid rgba(200, 120, 0, 0.4)' : '1px solid rgba(255, 153, 0, 0.3)',
                color: isLight ? '#b36b00' : '#ff9900',
                text: 'CHECK FAILED',
                icon: <Shield size={12} />
            }
        } else if (isMatch) {
            config = {
                background: isLight ? 'rgba(200, 0, 0, 0.12)' : 'rgba(255, 77, 77, 0.1)',
                border: isLight ? '1px solid rgba(200, 0, 0, 0.35)' : '1px solid rgba(255, 77, 77, 0.3)',
                color: isLight ? '#c00000' : '#ff4d4d',
                text: 'SANCTIONED',
                icon: <ShieldAlert size={12} />
            }
        } else if (isPotentialMatch) {
            config = {
                background: isLight ? 'rgba(180, 140, 0, 0.15)' : 'rgba(255, 193, 7, 0.1)',
                border: isLight ? '1px solid rgba(180, 140, 0, 0.4)' : '1px solid rgba(255, 193, 7, 0.3)',
                color: isLight ? '#997a00' : '#ffc107',
                text: 'POSSIBLE MATCH',
                icon: <ShieldAlert size={12} />
            }
        } else {
            config = {
                background: isLight ? 'rgba(0, 140, 70, 0.12)' : 'rgba(0, 255, 136, 0.1)',
                border: isLight ? '1px solid rgba(0, 140, 70, 0.35)' : '1px solid rgba(0, 255, 136, 0.3)',
                color: isLight ? '#008c46' : '#00ff88',
                text: 'CLEARED',
                icon: <ShieldCheck size={12} />
            }
        }

        const handleBadgeClick = (e: React.MouseEvent) => {
            e.stopPropagation()
            if (isPotentialMatch) {
                handleViewPotentialMatch(entity, vessel)
            }
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
                    cursor: isPotentialMatch ? 'pointer' : 'default'
                }}
                title={
                    isError ? 'API request failed. Click refresh to try again.' :
                    isPotentialMatch ? 'Click to review potential matches' :
                    `Last checked: ${target?.ofacCheckedAt ? new Date(target.ofacCheckedAt).toLocaleString() : 'Never'}`
                }
                onClick={handleBadgeClick}
            >
                {config.icon}
                {config.text}
                <RefreshCw
                    size={10}
                    style={{ marginLeft: '4px', cursor: 'pointer', opacity: 0.6 }}
                    className="hover-spin"
                    onClick={(e) => { e.stopPropagation(); onRecheck(); }}
                />
            </div>
        )
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
                                    <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {entity.name}
                                        <OfacBadge entity={entity} onRecheck={() => handleOfacRecheck(entity)} />
                                    </div>
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
                                    <div style={{ flex: 1 }}>
                                        <h2 style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            {selectedEntity.name}
                                            <OfacBadge entity={selectedEntity} onRecheck={() => handleOfacRecheck(selectedEntity)} />
                                        </h2>
                                        <p style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                                            {selectedEntity.type} {selectedEntity.identifier ? `• ${selectedEntity.identifier}` : ''}
                                        </p>
                                        {selectedEntity.type === 'person' && (
                                            <div
                                                style={{
                                                    marginTop: '12px',
                                                    padding: '8px 12px',
                                                    borderRadius: '8px',
                                                    background: selectedEntity.passportFilePath ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                                                    border: selectedEntity.passportFilePath ? '1px solid rgba(0, 255, 136, 0.3)' : '1px solid rgba(255, 77, 77, 0.3)',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    fontSize: '0.85rem',
                                                    cursor: selectedEntity.passportFilePath ? 'pointer' : 'default'
                                                }}
                                                onClick={() => selectedEntity.passportFilePath && window.api.fsOpen(selectedEntity.passportFilePath)}
                                            >
                                                {selectedEntity.passportFilePath ? (
                                                    <>📄 ID/Passport on file (Click to view)</>
                                                ) : (
                                                    <>⚠️ ID/Passport Missing</>
                                                )}
                                            </div>
                                        )}
                                        {selectedEntity.type === 'company' && (
                                            <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                <div
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderRadius: '8px',
                                                        background: selectedEntity.certificateOfIncorporationPath ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                                                        border: selectedEntity.certificateOfIncorporationPath ? '1px solid rgba(0, 255, 136, 0.3)' : '1px solid rgba(255, 77, 77, 0.3)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        fontSize: '0.85rem',
                                                        cursor: selectedEntity.certificateOfIncorporationPath ? 'pointer' : 'default'
                                                    }}
                                                    onClick={() => selectedEntity.certificateOfIncorporationPath && window.api.fsOpen(selectedEntity.certificateOfIncorporationPath)}
                                                >
                                                    {selectedEntity.certificateOfIncorporationPath ? (
                                                        <>📄 Certificate of Incorporation (Click to view)</>
                                                    ) : (
                                                        <>⚠️ Certificate of Incorporation Missing</>
                                                    )}
                                                </div>
                                                <div
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderRadius: '8px',
                                                        background: selectedEntity.articlesOfAssociationPath ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                                                        border: selectedEntity.articlesOfAssociationPath ? '1px solid rgba(0, 255, 136, 0.3)' : '1px solid rgba(255, 77, 77, 0.3)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        fontSize: '0.85rem',
                                                        cursor: selectedEntity.articlesOfAssociationPath ? 'pointer' : 'default'
                                                    }}
                                                    onClick={() => selectedEntity.articlesOfAssociationPath && window.api.fsOpen(selectedEntity.articlesOfAssociationPath)}
                                                >
                                                    {selectedEntity.articlesOfAssociationPath ? (
                                                        <>📄 Articles of Association (Click to view)</>
                                                    ) : (
                                                        <>⚠️ Articles of Association Missing</>
                                                    )}
                                                </div>
                                                <div
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderRadius: '8px',
                                                        background: selectedEntity.kycFilePath ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                                                        border: selectedEntity.kycFilePath ? '1px solid rgba(0, 255, 136, 0.3)' : '1px solid rgba(255, 77, 77, 0.3)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        fontSize: '0.85rem',
                                                        cursor: selectedEntity.kycFilePath ? 'pointer' : 'default'
                                                    }}
                                                    onClick={() => selectedEntity.kycFilePath && window.api.fsOpen(selectedEntity.kycFilePath)}
                                                >
                                                    {selectedEntity.kycFilePath ? (
                                                        <>📄 KYC (Click to view)</>
                                                    ) : (
                                                        <>⚠️ KYC Missing</>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {(selectedEntity.email || selectedEntity.phone) && (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '20px',
                                        marginTop: '24px',
                                        paddingTop: '20px',
                                        borderTop: '1px solid rgba(255,255,255,0.1)'
                                    }}>
                                        {selectedEntity.email && (
                                            <div>
                                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>Email Address</div>
                                                <div style={{ fontWeight: '500' }}>{selectedEntity.email}</div>
                                            </div>
                                        )}
                                        {selectedEntity.phone && (
                                            <div>
                                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>Phone Number</div>
                                                <div style={{ fontWeight: '500' }}>{selectedEntity.phone}</div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Ship size={20} color="var(--accent-primary)" /> Associated Vessels
                            </h3>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                                {getAssociatedVessels(selectedEntity.id).map(vessel => (
                                    <div key={vessel.id} className="glass-card" style={{ padding: '20px' }}>
                                        <div style={{ fontWeight: '600', fontSize: '1.2rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {vessel.name}
                                            <OfacBadge vessel={vessel} onRecheck={() => handleVesselOfacRecheck(vessel)} />
                                        </div>
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

            {sanctionsModal.show && (
                <SanctionsModal
                    searchedName={sanctionsModal.searchedName}
                    matches={sanctionsModal.matches}
                    onClose={() => setSanctionsModal({ show: false, searchedName: '', matches: [] })}
                    onMarkClean={handleMarkClean}
                    onConfirmMatch={handleConfirmMatch}
                />
            )}
        </div>
    )
}
