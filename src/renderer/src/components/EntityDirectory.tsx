import React, { useState, useEffect, useMemo } from 'react'
import { Search, User, Ship, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Shield, Building2, ShieldCheck, ShieldAlert, RefreshCw, Loader2, Pencil, X, Save, Trash2, Mail, Phone, FileText, AlertTriangle, CheckCircle2, Hash, Plus, Upload } from 'lucide-react'
import { Entity, EntityQueryParams, Vessel, VesselAssured, EntityUBO, SanctionsMatch } from '../../../shared/types'

function useDebounceValue<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay)
        return () => clearTimeout(handler)
    }, [value, delay])
    return debouncedValue
}
import { OfacService } from '../services/OfacService'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import SanctionsModal from './SanctionsModal'
import VesselDetail from './VesselDetail'
import ConfirmationModal from './ConfirmationModal'

export default function EntityDirectory() {
    const [entities, setEntities] = useState<Entity[]>([])
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [vesselAssureds, setVesselAssureds] = useState<VesselAssured[]>([])
    const [entityUBOs, setEntityUBOs] = useState<EntityUBO[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
    const [viewingVessel, setViewingVessel] = useState<Vessel | null>(null)
    const { showError, showSuccess } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    // Pagination state
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(25)
    const [total, setTotal] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const [isLoading, setIsLoading] = useState(false)

    // Filter state
    const [typeFilter, setTypeFilter] = useState<'all' | 'company' | 'person'>('all')
    const [ofacStatusFilter, setOfacStatusFilter] = useState<string>('all')

    const debouncedSearch = useDebounceValue(searchTerm, 500)

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

    // Entity editing state
    const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
    const [editForm, setEditForm] = useState<{ name: string; type: 'company' | 'person'; identifier: string; email: string; phone: string }>({ name: '', type: 'company', identifier: '', email: '', phone: '' })
    const [isSaving, setIsSaving] = useState(false)

    // Confirmation modal state
    const [deleteConfirmation, setDeleteConfirmation] = useState<{
        show: boolean
        entity: Entity | null
        message: string
    }>({ show: false, entity: null, message: '' })

    // Create entity state
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [createForm, setCreateForm] = useState({ name: '', type: 'company' as 'company' | 'person', identifier: '', email: '', phone: '' })
    const [isCreating, setIsCreating] = useState(false)

    const startEditing = (entity: Entity) => {
        setEditingEntity(entity)
        setEditForm({
            name: entity.name,
            type: entity.type,
            identifier: entity.identifier || '',
            email: entity.email || '',
            phone: entity.phone || ''
        })
    }

    const handleSaveEdit = async () => {
        if (!editingEntity || !editForm.name.trim()) return
        setIsSaving(true)
        try {
            await window.api.updateEntity(editingEntity.id, {
                name: editForm.name.trim(),
                type: editForm.type,
                identifier: editForm.identifier.trim() || undefined,
                email: editForm.email.trim() || undefined,
                phone: editForm.phone.trim() || undefined
            })
            setEditingEntity(null)
            setSelectedEntity(prev => prev?.id === editingEntity.id ? { ...prev, ...editForm, name: editForm.name.trim(), identifier: editForm.identifier.trim() || undefined, email: editForm.email.trim() || undefined, phone: editForm.phone.trim() || undefined } : prev)
            loadData()
        } catch (error: any) {
            showError(error.message || 'Failed to update entity')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteEntity = async (entity: Entity) => {
        const associatedVessels = getAssociatedVessels(entity.id)
        const message = associatedVessels.length > 0
            ? `This entity is linked to ${associatedVessels.length} vessel(s). Deleting it will remove all assured links. Continue?`
            : `Delete entity "${entity.name}"? This cannot be undone.`

        setDeleteConfirmation({
            show: true,
            entity,
            message
        })
    }

    const handleConfirmDelete = async () => {
        if (!deleteConfirmation.entity) return
        try {
            await window.api.deleteEntity(deleteConfirmation.entity.id)
            if (selectedEntity?.id === deleteConfirmation.entity.id) setSelectedEntity(null)
            showSuccess(`Entity "${deleteConfirmation.entity.name}" deleted`)
            loadData()
        } catch (error: any) {
            showError(error.message || 'Failed to delete entity')
        } finally {
            setDeleteConfirmation({ show: false, entity: null, message: '' })
        }
    }

    const handleCreateEntity = async () => {
        if (!createForm.name.trim()) return
        setIsCreating(true)
        try {
            const newEntity = await window.api.addEntity({
                name: createForm.name.trim(),
                type: createForm.type,
                identifier: createForm.identifier.trim() || undefined,
                email: createForm.email.trim() || undefined,
                phone: createForm.phone.trim() || undefined
            })
            setShowCreateModal(false)
            setCreateForm({ name: '', type: 'company', identifier: '', email: '', phone: '' })
            showSuccess('Entity created. Checking sanctions...')
            loadData()

            // Auto-check sanctions for the new entity
            try {
                const entityId = newEntity?.id
                if (entityId) {
                    setCheckingId(entityId)
                    const entityName = createForm.name.trim()
                    const result = await OfacService.checkSanctions(entityName)
                    await window.api.updateEntity(entityId, {
                        ofacCheckedAt: result.timestamp,
                        ofacMatchFound: result.matchFound,
                        ofacStatus: result.status
                    })
                    loadData()
                    if (result.matchFound && result.matches.length > 0) {
                        setSanctionsModal({ show: true, searchedName: entityName, matches: result.matches, entityId })
                    }
                    setCheckingId(null)
                }
            } catch {
                setCheckingId(null)
            }
        } catch (error: any) {
            showError(error.message || 'Failed to create entity')
        } finally {
            setIsCreating(false)
        }
    }

    const handleUploadEntityDoc = async (entityId: string, field: string) => {
        try {
            const filePath = await window.api.dialogOpenFileAny()
            if (!filePath) return
            await window.api.updateEntity(entityId, { [field]: filePath })
            showSuccess('Document uploaded')
            // Update selectedEntity locally to reflect change immediately
            setSelectedEntity(prev => prev?.id === entityId ? { ...prev, [field]: filePath } : prev)
            loadData()
        } catch (error: any) {
            showError(error.message || 'Failed to upload document')
        }
    }

    const loadData = async () => {
        setIsLoading(true)
        try {
            const [result, v, va, eu] = await Promise.all([
                window.api.getEntitiesPaginated({
                    page,
                    limit,
                    search: debouncedSearch,
                    type: typeFilter,
                    ofacStatus: ofacStatusFilter as EntityQueryParams['ofacStatus']
                }),
                window.api.getVessels(),
                window.api.getVesselAssureds(),
                window.api.getEntityUBOs()
            ])
            setEntities(result.data)
            setTotal(result.total)
            setTotalPages(result.totalPages)
            setVessels(v)
            setVesselAssureds(va)
            setEntityUBOs(eu)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => { loadData() }, [page, limit, debouncedSearch, typeFilter, ofacStatusFilter])
    useEffect(() => { setPage(1) }, [debouncedSearch, typeFilter, ofacStatusFilter, limit])

    // Clear selected entity on page change (but not initial load)
    const [hasInitialized, setHasInitialized] = useState(false)
    useEffect(() => {
        if (hasInitialized) {
            setSelectedEntity(null)
        } else {
            setHasInitialized(true)
        }
    }, [page])

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

    // Stats
    const companyCount = useMemo(() => entities.filter(e => e.type === 'company').length, [entities])
    const personCount = useMemo(() => entities.filter(e => e.type === 'person').length, [entities])

    const OfacBadge = ({ entity, vessel, onRecheck }: { entity?: Entity, vessel?: Vessel, onRecheck: () => void }) => {
        const target = entity || vessel
        const isChecking = checkingId === target?.id
        const isMatch = target?.ofacStatus === 'MATCH' || target?.ofacStatus === 'SANCTIONED'
        const isPotentialMatch = target?.ofacStatus === 'POTENTIAL_MATCH'
        const isError = target?.ofacStatus === 'ERROR'
        const isPending = !target?.ofacStatus || target.ofacStatus === 'PENDING'

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

    const DocBadge = ({ label, hasFile, onClick, onUpload }: { label: string; hasFile: boolean; onClick?: () => void; onUpload?: () => void }) => (
        <div
            style={{
                padding: '8px 14px',
                borderRadius: '10px',
                background: hasFile
                    ? (isLight ? 'rgba(0, 140, 70, 0.08)' : 'rgba(0, 255, 136, 0.06)')
                    : (isLight ? 'rgba(200, 0, 0, 0.06)' : 'rgba(255, 77, 77, 0.06)'),
                border: hasFile
                    ? (isLight ? '1px solid rgba(0, 140, 70, 0.2)' : '1px solid rgba(0, 255, 136, 0.15)')
                    : (isLight ? '1px solid rgba(200, 0, 0, 0.2)' : '1px solid rgba(255, 77, 77, 0.15)'),
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.82rem',
                cursor: hasFile ? 'pointer' : 'default',
                transition: 'var(--transition)'
            }}
            onClick={onClick}
        >
            {hasFile ? (
                <CheckCircle2 size={15} color={isLight ? '#008c46' : '#00ff88'} />
            ) : (
                <AlertTriangle size={15} color={isLight ? '#c00000' : '#ff4d4d'} />
            )}
            <span style={{ color: hasFile ? (isLight ? '#008c46' : 'rgba(0, 255, 136, 0.85)') : (isLight ? '#c00000' : 'rgba(255, 77, 77, 0.85)') }}>
                {label}
            </span>
            {hasFile && <FileText size={13} style={{ marginLeft: 'auto', opacity: 0.4 }} />}
            {!hasFile && onUpload && (
                <button
                    onClick={(e) => { e.stopPropagation(); onUpload() }}
                    className="btn-secondary"
                    style={{
                        marginLeft: 'auto',
                        padding: '3px 8px',
                        fontSize: '0.72rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                    title={`Upload ${label}`}
                >
                    <Upload size={11} /> Upload
                </button>
            )}
        </div>
    )

    const associatedVessels = selectedEntity ? getAssociatedVessels(selectedEntity.id) : []

    if (viewingVessel) {
        return <VesselDetail vessel={viewingVessel} backLabel="Back to Entity" onBack={() => { setViewingVessel(null); loadData() }} />
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Entity Directory</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Search for Assureds and UBOs to see their vessel associations.</p>
                </div>
                <button
                    className="btn-primary"
                    onClick={() => setShowCreateModal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', fontSize: '0.9rem', flexShrink: 0 }}
                >
                    <Plus size={16} /> Create Entity
                </button>
            </header>

            {/* Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
                <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Shield size={20} color="white" />
                    </div>
                    <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.1 }}>{total}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Total Entities</div>
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: isLight ? 'rgba(26, 115, 232, 0.12)' : 'rgba(0, 210, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 size={20} color="var(--accent-primary)" />
                    </div>
                    <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.1 }}>{companyCount}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Companies</div>
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: isLight ? 'rgba(26, 115, 232, 0.12)' : 'rgba(0, 210, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={20} color="var(--accent-primary)" />
                    </div>
                    <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.1 }}>{personCount}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Persons</div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '28px', alignItems: 'start' }}>
                {/* Left Side: Search & List */}
                <div className="glass-card" style={{ padding: '0', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 300px)' }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--table-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ position: 'relative' }}>
                            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={16} />
                            <input
                                type="text"
                                placeholder="Search entities..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                aria-label="Search entities by name"
                                style={{
                                    width: '100%',
                                    padding: '9px 10px 9px 38px',
                                    fontSize: '0.9rem'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} style={{ flex: 1, padding: '7px 10px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} aria-label="Filter by entity type">
                                <option value="all">All Types</option>
                                <option value="company">Companies</option>
                                <option value="person">Persons</option>
                            </select>
                            <select value={ofacStatusFilter} onChange={e => setOfacStatusFilter(e.target.value)} style={{ flex: 1, padding: '7px 10px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} aria-label="Filter by sanctions status">
                                <option value="all">All Statuses</option>
                                <option value="CLEARED">Cleared</option>
                                <option value="POTENTIAL_MATCH">Potential Match</option>
                                <option value="MATCH">Match</option>
                                <option value="PENDING">Pending</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {isLoading && entities.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                <Loader2 size={24} className="spinner" style={{ marginBottom: '12px' }} />
                                <div>Loading entities...</div>
                            </div>
                        ) : entities.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                <Shield size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                <div>No entities found</div>
                            </div>
                        ) : (
                            entities.map(entity => {
                                const vesselCount = getAssociatedVessels(entity.id).length
                                const isSelected = selectedEntity?.id === entity.id
                                return (
                                    <div
                                        key={entity.id}
                                        onClick={() => setSelectedEntity(entity)}
                                        style={{
                                            padding: '14px 16px',
                                            borderBottom: '1px solid var(--table-border)',
                                            cursor: 'pointer',
                                            background: isSelected
                                                ? (isLight ? 'rgba(26, 115, 232, 0.08)' : 'rgba(0, 210, 255, 0.08)')
                                                : 'transparent',
                                            borderLeft: isSelected ? '3px solid var(--accent-primary)' : '3px solid transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            transition: 'var(--transition)'
                                        }}
                                        className="hover-effect"
                                    >
                                        <div style={{
                                            width: '38px',
                                            height: '38px',
                                            borderRadius: '10px',
                                            background: entity.type === 'company'
                                                ? (isLight ? 'rgba(26, 115, 232, 0.1)' : 'rgba(0, 210, 255, 0.1)')
                                                : (isLight ? 'rgba(156, 39, 176, 0.1)' : 'rgba(186, 104, 200, 0.1)'),
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            {entity.type === 'company'
                                                ? <Building2 size={18} color="var(--accent-primary)" />
                                                : <User size={18} color={isLight ? '#9c27b0' : '#ba68c8'} />
                                            }
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: '600', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {entity.name}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    padding: '1px 6px',
                                                    borderRadius: '3px',
                                                    background: entity.type === 'company'
                                                        ? (isLight ? 'rgba(26, 115, 232, 0.08)' : 'rgba(0, 210, 255, 0.08)')
                                                        : (isLight ? 'rgba(156, 39, 176, 0.08)' : 'rgba(186, 104, 200, 0.08)'),
                                                    color: entity.type === 'company' ? 'var(--accent-primary)' : (isLight ? '#9c27b0' : '#ba68c8')
                                                }}>
                                                    {entity.type}
                                                </span>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                    {vesselCount} vessel{vesselCount !== 1 ? 's' : ''}
                                                </span>
                                                {entity.identifier && (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }} title={entity.identifier}>
                                                        {entity.identifier}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ marginTop: '4px' }}>
                                                <OfacBadge entity={entity} onRecheck={() => handleOfacRecheck(entity)} />
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {!isLoading && totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--table-border)', fontSize: '0.82rem' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>
                                {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
                            </div>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(1)} style={{ padding: '4px 6px' }} aria-label="First page"><ChevronsLeft size={14} /></button>
                                <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '4px 6px' }} aria-label="Previous page"><ChevronLeft size={14} /></button>
                                <span style={{ margin: '0 6px', color: 'var(--text-secondary)' }}>{page}/{totalPages}</span>
                                <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ padding: '4px 6px' }} aria-label="Next page"><ChevronRight size={14} /></button>
                                <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage(totalPages)} style={{ padding: '4px 6px' }} aria-label="Last page"><ChevronsRight size={14} /></button>
                                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ marginLeft: '8px', padding: '3px 6px', fontSize: '0.82rem' }} aria-label="Entities per page">
                                    <option value="10">10</option>
                                    <option value="25">25</option>
                                    <option value="50">50</option>
                                    <option value="100">100</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Side: Details */}
                <div style={{ minHeight: '400px' }}>
                    {selectedEntity ? (
                        <div className="fade-in">
                            {/* Entity Header Card */}
                            <div className="glass-card" style={{ padding: '28px', marginBottom: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
                                    <div style={{
                                        width: '64px',
                                        height: '64px',
                                        borderRadius: '16px',
                                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        flexShrink: 0
                                    }}>
                                        {selectedEntity.type === 'company' ? <Building2 size={30} /> : <User size={30} />}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                            <h2 style={{ fontSize: '1.6rem', margin: 0 }}>{selectedEntity.name}</h2>
                                            <OfacBadge entity={selectedEntity} onRecheck={() => handleOfacRecheck(selectedEntity)} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                padding: '2px 10px',
                                                borderRadius: '4px',
                                                background: selectedEntity.type === 'company'
                                                    ? (isLight ? 'rgba(26, 115, 232, 0.1)' : 'rgba(0, 210, 255, 0.1)')
                                                    : (isLight ? 'rgba(156, 39, 176, 0.1)' : 'rgba(186, 104, 200, 0.1)'),
                                                color: selectedEntity.type === 'company' ? 'var(--accent-primary)' : (isLight ? '#9c27b0' : '#ba68c8'),
                                                fontWeight: 600
                                            }}>
                                                {selectedEntity.type}
                                            </span>
                                            {selectedEntity.identifier && (
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{selectedEntity.identifier}</span>
                                            )}
                                        </div>

                                        {/* Contact Info */}
                                        {(selectedEntity.email || selectedEntity.phone) && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '14px' }}>
                                                {selectedEntity.email && selectedEntity.email.split(',').map((em, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                        <Mail size={14} color="var(--accent-primary)" />
                                                        {em.trim()}
                                                    </div>
                                                ))}
                                                {selectedEntity.phone && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                        <Phone size={14} color="var(--accent-primary)" />
                                                        {selectedEntity.phone}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                        <button
                                            onClick={() => startEditing(selectedEntity)}
                                            className="btn-secondary"
                                            style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                                            title="Edit entity info"
                                        >
                                            <Pencil size={14} /> Edit
                                        </button>
                                        <button
                                            onClick={() => handleDeleteEntity(selectedEntity)}
                                            className="btn-secondary"
                                            style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)' }}
                                            title="Delete entity"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Documents Section */}
                                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--table-border)' }}>
                                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: 600 }}>Documents</div>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        {selectedEntity.type === 'person' ? (
                                            <DocBadge
                                                label="ID / Passport"
                                                hasFile={!!selectedEntity.passportFilePath}
                                                onClick={selectedEntity.passportFilePath ? () => window.api.fsOpen(selectedEntity.passportFilePath!) : undefined}
                                                onUpload={!selectedEntity.passportFilePath ? () => handleUploadEntityDoc(selectedEntity.id, 'passportFilePath') : undefined}
                                            />
                                        ) : (
                                            <>
                                                <DocBadge
                                                    label="Certificate of Incorporation"
                                                    hasFile={!!selectedEntity.certificateOfIncorporationPath}
                                                    onClick={selectedEntity.certificateOfIncorporationPath ? () => window.api.fsOpen(selectedEntity.certificateOfIncorporationPath!) : undefined}
                                                    onUpload={!selectedEntity.certificateOfIncorporationPath ? () => handleUploadEntityDoc(selectedEntity.id, 'certificateOfIncorporationPath') : undefined}
                                                />
                                                <DocBadge
                                                    label="Articles of Association"
                                                    hasFile={!!selectedEntity.articlesOfAssociationPath}
                                                    onClick={selectedEntity.articlesOfAssociationPath ? () => window.api.fsOpen(selectedEntity.articlesOfAssociationPath!) : undefined}
                                                    onUpload={!selectedEntity.articlesOfAssociationPath ? () => handleUploadEntityDoc(selectedEntity.id, 'articlesOfAssociationPath') : undefined}
                                                />
                                                <DocBadge
                                                    label="KYC"
                                                    hasFile={!!selectedEntity.kycFilePath}
                                                    onClick={selectedEntity.kycFilePath ? () => window.api.fsOpen(selectedEntity.kycFilePath!) : undefined}
                                                    onUpload={!selectedEntity.kycFilePath ? () => handleUploadEntityDoc(selectedEntity.id, 'kycFilePath') : undefined}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Associated Vessels */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                                    <Ship size={20} color="var(--accent-primary)" /> Associated Vessels
                                </h3>
                                <span style={{
                                    fontSize: '0.78rem',
                                    padding: '3px 10px',
                                    borderRadius: '12px',
                                    background: isLight ? 'rgba(26, 115, 232, 0.1)' : 'rgba(0, 210, 255, 0.08)',
                                    color: 'var(--accent-primary)',
                                    fontWeight: 600
                                }}>
                                    {associatedVessels.length} vessel{associatedVessels.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {associatedVessels.length === 0 ? (
                                <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <Ship size={36} style={{ marginBottom: '12px', opacity: 0.2 }} />
                                    <div style={{ fontSize: '0.95rem' }}>No vessels linked to this entity</div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                                    {associatedVessels.map(vessel => (
                                        <div key={vessel.id} className="glass-card" style={{ padding: '20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '8px',
                                                    background: isLight ? 'rgba(26, 115, 232, 0.08)' : 'rgba(0, 210, 255, 0.08)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <Ship size={16} color="var(--accent-primary)" />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div
                                                        style={{ fontWeight: '600', fontSize: '1rem', cursor: 'pointer', color: 'var(--accent-primary)' }}
                                                        onClick={() => setViewingVessel(vessel)}
                                                    >{vessel.name}</div>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Hash size={11} /> {vessel.imoNumber}
                                                    </div>
                                                </div>
                                                <OfacBadge vessel={vessel} onRecheck={() => handleVesselOfacRecheck(vessel)} />
                                            </div>

                                            {vessel.roles.length > 0 && (
                                                <div style={{ marginTop: '12px' }}>
                                                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Direct Role</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {vessel.roles.map((r, i) => (
                                                            <span key={i} style={{
                                                                background: isLight ? 'rgba(26, 115, 232, 0.08)' : 'rgba(0, 210, 255, 0.08)',
                                                                color: 'var(--accent-primary)',
                                                                padding: '3px 10px',
                                                                borderRadius: '6px',
                                                                fontSize: '0.75rem',
                                                                border: isLight ? '1px solid rgba(26, 115, 232, 0.15)' : '1px solid rgba(0, 210, 255, 0.15)',
                                                                fontWeight: 500
                                                            }}>
                                                                {r}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {vessel.viaAssureds.length > 0 && (
                                                <div style={{ marginTop: '10px' }}>
                                                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Via Assured (UBO)</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {vessel.viaAssureds.map((r, i) => (
                                                            <span key={i} style={{
                                                                background: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)',
                                                                color: 'var(--text-secondary)',
                                                                padding: '3px 10px',
                                                                borderRadius: '6px',
                                                                fontSize: '0.75rem',
                                                                border: '1px solid var(--table-border)'
                                                            }}>
                                                                {r}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="glass-card" style={{
                            height: '100%',
                            minHeight: '400px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-secondary)',
                            textAlign: 'center',
                            padding: '48px'
                        }}>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '20px',
                                background: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.03)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '20px'
                            }}>
                                <Shield size={36} style={{ opacity: 0.25 }} />
                            </div>
                            <h3 style={{ marginBottom: '8px', fontSize: '1.1rem' }}>Select an entity</h3>
                            <p style={{ fontSize: '0.9rem', maxWidth: '280px', lineHeight: 1.5 }}>
                                Choose an entity from the list to view their details, documents, and vessel associations.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            {editingEntity && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }} onClick={() => setEditingEntity(null)}>
                    <div className="glass-card" style={{ padding: '32px', width: '480px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '1.3rem' }}>Edit Entity</h3>
                            <button onClick={() => setEditingEntity(null)} className="btn-secondary" style={{ padding: '6px' }}><X size={18} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Name *</label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                    style={{ width: '100%' }}
                                    placeholder="Entity name"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Type</label>
                                <select
                                    value={editForm.type}
                                    onChange={e => setEditForm(f => ({ ...f, type: e.target.value as 'company' | 'person' }))}
                                    style={{ width: '100%', padding: '10px 12px' }}
                                >
                                    <option value="company">Company</option>
                                    <option value="person">Person</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Identifier</label>
                                <input
                                    type="text"
                                    value={editForm.identifier}
                                    onChange={e => setEditForm(f => ({ ...f, identifier: e.target.value }))}
                                    style={{ width: '100%' }}
                                    placeholder="Optional note to distinguish same-named entities"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Email(s)</label>
                                <input
                                    type="text"
                                    value={editForm.email}
                                    onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                                    style={{ width: '100%' }}
                                    placeholder="Separate multiple emails with commas"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Phone</label>
                                <input
                                    type="text"
                                    value={editForm.phone}
                                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                                    style={{ width: '100%' }}
                                    placeholder="Phone number"
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button onClick={() => setEditingEntity(null)} className="btn-secondary">Cancel</button>
                                <button
                                    onClick={handleSaveEdit}
                                    className="btn-primary"
                                    disabled={!editForm.name.trim() || isSaving}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    {isSaving ? <Loader2 size={14} className="spinner" /> : <Save size={14} />}
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Entity Modal */}
            {showCreateModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }} onClick={() => setShowCreateModal(false)}>
                    <div className="glass-card" style={{ padding: '32px', width: '480px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '1.3rem' }}>Create Entity</h3>
                            <button onClick={() => setShowCreateModal(false)} className="btn-secondary" style={{ padding: '6px' }}><X size={18} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Name *</label>
                                <input
                                    type="text"
                                    value={createForm.name}
                                    onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                                    style={{ width: '100%' }}
                                    placeholder="Entity name"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Type</label>
                                <select
                                    value={createForm.type}
                                    onChange={e => setCreateForm(f => ({ ...f, type: e.target.value as 'company' | 'person' }))}
                                    style={{ width: '100%', padding: '10px 12px' }}
                                >
                                    <option value="company">Company</option>
                                    <option value="person">Person</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Identifier</label>
                                <input
                                    type="text"
                                    value={createForm.identifier}
                                    onChange={e => setCreateForm(f => ({ ...f, identifier: e.target.value }))}
                                    style={{ width: '100%' }}
                                    placeholder="Optional note to distinguish same-named entities"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Email(s)</label>
                                <input
                                    type="text"
                                    value={createForm.email}
                                    onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                                    style={{ width: '100%' }}
                                    placeholder="Separate multiple emails with commas"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Phone</label>
                                <input
                                    type="text"
                                    value={createForm.phone}
                                    onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                                    style={{ width: '100%' }}
                                    placeholder="Phone number"
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                                <button
                                    onClick={handleCreateEntity}
                                    className="btn-primary"
                                    disabled={!createForm.name.trim() || isCreating}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    {isCreating ? <Loader2 size={14} className="spinner" /> : <Plus size={14} />}
                                    Create Entity
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                    title="Delete Entity?"
                    message={deleteConfirmation.message}
                    confirmLabel="Delete"
                    isDangerous={true}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setDeleteConfirmation({ show: false, entity: null, message: '' })}
                />
            )}
        </div>
    )
}
