import React, { useState, useEffect } from 'react'
import { Ship, ChevronRight, Hash, Search, Filter, ArrowUpDown, Shield, ShieldCheck, ShieldAlert, RefreshCw, Loader2, ChevronLeft, ChevronsLeft, ChevronsRight, Plus, X } from 'lucide-react'
import { Vessel, Fleet, Entity, SanctionsMatch, VesselQueryParams, FlagState } from '../../../shared/types'
import { getFlagClass } from '../utils/countryCodeMap'
import 'flag-icons/css/flag-icons.min.css'
import { OfacService } from '../services/OfacService'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import VesselDetail from './VesselDetail'
import SanctionsModal from './SanctionsModal'


// Simple debounce hook implementation if not available
function useDebounceValue<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay)
        return () => clearTimeout(handler)
    }, [value, delay])
    return debouncedValue
}

export default function VesselManager({ initialVesselId, initialVesselSection, onClearInitialVessel }: { initialVesselId?: string | null; initialVesselSection?: 'documents' | 'surveys'; onClearInitialVessel?: () => void } = {}) {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [fleets, setFleets] = useState<Fleet[]>([])
    const [entities, setEntities] = useState<Entity[]>([])
    const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null)
    const { showError, showSuccess } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    // Pagination State
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(10)
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
            setFleets(fData)
            setEntities(eData)
            setFlagStates(fsData)
        }
        loadStaticData()
    }, [])

    // Open vessel by ID from external navigation
    useEffect(() => {
        if (initialVesselId) {
            (async () => {
                const allVessels = await window.api.getVessels()
                const vessel = allVessels.find((v: Vessel) => v.id === initialVesselId)
                if (vessel) setSelectedVessel(vessel)
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
            setVessels(result.data)
            setTotal(result.total)
            setTotalPages(result.totalPages)
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
            await window.api.updateVessel(vessel.id, {
                ofacCheckedAt: result.timestamp,
                ofacMatchFound: result.matchFound,
                ofacStatus: result.status
            })
            loadData()

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
                    cursor: isPotentialMatch ? 'pointer' : 'default'
                }}
                title={
                    isError ? 'API request failed. Click refresh to try again.' :
                        isPotentialMatch ? 'Click to review potential matches' :
                            `Last checked: ${vessel.ofacCheckedAt ? new Date(vessel.ofacCheckedAt).toLocaleString() : 'Never'}`
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
        return <VesselDetail vessel={selectedVessel} backLabel="Back to Vessels" onBack={() => { setSelectedVessel(null); loadData() }} initialSection={initialVesselSection} />
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Vessel Registry</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Search, filter, and manage all vessels across your fleets.</p>
                </div>
                <button
                    onClick={() => setShowQuickAdd(!showQuickAdd)}
                    className={showQuickAdd ? 'btn-secondary' : 'btn-primary'}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
                >
                    {showQuickAdd ? <X size={20} /> : <Plus size={20} />}
                    {showQuickAdd ? 'Cancel' : 'Add Vessel'}
                </button>
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
                                                setEntities(eData)
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
                        style={{ padding: '10px', borderRadius: '12px', color: 'var(--text-primary)' }}
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
                        style={{ padding: '10px', borderRadius: '12px', color: 'var(--text-primary)' }}
                        aria-label="Filter by status"
                    >
                        <option value="active">Active Only</option>
                        <option value="inactive">Inactive Only</option>
                        <option value="all">All Vessels</option>
                    </select>
                </div>
            </div>

            <div className="glass-card" style={{ padding: '0', overflowX: 'auto', minHeight: '300px' }}>
                {isLoading && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <Loader2 className="spinner" style={{ margin: '0 auto 16px', display: 'block' }} />
                        Loading vessels...
                    </div>
                )}

                {!isLoading && vessels.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No vessels found matching your criteria.
                    </div>
                )}

                {!isLoading && vessels.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                        <caption className="sr-only">Vessel registry</caption>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                <th scope="col" style={{ padding: '16px', cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                                    Vessel Name <ArrowUpDown size={14} style={{ opacity: sortField === 'name' ? 1 : 0.3 }} />
                                </th>
                                <th scope="col" style={{ padding: '16px', cursor: 'pointer' }} onClick={() => toggleSort('imoNumber')}>
                                    IMO Number <ArrowUpDown size={14} style={{ opacity: sortField === 'imoNumber' ? 1 : 0.3 }} />
                                </th>
                                <th scope="col" style={{ padding: '16px', width: '100px' }}>Sanctions</th>
                                <th scope="col" style={{ padding: '16px' }}>Customer</th>
                                <th scope="col" style={{ padding: '16px' }}>Current Fleet</th>
                                <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vessels.map(v => {
                                return (
                                    <tr key={v.id} style={{ borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
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
                                                            background: 'rgba(0,0,0,0.1)',
                                                            padding: '1px 6px',
                                                            borderRadius: '3px',
                                                            color: 'var(--text-secondary)',
                                                            border: '1px solid rgba(0,0,0,0.1)'
                                                        }}>
                                                            INACTIVE
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                                            <Hash size={14} style={{ marginRight: '4px' }} /> {v.imoNumber}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <OfacBadge vessel={v} />
                                        </td>
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
                                                            style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem', width: '160px' }}
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
                                                                        setEntities(eData)
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
                                                    <span
                                                        onClick={() => { setEditingCustomerVesselId(v.id); setTableCustomerSearch(''); }}
                                                        style={{ cursor: 'pointer', fontSize: '0.85rem', color: v.customerId ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                                                    >
                                                        {v.customerId ? `${entities.find(e => e.id === v.customerId)?.name || 'Unknown'}` : 'None'}
                                                        {v.customerType ? ` (${v.customerType})` : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <select
                                                value={v.fleetId || ''}
                                                onChange={e => handleUpdateFleet(v.id, e.target.value)}
                                                style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                                                aria-label="Assign fleet"
                                            >
                                                <option value="">Standalone</option>
                                                {fleets.map(f => (
                                                    <option key={f.id} value={f.id}>{f.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <button onClick={() => setSelectedVessel(v)} className="btn-secondary" style={{ padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                Details <ChevronRight size={16} />
                                            </button>
                                        </td>
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
                                style={{ marginLeft: '16px', padding: '4px', borderRadius: '4px', fontSize: '0.9rem' }}
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
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="glass-card" style={{ padding: '24px', maxWidth: '360px', width: '90%' }}>
                        <h3 style={{ marginBottom: '16px' }}>Customer Type</h3>
                        <p style={{ marginBottom: '20px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            How is this customer related?
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
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
                                className="btn-primary" style={{ flex: 1, padding: '12px' }}>
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
                                className="btn-primary" style={{ flex: 1, padding: '12px' }}>
                                Direct
                            </button>
                        </div>
                        <button onClick={() => setCustomerTypePrompt(null)} className="btn-secondary" style={{ width: '100%', marginTop: '12px' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
