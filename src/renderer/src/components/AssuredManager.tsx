import React, { useState, useEffect } from 'react'
import { Trash2, Users, UserPlus, UserCheck, ChevronDown, ChevronUp, Check, Building2, User, Shield, ShieldCheck, ShieldAlert, RefreshCw, Loader2, Pencil, X, Save } from 'lucide-react'
import { Vessel, Entity, AssuredRole, VesselAssured, EntityUBO, SanctionsMatch } from '../../../shared/types'
import { OfacService } from '../services/OfacService'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import SanctionsModal from './SanctionsModal'

interface AssuredManagerProps {
    vessel: Vessel
}

export default function AssuredManager({ vessel }: AssuredManagerProps) {
    const [entities, setEntities] = useState<Entity[]>([])
    const [roles, setRoles] = useState<AssuredRole[]>([])
    const [vesselAssureds, setVesselAssureds] = useState<VesselAssured[]>([])
    const [entityUBOs, setEntityUBOs] = useState<EntityUBO[]>([])
    const { showError, showSuccess } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'

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

    // Editing state for assured roles
    const [editingVesselAssuredId, setEditingVesselAssuredId] = useState<string | null>(null)
    const [editRoleValue, setEditRoleValue] = useState('')
    const [isUpdatingRole, setIsUpdatingRole] = useState(false)

    // Loading states
    const [isAddingAssured, setIsAddingAssured] = useState(false)
    const [isAddingUBO, setIsAddingUBO] = useState(false)
    const [checkingId, setCheckingId] = useState<string | null>(null)

    // Sanctions modal state
    const [sanctionsModal, setSanctionsModal] = useState<{
        show: boolean
        searchedName: string
        matches: SanctionsMatch[]
        entityId?: string
    }>({ show: false, searchedName: '', matches: [] })

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

        setIsAddingAssured(true)
        try {
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
            showSuccess('Assured added successfully')
            loadData()
        } catch (error: any) {
            showError(error.message || 'Failed to add assured. Please try again.')
        } finally {
            setIsAddingAssured(false)
        }
    }

    const handleAddUBO = async (assuredEntityId: string) => {
        if (!newUBOName.trim()) return

        setIsAddingUBO(true)
        try {
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
            showSuccess('UBO added successfully')
            loadData()
        } catch (error: any) {
            showError(error.message || 'Failed to add UBO. Please try again.')
        } finally {
            setIsAddingUBO(false)
        }
    }

    const handleUpdateRole = async (id: string) => {
        if (!editRoleValue.trim()) return
        setIsUpdatingRole(true)
        try {
            // Auto-register role if it doesn't exist
            const roleExists = roles.some(r => r.name.toLowerCase() === editRoleValue.trim().toLowerCase())
            if (!roleExists) {
                await window.api.addAssuredRole({ name: editRoleValue.trim() })
            }

            await window.api.updateVesselAssuredRole(id, editRoleValue.trim())
            showSuccess('Role updated successfully')
            setEditingVesselAssuredId(null)
            loadData()
        } catch (error: any) {
            showError(error.message || 'Failed to update role.')
        } finally {
            setIsUpdatingRole(false)
        }
    }

    const handleDeleteAssured = async (id: string) => {
        if (confirm('Remove this assured from this vessel?')) {
            window.focus()
            try {
                await window.api.deleteVesselAssured(id)
                showSuccess('Assured removed successfully')
                loadData()
            } catch (error: any) {
                showError(error.message || 'Failed to remove assured. You may need admin privileges.')
            }
        } else {
            window.focus()
        }
    }

    const handleDeleteUBO = async (assuredEntityId: string, uboEntityId: string) => {
        try {
            await window.api.deleteEntityUBO({ assuredEntityId, uboEntityId })
            showSuccess('UBO removed successfully')
            loadData()
        } catch (error: any) {
            showError(error.message || 'Failed to remove UBO.')
        }
    }

    const handleUploadPassport = async (e: React.DragEvent, entityId: string) => {
        e.preventDefault()
        e.stopPropagation()

        const files = e.dataTransfer.files
        if (files.length === 0) return
        const file = files[0]

        const filePath = window.api.getFilePath(file)
        if (!filePath) {
            showError('Could not retrieve file path')
            return
        }

        // Security: Validate file type
        const validation = await window.api.fileTypesValidateFile(filePath)
        if (!validation.valid) {
            showError(`File rejected: ${validation.reason}`)
            return
        }

        await window.api.updateEntity(entityId, { passportFilePath: filePath })
        showSuccess('ID/Passport uploaded successfully')
        loadData()
    }

    const handleUploadCertificateOfIncorporation = async (e: React.DragEvent, entityId: string) => {
        e.preventDefault()
        e.stopPropagation()

        const files = e.dataTransfer.files
        if (files.length === 0) return
        const file = files[0]

        const filePath = window.api.getFilePath(file)
        if (!filePath) {
            showError('Could not retrieve file path')
            return
        }

        // Security: Validate file type
        const validation = await window.api.fileTypesValidateFile(filePath)
        if (!validation.valid) {
            showError(`File rejected: ${validation.reason}`)
            return
        }

        await window.api.updateEntity(entityId, { certificateOfIncorporationPath: filePath })
        showSuccess('Certificate of Incorporation uploaded successfully')
        loadData()
    }

    const handleUploadArticlesOfAssociation = async (e: React.DragEvent, entityId: string) => {
        e.preventDefault()
        e.stopPropagation()

        const files = e.dataTransfer.files
        if (files.length === 0) return
        const file = files[0]

        const filePath = window.api.getFilePath(file)
        if (!filePath) {
            showError('Could not retrieve file path')
            return
        }

        // Security: Validate file type
        const validation = await window.api.fileTypesValidateFile(filePath)
        if (!validation.valid) {
            showError(`File rejected: ${validation.reason}`)
            return
        }

        await window.api.updateEntity(entityId, { articlesOfAssociationPath: filePath })
        showSuccess('Articles of Association uploaded successfully')
        loadData()
    }

    const handleUploadKYC = async (e: React.DragEvent, entityId: string) => {
        e.preventDefault()
        e.stopPropagation()

        const files = e.dataTransfer.files
        if (files.length === 0) return
        const file = files[0]

        const filePath = window.api.getFilePath(file)
        if (!filePath) {
            showError('Could not retrieve file path')
            return
        }

        // Security: Validate file type
        const validation = await window.api.fileTypesValidateFile(filePath)
        if (!validation.valid) {
            showError(`File rejected: ${validation.reason}`)
            return
        }

        await window.api.updateEntity(entityId, { kycFilePath: filePath })
        showSuccess('KYC uploaded successfully')
        loadData()
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
                setSanctionsModal({
                    show: true,
                    searchedName: entity.name,
                    matches: result.matches,
                    entityId: entity.id
                })
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
        }
        setSanctionsModal({ show: false, searchedName: '', matches: [] })
        loadData()
    }

    const handleConfirmMatch = async () => {
        if (sanctionsModal.entityId) {
            await window.api.updateEntity(sanctionsModal.entityId, { ofacStatus: 'MATCH', ofacMatchFound: true })
        }
        setSanctionsModal({ show: false, searchedName: '', matches: [] })
        loadData()
    }

    const handleViewPotentialMatch = async (entity: Entity) => {
        setCheckingId(entity.id)
        try {
            const result = await OfacService.checkSanctions(entity.name)
            if (result.matches.length > 0) {
                setSanctionsModal({
                    show: true,
                    searchedName: entity.name,
                    matches: result.matches,
                    entityId: entity.id
                })
            }
        } catch (error: any) {
            showError(error.message || 'Failed to load sanctions data. Please try again.')
        } finally {
            setCheckingId(null)
        }
    }

    const OfacBadge = ({ entity }: { entity: Entity }) => {
        const isChecking = checkingId === entity.id
        const isMatch = entity.ofacStatus === 'MATCH' || entity.ofacStatus === 'SANCTIONED'
        const isPotentialMatch = entity.ofacStatus === 'POTENTIAL_MATCH'
        const isError = entity.ofacStatus === 'ERROR'
        const isPending = !entity.ofacStatus || entity.ofacStatus === 'PENDING'

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
                handleViewPotentialMatch(entity)
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
                            `Last checked: ${entity.ofacCheckedAt ? new Date(entity.ofacCheckedAt).toLocaleString() : 'Never'}`
                }
                onClick={handleBadgeClick}
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
                                    style={{ width: '100%' }}
                                    placeholder="Type name to find or create..."
                                    required
                                    aria-label="Entity name"
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
                                        background: isLight ? '#ffffff' : '#1e222a',
                                        border: '1px solid var(--accent-primary)',
                                        borderRadius: '8px',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                                        backdropFilter: 'none'
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
                                                style={{ width: '100%' }}
                                                placeholder="e.g. Greek Branch, ID Number..."
                                                aria-label="Distinguishing identifier"
                                            />
                                        </div>
                                        <div style={{ width: '140px' }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Entity Type</label>
                                            <select
                                                value={newType}
                                                onChange={e => setNewType(e.target.value as any)}
                                                style={{ width: '100%', color: 'var(--text-primary)' }}
                                                aria-label="Entity type"
                                            >
                                                <option value="company">Company</option>
                                                <option value="person">Person</option>
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
                                                style={{ width: '100%' }}
                                                placeholder="contact@entity.com"
                                                aria-label="Entity email"
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Phone</label>
                                            <input
                                                type="text"
                                                value={newPhone}
                                                onChange={e => setNewPhone(e.target.value)}
                                                style={{ width: '100%' }}
                                                placeholder="+123..."
                                                aria-label="Entity phone"
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
                                    style={{ width: '100%' }}
                                    placeholder="Select or type role..."
                                    required
                                    aria-label="Role on vessel"
                                />
                                <datalist id="role-suggestions">
                                    {roles.map(r => <option key={r.id} value={r.name} />)}
                                </datalist>
                            </div>
                            <button type="submit" className="btn-primary" disabled={isAddingAssured} style={{ padding: '10px 32px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {isAddingAssured && <Loader2 size={16} className="spinner" />}
                                {isAddingAssured ? 'Adding...' : selectedEntityId ? 'Link Existing Assured' : 'Register & Add New Assured'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
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
                                    <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--table-border)' }}>
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
                                            {editingVesselAssuredId === va.id ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <input
                                                        list="role-suggestions-edit"
                                                        type="text"
                                                        value={editRoleValue}
                                                        onChange={e => setEditRoleValue(e.target.value)}
                                                        style={{ padding: '4px 8px', fontSize: '0.8rem', width: '150px' }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleUpdateRole(va.id)
                                                            if (e.key === 'Escape') setEditingVesselAssuredId(null)
                                                        }}
                                                        autoFocus
                                                    />
                                                    <datalist id="role-suggestions-edit">
                                                        {roles.map(r => <option key={r.id} value={r.name} />)}
                                                    </datalist>
                                                </div>
                                            ) : (
                                                <span style={{ background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>{va.role}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <button
                                                onClick={() => setExpandedAssuredId(isExpanded ? null : va.id)}
                                                style={{ background: 'transparent', color: 'var(--accent-primary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                aria-expanded={isExpanded}
                                                aria-label="Toggle UBO details"
                                            >
                                                {ubos.length} UBO(s) {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </button>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                                {editingVesselAssuredId === va.id ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleUpdateRole(va.id)}
                                                            className="btn-secondary"
                                                            style={{ padding: '4px', color: 'var(--success)' }}
                                                            title="Save Role"
                                                            disabled={isUpdatingRole}
                                                        >
                                                            {isUpdatingRole ? <Loader2 size={18} className="spinner" /> : <Save size={18} />}
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingVesselAssuredId(null)}
                                                            className="btn-secondary"
                                                            style={{ padding: '4px', color: 'var(--danger)' }}
                                                            title="Cancel"
                                                        >
                                                            <X size={18} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <>
                                                            <button
                                                                onClick={() => { setEditingVesselAssuredId(va.id); setEditRoleValue(va.role); }}
                                                                style={{ background: 'transparent', color: 'var(--accent-primary)', padding: '4px' }}
                                                                title="Edit Role"
                                                            >
                                                                <Pencil size={18} />
                                                            </button>
                                                        </>
                                                    </>
                                                )}
                                                <button onClick={() => handleDeleteAssured(va.id)} style={{ background: 'transparent', color: 'var(--danger)', padding: '4px' }} title="Remove Assured" aria-label="Remove assured">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr style={{ background: isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(0, 0, 0, 0.1)', borderBottom: '1px solid var(--table-border)' }}>
                                            <td colSpan={4} style={{ padding: '16px 32px' }}>
                                                <div style={{ padding: '16px', borderLeft: '2px solid var(--accent-primary)', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' }}>
                                                    {entity?.type === 'company' && (
                                                        <div style={{ marginBottom: '20px', padding: '12px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                                            <h4 style={{ fontSize: '0.85rem', marginBottom: '10px', color: 'var(--text-secondary)' }}>Company Documents</h4>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                                                <div
                                                                    onDragOver={(e) => e.preventDefault()}
                                                                    onDrop={(e) => handleUploadCertificateOfIncorporation(e, entity.id)}
                                                                    style={{
                                                                        padding: '10px',
                                                                        borderRadius: '6px',
                                                                        background: entity.certificateOfIncorporationPath ? (isLight ? 'rgba(0, 180, 80, 0.1)' : 'rgba(0, 255, 136, 0.1)') : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
                                                                        border: isLight ? '1px dashed rgba(0,0,0,0.2)' : '1px dashed rgba(255,255,255,0.2)',
                                                                        cursor: entity.certificateOfIncorporationPath ? 'pointer' : 'default',
                                                                        fontSize: '0.8rem',
                                                                        textAlign: 'center'
                                                                    }}
                                                                    onClick={() => entity.certificateOfIncorporationPath && window.api.fsOpen(entity.certificateOfIncorporationPath)}
                                                                >
                                                                    {entity.certificateOfIncorporationPath ? '📄 Certificate of Incorporation (Click to view)' : '📎 Drop Certificate of Incorporation here'}
                                                                </div>
                                                                <div
                                                                    onDragOver={(e) => e.preventDefault()}
                                                                    onDrop={(e) => handleUploadArticlesOfAssociation(e, entity.id)}
                                                                    style={{
                                                                        padding: '10px',
                                                                        borderRadius: '6px',
                                                                        background: entity.articlesOfAssociationPath ? (isLight ? 'rgba(0, 180, 80, 0.1)' : 'rgba(0, 255, 136, 0.1)') : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
                                                                        border: isLight ? '1px dashed rgba(0,0,0,0.2)' : '1px dashed rgba(255,255,255,0.2)',
                                                                        cursor: entity.articlesOfAssociationPath ? 'pointer' : 'default',
                                                                        fontSize: '0.8rem',
                                                                        textAlign: 'center'
                                                                    }}
                                                                    onClick={() => entity.articlesOfAssociationPath && window.api.fsOpen(entity.articlesOfAssociationPath)}
                                                                >
                                                                    {entity.articlesOfAssociationPath ? '📄 Articles of Association (Click to view)' : '📎 Drop Articles of Association here'}
                                                                </div>
                                                                <div
                                                                    onDragOver={(e) => e.preventDefault()}
                                                                    onDrop={(e) => handleUploadKYC(e, entity.id)}
                                                                    style={{
                                                                        padding: '10px',
                                                                        borderRadius: '6px',
                                                                        background: entity.kycFilePath ? (isLight ? 'rgba(0, 180, 80, 0.1)' : 'rgba(0, 255, 136, 0.1)') : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
                                                                        border: isLight ? '1px dashed rgba(0,0,0,0.2)' : '1px dashed rgba(255,255,255,0.2)',
                                                                        cursor: entity.kycFilePath ? 'pointer' : 'default',
                                                                        fontSize: '0.8rem',
                                                                        textAlign: 'center'
                                                                    }}
                                                                    onClick={() => entity.kycFilePath && window.api.fsOpen(entity.kycFilePath)}
                                                                >
                                                                    {entity.kycFilePath ? '📄 KYC (Click to view)' : '📎 Drop KYC here'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {entity?.type === 'person' && (
                                                        <div style={{ marginBottom: '20px', padding: '12px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                                            <h4 style={{ fontSize: '0.85rem', marginBottom: '10px', color: 'var(--text-secondary)' }}>Identity Documents</h4>
                                                            <div
                                                                onDragOver={(e) => e.preventDefault()}
                                                                onDrop={(e) => handleUploadPassport(e, entity.id)}
                                                                style={{
                                                                    padding: '10px',
                                                                    borderRadius: '6px',
                                                                    background: entity.passportFilePath ? (isLight ? 'rgba(0, 180, 80, 0.1)' : 'rgba(0, 255, 136, 0.1)') : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
                                                                    border: isLight ? '1px dashed rgba(0,0,0,0.2)' : '1px dashed rgba(255,255,255,0.2)',
                                                                    cursor: entity.passportFilePath ? 'pointer' : 'default',
                                                                    fontSize: '0.8rem',
                                                                    textAlign: 'center'
                                                                }}
                                                                onClick={() => entity.passportFilePath && window.api.fsOpen(entity.passportFilePath)}
                                                            >
                                                                {entity.passportFilePath ? '📄 ID/Passport (Click to view)' : '📎 Drop ID/Passport here'}
                                                            </div>
                                                        </div>
                                                    )}
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
                                                                style={{ width: '100%' }}
                                                                aria-label="UBO name"
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
                                                                    background: isLight ? '#ffffff' : '#1e222a',
                                                                    border: '1px solid var(--accent-primary)',
                                                                    borderRadius: '8px',
                                                                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                                                                    backdropFilter: 'none'
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
                                                                    style={{ width: '100%' }}
                                                                    aria-label="UBO identifier"
                                                                />
                                                            )}
                                                            {selectedUBOId && <div style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--success)' }}><Check size={14} /> Linked</div>}
                                                        </div>
                                                        {!selectedUBOId ? (
                                                            <select
                                                                value={newUBOType}
                                                                onChange={e => setNewUBOType(e.target.value as any)}
                                                                style={{ width: '100%', color: 'var(--text-primary)' }}
                                                                aria-label="UBO type"
                                                            >
                                                                <option value="company">Company</option>
                                                                <option value="person">Person</option>
                                                            </select>
                                                        ) : <div />}
                                                        <button onClick={() => handleAddUBO(va.entityId)} className="btn-secondary" disabled={isAddingUBO} style={{ padding: '0 20px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            {isAddingUBO && <Loader2 size={14} className="spinner" />}
                                                            {isAddingUBO ? 'Adding...' : selectedUBOId ? 'Link' : 'New'}
                                                        </button>
                                                    </div>

                                                    {!selectedUBOId && (
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                                            <input
                                                                type="email"
                                                                value={newUBOEmail}
                                                                onChange={e => setNewUBOEmail(e.target.value)}
                                                                placeholder="UBO Email..."
                                                                style={{ width: '100%' }}
                                                                aria-label="UBO email"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={newUBOPhone}
                                                                onChange={e => setNewUBOPhone(e.target.value)}
                                                                placeholder="UBO Phone..."
                                                                style={{ width: '100%' }}
                                                                aria-label="UBO phone"
                                                            />
                                                        </div>
                                                    )}

                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                                        {ubos.map(ubo => (
                                                            <div
                                                                key={ubo!.id}
                                                                style={{
                                                                    background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
                                                                    border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
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
                                                                                background: ubo!.passportFilePath ? (isLight ? 'rgba(0, 180, 80, 0.1)' : 'rgba(0, 255, 136, 0.1)') : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
                                                                                border: isLight ? '1px dashed rgba(0,0,0,0.2)' : '1px dashed rgba(255,255,255,0.2)',
                                                                                cursor: ubo!.passportFilePath ? 'pointer' : 'default'
                                                                            }}
                                                                            onClick={() => ubo!.passportFilePath && window.api.fsOpen(ubo!.passportFilePath)}
                                                                        >
                                                                            {ubo!.passportFilePath ? '📄 ID/Passport (Click to view)' : '📎 Drop ID/Passport here'}
                                                                        </div>
                                                                    )}
                                                                    {ubo!.type === 'company' && (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                                                            <div
                                                                                onDragOver={(e) => e.preventDefault()}
                                                                                onDrop={(e) => handleUploadCertificateOfIncorporation(e, ubo!.id)}
                                                                                style={{
                                                                                    fontSize: '0.7rem',
                                                                                    padding: '4px 6px',
                                                                                    borderRadius: '4px',
                                                                                    background: ubo!.certificateOfIncorporationPath ? (isLight ? 'rgba(0, 180, 80, 0.1)' : 'rgba(0, 255, 136, 0.1)') : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
                                                                                    border: isLight ? '1px dashed rgba(0,0,0,0.2)' : '1px dashed rgba(255,255,255,0.2)',
                                                                                    cursor: ubo!.certificateOfIncorporationPath ? 'pointer' : 'default'
                                                                                }}
                                                                                onClick={() => ubo!.certificateOfIncorporationPath && window.api.fsOpen(ubo!.certificateOfIncorporationPath)}
                                                                            >
                                                                                {ubo!.certificateOfIncorporationPath ? '📄 COI (Click to view)' : '📎 Drop Cert. of Inc.'}
                                                                            </div>
                                                                            <div
                                                                                onDragOver={(e) => e.preventDefault()}
                                                                                onDrop={(e) => handleUploadArticlesOfAssociation(e, ubo!.id)}
                                                                                style={{
                                                                                    fontSize: '0.7rem',
                                                                                    padding: '4px 6px',
                                                                                    borderRadius: '4px',
                                                                                    background: ubo!.articlesOfAssociationPath ? (isLight ? 'rgba(0, 180, 80, 0.1)' : 'rgba(0, 255, 136, 0.1)') : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
                                                                                    border: isLight ? '1px dashed rgba(0,0,0,0.2)' : '1px dashed rgba(255,255,255,0.2)',
                                                                                    cursor: ubo!.articlesOfAssociationPath ? 'pointer' : 'default'
                                                                                }}
                                                                                onClick={() => ubo!.articlesOfAssociationPath && window.api.fsOpen(ubo!.articlesOfAssociationPath)}
                                                                            >
                                                                                {ubo!.articlesOfAssociationPath ? '📄 AOA (Click to view)' : '📎 Drop Art. of Assoc.'}
                                                                            </div>
                                                                            <div
                                                                                onDragOver={(e) => e.preventDefault()}
                                                                                onDrop={(e) => handleUploadKYC(e, ubo!.id)}
                                                                                style={{
                                                                                    fontSize: '0.7rem',
                                                                                    padding: '4px 6px',
                                                                                    borderRadius: '4px',
                                                                                    background: ubo!.kycFilePath ? (isLight ? 'rgba(0, 180, 80, 0.1)' : 'rgba(0, 255, 136, 0.1)') : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
                                                                                    border: isLight ? '1px dashed rgba(0,0,0,0.2)' : '1px dashed rgba(255,255,255,0.2)',
                                                                                    cursor: ubo!.kycFilePath ? 'pointer' : 'default'
                                                                                }}
                                                                                onClick={() => ubo!.kycFilePath && window.api.fsOpen(ubo!.kycFilePath)}
                                                                            >
                                                                                {ubo!.kycFilePath ? '📄 KYC (Click to view)' : '📎 Drop KYC here'}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <button onClick={() => handleDeleteUBO(va.entityId, ubo!.id)} style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '2px' }} className="hover-danger" aria-label="Remove UBO">
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

            {sanctionsModal.show && (
                <SanctionsModal
                    searchedName={sanctionsModal.searchedName}
                    matches={sanctionsModal.matches}
                    onClose={() => setSanctionsModal({ show: false, searchedName: '', matches: [] })}
                    onMarkClean={handleMarkClean}
                    onConfirmMatch={handleConfirmMatch}
                />
            )}
        </section>
    )
}
