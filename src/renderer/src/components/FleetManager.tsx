import { useState, useEffect, useMemo } from 'react'
import {
    FolderPlus,
    Trash2,
    Folder,
    Ship,
    Eye,
    ChevronDown,
    ChevronRight,
    Search,
    Building2,
    Users,
    HelpCircle
} from 'lucide-react'
import { Fleet, Vessel, Entity, FlagState } from '../../../shared/types'
import { getFlagClass } from '../utils/countryCodeMap'
import 'flag-icons/css/flag-icons.min.css'
import FleetDetail from './FleetDetail'
import VesselDetail from './VesselDetail'

interface CustomerGroup {
    entity: Entity
    vessels: Vessel[]
}

export default function FleetManager() {
    const [fleets, setFleets] = useState<Fleet[]>([])
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [entities, setEntities] = useState<Entity[]>([])
    const [flagStates, setFlagStates] = useState<FlagState[]>([])

    const [newFleetName, setNewFleetName] = useState('')
    const [selectedFleet, setSelectedFleet] = useState<Fleet | null>(null)
    const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null)

    // Filter/search state
    const [searchTerm, setSearchTerm] = useState('')
    const [typeFilter, setTypeFilter] = useState<'all' | 'broker' | 'direct'>('all')

    // Expanded customers
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set())

    // Collapsed sections
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['Brokers', 'Direct Clients', 'Unassigned']))

    // View mode
    const [viewMode, setViewMode] = useState<'customers' | 'fleets'>('customers')

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const [fData, vData, eData, fsData] = await Promise.all([
            window.api.getFleets(),
            window.api.getVessels(),
            window.api.getEntities(),
            window.api.getFlagStates()
        ])
        setFleets(fData)
        setVessels(vData)
        setEntities(eData)
        setFlagStates(fsData)
    }

    const handleAddFleet = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newFleetName.trim()) return
        const fleet = await window.api.addFleet({ name: newFleetName })
        setNewFleetName('')
        await loadData()
        setSelectedFleet(fleet)
    }

    const handleDeleteFleet = async (id: string) => {
        if (confirm('Delete this fleet? Vessels will be moved to "Standalone".')) {
            await window.api.deleteFleet(id)
            loadData()
        }
    }

    const toggleCustomer = (id: string) => {
        setExpandedCustomers(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleSection = (section: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(section)) next.delete(section)
            else next.add(section)
            return next
        })
    }

    // Group vessels by customer
    const { brokerGroups, directGroups, unassigned } = useMemo(() => {
        const search = searchTerm.toLowerCase()
        const brokerMap = new Map<string, CustomerGroup>()
        const directMap = new Map<string, CustomerGroup>()
        const unassignedList: Vessel[] = []

        for (const vessel of vessels) {
            // Apply search filter
            if (search) {
                const customerEntity = vessel.customerId ? entities.find(e => e.id === vessel.customerId) : null
                const customerName = customerEntity?.name?.toLowerCase() || ''
                const vesselMatch = vessel.name.toLowerCase().includes(search) || vessel.imoNumber.toLowerCase().includes(search)
                const customerMatch = customerName.includes(search)
                if (!vesselMatch && !customerMatch) continue
            }

            if (!vessel.customerId || !vessel.customerType) {
                if (typeFilter === 'all' || typeFilter === 'direct') {
                    unassignedList.push(vessel)
                }
                continue
            }

            if (typeFilter !== 'all' && vessel.customerType !== typeFilter) continue

            const map = vessel.customerType === 'broker' ? brokerMap : directMap
            const existing = map.get(vessel.customerId)
            if (existing) {
                existing.vessels.push(vessel)
            } else {
                const entity = entities.find(e => e.id === vessel.customerId)
                if (entity) {
                    map.set(vessel.customerId, { entity, vessels: [vessel] })
                } else {
                    unassignedList.push(vessel)
                }
            }
        }

        // Sort groups by entity name
        const sortGroups = (groups: CustomerGroup[]) =>
            groups.sort((a, b) => a.entity.name.localeCompare(b.entity.name))

        return {
            brokerGroups: sortGroups(Array.from(brokerMap.values())),
            directGroups: sortGroups(Array.from(directMap.values())),
            unassigned: unassignedList
        }
    }, [vessels, entities, searchTerm, typeFilter])

    // Navigate to fleet detail
    if (selectedFleet) {
        return <FleetDetail fleet={selectedFleet} onBack={() => { setSelectedFleet(null); loadData() }} />
    }

    // Navigate to vessel detail
    if (selectedVessel) {
        return <VesselDetail vessel={selectedVessel} backLabel="Back to Fleet Management" onBack={() => { setSelectedVessel(null); loadData() }} />
    }

    const renderVesselRow = (vessel: Vessel) => {
        const fleet = fleets.find(f => f.id === vessel.fleetId)
        const fs = flagStates.find(f => f.id === vessel.flagStateId)
        const flagCls = fs ? getFlagClass(fs.iso3Code) : ''
        return (
            <tr
                key={vessel.id}
                style={{ borderBottom: '1px solid var(--table-border)' }}
                className="hover-effect"
            >
                <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Ship size={14} color="var(--accent-primary)" />
                        <span
                            style={{ fontWeight: '600', cursor: 'pointer', color: 'var(--accent-primary)' }}
                            onClick={() => setSelectedVessel(vessel)}
                        >
                            {vessel.name}
                        </span>
                        {!vessel.isActive && (
                            <span style={{
                                fontSize: '0.6rem',
                                background: 'rgba(0,0,0,0.1)',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                color: 'var(--text-secondary)',
                                border: '1px solid rgba(0,0,0,0.1)'
                            }}>
                                INACTIVE
                            </span>
                        )}
                    </div>
                </td>
                <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {vessel.imoNumber}
                </td>
                <td style={{ padding: '10px 16px' }}>
                    {flagCls ? <span className={flagCls} style={{ fontSize: '1.1rem' }}></span> : <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>—</span>}
                </td>
                <td style={{ padding: '10px 16px' }}>
                    {fleet ? (
                        <span style={{
                            fontSize: '0.75rem',
                            background: 'rgba(0, 210, 255, 0.1)',
                            color: 'var(--accent-primary)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid rgba(0, 210, 255, 0.2)'
                        }}>
                            {fleet.name}
                        </span>
                    ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>—</span>
                    )}
                </td>
            </tr>
        )
    }

    const renderCustomerGroup = (group: CustomerGroup) => {
        const isExpanded = expandedCustomers.has(group.entity.id)
        return (
            <div key={group.entity.id} className="glass-card" style={{ padding: '0', marginBottom: '12px', overflow: 'hidden' }}>
                <div
                    onClick={() => toggleCustomer(group.entity.id)}
                    style={{
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: 'pointer',
                        transition: 'var(--transition)'
                    }}
                    className="hover-effect"
                >
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <Building2 size={18} color="var(--accent-primary)" />
                    <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: '600' }}>{group.entity.name}</span>
                        {group.entity.identifier && (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '8px' }}>
                                ({group.entity.identifier})
                            </span>
                        )}
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)'
                    }}>
                        <Ship size={14} /> {group.vessels.length} vessel{group.vessels.length !== 1 ? 's' : ''}
                    </div>
                </div>
                {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--table-border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Vessels for {group.entity.name}</caption>
                            <thead>
                                <tr style={{ background: 'var(--table-header-bg)' }}>
                                    <th scope="col" style={{ padding: '8px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Vessel</th>
                                    <th scope="col" style={{ padding: '8px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>IMO</th>
                                    <th scope="col" style={{ padding: '8px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', width: '60px' }}>Flag</th>
                                    <th scope="col" style={{ padding: '8px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Fleet</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.vessels.map(renderVesselRow)}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )
    }

    const renderSection = (title: string, icon: React.ReactNode, groups: CustomerGroup[], badge?: string) => {
        const isCollapsed = collapsedSections.has(title)
        const totalVessels = groups.reduce((sum, g) => sum + g.vessels.length, 0)
        if (groups.length === 0 && title !== 'Unassigned') return null
        return (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
                <div
                    onClick={() => toggleSection(title)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        marginBottom: isCollapsed ? '0' : '16px',
                        userSelect: 'none'
                    }}
                >
                    {isCollapsed ? <ChevronRight size={18} color="var(--accent-primary)" /> : <ChevronDown size={18} color="var(--accent-primary)" />}
                    {icon}
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h3>
                    {badge && (
                        <span style={{
                            fontSize: '0.75rem',
                            padding: '2px 10px',
                            borderRadius: '12px',
                            background: 'rgba(0, 210, 255, 0.1)',
                            color: 'var(--accent-primary)',
                            border: '1px solid rgba(0, 210, 255, 0.2)'
                        }}>
                            {badge}
                        </span>
                    )}
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {groups.length} customer{groups.length !== 1 ? 's' : ''} &middot; {totalVessels} vessel{totalVessels !== 1 ? 's' : ''}
                    </span>
                </div>
                {!isCollapsed && groups.map(renderCustomerGroup)}
            </section>
        )
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Fleet Management</h1>
                <p style={{ color: 'var(--text-secondary)' }}>View vessels grouped by customer, manage fleets, and export reports.</p>
            </header>

            {/* View toggle */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', alignItems: 'center' }}>
                <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                    <button
                        onClick={() => setViewMode('customers')}
                        style={{
                            padding: '8px 16px',
                            background: viewMode === 'customers' ? 'var(--accent-primary)' : 'transparent',
                            color: viewMode === 'customers' ? '#000' : 'var(--text-primary)',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.85rem',
                            fontWeight: viewMode === 'customers' ? '600' : '400'
                        }}
                    >
                        <Users size={16} /> By Customer
                    </button>
                    <button
                        onClick={() => setViewMode('fleets')}
                        style={{
                            padding: '8px 16px',
                            background: viewMode === 'fleets' ? 'var(--accent-primary)' : 'transparent',
                            color: viewMode === 'fleets' ? '#000' : 'var(--text-primary)',
                            border: 'none',
                            borderLeft: '1px solid var(--glass-border)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.85rem',
                            fontWeight: viewMode === 'fleets' ? '600' : '400'
                        }}
                    >
                        <Folder size={16} /> By Fleet
                    </button>
                </div>
            </div>

            {viewMode === 'customers' ? (
                <>
                    {/* Search & Filter */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '400px' }}>
                            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={16} />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search customers or vessels..."
                                style={{ width: '100%', paddingLeft: '36px' }}
                                aria-label="Search customers or vessels"
                            />
                        </div>
                        <select
                            value={typeFilter}
                            onChange={e => setTypeFilter(e.target.value as any)}
                            style={{ padding: '10px' }}
                            aria-label="Filter by customer type"
                        >
                            <option value="all">All Types</option>
                            <option value="broker">Brokers Only</option>
                            <option value="direct">Direct Clients Only</option>
                        </select>
                    </div>

                    {/* Brokers */}
                    {(typeFilter === 'all' || typeFilter === 'broker') && brokerGroups.length > 0 &&
                        renderSection('Brokers', <Building2 size={20} color="#f59e0b" />, brokerGroups, 'BROKER')
                    }

                    {/* Direct Clients */}
                    {(typeFilter === 'all' || typeFilter === 'direct') && directGroups.length > 0 &&
                        renderSection('Direct Clients', <Building2 size={20} color="#10b981" />, directGroups, 'DIRECT')
                    }

                    {/* Unassigned */}
                    {unassigned.length > 0 && (
                        <section className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
                            <div
                                onClick={() => toggleSection('Unassigned')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    cursor: 'pointer',
                                    marginBottom: collapsedSections.has('Unassigned') ? '0' : '16px',
                                    userSelect: 'none'
                                }}
                            >
                                {collapsedSections.has('Unassigned') ? <ChevronRight size={18} color="var(--accent-primary)" /> : <ChevronDown size={18} color="var(--accent-primary)" />}
                                <HelpCircle size={20} color="var(--text-secondary)" />
                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Unassigned</h3>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {unassigned.length} vessel{unassigned.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            {!collapsedSections.has('Unassigned') && (
                                <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <caption className="sr-only">Unassigned vessels</caption>
                                        <thead>
                                            <tr style={{ background: 'var(--table-header-bg)' }}>
                                                <th scope="col" style={{ padding: '8px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Vessel</th>
                                                <th scope="col" style={{ padding: '8px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>IMO</th>
                                                <th scope="col" style={{ padding: '8px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', width: '60px' }}>Flag</th>
                                                <th scope="col" style={{ padding: '8px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Fleet</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {unassigned.map(renderVesselRow)}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    )}

                    {brokerGroups.length === 0 && directGroups.length === 0 && unassigned.length === 0 && (
                        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <Users size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                            <p>No vessels match the current filters.</p>
                        </div>
                    )}
                </>
            ) : (
                /* Fleet view - original fleet management */
                <>
                    <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FolderPlus size={20} color="var(--accent-primary)" /> Create New Fleet
                        </h3>
                        <form onSubmit={handleAddFleet} style={{ display: 'flex', gap: '12px' }}>
                            <input
                                type="text"
                                value={newFleetName}
                                onChange={e => setNewFleetName(e.target.value)}
                                style={{ flex: 1 }}
                                placeholder="e.g. Tanker Division"
                                aria-label="Fleet name"
                            />
                            <button type="submit" className="btn-primary">Add Fleet</button>
                        </form>
                    </section>

                    <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Fleets</caption>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th scope="col" style={{ padding: '16px' }}>Fleet Name</th>
                                    <th scope="col" style={{ padding: '16px', width: '120px' }}>Vessels</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fleets.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            No fleets created yet.
                                        </td>
                                    </tr>
                                ) : fleets.map(fleet => {
                                    const count = vessels.filter(v => v.fleetId === fleet.id).length
                                    return (
                                        <tr key={fleet.id} style={{ borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <Folder size={18} color="var(--accent-primary)" />
                                                    <span style={{ fontWeight: '600' }}>{fleet.name}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                    <Ship size={14} /> {count}
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                    <button
                                                        onClick={() => setSelectedFleet(fleet)}
                                                        className="btn-primary"
                                                        style={{ padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                                                    >
                                                        <Eye size={14} /> View
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteFleet(fleet.id)}
                                                        style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer', padding: '6px' }}
                                                        title="Delete Fleet"
                                                        aria-label="Delete fleet"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    )
}
