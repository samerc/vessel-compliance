import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Trash2, Pencil, X, Search, Globe, Anchor, Building2,
  CheckCircle2, XCircle, Mail
} from 'lucide-react'
import { FlagState, FlagStatePort } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { getFlagClass, countryNameToIso3 } from '../utils/countryCodeMap'
import ConfirmationModal from './ConfirmationModal'
import 'flag-icons/css/flag-icons.min.css'

interface FlagStateDirectoryProps {
  onNavigateToVessel?: (vesselId: string) => void
}

export default function FlagStateDirectory(_props: FlagStateDirectoryProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { showSuccess, showError } = useToast()
  const { hasPermission } = useAuth()
  const canManage = hasPermission('admin:settings')

  const [flagStates, setFlagStates] = useState<FlagState[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFlag, setSelectedFlag] = useState<FlagState | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Panel ports state
  const [panelPorts, setPanelPorts] = useState<FlagStatePort[]>([])
  const [loadingPorts, setLoadingPorts] = useState(false)

  // Add port inline state
  const [newPortName, setNewPortName] = useState('')
  const [newPortDefault, setNewPortDefault] = useState(false)

  // Edit port inline state
  const [editingPortId, setEditingPortId] = useState<string | null>(null)
  const [editPortName, setEditPortName] = useState('')
  const [editPortDefault, setEditPortDefault] = useState(false)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [modalEditId, setModalEditId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formIso3, setFormIso3] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRatifiedBunker, setFormRatifiedBunker] = useState(false)
  const [formRatifiedWreck, setFormRatifiedWreck] = useState(false)
  const [formAuthorityName, setFormAuthorityName] = useState('')
  const [formAuthorityAddress, setFormAuthorityAddress] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const data = await window.api.getFlagStates()
    setFlagStates(Array.isArray(data) ? data : [])
  }

  const loadPorts = async (flagStateId: string) => {
    setLoadingPorts(true)
    try {
      const ports = await window.api.flagStateGetPorts(flagStateId)
      setPanelPorts(Array.isArray(ports) ? ports : [])
    } catch {
      setPanelPorts([])
    } finally {
      setLoadingPorts(false)
    }
  }

  // Filter
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return flagStates
    const q = searchTerm.toLowerCase()
    return flagStates.filter(
      fs => fs.name.toLowerCase().includes(q) || fs.iso3Code.toLowerCase().includes(q)
    )
  }, [flagStates, searchTerm])

  // Stats
  const bunkerCount = useMemo(() => flagStates.filter(fs => fs.ratifiedBunker).length, [flagStates])
  const wreckCount = useMemo(() => flagStates.filter(fs => fs.ratifiedWreck).length, [flagStates])
  const [portCounts, setPortCounts] = useState<Record<string, number>>({})
  const withPortsCount = useMemo(() => Object.values(portCounts).filter(c => c > 0).length, [portCounts])

  // Load port counts for all flags on mount
  useEffect(() => {
    if (flagStates.length === 0) return
    const loadAllPortCounts = async () => {
      const counts: Record<string, number> = {}
      await Promise.all(
        flagStates.map(async fs => {
          try {
            const ports = await window.api.flagStateGetPorts(fs.id)
            counts[fs.id] = Array.isArray(ports) ? ports.length : 0
          } catch {
            counts[fs.id] = 0
          }
        })
      )
      setPortCounts(counts)
    }
    loadAllPortCounts()
  }, [flagStates])

  // Select flag → load ports
  const handleSelect = async (fs: FlagState) => {
    if (selectedFlag?.id === fs.id) {
      setSelectedFlag(null)
      setPanelPorts([])
      return
    }
    setSelectedFlag(fs)
    setEditingPortId(null)
    setNewPortName('')
    setNewPortDefault(false)
    await loadPorts(fs.id)
  }

  // Name → auto ISO lookup
  const handleNameChange = (value: string, setName: (v: string) => void, setIso3: (v: string) => void) => {
    setName(value)
    const match = countryNameToIso3.find(c => c.name.toLowerCase() === value.toLowerCase())
    if (match) setIso3(match.iso3)
  }

  // Modal helpers
  const resetForm = () => {
    setFormName('')
    setFormIso3('')
    setFormEmail('')
    setFormRatifiedBunker(false)
    setFormRatifiedWreck(false)
    setFormAuthorityName('')
    setFormAuthorityAddress('')
    setModalEditId(null)
  }

  const openAddModal = () => {
    resetForm()
    setShowModal(true)
  }

  const openEditModal = (fs: FlagState) => {
    setModalEditId(fs.id)
    setFormName(fs.name)
    setFormIso3(fs.iso3Code)
    setFormEmail(fs.email || '')
    setFormRatifiedBunker(Boolean(fs.ratifiedBunker))
    setFormRatifiedWreck(Boolean(fs.ratifiedWreck))
    setFormAuthorityName(fs.authorityName || '')
    setFormAuthorityAddress(fs.authorityAddress || '')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    resetForm()
  }

  const handleModalSave = async () => {
    if (!formName.trim() || !formIso3.trim()) return
    if (formIso3.trim().length !== 3) {
      showError('ISO code must be exactly 3 characters')
      return
    }
    try {
      const payload = {
        name: formName.trim(),
        iso3Code: formIso3.toUpperCase(),
        email: formEmail.trim() || undefined,
        ratifiedBunker: formRatifiedBunker,
        ratifiedWreck: formRatifiedWreck,
        authorityName: formAuthorityName.trim() || undefined,
        authorityAddress: formAuthorityAddress.trim() || undefined
      }
      if (modalEditId) {
        await window.api.updateFlagState(modalEditId, payload)
        showSuccess('Flag state updated')
        // Update selected if it was the one we edited
        if (selectedFlag?.id === modalEditId) {
          setSelectedFlag({ ...selectedFlag, ...payload } as FlagState)
        }
      } else {
        await window.api.addFlagState(payload)
        showSuccess('Flag state added')
      }
      closeModal()
      loadData()
    } catch (err: any) {
      showError(err.message || 'Failed to save flag state')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await window.api.deleteFlagState(id)
      if (selectedFlag?.id === id) {
        setSelectedFlag(null)
        setPanelPorts([])
      }
      setDeleteConfirmId(null)
      showSuccess('Flag state deleted')
      loadData()
    } catch (err: any) {
      showError(err.message || 'Failed to delete flag state')
    }
  }

  // Port handlers
  const handleAddPort = async () => {
    if (!selectedFlag || !newPortName.trim()) return
    try {
      const port = await window.api.flagStateAddPort(selectedFlag.id, newPortName.trim(), newPortDefault) as any
      if (port && !port.error) {
        const updated = newPortDefault
          ? panelPorts.map(p => ({ ...p, isDefault: false }))
          : [...panelPorts]
        updated.push(port)
        setPanelPorts(updated)
        setPortCounts(prev => ({ ...prev, [selectedFlag.id]: updated.length }))
        setNewPortName('')
        setNewPortDefault(false)
        showSuccess('Port added')
      }
    } catch (err: any) {
      showError(err.message || 'Failed to add port')
    }
  }

  const handleUpdatePort = async () => {
    if (!editingPortId || !editPortName.trim()) return
    try {
      await window.api.flagStateUpdatePort(editingPortId, editPortName.trim(), editPortDefault)
      setPanelPorts(prev => prev.map(p => {
        if (p.id === editingPortId) return { ...p, name: editPortName.trim(), isDefault: editPortDefault }
        if (editPortDefault) return { ...p, isDefault: false }
        return p
      }))
      setEditingPortId(null)
      showSuccess('Port updated')
    } catch (err: any) {
      showError(err.message || 'Failed to update port')
    }
  }

  const handleDeletePort = async (portId: string) => {
    if (!selectedFlag) return
    try {
      await window.api.flagStateDeletePort(portId)
      const updated = panelPorts.filter(p => p.id !== portId)
      setPanelPorts(updated)
      setPortCounts(prev => ({ ...prev, [selectedFlag.id]: updated.length }))
      showSuccess('Port deleted')
    } catch (err: any) {
      showError(err.message || 'Failed to delete port')
    }
  }

  // Style constants
  const sectionLabel: React.CSSProperties = {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    marginBottom: '8px'
  }

  const accentBg = isLight ? 'rgba(26,115,232,0.1)' : 'rgba(0,210,255,0.1)'

  return (
    <div className="fade-in">
      {/* Header */}
      <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '4px' }}>Flag States</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Manage vessel flag state registries, conventions, and ports.</p>
        </div>
      </header>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { icon: <Globe size={20} color="white" />, label: 'Total Flags', value: flagStates.length, gradient: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' },
          { icon: <CheckCircle2 size={20} color="white" />, label: 'Bunker Ratified', value: bunkerCount, gradient: 'linear-gradient(135deg, #22c55e, #16a34a)' },
          { icon: <CheckCircle2 size={20} color="white" />, label: 'Wreck Ratified', value: wreckCount, gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)' },
          { icon: <Anchor size={20} color="white" />, label: 'With Ports', value: withPortsCount, gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }
        ].map((stat, i) => (
          <div key={i} className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: stat.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {stat.icon}
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.1 }}>{stat.value}</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Add row */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={15} />
          <input
            type="text"
            placeholder="Search by name or ISO code..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '34px', paddingRight: '10px', width: '100%', fontSize: '0.88rem' }}
          />
        </div>
        {canManage && (
          <button className="btn-primary" onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', fontSize: '0.9rem', flexShrink: 0 }}>
            <Plus size={16} /> Add Flag
          </button>
        )}
      </div>

      {/* Main: table + slide-in */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* Table */}
        <div className="glass-card" style={{ flex: 1, minWidth: 0, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 'auto' }} />
                <col style={{ width: '70px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '70px' }} />
                <col style={{ width: 'auto', minWidth: '120px' }} />
              </colgroup>
              <caption className="sr-only">Flag states</caption>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)', position: 'sticky', top: 0, zIndex: 1 }}>
                  {['Flag Name', 'ISO', 'Bunker', 'Wreck', 'Ports', 'Authority'].map(col => (
                    <th key={col} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.69rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <Globe size={30} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.25 }} />
                      {searchTerm ? 'No flag states match your search' : 'No flag states added yet'}
                    </td>
                  </tr>
                ) : filtered.map(fs => {
                  const flagCls = getFlagClass(fs.iso3Code)
                  const isSelected = selectedFlag?.id === fs.id
                  const pCount = portCounts[fs.id] || 0
                  return (
                    <tr
                      key={fs.id}
                      onClick={() => handleSelect(fs)}
                      className="hover-effect"
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--table-border)',
                        background: isSelected ? (isLight ? 'rgba(26,115,232,0.07)' : 'rgba(0,210,255,0.06)') : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--accent-primary)' : '3px solid transparent',
                        transition: 'background 0.12s, border-color 0.12s'
                      }}
                    >
                      {/* Flag Name */}
                      <td style={{ padding: '12px 16px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {flagCls ? (
                            <span className={flagCls} style={{ fontSize: '1.3rem', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: '28px', height: '20px', borderRadius: '3px', background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Globe size={12} color="var(--text-secondary)" />
                            </div>
                          )}
                          <span style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fs.name}</span>
                        </div>
                      </td>
                      {/* ISO */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 600 }}>{fs.iso3Code}</span>
                      </td>
                      {/* Bunker */}
                      <td style={{ padding: '12px 16px' }}>
                        {fs.ratifiedBunker ? (
                          <CheckCircle2 size={16} color="#22c55e" />
                        ) : (
                          <XCircle size={16} color={isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'} />
                        )}
                      </td>
                      {/* Wreck */}
                      <td style={{ padding: '12px 16px' }}>
                        {fs.ratifiedWreck ? (
                          <CheckCircle2 size={16} color="#22c55e" />
                        ) : (
                          <XCircle size={16} color={isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'} />
                        )}
                      </td>
                      {/* Ports */}
                      <td style={{ padding: '12px 16px' }}>
                        {pCount > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-primary)', background: accentBg, padding: '2px 8px', borderRadius: '10px' }}>
                            <Anchor size={11} />{pCount}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                        )}
                      </td>
                      {/* Authority */}
                      <td style={{ padding: '12px 16px' }}>
                        {fs.authorityName ? (
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{fs.authorityName}</span>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Slide-in panel */}
        {selectedFlag && (
          <div
            className="fade-in"
            style={{
              width: '400px',
              flexShrink: 0,
              background: isLight ? '#f4f6fb' : '#14172a',
              border: '1px solid var(--glass-border)',
              borderRadius: '12px',
              maxHeight: 'calc(100vh - 280px)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Panel header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--table-border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {(() => {
                    const cls = getFlagClass(selectedFlag.iso3Code)
                    return cls
                      ? <span className={cls} style={{ fontSize: '1.6rem' }} />
                      : <Globe size={24} color="white" />
                  })()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.2, marginBottom: '4px', wordBreak: 'break-word' }}>{selectedFlag.name}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 600 }}>{selectedFlag.iso3Code}</div>
                </div>
                <button onClick={() => { setSelectedFlag(null); setPanelPorts([]) }} style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Conventions */}
              <div>
                <div style={sectionLabel}>Conventions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    {selectedFlag.ratifiedBunker ? (
                      <CheckCircle2 size={15} color="#22c55e" />
                    ) : (
                      <XCircle size={15} color="var(--danger)" />
                    )}
                    <span>Bunker Convention (2001):</span>
                    <span style={{ fontWeight: 600, color: selectedFlag.ratifiedBunker ? '#22c55e' : 'var(--danger)' }}>
                      {selectedFlag.ratifiedBunker ? 'Ratified' : 'Not Ratified'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    {selectedFlag.ratifiedWreck ? (
                      <CheckCircle2 size={15} color="#22c55e" />
                    ) : (
                      <XCircle size={15} color="var(--danger)" />
                    )}
                    <span>Wreck Removal Convention (2007):</span>
                    <span style={{ fontWeight: 600, color: selectedFlag.ratifiedWreck ? '#22c55e' : 'var(--danger)' }}>
                      {selectedFlag.ratifiedWreck ? 'Ratified' : 'Not Ratified'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Maritime Authority */}
              <div>
                <div style={sectionLabel}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Building2 size={11} /> Maritime Authority
                  </span>
                </div>
                {selectedFlag.authorityName ? (
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>{selectedFlag.authorityName}</div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Not set</div>
                )}
                {selectedFlag.authorityAddress ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{selectedFlag.authorityAddress}</div>
                ) : !selectedFlag.authorityName ? null : (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No address</div>
                )}
              </div>

              {/* Email */}
              <div>
                <div style={sectionLabel}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Mail size={11} /> Email
                  </span>
                </div>
                {selectedFlag.email ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedFlag.email.split(',').map((e, i) => (
                      <span key={i} style={{
                        padding: '3px 10px',
                        borderRadius: '6px',
                        background: accentBg,
                        border: `1px solid ${isLight ? 'rgba(26,115,232,0.15)' : 'rgba(0,210,255,0.15)'}`,
                        fontSize: '0.82rem',
                        color: 'var(--accent-primary)'
                      }}>{e.trim()}</span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Not set</div>
                )}
              </div>

              {/* Ports of Registry */}
              <div>
                <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Anchor size={11} /> Ports of Registry
                  </span>
                  {panelPorts.length > 0 && (
                    <span style={{ padding: '1px 6px', borderRadius: '8px', background: accentBg, color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.65rem' }}>{panelPorts.length}</span>
                  )}
                </div>

                {loadingPorts ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '8px 0' }}>Loading ports...</div>
                ) : panelPorts.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '8px' }}>No ports of registry</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                    {panelPorts.map(port => (
                      <div key={port.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        background: port.isDefault ? (isLight ? 'rgba(0,170,200,0.08)' : 'rgba(0,170,200,0.1)') : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)'),
                        border: `1px solid ${port.isDefault ? 'rgba(0,170,200,0.25)' : 'var(--glass-border)'}`,
                        fontSize: '0.85rem'
                      }}>
                        {editingPortId === port.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                            <input
                              type="text"
                              value={editPortName}
                              onChange={e => setEditPortName(e.target.value)}
                              style={{ flex: 1, padding: '2px 6px', fontSize: '0.82rem' }}
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') handleUpdatePort(); if (e.key === 'Escape') setEditingPortId(null) }}
                            />
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <input type="checkbox" checked={editPortDefault} onChange={e => setEditPortDefault(e.target.checked)} />
                              Default
                            </label>
                            <button onClick={handleUpdatePort} className="btn-primary" style={{ padding: '2px 6px', fontSize: '0.72rem' }}>Save</button>
                            <button onClick={() => setEditingPortId(null)} className="btn-secondary" style={{ padding: '2px 6px', fontSize: '0.72rem' }}>Cancel</button>
                          </div>
                        ) : (
                          <>
                            <span style={{ flex: 1, fontWeight: port.isDefault ? 600 : 400 }}>{port.name}</span>
                            {port.isDefault && (
                              <span style={{
                                fontSize: '0.62rem',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(0,170,200,0.2)',
                                color: 'var(--accent-primary)',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                              }}>Default</span>
                            )}
                            {canManage && (
                              <>
                                <button
                                  onClick={() => { setEditingPortId(port.id); setEditPortName(port.name); setEditPortDefault(port.isDefault) }}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--accent-primary)' }}
                                  title="Edit port"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeletePort(port.id)}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--danger)' }}
                                  title="Delete port"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add port inline */}
                {canManage && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={newPortName}
                      onChange={e => setNewPortName(e.target.value)}
                      placeholder="Port name"
                      style={{ flex: 1, minWidth: '100px', padding: '4px 8px', fontSize: '0.82rem' }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddPort() } }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={newPortDefault} onChange={e => setNewPortDefault(e.target.checked)} />
                      Default
                    </label>
                    <button
                      onClick={handleAddPort}
                      className="btn-primary"
                      style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Plus size={13} /> Add
                    </button>
                  </div>
                )}
              </div>

              {/* Actions */}
              {canManage && (
                <div>
                  <div style={sectionLabel}>Actions</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => openEditModal(selectedFlag)} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Pencil size={14} /> Edit Flag
                    </button>
                    <button onClick={() => setDeleteConfirmId(selectedFlag.id)} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)' }}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={closeModal}>
          <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '16px', padding: '32px', width: '520px', maxWidth: '90vw', border: '1px solid var(--glass-border)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Globe size={18} color="white" />
                </div>
                <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{modalEditId ? 'Edit Flag State' : 'Add Flag State'}</h3>
              </div>
              <button onClick={closeModal} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Name + ISO row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Country Name *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => handleNameChange(e.target.value, setFormName, setFormIso3)}
                    placeholder="e.g. Panama"
                    style={{ width: '100%' }}
                    list="country-names-modal"
                    autoFocus
                  />
                  <datalist id="country-names-modal">
                    {countryNameToIso3.map(c => (
                      <option key={c.iso3} value={c.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>ISO Code *</label>
                  <input
                    type="text"
                    value={formIso3}
                    onChange={e => setFormIso3(e.target.value.toUpperCase().slice(0, 3))}
                    placeholder="PAN"
                    style={{ width: '100%', textTransform: 'uppercase', fontFamily: 'monospace' }}
                    maxLength={3}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Email</label>
                <textarea
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="Email addresses (comma-separated)"
                  rows={2}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              {/* Conventions */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Conventions</label>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formRatifiedBunker} onChange={e => setFormRatifiedBunker(e.target.checked)} />
                    Bunker Convention (2001)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formRatifiedWreck} onChange={e => setFormRatifiedWreck(e.target.checked)} />
                    Wreck Removal Convention (2007)
                  </label>
                </div>
              </div>

              {/* Authority */}
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Maritime Authority Name</label>
                <input
                  type="text"
                  value={formAuthorityName}
                  onChange={e => setFormAuthorityName(e.target.value)}
                  placeholder="e.g. Panama Maritime Authority"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Authority Address</label>
                <textarea
                  value={formAuthorityAddress}
                  onChange={e => setFormAuthorityAddress(e.target.value)}
                  placeholder="Authority address"
                  rows={3}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button onClick={closeModal} className="btn-secondary" style={{ padding: '10px 20px' }}>Cancel</button>
                <button onClick={handleModalSave} className="btn-primary" style={{ padding: '10px 20px' }}>
                  {modalEditId ? 'Save Changes' : 'Add Flag State'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirmId && (
        <ConfirmationModal
          title="Delete Flag State"
          message="Delete this flag state? Vessels will have their flag unset."
          confirmLabel="Delete"
          isDangerous
          onConfirm={() => handleDelete(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  )
}
