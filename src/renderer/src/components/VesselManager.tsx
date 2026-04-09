import React, { useState, useEffect } from 'react'
import { Ship, ChevronRight, ChevronDown, Hash, Search, Filter, ArrowUpDown, Shield, ShieldCheck, ShieldAlert, RefreshCw, Loader2, ChevronLeft, ChevronsLeft, ChevronsRight, Plus, X, CheckSquare, Square, Download } from 'lucide-react'
import { Vessel, Fleet, Entity, SanctionsMatch, VesselQueryParams, FlagState } from '../../../shared/types'
import { getFlagClass } from '../utils/countryCodeMap'
import 'flag-icons/css/flag-icons.min.css'
import { OfacService } from '../services/OfacService'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import VesselDetail from './VesselDetail'
import SanctionsModal from './SanctionsModal'
import { formatDateTime } from '../utils/dateUtils'
import ColumnSelector, { useColumnPrefs, ColumnDef } from './ColumnSelector'


// Simple debounce hook implementation if not available
function useDebounceValue<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay)
        return () => clearTimeout(handler)
    }, [value, delay])
    return debouncedValue
}

export default function VesselManager({ initialVesselId, initialVesselSection, onClearInitialVessel, onNavigateBack, navigateBackLabel, onNavigateToQuotation }: { initialVesselId?: string | null; initialVesselSection?: 'documents' | 'assureds' | 'surveys' | 'policies' | 'history' | 'timeline' | 'quotations'; onClearInitialVessel?: () => void; onNavigateBack?: () => void; navigateBackLabel?: string; onNavigateToQuotation?: (quotationId: string) => void } = {}) {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [fleets, setFleets] = useState<Fleet[]>([])
    const [entities, setEntities] = useState<Entity[]>([])
    const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null)
    const [openInEditMode, setOpenInEditMode] = useState(false)
    const { showError, showSuccess } = useToast()
    const { theme } = useTheme()
    const { hasPermission } = useAuth()
    const isLight = theme === 'light'

    // Pagination State
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(25)
    const [total, setTotal] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const [isLoading, setIsLoading] = useState(false)

    // UI State
    const [searchTerm, setSearchTerm] = useState('')
    const debouncedSearch = useDebounceValue(searchTerm, 500)

    const [fleetFilter, setFleetFilter] = useState('all')
    const [sortField, setSortField] = useState<'name' | 'imoNumber'>('name')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')

    // Add Mode
    const [newVessel, setNewVessel] = useState({ name: '', imo: '', fleetId: '', customerId: '', customerType: '' as '' | 'broker' | 'direct' })
    const [isAdding, setIsAdding] = useState(false)
    const [showQuickAdd, setShowQuickAdd] = useState(false)

    // Customer search state
    const [customerSearch, setCustomerSearch] = useState('')
    const [customerTypePrompt, setCustomerTypePrompt] = useState<{ vesselId: string; customerId: string } | null>(null)
    // Per-vessel customer search in table
    const [editingCustomerVesselId, setEditingCustomerVesselId] = useState<string | null>(null)
    const [tableCustomerSearch, setTableCustomerSearch] = useState('')

    const [flagStates, setFlagStates] = useState<FlagState[]>([])

    // Bulk selection state
    const [selectMode, setSelectMode] = useState(false)
    const [selectedVesselIds, setSelectedVesselIds] = useState<Set<string>>(new Set())
    const [bulkFleetDropdown, setBulkFleetDropdown] = useState(false)
    const [newFleetInput, setNewFleetInput] = useState(false)
    const [newFleetName, setNewFleetName] = useState('')

    // Column preferences
    const VESSEL_COLUMNS: ColumnDef[] = [
        { id: 'name', label: 'Vessel Name', defaultVisible: true },
        { id: 'imo', label: 'IMO Number', defaultVisible: true },
        { id: 'sanctions', label: 'Sanctions', defaultVisible: true },
        { id: 'customer', label: 'Customer', defaultVisible: true },
        { id: 'fleet', label: 'Fleet', defaultVisible: true },
        { id: 'actions', label: 'Actions', defaultVisible: true }
    ]
    const { visibleColumns, setVisibleColumns } = useColumnPrefs('vessels', VESSEL_COLUMNS)
    const visibleSet = new Set(visibleColumns)

    // Section and back-navigation tracking for external navigation
    const [appliedSection, setAppliedSection] = useState<'documents' | 'assureds' | 'surveys' | 'policies' | 'history' | 'timeline' | 'quotations' | undefined>(undefined)
    const [navigatedExternally, setNavigatedExternally] = useState(false)

    // Sanctions checking state
    const [checkingVesselId, setCheckingVesselId] = useState<string | null>(null)

    // Sanctions modal state
    const [sanctionsModal, setSanctionsModal] = useState<{
        show: boolean
        searchedName: string
        matches: SanctionsMatch[]
        vesselId?: string
    }>({ show: false, searchedName: '', matches: [] })

    // Load initial fleets
    useEffect(() => {
        const loadStaticData = async () => {
            const [fData, eData, fsData] = await Promise.all([
                window.api.getFleets(),
                window.api.getEntities(),
                window.api.getFlagStates()
            ])
            setFleets(Array.isArray(fData) ? fData : [])
            setEntities(Array.isArray(eData) ? eData : [])
            setFlagStates(Array.isArray(fsData) ? fsData : [])
        }
        loadStaticData()
    }, [])

    // Open vessel by ID from external navigation
    useEffect(() => {
        if (initialVesselId) {
            // Capture section NOW (synchronously) before the async gap clears it
            const sectionToApply = initialVesselSection
            ;(async () => {
                const allVessels = await window.api.getVessels()
                const vessel = Array.isArray(allVessels) ? allVessels.find((v: Vessel) => v.id === initialVesselId) : undefined
                if (vessel) {
                    setAppliedSection(sectionToApply)
                    setNavigatedExternally(true)
                    setSelectedVessel(vessel)
                }
                if (onClearInitialVessel) onClearInitialVessel()
            })()
        }
    }, [initialVesselId])

    // Load vessels when params change
    useEffect(() => {
        loadData()
    }, [page, limit, debouncedSearch, fleetFilter, statusFilter, sortField, sortOrder])

    const loadData = async () => {
        setIsLoading(true)
        try {
            const params: VesselQueryParams = {
                page,
                limit,
                search: debouncedSearch,
                fleetId: fleetFilter,
                status: statusFilter,
                sortField,
                sortOrder
            }

            // @ts-ignore - API exposed in preload
            const result = await window.api.getVesselsPaginated(params)
            setVessels(Array.isArray(result?.data) ? result.data : [])
            setTotal(result?.total ?? 0)
            setTotalPages(result?.totalPages ?? 1)
        } catch (error: any) {
            console.error('Failed to load vessels:', error)
            showError('Failed to load vessels')
        } finally {
            setIsLoading(false)
        }
    }

    // Reset page when filters change
    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, fleetFilter, statusFilter, limit])

    const handleAddVessel = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newVessel.name || !newVessel.imo) return

        setIsAdding(true)
        try {
            // Scan OFAC
            const scanResult = await OfacService.checkSanctions(newVessel.name)

            const result = await window.api.addVessel({
                name: newVessel.name,
                imoNumber: newVessel.imo,
                fleetId: newVessel.fleetId,
                customerId: newVessel.customerId || undefined,
                customerType: newVessel.customerType || undefined,
                ofacCheckedAt: scanResult.timestamp,
                ofacMatchFound: scanResult.matchFound,
                ofacStatus: scanResult.status,
                isActive: true
            })

            if (!result.success || !result.data) {
                showError(result.message || 'Failed to register vessel')
                return
            }

            const vessel = result.data
            setNewVessel({ name: '', imo: '', fleetId: '', customerId: '', customerType: '' })
            showSuccess(`Vessel "${vessel.name}" registered successfully`)
            loadData()
            setOpenInEditMode(true)
            setSelectedVessel(vessel)

            // Show modal if potential matches found
            if (scanResult.matchFound && scanResult.matches.length > 0) {
                setSanctionsModal({
                    show: true,
                    searchedName: newVessel.name,
                    matches: scanResult.matches,
                    vesselId: vessel.id
                })
            }
        } catch (error: any) {
            console.error('Add vessel error:', error)
            showError('An unexpected error occurred')
        } finally {
            setIsAdding(false)
        }
    }

    const handleUpdateFleet = async (vesselId: string, fleetId: string) => {
        await window.api.updateVessel(vesselId, { fleetId: fleetId })
        loadData()
    }

    const handleUpdateCustomer = async (vesselId: string, customerId: string, customerType: 'broker' | 'direct' | '') => {
        await window.api.updateVessel(vesselId, {
            customerId: customerId || undefined,
            customerType: (customerType || undefined) as Vessel['customerType']
        })
        loadData()
    }

    const toggleSort = (field: 'name' | 'imoNumber') => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortOrder('asc')
        }
    }

    const handleOfacRecheck = async (vessel: Vessel) => {
        setCheckingVesselId(vessel.id)
        try {
            const result = await OfacService.checkSanctions(vessel.name)
            const autoMark = result.autoMarkCleanOnCheck ?? true
            if (result.status !== 'CLEARED' || autoMark) {
                await window.api.updateVessel(vessel.id, {
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
                    searchedName: vessel.name,
                    matches: result.matches,
                    vesselId: vessel.id
                })
            }
        } catch (error: any) {
            showError(error.message || 'Sanctions check failed. Please try again.')
        } finally {
            setCheckingVesselId(null)
        }
    }

    const handleMarkClean = async () => {
        if (sanctionsModal.vesselId) {
            await window.api.updateVessel(sanctionsModal.vesselId, { ofacStatus: 'CLEARED', ofacMatchFound: false })
        }
        setSanctionsModal({ show: false, searchedName: '', matches: [] })
        loadData()
    }

    const handleConfirmMatch = async () => {
        if (sanctionsModal.vesselId) {
            await window.api.updateVessel(sanctionsModal.vesselId, { ofacStatus: 'MATCH', ofacMatchFound: true })
        }
        setSanctionsModal({ show: false, searchedName: '', matches: [] })
        loadData()
    }

    // Bulk operations
    const toggleSelectVessel = (vesselId: string) => {
        setSelectedVesselIds(prev => {
            const next = new Set(prev)
            if (next.has(vesselId)) next.delete(vesselId)
            else next.add(vesselId)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (selectedVesselIds.size === vessels.length) {
            setSelectedVesselIds(new Set())
        } else {
            setSelectedVesselIds(new Set(vessels.map(v => v.id)))
        }
    }

    const handleCreateFleetAndAssign = async () => {
        if (!newFleetName.trim()) return
        try {
            const created = await window.api.addFleet({ name: newFleetName.trim() })
            setFleets(prev => [...prev, created])
            setNewFleetName('')
            setNewFleetInput(false)
            await handleBulkAssignFleet(created.id)
        } catch (err: any) {
            showError(err.message || 'Failed to create fleet')
        }
    }

    const handleBulkAssignFleet = async (fleetId: string) => {
        try {
            await window.api.bulkAssignFleet([...selectedVesselIds], fleetId)
            showSuccess(`Assigned ${selectedVesselIds.size} vessel(s) to fleet`)
            setSelectedVesselIds(new Set())
            setBulkFleetDropdown(false)
            loadData()
        } catch (err: any) {
            showError(err.message || 'Failed to assign fleet')
        }
    }

    const handleBulkChangeStatus = async (isActive: boolean) => {
        try {
            await window.api.bulkSetVesselStatus([...selectedVesselIds], isActive)
            showSuccess(`Updated ${selectedVesselIds.size} vessel(s) to ${isActive ? 'active' : 'inactive'}`)
            setSelectedVesselIds(new Set())
            loadData()
        } catch (err: any) {
            showError(err.message || 'Failed to update status')
        }
    }

    const handleBulkExport = () => {
        const selected = vessels.filter(v => selectedVesselIds.has(v.id))
        if (selected.length === 0) return
        // Build CSV content
        const headers = ['Name', 'IMO Number', 'Fleet', 'Customer', 'Status', 'Sanctions']
        const rows = selected.map(v => [
            v.name,
            v.imoNumber,
            fleets.find(f => f.id === v.fleetId)?.name || 'Standalone',
            entities.find(e => e.id === v.customerId)?.name || '',
            v.isActive ? 'Active' : 'Inactive',
            v.ofacStatus || 'NOT CHECKED'
        ])
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(','))].join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `vessels-export-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
        showSuccess(`Exported ${selected.length} vessel(s)`)
    }

    const handleViewPotentialMatch = async (vessel: Vessel) => {
        setCheckingVesselId(vessel.id)
        try {
            const result = await OfacService.checkSanctions(vessel.name)
            if (result.matches.length > 0) {
                setSanctionsModal({
                    show: true,
                    searchedName: vessel.name,
                    matches: result.matches,
                    vesselId: vessel.id
                })
            }
        } catch (error: any) {
            showError(error.message || 'Failed to load sanctions data. Please try again.')
        } finally {
            setCheckingVesselId(null)
        }
    }

    const OfacBadge = ({ vessel }: { vessel: Vessel }) => {
        const isChecking = checkingVesselId === vessel.id
        const isMatch = vessel.ofacStatus === 'MATCH' || vessel.ofacStatus === 'SANCTIONED'
        const isPotentialMatch = vessel.ofacStatus === 'POTENTIAL_MATCH'
        const isError = vessel.ofacStatus === 'ERROR'
        const isPending = !vessel.ofacStatus || vessel.ofacStatus === 'PENDING'

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
                handleViewPotentialMatch(vessel)
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
                            `Last checked: ${vessel.ofacCheckedAt ? formatDateTime(vessel.ofacCheckedAt) : 'Never'}`
                }
                onClick={handleBadgeClick}
            >
                {config.icon}
                {config.text}
                <RefreshCw
                    size={10}
                    style={{ marginLeft: '4px', cursor: 'pointer', opacity: 0.6 }}
                    className="hover-spin"
                    onClick={(e) => { e.stopPropagation(); handleOfacRecheck(vessel); }}
                />
            </div>
        )
    }

    if (selectedVessel) {
        const handleBack = navigatedExternally && onNavigateBack
            ? () => { onNavigateBack(); setSelectedVessel(null); setAppliedSection(undefined); setNavigatedExternally(false); setOpenInEditMode(false) }
            : () => { setSelectedVessel(null); setAppliedSection(undefined); setNavigatedExternally(false); setOpenInEditMode(false); loadData() }
        const backLabel = navigatedExternally && navigateBackLabel ? navigateBackLabel : 'Back to Vessels'
        return <VesselDetail vessel={selectedVessel} backLabel={backLabel} onBack={handleBack} initialSection={appliedSection} initialEditing={openInEditMode} onNavigateToQuotation={onNavigateToQuotation} />
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Vessel Registry</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Search, filter, and manage all vessels across your fleets.</p>
                </div>
                {hasPermission('vessels:create') && (
                    <button
                        onClick={() => setShowQuickAdd(!showQuickAdd)}
                        className={showQuickAdd ? 'btn-secondary' : 'btn-primary'}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
                    >
                        {showQuickAdd ? <X size={20} /> : <Plus size={20} />}
                        {showQuickAdd ? 'Cancel' : 'Add Vessel'}
                    </button>
                )}
            </header>

            {showQuickAdd && (
                <section className="glass-card fade-in" style={{ padding: '24px', marginBottom: '32px', border: '1px solid var(--accent-primary)' }}>
                    <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Ship size={20} color="var(--accent-primary)" /> Quick Register
                    </h3>
                    <form onSubmit={handleAddVessel} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            value={newVessel.name}
                            onChange={e => setNewVessel({ ...newVessel, name: e.target.value.toUpperCase() })}
                            style={{ flex: 2, minWidth: '200px', textTransform: 'uppercase' }}
                            placeholder="Vessel Name"
                            aria-label="Vessel name"
                        />
                        <input
                            type="text"
                            value={newVessel.imo}
                            onChange={e => setNewVessel({ ...newVessel, imo: e.target.value })}
                            style={{ flex: 1, minWidth: '120px' }}
                            placeholder="IMO No."
                            aria-label="IMO number"
                        />
                        <select
                            value={newVessel.fleetId}
                            onChange={e => setNewVessel({ ...newVessel, fleetId: e.target.value })}
                            style={{ flex: 1, minWidth: '150px', color: 'var(--text-primary)' }}
                            aria-label="Fleet assignment"
                        >
                            <option value="">Standalone</option>
                            {fleets.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                            <input
                                type="text"
                                value={newVessel.customerId ? (entities.find(e => e.id === newVessel.customerId)?.name || '') + (newVessel.customerType ? ` (${newVessel.customerType})` : '') : customerSearch}
                                onChange={e => { setCustomerSearch(e.target.value); setNewVessel({ ...newVessel, customerId: '', customerType: '' }); }}
                                style={{ width: '100%', color: 'var(--text-primary)' }}
                                placeholder="Search or create customer..."
                                aria-label="Customer"
                            />
                            {customerSearch && !newVessel.customerId && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                                    marginTop: '4px', padding: '8px', maxHeight: '200px', overflowY: 'auto',
                                    background: isLight ? '#ffffff' : '#1e222a',
                                    border: '1px solid var(--accent-primary)', borderRadius: '8px',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                                }}>
                                    {entities.filter(e => e.name.toLowerCase().includes(customerSearch.toLowerCase())).map(ent => (
                                        <div key={ent.id} onClick={() => { setCustomerTypePrompt({ vesselId: '', customerId: ent.id }); }}
                                            style={{ padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }} className="hover-effect">
                                            {ent.name} {ent.identifier ? `[${ent.identifier}]` : ''}
                                        </div>
                                    ))}
                                    {entities.filter(e => e.name.toLowerCase().includes(customerSearch.toLowerCase())).length === 0 && (
                                        <div
                                            onClick={async () => {
                                                const newEntity = await window.api.addEntity({ name: customerSearch, type: 'company' })
                                                const eData = await window.api.getEntities()
                                                setEntities(Array.isArray(eData) ? eData : [])
                                                setCustomerTypePrompt({ vesselId: '', customerId: newEntity.id })
                                            }}
                                            style={{ padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--accent-primary)' }}
                                            className="hover-effect"
                                        >
                                            + Create &quot;{customerSearch}&quot; as customer
                                        </div>
                                    )}
                                </div>
                            )}
                            {newVessel.customerId && (
                                <button onClick={() => { setNewVessel({ ...newVessel, customerId: '', customerType: '' }); setCustomerSearch(''); }}
                                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <button type="submit" className="btn-primary" disabled={isAdding} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isAdding && <Loader2 size={16} className="spinner" />}
                            {isAdding ? 'Registering...' : 'Register'}
                        </button>
                    </form>
                </section>
            )}

            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} size={18} />
                    <input
                        type="text"
                        placeholder="Search by name or IMO..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ width: '100%', paddingLeft: '40px' }}
                        aria-label="Search vessels"
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Filter size={18} color="var(--text-secondary)" />
                    <select
                        value={fleetFilter}
                        onChange={e => setFleetFilter(e.target.value)}
                        style={{ padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                        aria-label="Filter by fleet"
                    >
                        <option value="all">All Fleets</option>
                        <option value="">Standalone</option>
                        {fleets.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Status:</span>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as any)}
                        style={{ padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                        aria-label="Filter by status"
                    >
                        <option value="active">Active Only</option>
                        <option value="inactive">Inactive Only</option>
                        <option value="all">All Vessels</option>
                    </select>
                </div>
                <button
                    onClick={() => {
                        setSelectMode(prev => {
                            if (prev) setSelectedVesselIds(new Set())
                            return !prev
                        })
                    }}
                    className={selectMode ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                    title={selectMode ? 'Exit select mode' : 'Enter select mode'}
                >
                    <CheckSquare size={16} />
                    Select
                </button>
            </div>

            {/* Bulk Action Toolbar */}
            {selectMode && selectedVesselIds.size > 0 && (
                <div className="glass-card fade-in" style={{
                    padding: '10px 20px',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: isLight ? 'rgba(0,150,200,0.08)' : 'rgba(0,210,255,0.06)',
                    border: '1px solid var(--accent-primary)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10
                }}>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--accent-primary)' }}>
                        {selectedVesselIds.size} selected
                    </span>
                    <div style={{ width: '1px', height: '20px', background: 'var(--glass-border)' }} />
                    {hasPermission('vessels:edit') && (
                        <div style={{ position: 'relative' }}>
                            <button
                                className="btn-secondary"
                                onClick={() => setBulkFleetDropdown(!bulkFleetDropdown)}
                                style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                Assign to Fleet <ChevronDown size={13} />
                            </button>
                            {bulkFleetDropdown && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '4px',
                                    padding: '4px',
                                    minWidth: '180px',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    background: isLight ? '#ffffff' : '#1e222a',
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: '8px',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                                    zIndex: 100
                                }}>
                                    <div
                                        onClick={() => handleBulkAssignFleet('')}
                                        style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}
                                        className="hover-effect"
                                    >
                                        Standalone
                                    </div>
                                    {[...fleets].sort((a, b) => a.name.localeCompare(b.name)).map(f => (
                                        <div
                                            key={f.id}
                                            onClick={() => handleBulkAssignFleet(f.id)}
                                            style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.85rem' }}
                                            className="hover-effect"
                                        >
                                            {f.name}
                                        </div>
                                    ))}
                                    <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: '4px', paddingTop: '4px' }}>
                                        {newFleetInput ? (
                                            <div style={{ display: 'flex', gap: '4px', padding: '4px' }}>
                                                <input value={newFleetName} onChange={e => setNewFleetName(e.target.value)} placeholder="Fleet name" autoFocus
                                                    onKeyDown={e => { if (e.key === 'Enter' && newFleetName.trim()) handleCreateFleetAndAssign(); if (e.key === 'Escape') { setNewFleetInput(false); setNewFleetName('') } }}
                                                    style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', fontSize: '0.82rem', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }} />
                                                <button onClick={handleCreateFleetAndAssign} disabled={!newFleetName.trim()} className="btn-primary" style={{ padding: '3px 8px', fontSize: '0.75rem' }}>Add</button>
                                            </div>
                                        ) : (
                                            <div
                                                onClick={() => setNewFleetInput(true)}
                                                style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.82rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                className="hover-effect"
                                            >
                                                <Plus size={13} /> Create New Fleet
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {hasPermission('vessels:edit') && (
                        <div style={{ position: 'relative' }}>
                            <select
                                onChange={e => {
                                    if (e.target.value === 'active') handleBulkChangeStatus(true)
                                    else if (e.target.value === 'inactive') handleBulkChangeStatus(false)
                                    e.target.value = ''
                                }}
                                defaultValue=""
                                style={{ padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                            >
                                <option value="" disabled>Change Status</option>
                                <option value="active">Set Active</option>
                                <option value="inactive">Set Inactive</option>
                            </select>
                        </div>
                    )}
                    <button
                        className="btn-secondary"
                        onClick={handleBulkExport}
                        style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Download size={13} /> Export Selected
                    </button>
                    <div style={{ flex: 1 }} />
                    <button
                        onClick={() => setSelectedVesselIds(new Set())}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <X size={13} /> Clear
                    </button>
                </div>
            )}

            <div className="glass-card" style={{ padding: '0', overflowX: 'auto', minHeight: '300px' }}>
                {isLoading && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <Loader2 className="spinner" style={{ margin: '0 auto 16px', display: 'block' }} />
                        Loading vessels...
                    </div>
                )}

                {!isLoading && vessels.length === 0 && (
                    <div style={{ padding: '64px 40px', textAlign: 'center' }}>
                        <Ship size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.3 }} />
                        <div style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                            No vessels found
                        </div>
                        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                            {searchTerm ? 'No vessels match your search criteria.' : 'No vessels registered yet. Click "Add Vessel" to get started.'}
                        </p>
                    </div>
                )}

                {!isLoading && vessels.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                        <caption className="sr-only">Vessel registry</caption>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                {selectMode && (
                                <th scope="col" style={{ padding: '14px 8px 14px 16px', width: '40px' }}>
                                    <div
                                        onClick={toggleSelectAll}
                                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--accent-primary)' }}
                                        title={selectedVesselIds.size === vessels.length ? 'Deselect all' : 'Select all'}
                                    >
                                        {selectedVesselIds.size === vessels.length && vessels.length > 0
                                            ? <CheckSquare size={16} />
                                            : <Square size={16} style={{ opacity: 0.4 }} />
                                        }
                                    </div>
                                </th>
                                )}
                                {visibleSet.has('name') && (
                                    <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', fontSize: '0.8rem', color: 'var(--text-secondary)', userSelect: 'none', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            Vessel Name <ArrowUpDown size={13} style={{ opacity: sortField === 'name' ? 1 : 0.3 }} />
                                        </span>
                                    </th>
                                )}
                                {visibleSet.has('imo') && (
                                    <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', fontSize: '0.8rem', color: 'var(--text-secondary)', userSelect: 'none', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => toggleSort('imoNumber')}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            IMO Number <ArrowUpDown size={13} style={{ opacity: sortField === 'imoNumber' ? 1 : 0.3 }} />
                                        </span>
                                    </th>
                                )}
                                {visibleSet.has('sanctions') && (
                                    <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', fontSize: '0.8rem', color: 'var(--text-secondary)', userSelect: 'none', whiteSpace: 'nowrap', width: '120px' }}>Sanctions</th>
                                )}
                                {visibleSet.has('customer') && (
                                    <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', fontSize: '0.8rem', color: 'var(--text-secondary)', userSelect: 'none', whiteSpace: 'nowrap' }}>Customer</th>
                                )}
                                {visibleSet.has('fleet') && (
                                    <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', fontSize: '0.8rem', color: 'var(--text-secondary)', userSelect: 'none', whiteSpace: 'nowrap' }}>Fleet</th>
                                )}
                                {visibleSet.has('actions') && (
                                    <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', fontSize: '0.8rem', color: 'var(--text-secondary)', userSelect: 'none', whiteSpace: 'nowrap', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                            Actions
                                            <ColumnSelector
                                                pageKey="vessels"
                                                allColumns={VESSEL_COLUMNS}
                                                visibleColumns={visibleColumns}
                                                onChange={setVisibleColumns}
                                            />
                                        </div>
                                    </th>
                                )}
                                {!visibleSet.has('actions') && (
                                    <th scope="col" style={{ padding: '14px 16px', textAlign: 'right' }}>
                                        <ColumnSelector
                                            pageKey="vessels"
                                            allColumns={VESSEL_COLUMNS}
                                            visibleColumns={visibleColumns}
                                            onChange={setVisibleColumns}
                                        />
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {vessels.map(v => {
                                const isBulkChecked = selectedVesselIds.has(v.id)
                                return (
                                    <tr key={v.id} style={{ borderBottom: '1px solid var(--table-border)', background: isBulkChecked ? (isLight ? 'rgba(0,150,200,0.06)' : 'rgba(0,210,255,0.04)') : undefined }} className="hover-effect">
                                        {selectMode && (
                                        <td style={{ padding: '16px 8px 16px 16px', width: '40px' }}>
                                            <div
                                                onClick={(e) => { e.stopPropagation(); toggleSelectVessel(v.id) }}
                                                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: isBulkChecked ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                            >
                                                {isBulkChecked ? <CheckSquare size={16} /> : <Square size={16} style={{ opacity: 0.4 }} />}
                                            </div>
                                        </td>
                                        )}
                                        {visibleSet.has('name') && (
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ background: 'var(--bg-card)', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '28px' }}>
                                                    {(() => {
                                                        const fs = flagStates.find(f => f.id === v.flagStateId)
                                                        const flagCls = fs ? getFlagClass(fs.iso3Code) : ''
                                                        return flagCls
                                                            ? <span className={flagCls} style={{ fontSize: '1.2rem' }}></span>
                                                            : <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: '500' }}>N/A</span>
                                                    })()}
                                                </div>
                                                <span
                                                    onClick={() => setSelectedVessel(v)}
                                                    style={{
                                                        fontWeight: '600',
                                                        cursor: 'pointer',
                                                        color: 'var(--accent-primary)',
                                                        textDecoration: 'none',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px'
                                                    }}
                                                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                                >
                                                    {v.name}
                                                    {!v.isActive && (
                                                        <span style={{
                                                            fontSize: '0.65rem',
                                                            background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
                                                            padding: '1px 6px',
                                                            borderRadius: '3px',
                                                            color: 'var(--text-secondary)',
                                                            border: isLight ? '1px solid rgba(0,0,0,0.12)' : '1px solid rgba(255,255,255,0.12)'
                                                        }}>
                                                            INACTIVE
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </td>
                                        )}
                                        {visibleSet.has('imo') && (
                                        <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                                            <Hash size={14} style={{ marginRight: '4px' }} /> {v.imoNumber}
                                        </td>
                                        )}
                                        {visibleSet.has('sanctions') && (
                                        <td style={{ padding: '16px' }}>
                                            <OfacBadge vessel={v} />
                                        </td>
                                        )}
                                        {visibleSet.has('customer') && (
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ position: 'relative' }}>
                                                {editingCustomerVesselId === v.id ? (
                                                    <>
                                                        <input
                                                            type="text"
                                                            value={tableCustomerSearch}
                                                            onChange={e => setTableCustomerSearch(e.target.value)}
                                                            autoFocus
                                                            onBlur={() => setTimeout(() => setEditingCustomerVesselId(null), 200)}
                                                            placeholder="Search customer..."
                                                            style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem', width: '200px', boxSizing: 'border-box' }}
                                                            aria-label="Search customer"
                                                        />
                                                        <div style={{
                                                            position: 'absolute', top: '100%', left: 0, zIndex: 100,
                                                            marginTop: '4px', padding: '4px', maxHeight: '150px', overflowY: 'auto',
                                                            background: isLight ? '#ffffff' : '#1e222a', minWidth: '200px',
                                                            border: '1px solid var(--accent-primary)', borderRadius: '8px',
                                                            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                                                        }}>
                                                            <div onClick={() => { handleUpdateCustomer(v.id, '', ''); setEditingCustomerVesselId(null); }}
                                                                style={{ padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)' }} className="hover-effect">
                                                                None
                                                            </div>
                                                            {entities.filter(e => !tableCustomerSearch || e.name.toLowerCase().includes(tableCustomerSearch.toLowerCase())).map(ent => (
                                                                <div key={ent.id}
                                                                    onClick={() => { setCustomerTypePrompt({ vesselId: v.id, customerId: ent.id }); setEditingCustomerVesselId(null); }}
                                                                    style={{ padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }} className="hover-effect">
                                                                    {ent.name}
                                                                </div>
                                                            ))}
                                                            {tableCustomerSearch && entities.filter(e => e.name.toLowerCase().includes(tableCustomerSearch.toLowerCase())).length === 0 && (
                                                                <div
                                                                    onClick={async () => {
                                                                        const newEntity = await window.api.addEntity({ name: tableCustomerSearch, type: 'company' })
                                                                        const eData = await window.api.getEntities()
                                                                        setEntities(Array.isArray(eData) ? eData : [])
                                                                        setCustomerTypePrompt({ vesselId: v.id, customerId: newEntity.id })
                                                                        setEditingCustomerVesselId(null)
                                                                    }}
                                                                    style={{ padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--accent-primary)' }}
                                                                    className="hover-effect">
                                                                    + Create &quot;{tableCustomerSearch}&quot;
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div
                                                        onClick={() => { setEditingCustomerVesselId(v.id); setTableCustomerSearch(''); }}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: v.customerId ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', width: '200px', boxSizing: 'border-box' }}
                                                    >
                                                        <span style={{ flex: 1 }}>
                                                            {v.customerId ? `${entities.find(e => e.id === v.customerId)?.name || 'Unknown'}` : 'None'}
                                                            {v.customerType ? ` (${v.customerType})` : ''}
                                                        </span>
                                                        <ChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        )}
                                        {visibleSet.has('fleet') && (
                                        <td style={{ padding: '16px' }}>
                                            <select
                                                value={v.fleetId || ''}
                                                onChange={e => handleUpdateFleet(v.id, e.target.value)}
                                                style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)', fontFamily: 'inherit', width: '200px' }}
                                                aria-label="Assign fleet"
                                            >
                                                <option value="">Standalone</option>
                                                {fleets.map(f => (
                                                    <option key={f.id} value={f.id}>{f.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        )}
                                        {visibleSet.has('actions') && (
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <button onClick={() => setSelectedVessel(v)} className="btn-secondary" style={{ padding: '6px 8px', display: 'inline-flex', alignItems: 'center' }} aria-label="View details">
                                                <ChevronRight size={16} />
                                            </button>
                                        </td>
                                        )}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}

                {/* Pagination Controls */}
                {!isLoading && totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderTop: '1px solid var(--table-border)' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} vessels
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                                className="btn-secondary"
                                disabled={page === 1}
                                onClick={() => setPage(1)}
                                style={{ padding: '6px' }}
                                title="First Page"
                                aria-label="First page"
                            >
                                <ChevronsLeft size={16} />
                            </button>
                            <button
                                className="btn-secondary"
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                style={{ padding: '6px' }}
                                title="Previous Page"
                                aria-label="Previous page"
                            >
                                <ChevronLeft size={16} />
                            </button>

                            <span style={{ margin: '0 8px', fontSize: '0.9rem' }}>
                                Page {page} of {totalPages}
                            </span>

                            <button
                                className="btn-secondary"
                                disabled={page === totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                style={{ padding: '6px' }}
                                title="Next Page"
                                aria-label="Next page"
                            >
                                <ChevronRight size={16} />
                            </button>
                            <button
                                className="btn-secondary"
                                disabled={page === totalPages}
                                onClick={() => setPage(totalPages)}
                                style={{ padding: '6px' }}
                                title="Last Page"
                                aria-label="Last page"
                            >
                                <ChevronsRight size={16} />
                            </button>

                            <select
                                value={limit}
                                onChange={(e) => setLimit(Number(e.target.value))}
                                style={{ marginLeft: '16px', padding: '6px 8px', borderRadius: '6px', fontSize: '0.85rem', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                                aria-label="Vessels per page"
                            >
                                <option value="10">10 / page</option>
                                <option value="25">25 / page</option>
                                <option value="50">50 / page</option>
                                <option value="100">100 / page</option>
                            </select>
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

            {customerTypePrompt && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ padding: '28px', maxWidth: '360px', width: '90%', background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '16px', border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', color: 'var(--text-primary)' }}>Customer Type</h3>
                        <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            How is this customer related to the vessel?
                        </p>
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                            <button
                                onClick={() => {
                                    if (customerTypePrompt.vesselId) {
                                        handleUpdateCustomer(customerTypePrompt.vesselId, customerTypePrompt.customerId, 'broker')
                                    } else {
                                        setNewVessel({ ...newVessel, customerId: customerTypePrompt.customerId, customerType: 'broker' })
                                        setCustomerSearch('')
                                    }
                                    setCustomerTypePrompt(null)
                                }}
                                className="btn-primary" style={{ flex: 1, padding: '10px' }}>
                                Broker
                            </button>
                            <button
                                onClick={() => {
                                    if (customerTypePrompt.vesselId) {
                                        handleUpdateCustomer(customerTypePrompt.vesselId, customerTypePrompt.customerId, 'direct')
                                    } else {
                                        setNewVessel({ ...newVessel, customerId: customerTypePrompt.customerId, customerType: 'direct' })
                                        setCustomerSearch('')
                                    }
                                    setCustomerTypePrompt(null)
                                }}
                                className="btn-secondary" style={{ flex: 1, padding: '10px' }}>
                                Direct Client
                            </button>
                        </div>
                        <button onClick={() => setCustomerTypePrompt(null)} className="btn-secondary" style={{ width: '100%' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
