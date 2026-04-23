import React, { useState, useEffect } from 'react'
import { Trash2, Users, UserPlus, UserCheck, Check, Building2, User, Shield, ShieldCheck, ShieldAlert, RefreshCw, Loader2, Pencil, X, Save, Upload, FolderOpen, Plus, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Vessel, Entity, AssuredRole, VesselAssured, EntityUBO, SanctionsMatch, EntityAddress, EntityDocumentType, EntityDocument } from '../../../shared/types'
import { OfacService } from '../services/OfacService'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import SanctionsModal from './SanctionsModal'
import ConfirmationModal from './ConfirmationModal'
import { formatDateTime } from '../utils/dateUtils'

interface AssuredManagerProps {
    vessel: Vessel
}

export default function AssuredManager({ vessel }: AssuredManagerProps) {
    const [entities, setEntities] = useState<Entity[]>([])
    const [roles, setRoles] = useState<AssuredRole[]>([])
    const [vesselAssureds, setVesselAssureds] = useState<VesselAssured[]>([])
    const [entityUBOs, setEntityUBOs] = useState<EntityUBO[]>([])
    const [entityDocTypes, setEntityDocTypes] = useState<EntityDocumentType[]>([])
    const [entityDocs, setEntityDocs] = useState<EntityDocument[]>([])
    const { showError, showSuccess } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light' || theme === 'aurora'
    const { hasPermission } = useAuth()
    const canManageAssureds = hasPermission('assureds:manage')
    const canUploadDocs = hasPermission('documents:upload')

    const [showAddForm, setShowAddForm] = useState(false)
    const [newName, setNewName] = useState('')
    const [newType, setNewType] = useState<'company' | 'person'>('company')
    const [newRole, setNewRole] = useState('')
    const [newIdentifier, setNewIdentifier] = useState('')
    const [selectedAssuredId, setSelectedAssuredId] = useState<string | null>(null)
    const [newUBOName, setNewUBOName] = useState('')
    const [newUBOType, setNewUBOType] = useState<'company' | 'person'>('person')
    const [newUBOIdentifier, setNewUBOIdentifier] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [newPhone, setNewPhone] = useState('')
    const [newUBOEmail, setNewUBOEmail] = useState('')
    const [newUBOPhone, setNewUBOPhone] = useState('')

    const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
    const [selectedUBOId, setSelectedUBOId] = useState<string | null>(null)

    // Address state
    const [allAddresses, setAllAddresses] = useState<EntityAddress[]>([])
    const [showAddAddressFor, setShowAddAddressFor] = useState<string | null>(null) // vesselAssured id
    const [addrForm, setAddrForm] = useState({ label: '', addressLine1: '', addressLine2: '', city: '', country: '', postalCode: '' })

    // Editing state for assured roles
    const [editingVesselAssuredId, setEditingVesselAssuredId] = useState<string | null>(null)
    const [editRoleValue, setEditRoleValue] = useState('')
    const [isUpdatingRole, setIsUpdatingRole] = useState(false)
    const [editingEntityId, setEditingEntityId] = useState<string | null>(null)
    const [editEntityName, setEditEntityName] = useState('')

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

    // Confirmation modal state
    const [deleteConfirmation, setDeleteConfirmation] = useState<{
        show: boolean
        id: string | null
        title: string
        message: string
        type: 'assured' | 'ubo'
        uboParentId?: string // For UBO deletion we need parent assured ID
    }>({ show: false, id: null, title: '', message: '', type: 'assured' })

    useEffect(() => {
        loadData()
    }, [vessel.id])

    const loadData = async () => {
        try {
            const [e, r, va, eu, addrs, edTypes, allDocs] = await Promise.all([
                window.api.getEntities(),
                window.api.getAssuredRoles(),
                window.api.getVesselAssureds(vessel.id),
                window.api.getEntityUBOs(),
                window.api.getAllEntityAddresses(),
                window.api.getEntityDocumentTypes(),
                window.api.getEntityDocuments()
            ])
            setEntities(Array.isArray(e) ? e : [])
            setRoles(Array.isArray(r) ? r : [])
            setVesselAssureds(Array.isArray(va) ? va : [])
            setEntityUBOs(Array.isArray(eu) ? eu : [])
            setAllAddresses(Array.isArray(addrs) ? addrs : [])
            setEntityDocTypes(Array.isArray(edTypes) ? (edTypes as EntityDocumentType[]).filter(t => t.isActive) : [])
            setEntityDocs(Array.isArray(allDocs) ? allDocs : [])
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

    const handleLinkExistingUBO = async (assuredEntityId: string, uboEntityId: string) => {
        setIsAddingUBO(true)
        try {
            await window.api.addEntityUBO({ assuredEntityId, uboEntityId })
            setNewUBOName('')
            setSelectedUBOId(null)
            showSuccess('UBO linked successfully')
            loadData()
        } catch (error: any) {
            showError(error.message || 'Failed to link UBO.')
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

    const handleRenameEntity = async (entityId: string) => {
        if (!editEntityName.trim()) return
        try {
            await window.api.updateEntity(entityId, { name: editEntityName.trim() })
            showSuccess('Name updated')
            setEditingEntityId(null)
            loadData()
        } catch (error: any) {
            showError(error.message || 'Failed to rename')
        }
    }

    const handleChangeAddress = async (vesselAssuredId: string, addressId: string | null) => {
        try {
            await window.api.updateVesselAssuredAddress(vesselAssuredId, addressId)
            setVesselAssureds(prev => prev.map(va => va.id === vesselAssuredId ? { ...va, addressId } : va))
        } catch (e: any) { showError(e.message || 'Failed to update address') }
    }

    const handleAddNewAddress = async (vesselAssuredId: string, entityId: string) => {
        if (!addrForm.label.trim() || !addrForm.addressLine1.trim()) return
        try {
            const newAddr = await window.api.addEntityAddress({
                entityId,
                label: addrForm.label.trim(),
                addressLine1: addrForm.addressLine1.trim(),
                addressLine2: addrForm.addressLine2.trim() || undefined,
                city: addrForm.city.trim() || undefined,
                country: addrForm.country.trim() || undefined,
                postalCode: addrForm.postalCode.trim() || undefined
            })
            if (newAddr && (newAddr as any).error) { showError((newAddr as any).message || 'Failed to add address'); return }
            if (newAddr && newAddr.id) {
                setAllAddresses(prev => [...prev, newAddr])
                await handleChangeAddress(vesselAssuredId, newAddr.id)
                showSuccess('Address added and assigned')
            }
            setShowAddAddressFor(null)
            setAddrForm({ label: '', addressLine1: '', addressLine2: '', city: '', country: '', postalCode: '' })
        } catch (e: any) { showError(e.message || 'Failed to add address') }
    }

    const handleDeleteAssured = async (id: string) => {
        setDeleteConfirmation({
            show: true,
            id,
            title: 'Remove Assured?',
            message: 'Are you sure you want to remove this assured from this vessel? This will also remove any linked UBOs.',
            type: 'assured'
        })
    }

    const handleDeleteUBO = async (assuredEntityId: string, uboEntityId: string) => {
        setDeleteConfirmation({
            show: true,
            id: uboEntityId,
            uboParentId: assuredEntityId,
            title: 'Remove UBO?',
            message: 'Are you sure you want to remove this UBO?',
            type: 'ubo'
        })
    }

    const handleConfirmDelete = async () => {
        if (!deleteConfirmation.id) return

        if (deleteConfirmation.type === 'assured') {
            try {
                await window.api.deleteVesselAssured(deleteConfirmation.id)
                showSuccess('Assured removed successfully')
                setIsAddingAssured(false)
                setIsAddingUBO(false)
                if (selectedAssuredId === deleteConfirmation.id) setSelectedAssuredId(null)
                loadData()
            } catch (error: any) {
                showError(error.message || 'Failed to remove assured. You may need admin privileges.')
            }
        } else if (deleteConfirmation.type === 'ubo' && deleteConfirmation.uboParentId) {
            try {
                await window.api.deleteEntityUBO({ assuredEntityId: deleteConfirmation.uboParentId, uboEntityId: deleteConfirmation.id })
                showSuccess('UBO removed successfully')
                setIsAddingUBO(false)
                loadData()
            } catch (error: any) {
                showError(error.message || 'Failed to remove UBO.')
            }
        }
        setDeleteConfirmation(prev => ({ ...prev, show: false }))
    }

    const handleDropEntityDoc = async (e: React.DragEvent, entityId: string, documentTypeId: string) => {
        e.preventDefault()
        e.stopPropagation()
        const files = e.dataTransfer.files
        if (files.length === 0) return
        const file = files[0]
        const filePath = window.api.getFilePath(file)
        if (!filePath) { showError('Could not retrieve file path'); return }
        const validation = await window.api.fileTypesValidateFile(filePath)
        if (!validation.valid) { showError(`File rejected: ${validation.reason}`); return }
        await window.api.upsertEntityDocument({ entityId, documentTypeId, filePath })
        showSuccess('Document uploaded successfully')
        loadData()
    }

    const handleClickUploadDoc = async (entityId: string, documentTypeId: string, label: string) => {
        try {
            const filePath = await window.api.dialogOpenFileAny()
            if (!filePath) return
            const validation = await window.api.fileTypesValidateFile(filePath)
            if (!validation.valid) { showError(`File rejected: ${validation.reason}`); return }
            await window.api.upsertEntityDocument({ entityId, documentTypeId, filePath })
            showSuccess(`${label} uploaded successfully`)
            loadData()
        } catch (error: any) {
            showError(error.message || `Failed to upload ${label}`)
        }
    }

    const handleDeleteDoc = async (entityId: string, documentTypeId: string) => {
        try {
            await window.api.deleteEntityDocument(entityId, documentTypeId)
            showSuccess('Document removed')
            loadData()
        } catch (error: any) {
            showError(error.message || 'Failed to remove document')
        }
    }

    const handleOfacRecheck = async (entity: Entity) => {
        setCheckingId(entity.id)
        try {
            const result = await OfacService.checkSanctions(entity.name)
            const autoMark = result.autoMarkCleanOnCheck ?? true
            if (result.status !== 'CLEARED' || autoMark) {
                await window.api.updateEntity(entity.id, {
                    ofacCheckedAt: result.timestamp,
                    ofacMatchFound: result.matchFound,
                    ofacStatus: result.status
                })
                loadData()
            } else {
                showSuccess('Sanctions check complete: no matches found above threshold')
            }

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
                color: 'var(--danger)',
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

        const isClickable = isPotentialMatch || isMatch
        const handleBadgeClick = (e: React.MouseEvent) => {
            e.stopPropagation()
            if (isClickable) {
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
                    cursor: isClickable ? 'pointer' : 'default'
                }}
                title={
                    isError ? 'API request failed. Click refresh to try again.' :
                        isPotentialMatch ? 'Click to review potential matches' :
                            `Last checked: ${entity.ofacCheckedAt ? formatDateTime(entity.ofacCheckedAt) : 'Never'}`
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

    const sortedAssureds = [...vesselAssureds].sort((a, b) => {
        const aOrder = roles.findIndex(r => r.name === a.role)
        const bOrder = roles.findIndex(r => r.name === b.role)
        return (aOrder === -1 ? 999 : aOrder) - (bOrder === -1 ? 999 : bOrder)
    })

    const selectedVA = sortedAssureds.find(va => va.id === selectedAssuredId)
    const selectedEntity = selectedVA ? entities.find(e => e.id === selectedVA.entityId) : null
    const selectedUbos = selectedVA ? entityUBOs.filter(u => u.assuredEntityId === selectedVA.entityId).map(u => entities.find(e => e.id === u.uboEntityId)).filter(Boolean) : []

    const getDocScore = (entityId: string, entityType: string) => {
        const applicable = entityDocTypes.filter(t => t.isRequired && (t.entityScope === 'both' || t.entityScope === entityType))
        const docs = entityDocs.filter(d => d.entityId === entityId)
        const have = applicable.filter(t => docs.some(d => d.documentTypeId === t.id && d.filePath)).length
        return { have, total: applicable.length }
    }

    const DocRow = ({ ent }: { ent: Entity }) => {
        const applicable = entityDocTypes.filter(t => t.entityScope === 'both' || t.entityScope === ent.type)
        const docsForEnt = entityDocs.filter(d => d.entityId === ent.id)
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {applicable.map(dt => {
                    const doc = docsForEnt.find(d => d.documentTypeId === dt.id)
                    const hasFile = !!doc?.filePath
                    return (
                        <div key={dt.id}
                            onDragOver={ev => ev.preventDefault()}
                            onDrop={ev => handleDropEntityDoc(ev, ent.id, dt.id)}
                            style={{ padding: '8px 12px', borderRadius: '8px', background: hasFile ? (isLight ? 'rgba(0,140,70,0.06)' : 'rgba(0,255,136,0.04)') : (isLight ? 'rgba(200,0,0,0.04)' : 'rgba(255,77,77,0.04)'), border: hasFile ? (isLight ? '1px solid rgba(0,140,70,0.15)' : '1px solid rgba(0,255,136,0.12)') : (isLight ? '1px solid rgba(200,0,0,0.12)' : '1px solid rgba(255,77,77,0.1)'), display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            {hasFile
                                ? <CheckCircle2 size={14} color={isLight ? '#008c46' : '#00ff88'} />
                                : <AlertTriangle size={14} color={isLight ? '#c00000' : '#ff4d4d'} />
                            }
                            <span style={{ flex: 1, fontSize: '0.82rem', color: hasFile ? (isLight ? '#008c46' : 'rgba(0,255,136,0.85)') : (isLight ? '#c00000' : 'rgba(255,77,77,0.85)'), cursor: hasFile ? 'pointer' : 'default' }} onClick={hasFile ? () => window.api.fsOpen(doc!.filePath!) : undefined}>{dt.name}</span>
                            {hasFile ? (
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={e => { e.stopPropagation(); window.api.shellShowItemInFolder(doc!.filePath!) }} className="btn-secondary" style={{ padding: '3px 6px', fontSize: '0.68rem' }} title="Open location"><FolderOpen size={10} /></button>
                                    <button onClick={e => { e.stopPropagation(); handleClickUploadDoc(ent.id, dt.id, dt.name) }} className="btn-secondary" style={{ padding: '3px 6px', fontSize: '0.68rem' }} title="Replace"><Upload size={10} /></button>
                                    {canUploadDocs && <button onClick={e => { e.stopPropagation(); handleDeleteDoc(ent.id, dt.id) }} className="btn-secondary" style={{ padding: '3px 6px', fontSize: '0.68rem', color: 'var(--danger)' }} title="Remove"><Trash2 size={10} /></button>}
                                </div>
                            ) : (
                                <button onClick={() => handleClickUploadDoc(ent.id, dt.id, dt.name)} className="btn-secondary" style={{ padding: '3px 8px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px' }}><Upload size={10} /> Upload</button>
                            )}
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <section className="fade-in" style={{ marginTop: '32px' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={20} color="var(--accent-primary)" /> Assureds & UBOs
                </h3>
                {canManageAssureds && (
                    <button
                        onClick={() => { setShowAddForm(!showAddForm); setSelectedEntityId(null); setIsAddingAssured(false); }}
                        className="btn-primary"
                        style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                    >
                        {showAddForm ? 'Cancel' : <><UserPlus size={16} /> Add Assured</>}
                    </button>
                )}
            </header>

            {showAddForm && (
                <div className="glass-card" style={{ padding: '24px', marginBottom: '24px', border: '1px solid var(--accent-primary)' }}>
                    <form onSubmit={handleAddAssured}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div style={{ position: 'relative' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Entity Name</label>
                                <input type="text" value={newName} onChange={e => { setNewName(e.target.value); setSelectedEntityId(null); }} style={{ width: '100%' }} placeholder="Type name to find or create..." required aria-label="Entity name" />
                                {newName && !selectedEntityId && matchingEntities.length > 0 && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: '4px', padding: '8px', maxHeight: '200px', overflowY: 'auto', background: isLight ? '#ffffff' : '#1e222a', border: '1px solid var(--accent-primary)', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', backdropFilter: 'none' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '8px', padding: '4px' }}>Existing matches:</div>
                                        {matchingEntities.map(ent => (
                                            <div key={ent.id} onClick={() => { setSelectedEntityId(ent.id); setNewName(ent.name); }} style={{ padding: '8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="hover-effect">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{ent.type === 'company' ? <Building2 size={14} opacity={0.5} /> : <User size={14} opacity={0.5} />}<span>{ent.name}</span></div>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>{ent.identifier ? `[${ent.identifier}]` : '(ID: ' + ent.id.slice(0, 4) + ')'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {selectedEntityId && <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={14} /> Linked to existing entity</div>}
                            </div>
                            {!selectedEntityId && (
                                <>
                                    <div style={{ display: 'flex', gap: '20px' }}>
                                        <div style={{ flex: 1 }}><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Identifier (Optional)</label><input type="text" value={newIdentifier} onChange={e => setNewIdentifier(e.target.value)} style={{ width: '100%' }} placeholder="e.g. Greek Branch..." /></div>
                                        <div style={{ width: '140px' }}><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Type</label><select value={newType} onChange={e => setNewType(e.target.value as any)} style={{ width: '100%', color: 'var(--text-primary)' }}><option value="company">Company</option><option value="person">Person</option></select></div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                                        <div><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Email</label><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ width: '100%' }} placeholder="contact@entity.com" /></div>
                                        <div><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Phone</label><input type="text" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={{ width: '100%' }} placeholder="+123..." /></div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'flex-end' }}>
                            <div><label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Role on Vessel</label><input list="role-suggestions" type="text" value={newRole} onChange={e => setNewRole(e.target.value)} style={{ width: '100%' }} placeholder="Select or type role..." required /><datalist id="role-suggestions">{roles.map(r => <option key={r.id} value={r.name} />)}</datalist></div>
                            <button type="submit" className="btn-primary" disabled={isAddingAssured} style={{ padding: '10px 32px', display: 'flex', alignItems: 'center', gap: '8px' }}>{isAddingAssured && <Loader2 size={16} className="spinner" />}{isAddingAssured ? 'Adding...' : selectedEntityId ? 'Link Existing' : 'Register & Add'}</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'flex', gap: '0' }}>
                {/* Left: Assured table */}
                <div className="glass-card" style={{ flex: 1, padding: '0', overflow: 'hidden', borderRadius: selectedAssuredId ? '12px 0 0 12px' : '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                <th style={{ padding: '14px 16px' }}>Assured Name</th>
                                <th style={{ padding: '14px 16px' }}>Role</th>
                                <th style={{ padding: '14px 16px', minWidth: '100px' }}>Documents</th>
                                <th style={{ padding: '14px 16px' }}>UBOs</th>
                                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedAssureds.map(va => {
                                const entity = entities.find(e => e.id === va.entityId)
                                const ubos = entityUBOs.filter(u => u.assuredEntityId === va.entityId)
                                const isSelected = selectedAssuredId === va.id
                                const score = entity ? getDocScore(entity.id, entity.type) : { have: 0, total: 0 }
                                const docColor = score.total === 0 ? 'var(--text-secondary)' : score.have === score.total ? (isLight ? '#008c46' : '#00c264') : score.have === 0 ? (isLight ? '#c00000' : '#ff4d4d') : (isLight ? '#b45309' : '#f59e0b')

                                return (
                                    <tr key={va.id} onClick={() => setSelectedAssuredId(isSelected ? null : va.id)} style={{ borderBottom: '1px solid var(--table-border)', cursor: 'pointer', background: isSelected ? 'rgba(0,210,255,0.06)' : 'transparent', transition: 'background 0.15s' }} className="hover-effect">
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {entity?.type === 'company' ? <Building2 size={15} opacity={0.5} /> : <User size={15} opacity={0.5} />}
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{entity?.name}</div>
                                                    {entity?.identifier && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{entity.identifier}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem' }}>{va.role}</span>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: docColor }}>{score.have}/{score.total}</span>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{ubos.length}</span>
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }} onClick={e => e.stopPropagation()}>
                                                {canManageAssureds && <button onClick={() => { setEditingVesselAssuredId(va.id); setEditRoleValue(va.role) }} style={{ background: 'transparent', color: 'var(--accent-primary)', padding: '3px' }} title="Edit Role"><Pencil size={15} /></button>}
                                                {canManageAssureds && <button onClick={() => handleDeleteAssured(va.id)} style={{ background: 'transparent', color: 'var(--danger)', padding: '3px' }} title="Remove"><Trash2 size={15} /></button>}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                            {vesselAssureds.length === 0 && (
                                <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No assureds assigned to this vessel.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Right: Slide-in panel */}
                {selectedAssuredId && selectedEntity && selectedVA && (
                    <div style={{ width: '440px', flexShrink: 0, background: isLight ? '#f4f6fb' : '#14172a', border: '1px solid var(--glass-border)', borderLeft: 'none', borderRadius: '0 12px 12px 0', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                        {/* Panel header */}
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--table-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(0,170,200,0.15), rgba(0,170,200,0.05))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {selectedEntity.type === 'company' ? <Building2 size={20} color="var(--accent-primary)" /> : <User size={20} color="var(--accent-primary)" />}
                            </div>
                            <div style={{ flex: 1 }}>
                                {editingEntityId === selectedEntity.id ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <input type="text" value={editEntityName} onChange={e => setEditEntityName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRenameEntity(selectedEntity.id); if (e.key === 'Escape') setEditingEntityId(null) }} autoFocus style={{ fontWeight: 700, fontSize: '0.95rem', padding: '2px 6px', width: '100%' }} />
                                        <button onClick={() => handleRenameEntity(selectedEntity.id)} style={{ background: 'transparent', color: 'var(--success)', border: 'none', cursor: 'pointer', padding: '2px' }} title="Save"><Save size={14} /></button>
                                        <button onClick={() => setEditingEntityId(null)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer', padding: '2px' }} title="Cancel"><X size={14} /></button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{selectedEntity.name}</span>
                                        {canManageAssureds && <button onClick={() => { setEditingEntityId(selectedEntity.id); setEditEntityName(selectedEntity.name) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', opacity: 0.5 }} title="Rename"><Pencil size={12} /></button>}
                                    </div>
                                )}
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {selectedVA.role} <span style={{ opacity: 0.4 }}>|</span> {selectedEntity.type}
                                </div>
                            </div>
                            <button onClick={() => setSelectedAssuredId(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}><X size={18} /></button>
                        </div>

                        {/* Sanctions */}
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--table-border)' }}>
                            <OfacBadge entity={selectedEntity} />
                        </div>

                        {/* Contact info */}
                        {(selectedEntity.email || selectedEntity.phone) && (
                            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--table-border)', fontSize: '0.82rem' }}>
                                {selectedEntity.email && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><span style={{ color: 'var(--text-secondary)', minWidth: '50px' }}>Email</span><span style={{ color: 'var(--accent-primary)' }}>{selectedEntity.email}</span></div>}
                                {selectedEntity.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: 'var(--text-secondary)', minWidth: '50px' }}>Phone</span><span>{selectedEntity.phone}</span></div>}
                            </div>
                        )}

                        {/* Role editing */}
                        {editingVesselAssuredId === selectedVA.id && (
                            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--table-border)' }}>
                                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>Edit Role</div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input list="role-suggestions-edit" type="text" value={editRoleValue} onChange={e => setEditRoleValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleUpdateRole(selectedVA.id); if (e.key === 'Escape') setEditingVesselAssuredId(null) }} style={{ flex: 1, padding: '6px 10px', fontSize: '0.82rem' }} autoFocus />
                                    <datalist id="role-suggestions-edit">{roles.map(r => <option key={r.id} value={r.name} />)}</datalist>
                                    <button onClick={() => handleUpdateRole(selectedVA.id)} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.78rem' }} disabled={isUpdatingRole}>{isUpdatingRole ? <Loader2 size={14} className="spinner" /> : <Save size={14} />}</button>
                                    <button onClick={() => setEditingVesselAssuredId(null)} className="btn-secondary" style={{ padding: '6px 8px' }}><X size={14} /></button>
                                </div>
                            </div>
                        )}

                        {/* Address */}
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--table-border)' }}>
                            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>Address</div>
                            {(() => {
                                const entityAddrs = allAddresses.filter(a => a.entityId === selectedVA.entityId)
                                return (
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <select value={selectedVA.addressId || ''} onChange={e => handleChangeAddress(selectedVA.id, e.target.value || null)} style={{ flex: 1, padding: '5px 8px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                                                <option value="">— No address —</option>
                                                {entityAddrs.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                                            </select>
                                            <button onClick={() => { setShowAddAddressFor(showAddAddressFor === selectedVA.id ? null : selectedVA.id); setAddrForm({ label: '', addressLine1: '', addressLine2: '', city: '', country: '', postalCode: '' }) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '2px' }} title="Add new address"><Plus size={14} /></button>
                                        </div>
                                        {showAddAddressFor === selectedVA.id && (
                                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <input placeholder="Label *" value={addrForm.label} onChange={e => setAddrForm(p => ({ ...p, label: e.target.value }))} style={{ padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--input-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.78rem' }} />
                                                <textarea placeholder="Full address *" value={addrForm.addressLine1} onChange={e => setAddrForm(p => ({ ...p, addressLine1: e.target.value }))} rows={2} style={{ padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--input-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.78rem', resize: 'vertical', fontFamily: 'inherit' }} />
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    <button onClick={() => handleAddNewAddress(selectedVA.id, selectedVA.entityId)} disabled={!addrForm.label.trim() || !addrForm.addressLine1.trim()} className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Save & Assign</button>
                                                    <button onClick={() => setShowAddAddressFor(null)} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Cancel</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })()}
                        </div>

                        {/* Documents */}
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--table-border)' }}>
                            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>Documents</div>
                            <DocRow ent={selectedEntity} />
                        </div>

                        {/* UBOs */}
                        <div style={{ padding: '12px 20px' }}>
                            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <UserCheck size={12} /> Ultimate Beneficial Owners ({selectedUbos.length})
                            </div>

                            {selectedUbos.map(ubo => {
                                const uboScore = getDocScore(ubo!.id, ubo!.type)
                                return (
                                    <div key={ubo!.id} style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--table-border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            {ubo!.type === 'company' ? <Building2 size={14} opacity={0.5} /> : <User size={14} opacity={0.5} />}
                                            <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>{ubo!.name}</span>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: uboScore.have === uboScore.total ? (isLight ? '#008c46' : '#00c264') : (isLight ? '#c00000' : '#ff4d4d') }}>{uboScore.have}/{uboScore.total}</span>
                                            {canManageAssureds && <button onClick={() => handleDeleteUBO(selectedVA.entityId, ubo!.id)} style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '2px' }} className="hover-danger" title="Remove UBO"><Trash2 size={12} /></button>}
                                        </div>
                                        <OfacBadge entity={ubo!} />
                                        <div style={{ marginTop: '8px' }}><DocRow ent={ubo!} /></div>
                                    </div>
                                )
                            })}

                            {selectedUbos.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', fontStyle: 'italic', marginBottom: '12px' }}>No UBOs listed.</div>}

                            {/* Add UBO form */}
                            {canManageAssureds && (
                                <div style={{ marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px dashed var(--table-border)' }}>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                                        <div style={{ flex: 1, position: 'relative' }}>
                                            <input type="text" value={newUBOName} onChange={e => { setNewUBOName(e.target.value); setSelectedUBOId(null) }} placeholder="UBO Name..." style={{ width: '100%', padding: '6px 10px', fontSize: '0.8rem' }} />
                                            {newUBOName && !selectedUBOId && matchingUBOs.length > 0 && (
                                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: '4px', padding: '6px', maxHeight: '150px', overflowY: 'auto', background: isLight ? '#ffffff' : '#1e222a', border: '1px solid var(--accent-primary)', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                                                    {matchingUBOs.map(ent => (
                                                        <div key={ent.id} onClick={() => handleLinkExistingUBO(selectedVA.entityId, ent.id)} style={{ padding: '5px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }} className="hover-effect">
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>{ent.type === 'company' ? <Building2 size={11} opacity={0.5} /> : <User size={11} opacity={0.5} />}<span>{ent.name}</span></div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {!selectedUBOId && <select value={newUBOType} onChange={e => setNewUBOType(e.target.value as any)} style={{ width: '90px', padding: '6px', fontSize: '0.78rem', color: 'var(--text-primary)' }}><option value="person">Person</option><option value="company">Company</option></select>}
                                    </div>
                                    {!selectedUBOId && (
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                                            <input type="text" value={newUBOIdentifier} onChange={e => setNewUBOIdentifier(e.target.value)} placeholder="Identifier..." style={{ flex: 1, padding: '6px 10px', fontSize: '0.78rem' }} />
                                        </div>
                                    )}
                                    {!selectedUBOId && (
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                                            <input type="email" value={newUBOEmail} onChange={e => setNewUBOEmail(e.target.value)} placeholder="Email..." style={{ flex: 1, padding: '6px 10px', fontSize: '0.78rem' }} />
                                            <input type="text" value={newUBOPhone} onChange={e => setNewUBOPhone(e.target.value)} placeholder="Phone..." style={{ flex: 1, padding: '6px 10px', fontSize: '0.78rem' }} />
                                        </div>
                                    )}
                                    <button onClick={() => handleAddUBO(selectedVA.entityId)} className="btn-primary" disabled={isAddingUBO || !newUBOName.trim()} style={{ width: '100%', padding: '6px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        {isAddingUBO ? <Loader2 size={14} className="spinner" /> : <Plus size={14} />}
                                        {isAddingUBO ? 'Adding...' : selectedUBOId ? 'Link UBO' : 'Add UBO'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
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

            {deleteConfirmation.show && (
                <ConfirmationModal
                    title={deleteConfirmation.title}
                    message={deleteConfirmation.message}
                    confirmLabel="Remove"
                    isDangerous={true}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setDeleteConfirmation(prev => ({ ...prev, show: false }))}
                />
            )}
        </section>
    )
}
