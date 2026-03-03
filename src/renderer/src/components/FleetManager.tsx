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
  HelpCircle,
  X,
  Plus,
  Check,
  ExternalLink,
  UserMinus,
} from 'lucide-react'
import { Fleet, Vessel, Entity, FlagState } from '../../../shared/types'
import { getFlagClass } from '../utils/countryCodeMap'
import 'flag-icons/css/flag-icons.min.css'
import FleetDetail from './FleetDetail'
import VesselDetail from './VesselDetail'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'

interface CustomerGroup {
  entity: Entity
  vessels: Vessel[]
}

export default function FleetManager() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { showSuccess } = useToast()

  // --- data state ---
  const [fleets, setFleets] = useState<Fleet[]>([])
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [flagStates, setFlagStates] = useState<FlagState[]>([])

  // --- navigation ---
  const [selectedFleetDetail, setSelectedFleetDetail] = useState<Fleet | null>(null)
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null)

  // --- panel state ---
  const [panelFleet, setPanelFleet] = useState<Fleet | null>(null)
  // "Add vessels" section
  const [addOpen, setAddOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [pendingAdd, setPendingAdd] = useState<Set<string>>(new Set())
  const [addSaving, setAddSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // --- ui state ---
  const [viewMode, setViewMode] = useState<'fleets' | 'customers'>('fleets')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newFleetName, setNewFleetName] = useState('')
  const [fleetSearch, setFleetSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'broker' | 'direct'>('all')
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(['Brokers', 'Direct Clients', 'Unassigned'])
  )

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async (): Promise<Vessel[]> => {
    const [fData, vData, eData, fsData] = await Promise.all([
      window.api.getFleets(),
      window.api.getVessels(),
      window.api.getEntities(),
      window.api.getFlagStates(),
    ])
    setFleets(fData)
    setVessels(vData)
    setEntities(eData)
    setFlagStates(fsData)
    return vData
  }

  const openPanel = (fleet: Fleet) => {
    setPanelFleet(fleet)
    setAddOpen(false)
    setAddSearch('')
    setPendingAdd(new Set())
  }

  const handleAddFleet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFleetName.trim()) return
    const fleet = await window.api.addFleet({ name: newFleetName })
    setNewFleetName('')
    setShowAddForm(false)
    await loadData()
    openPanel(fleet)
    showSuccess(`Fleet "${fleet.name}" created`)
  }

  const handleDeleteFleet = async (fleet: Fleet) => {
    if (!confirm(`Delete "${fleet.name}"? All vessels will be unassigned.`)) return
    await window.api.deleteFleet(fleet.id)
    if (panelFleet?.id === fleet.id) setPanelFleet(null)
    await loadData()
    showSuccess(`Fleet "${fleet.name}" deleted`)
  }

  const handleRemoveVessel = async (vessel: Vessel) => {
    setRemovingId(vessel.id)
    try {
      await window.api.updateVessel(vessel.id, { fleetId: null as any })
      await loadData()
      showSuccess(`${vessel.name} removed from fleet`)
    } finally {
      setRemovingId(null)
    }
  }

  const handleAddSelected = async () => {
    if (!panelFleet || pendingAdd.size === 0) return
    setAddSaving(true)
    try {
      await Promise.all(
        [...pendingAdd].map(id => window.api.updateVessel(id, { fleetId: panelFleet.id }))
      )
      await loadData()
      setPendingAdd(new Set())
      setAddOpen(false)
      setAddSearch('')
      showSuccess(
        `${pendingAdd.size} vessel${pendingAdd.size !== 1 ? 's' : ''} added to ${panelFleet.name}`
      )
    } finally {
      setAddSaving(false)
    }
  }

  const togglePending = (id: string) => {
    setPendingAdd(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Stats
  const assignedCount = useMemo(() => vessels.filter(v => v.fleetId).length, [vessels])
  const unassignedCount = useMemo(() => vessels.filter(v => !v.fleetId).length, [vessels])

  // Filtered fleet list
  const filteredFleets = useMemo(() => {
    if (!fleetSearch.trim()) return fleets
    const s = fleetSearch.toLowerCase()
    return fleets.filter(f => f.name.toLowerCase().includes(s))
  }, [fleets, fleetSearch])

  // Panel: vessels already in this fleet
  const fleetVessels = useMemo(
    () => (panelFleet ? vessels.filter(v => v.fleetId === panelFleet.id) : []),
    [panelFleet, vessels]
  )

  // Panel: vessels available to add (not in this fleet), filtered by search
  const availableVessels = useMemo(() => {
    if (!panelFleet) return []
    const base = vessels.filter(v => v.fleetId !== panelFleet.id)
    if (!addSearch.trim()) return base
    const s = addSearch.toLowerCase()
    return base.filter(
      v => v.name.toLowerCase().includes(s) || v.imoNumber.toLowerCase().includes(s)
    )
  }, [panelFleet, vessels, addSearch])

  // Customer grouping
  const { brokerGroups, directGroups, customerUnassigned } = useMemo(() => {
    const search = customerSearch.toLowerCase()
    const brokerMap = new Map<string, CustomerGroup>()
    const directMap = new Map<string, CustomerGroup>()
    const unassignedList: Vessel[] = []

    for (const vessel of vessels) {
      if (search) {
        const customerEntity = vessel.customerId
          ? entities.find(e => e.id === vessel.customerId)
          : null
        const customerName = customerEntity?.name?.toLowerCase() || ''
        const vesselMatch =
          vessel.name.toLowerCase().includes(search) ||
          vessel.imoNumber.toLowerCase().includes(search)
        if (!vesselMatch && !customerName.includes(search)) continue
      }

      if (!vessel.customerId || !vessel.customerType) {
        if (typeFilter === 'all' || typeFilter === 'direct') unassignedList.push(vessel)
        continue
      }

      if (typeFilter !== 'all' && vessel.customerType !== typeFilter) continue

      const map = vessel.customerType === 'broker' ? brokerMap : directMap
      const existing = map.get(vessel.customerId)
      if (existing) {
        existing.vessels.push(vessel)
      } else {
        const entity = entities.find(e => e.id === vessel.customerId)
        if (entity) map.set(vessel.customerId, { entity, vessels: [vessel] })
        else unassignedList.push(vessel)
      }
    }

    const sortGroups = (g: CustomerGroup[]) =>
      g.sort((a, b) => a.entity.name.localeCompare(b.entity.name))

    return {
      brokerGroups: sortGroups(Array.from(brokerMap.values())),
      directGroups: sortGroups(Array.from(directMap.values())),
      customerUnassigned: unassignedList,
    }
  }, [vessels, entities, customerSearch, typeFilter])

  // ------- Navigation -------
  if (selectedFleetDetail) {
    return (
      <FleetDetail
        fleet={selectedFleetDetail}
        onBack={() => {
          setSelectedFleetDetail(null)
          loadData()
        }}
      />
    )
  }
  if (selectedVessel) {
    return (
      <VesselDetail
        vessel={selectedVessel}
        backLabel="Back to Fleet Management"
        onBack={() => {
          setSelectedVessel(null)
          loadData()
        }}
      />
    )
  }

  // ------- Helpers -------

  const VesselFlag = ({ vessel }: { vessel: Vessel }) => {
    const fs = flagStates.find(f => f.id === vessel.flagStateId)
    const cls = fs ? getFlagClass(fs.iso3Code) : ''
    return cls ? <span className={cls} style={{ fontSize: '0.95rem', opacity: 0.85 }} /> : null
  }

  const renderCustomerVesselRow = (vessel: Vessel) => {
    const fleet = fleets.find(f => f.id === vessel.fleetId)
    const fs = flagStates.find(f => f.id === vessel.flagStateId)
    const flagCls = fs ? getFlagClass(fs.iso3Code) : ''
    return (
      <tr key={vessel.id} style={{ borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
        <td style={{ padding: '10px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Ship size={14} color="var(--accent-primary)" />
            <span
              style={{
                fontWeight: 600,
                cursor: 'pointer',
                color: 'var(--accent-primary)',
                textTransform: 'uppercase',
              }}
              onClick={() => setSelectedVessel(vessel)}
            >
              {vessel.name}
            </span>
            {!vessel.isActive && (
              <span
                style={{
                  fontSize: '0.6rem',
                  background: 'rgba(0,0,0,0.1)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  color: 'var(--text-secondary)',
                  border: '1px solid rgba(0,0,0,0.1)',
                }}
              >
                INACTIVE
              </span>
            )}
          </div>
        </td>
        <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {vessel.imoNumber}
        </td>
        <td style={{ padding: '10px 16px' }}>
          {flagCls ? (
            <span className={flagCls} style={{ fontSize: '1.05rem' }} />
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>—</span>
          )}
        </td>
        <td style={{ padding: '10px 16px' }}>
          {fleet ? (
            <span
              style={{
                fontSize: '0.75rem',
                background: 'rgba(0,210,255,0.1)',
                color: 'var(--accent-primary)',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(0,210,255,0.2)',
              }}
            >
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
      <div
        key={group.entity.id}
        className="glass-card"
        style={{ padding: 0, marginBottom: '10px', overflow: 'hidden' }}
      >
        <div
          onClick={() =>
            setExpandedCustomers(prev => {
              const next = new Set(prev)
              if (next.has(group.entity.id)) next.delete(group.entity.id)
              else next.add(group.entity.id)
              return next
            })
          }
          style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
          className="hover-effect"
        >
          {isExpanded ? (
            <ChevronDown size={15} color="var(--text-secondary)" />
          ) : (
            <ChevronRight size={15} color="var(--text-secondary)" />
          )}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(0,210,255,0.25), rgba(0,210,255,0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Building2 size={16} color="var(--accent-primary)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.93rem' }}>{group.entity.name}</div>
            {group.entity.identifier && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.77rem' }}>
                {group.entity.identifier}
              </div>
            )}
          </div>
          <span
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Ship size={13} /> {group.vessels.length}
          </span>
        </div>
        {isExpanded && (
          <div style={{ borderTop: '1px solid var(--table-border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <caption className="sr-only">Vessels for {group.entity.name}</caption>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)' }}>
                  {['VESSEL', 'IMO', 'FLAG', 'FLEET'].map(h => (
                    <th
                      key={h}
                      scope="col"
                      style={{
                        padding: '8px 16px',
                        textAlign: 'left',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        fontWeight: 500,
                        letterSpacing: '0.04em',
                        width: h === 'FLAG' ? 60 : undefined,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{group.vessels.map(renderCustomerVesselRow)}</tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  const renderCustomerSection = (
    title: string,
    icon: React.ReactNode,
    groups: CustomerGroup[],
    badge?: string
  ) => {
    if (groups.length === 0) return null
    const isCollapsed = collapsedSections.has(title)
    const totalVessels = groups.reduce((sum, g) => sum + g.vessels.length, 0)
    return (
      <section className="glass-card" style={{ padding: '20px', marginBottom: '14px' }}>
        <div
          onClick={() =>
            setCollapsedSections(prev => {
              const next = new Set(prev)
              if (next.has(title)) next.delete(title)
              else next.add(title)
              return next
            })
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            marginBottom: isCollapsed ? 0 : '16px',
            userSelect: 'none',
          }}
        >
          {isCollapsed ? (
            <ChevronRight size={15} color="var(--text-secondary)" />
          ) : (
            <ChevronDown size={15} color="var(--text-secondary)" />
          )}
          {icon}
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
          {badge && (
            <span
              style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'rgba(0,210,255,0.1)',
                color: 'var(--accent-primary)',
                border: '1px solid rgba(0,210,255,0.2)',
                fontWeight: 600,
              }}
            >
              {badge}
            </span>
          )}
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            {groups.length} client{groups.length !== 1 ? 's' : ''} ·{' '}
            {totalVessels} vessel{totalVessels !== 1 ? 's' : ''}
          </span>
        </div>
        {!isCollapsed && groups.map(renderCustomerGroup)}
      </section>
    )
  }

  // ------- Main render -------
  return (
    <div className="fade-in">
      {/* Header */}
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '4px' }}>Fleet Management</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Manage fleets and view vessels by customer.
        </p>
      </header>

      {/* Stats */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}
      >
        {[
          {
            label: 'Total Fleets',
            value: fleets.length,
            icon: <Folder size={20} color="#00d2ff" />,
            bg: 'rgba(0,210,255,0.15)',
          },
          {
            label: 'Assigned Vessels',
            value: assignedCount,
            icon: <Ship size={20} color="#10b981" />,
            bg: 'rgba(16,185,129,0.15)',
          },
          {
            label: 'Unassigned',
            value: unassignedCount,
            icon: <HelpCircle size={20} color={unassignedCount > 0 ? '#f59e0b' : '#10b981'} />,
            bg: unassignedCount > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
          },
        ].map(s => (
          <div
            key={s.label}
            className="glass-card"
            style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: s.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          marginBottom: '20px',
          borderBottom: '1px solid var(--table-border)',
        }}
      >
        {(['fleets', 'customers'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              padding: '10px 22px',
              background: 'none',
              border: 'none',
              borderBottom:
                viewMode === mode ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: viewMode === mode ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: viewMode === mode ? 600 : 400,
              fontSize: '0.9rem',
              transition: 'var(--transition)',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              marginBottom: '-1px',
            }}
          >
            {mode === 'fleets' ? (
              <>
                <Folder size={15} /> By Fleet
              </>
            ) : (
              <>
                <Users size={15} /> By Customer
              </>
            )}
          </button>
        ))}
      </div>

      {/* ===== FLEET VIEW ===== */}
      {viewMode === 'fleets' ? (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          {/* Left: table */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
                <Search
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
                  size={14}
                  color="var(--text-secondary)"
                />
                <input
                  type="text"
                  value={fleetSearch}
                  onChange={e => setFleetSearch(e.target.value)}
                  placeholder="Search fleets..."
                  style={{ width: '100%', paddingLeft: '36px' }}
                />
              </div>
              <button
                onClick={() => setShowAddForm(v => !v)}
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap', marginLeft: 'auto' }}
              >
                <Plus size={15} /> Add Fleet
              </button>
            </div>

            {/* Inline add form */}
            {showAddForm && (
              <div className="glass-card" style={{ padding: '14px 18px' }}>
                <form
                  onSubmit={handleAddFleet}
                  style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
                >
                  <FolderPlus size={17} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                  <input
                    type="text"
                    value={newFleetName}
                    onChange={e => setNewFleetName(e.target.value)}
                    placeholder="Fleet name (e.g. Tanker Division)"
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <button type="submit" className="btn-primary" style={{ padding: '8px 16px' }}>
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false)
                      setNewFleetName('')
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      padding: '6px',
                    }}
                  >
                    <X size={17} />
                  </button>
                </form>
              </div>
            )}

            {/* Fleet table */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <caption className="sr-only">Fleets</caption>
                <thead>
                  <tr
                    style={{
                      background: 'var(--table-header-bg)',
                      borderBottom: '1px solid var(--table-border)',
                    }}
                  >
                    {[
                      { label: 'FLEET', width: undefined },
                      { label: 'VESSELS', width: 110 },
                      { label: 'ACTIONS', width: 130, right: true },
                    ].map(h => (
                      <th
                        key={h.label}
                        scope="col"
                        style={{
                          padding: '12px 16px',
                          textAlign: h.right ? 'right' : 'left',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                          letterSpacing: '0.05em',
                          width: h.width,
                        }}
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredFleets.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}
                      >
                        <Folder
                          size={40}
                          style={{ opacity: 0.18, display: 'block', margin: '0 auto 12px' }}
                        />
                        {fleetSearch
                          ? 'No fleets match your search.'
                          : 'No fleets yet. Click "Add Fleet" to get started.'}
                      </td>
                    </tr>
                  ) : (
                    filteredFleets.map(fleet => {
                      const count = vessels.filter(v => v.fleetId === fleet.id).length
                      const inactiveCount = vessels.filter(
                        v => v.fleetId === fleet.id && !v.isActive
                      ).length
                      const isSelected = panelFleet?.id === fleet.id
                      return (
                        <tr
                          key={fleet.id}
                          onClick={() => openPanel(fleet)}
                          style={{
                            borderBottom: '1px solid var(--table-border)',
                            background: isSelected ? 'rgba(0,210,255,0.06)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                          }}
                          className="hover-effect"
                        >
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  background: isSelected
                                    ? 'rgba(0,210,255,0.22)'
                                    : 'rgba(0,210,255,0.1)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                <Folder size={15} color="var(--accent-primary)" />
                              </div>
                              <span style={{ fontWeight: 600, fontSize: '0.93rem' }}>
                                {fleet.name}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Ship size={13} color="var(--text-secondary)" />
                              <span style={{ fontWeight: 600 }}>{count}</span>
                              {inactiveCount > 0 && (
                                <span
                                  style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}
                                >
                                  ({inactiveCount} inactive)
                                </span>
                              )}
                            </div>
                          </td>
                          <td
                            style={{ padding: '14px 16px', textAlign: 'right' }}
                            onClick={e => e.stopPropagation()}
                          >
                            <div
                              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}
                            >
                              <button
                                onClick={() => setSelectedFleetDetail(fleet)}
                                className="btn-secondary"
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '0.8rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                }}
                              >
                                <Eye size={13} /> View
                              </button>
                              <button
                                onClick={() => handleDeleteFleet(fleet)}
                                style={{
                                  background: 'transparent',
                                  color: 'var(--danger)',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '5px',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                title="Delete fleet"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: slide-in panel */}
          {panelFleet && (
            <div
              style={{
                width: 380,
                flexShrink: 0,
                background: isLight ? '#f4f6fb' : '#14172a',
                border: '1px solid var(--glass-border)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                maxHeight: 'calc(100vh - 280px)',
              }}
            >
              {/* Panel header */}
              <div
                style={{
                  padding: '16px 16px 14px',
                  borderBottom: '1px solid var(--glass-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', gap: '11px', alignItems: 'center' }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 9,
                      background:
                        'linear-gradient(135deg, rgba(0,210,255,0.4), rgba(0,210,255,0.12))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Folder size={18} color="var(--accent-primary)" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.97rem', lineHeight: 1.2 }}>
                      {panelFleet.name}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
                      {fleetVessels.length} vessel{fleetVessels.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    onClick={() => handleDeleteFleet(panelFleet)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--danger)',
                      padding: '5px',
                      display: 'flex',
                      alignItems: 'center',
                      opacity: 0.7,
                    }}
                    title="Delete fleet"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={() => setPanelFleet(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      padding: '5px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Current fleet vessels */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Section label */}
                <div
                  style={{
                    padding: '10px 16px 8px',
                    fontSize: '0.71rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.07em',
                    borderBottom: '1px solid var(--glass-border)',
                  }}
                >
                  VESSELS IN FLEET
                </div>

                {fleetVessels.length === 0 ? (
                  <div
                    style={{
                      padding: '28px 16px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <Ship size={28} style={{ opacity: 0.18, display: 'block', margin: '0 auto 10px' }} />
                    No vessels assigned yet.
                  </div>
                ) : (
                  fleetVessels.map(vessel => (
                    <div
                      key={vessel.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '9px',
                        padding: '10px 14px',
                        borderBottom: '1px solid rgba(0,0,0,0.04)',
                        transition: 'background 0.12s',
                      }}
                      className="hover-effect"
                    >
                      <Ship size={13} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            textTransform: 'uppercase',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {vessel.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          IMO {vessel.imoNumber}
                          {!vessel.isActive && (
                            <span style={{ marginLeft: 6, opacity: 0.65 }}>· INACTIVE</span>
                          )}
                        </div>
                      </div>
                      <VesselFlag vessel={vessel} />
                      <button
                        onClick={() => setSelectedVessel(vessel)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          padding: '3px',
                          opacity: 0.5,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Open vessel"
                      >
                        <ExternalLink size={12} />
                      </button>
                      <button
                        onClick={() => handleRemoveVessel(vessel)}
                        disabled={removingId === vessel.id}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--danger)',
                          padding: '3px',
                          opacity: removingId === vessel.id ? 0.4 : 0.7,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Remove from fleet"
                      >
                        <UserMinus size={13} />
                      </button>
                    </div>
                  ))
                )}

                {/* Add vessels section */}
                <div style={{ borderTop: '1px solid var(--glass-border)' }}>
                  <button
                    onClick={() => {
                      setAddOpen(v => !v)
                      setPendingAdd(new Set())
                      setAddSearch('')
                    }}
                    style={{
                      width: '100%',
                      padding: '11px 16px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: 'var(--accent-primary)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    {addOpen ? <ChevronDown size={15} /> : <Plus size={15} />}
                    Add Vessels
                    {!addOpen && availableVessels.length > 0 && (
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: '0.78rem', marginLeft: 2 }}>
                        ({availableVessels.length} available)
                      </span>
                    )}
                  </button>

                  {addOpen && (
                    <div style={{ borderTop: '1px solid var(--glass-border)' }}>
                      {/* Search */}
                      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--glass-border)' }}>
                        <div style={{ position: 'relative' }}>
                          <Search
                            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }}
                            size={13}
                            color="var(--text-secondary)"
                          />
                          <input
                            type="text"
                            value={addSearch}
                            onChange={e => setAddSearch(e.target.value)}
                            placeholder="Filter vessels..."
                            style={{ width: '100%', padding: '6px 8px 6px 28px', fontSize: '0.82rem' }}
                            autoFocus
                          />
                        </div>
                      </div>

                      {/* Vessel checklist */}
                      <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        {availableVessels.length === 0 ? (
                          <div
                            style={{
                              padding: '20px',
                              textAlign: 'center',
                              color: 'var(--text-secondary)',
                              fontSize: '0.83rem',
                            }}
                          >
                            {addSearch ? 'No vessels match.' : 'All vessels are already in this fleet.'}
                          </div>
                        ) : (
                          availableVessels.map(vessel => {
                            const checked = pendingAdd.has(vessel.id)
                            return (
                              <div
                                key={vessel.id}
                                onClick={() => togglePending(vessel.id)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '9px',
                                  padding: '8px 14px',
                                  cursor: 'pointer',
                                  background: checked ? 'rgba(0,210,255,0.07)' : 'transparent',
                                  borderLeft: checked
                                    ? '2px solid var(--accent-primary)'
                                    : '2px solid transparent',
                                  borderBottom: '1px solid rgba(0,0,0,0.04)',
                                  transition: 'background 0.1s',
                                }}
                                className="hover-effect"
                              >
                                <div
                                  style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: 4,
                                    flexShrink: 0,
                                    background: checked ? 'var(--accent-primary)' : 'transparent',
                                    border: checked ? 'none' : '1.5px solid var(--text-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  {checked && <Check size={10} color="#000" strokeWidth={2.5} />}
                                </div>
                                <Ship
                                  size={13}
                                  color={checked ? 'var(--accent-primary)' : 'var(--text-secondary)'}
                                  style={{ flexShrink: 0 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontWeight: checked ? 600 : 400,
                                      fontSize: '0.83rem',
                                      textTransform: 'uppercase',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {vessel.name}
                                  </div>
                                  <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)' }}>
                                    IMO {vessel.imoNumber}
                                  </div>
                                </div>
                                <VesselFlag vessel={vessel} />
                              </div>
                            )
                          })
                        )}
                      </div>

                      {/* Add footer */}
                      {pendingAdd.size > 0 && (
                        <div
                          style={{
                            padding: '10px 12px',
                            borderTop: '1px solid var(--glass-border)',
                            display: 'flex',
                            gap: '8px',
                          }}
                        >
                          <button
                            onClick={handleAddSelected}
                            className="btn-primary"
                            disabled={addSaving}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              fontSize: '0.85rem',
                            }}
                          >
                            {addSaving ? (
                              'Adding...'
                            ) : (
                              <>
                                <Check size={14} /> Add {pendingAdd.size} Vessel{pendingAdd.size !== 1 ? 's' : ''}
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setAddOpen(false)
                              setPendingAdd(new Set())
                              setAddSearch('')
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--glass-border)',
                              cursor: 'pointer',
                              color: 'var(--text-secondary)',
                              padding: '7px 10px',
                              borderRadius: '8px',
                              fontSize: '0.82rem',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ===== CUSTOMER VIEW ===== */
        <>
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginBottom: '20px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '380px' }}>
              <Search
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
                size={14}
                color="var(--text-secondary)"
              />
              <input
                type="text"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Search customers or vessels..."
                style={{ width: '100%', paddingLeft: '36px' }}
              />
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as 'all' | 'broker' | 'direct')}
              style={{ padding: '10px' }}
            >
              <option value="all">All Types</option>
              <option value="broker">Brokers Only</option>
              <option value="direct">Direct Clients Only</option>
            </select>
          </div>

          {(typeFilter === 'all' || typeFilter === 'broker') &&
            renderCustomerSection(
              'Brokers',
              <Building2 size={17} color="#f59e0b" />,
              brokerGroups,
              'BROKER'
            )}
          {(typeFilter === 'all' || typeFilter === 'direct') &&
            renderCustomerSection(
              'Direct Clients',
              <Building2 size={17} color="#10b981" />,
              directGroups,
              'DIRECT'
            )}

          {customerUnassigned.length > 0 &&
            (() => {
              const isCollapsed = collapsedSections.has('Unassigned')
              return (
                <section className="glass-card" style={{ padding: '20px', marginBottom: '14px' }}>
                  <div
                    onClick={() =>
                      setCollapsedSections(prev => {
                        const next = new Set(prev)
                        if (next.has('Unassigned')) next.delete('Unassigned')
                        else next.add('Unassigned')
                        return next
                      })
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      marginBottom: isCollapsed ? 0 : '16px',
                      userSelect: 'none',
                    }}
                  >
                    {isCollapsed ? (
                      <ChevronRight size={15} color="var(--text-secondary)" />
                    ) : (
                      <ChevronDown size={15} color="var(--text-secondary)" />
                    )}
                    <HelpCircle size={17} color="var(--text-secondary)" />
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Unassigned</h3>
                    <span
                      style={{
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                        marginLeft: 'auto',
                      }}
                    >
                      {customerUnassigned.length} vessel
                      {customerUnassigned.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {!isCollapsed && (
                    <div
                      style={{
                        overflow: 'hidden',
                        borderRadius: '8px',
                        border: '1px solid var(--table-border)',
                      }}
                    >
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <caption className="sr-only">Unassigned vessels</caption>
                        <thead>
                          <tr style={{ background: 'var(--table-header-bg)' }}>
                            {['VESSEL', 'IMO', 'FLAG', 'FLEET'].map(h => (
                              <th
                                key={h}
                                scope="col"
                                style={{
                                  padding: '8px 16px',
                                  textAlign: 'left',
                                  fontSize: '0.75rem',
                                  color: 'var(--text-secondary)',
                                  fontWeight: 500,
                                  letterSpacing: '0.04em',
                                  width: h === 'FLAG' ? 60 : undefined,
                                }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>{customerUnassigned.map(renderCustomerVesselRow)}</tbody>
                      </table>
                    </div>
                  )}
                </section>
              )
            })()}

          {brokerGroups.length === 0 &&
            directGroups.length === 0 &&
            customerUnassigned.length === 0 && (
              <div
                className="glass-card"
                style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}
              >
                <Users
                  size={40}
                  style={{ opacity: 0.18, display: 'block', margin: '0 auto 12px' }}
                />
                <p>No vessels match the current filters.</p>
              </div>
            )}
        </>
      )}
    </div>
  )
}
