import React, { useState, useEffect } from 'react'
import { Ship, ChevronRight, Hash, Search, Filter, ArrowUpDown, Shield, ShieldCheck, ShieldAlert, RefreshCw, Loader2 } from 'lucide-react'
import { Vessel, Fleet, SanctionsMatch } from '../../../shared/types'
import { OfacService } from '../services/OfacService'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import VesselDetail from './VesselDetail'
import SanctionsModal from './SanctionsModal'

export default function VesselManager() {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [fleets, setFleets] = useState<Fleet[]>([])
    const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null)
    const { showError, showSuccess } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    // UI State
    const [searchTerm, setSearchTerm] = useState('')
    const [fleetFilter, setFleetFilter] = useState('all')
    const [sortField, setSortField] = useState<'name' | 'imoNumber'>('name')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

    // Add Mode
    const [newVessel, setNewVessel] = useState({ name: '', imo: '', fleetId: '' })
    const [isAdding, setIsAdding] = useState(false)

    // Sanctions checking state
    const [checkingVesselId, setCheckingVesselId] = useState<string | null>(null)

    // Sanctions modal state
    const [sanctionsModal, setSanctionsModal] = useState<{
        show: boolean
        searchedName: string
        matches: SanctionsMatch[]
        vesselId?: string
    }>({ show: false, searchedName: '', matches: [] })

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const vData = await window.api.getVessels()
        const fData = await window.api.getFleets()
        setVessels(vData)
        setFleets(fData)
    }

    const handleAddVessel = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newVessel.name || !newVessel.imo) return

        setIsAdding(true)
        try {
            // Scan OFAC
            const scanResult = await OfacService.checkSanctions(newVessel.name)

            const vessel = await window.api.addVessel({
                name: newVessel.name,
                imoNumber: newVessel.imo,
                fleetId: newVessel.fleetId,
                ofacCheckedAt: scanResult.timestamp,
                ofacMatchFound: scanResult.matchFound,
                ofacStatus: scanResult.status
            })
            setNewVessel({ name: '', imo: '', fleetId: '' })
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
            showError(error.message || 'Failed to register vessel. Please try again.')
        } finally {
            setIsAdding(false)
        }
    }

    const handleUpdateFleet = async (vesselId: string, fleetId: string) => {
        await window.api.updateVessel(vesselId, { fleetId: fleetId })
        loadData()
    }

    const filteredVessels = vessels
        .filter(v => {
            const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                v.imoNumber.includes(searchTerm)
            const matchesFleet = fleetFilter === 'all' || v.fleetId === fleetFilter
            return matchesSearch && matchesFleet
        })
        .sort((a, b) => {
            const factor = sortOrder === 'asc' ? 1 : -1
            return a[sortField].localeCompare(b[sortField]) * factor
        })

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
        return <VesselDetail vessel={selectedVessel} backLabel="Back to Vessels" onBack={() => setSelectedVessel(null)} />
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Vessel Registry</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Search, filter, and manage all vessels across your fleets.</p>
            </header>

            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
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
                    />
                    <input
                        type="text"
                        value={newVessel.imo}
                        onChange={e => setNewVessel({ ...newVessel, imo: e.target.value })}
                        style={{ flex: 1, minWidth: '120px' }}
                        placeholder="IMO No."
                    />
                    <select
                        value={newVessel.fleetId}
                        onChange={e => setNewVessel({ ...newVessel, fleetId: e.target.value })}
                        style={{ flex: 1, minWidth: '150px', color: 'var(--text-primary)' }}
                    >
                        <option value="">Standalone</option>
                        {fleets.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                    <button type="submit" className="btn-primary" disabled={isAdding} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isAdding && <Loader2 size={16} className="spinner" />}
                        {isAdding ? 'Registering...' : 'Register'}
                    </button>
                </form>
            </section>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} size={18} />
                    <input
                        type="text"
                        placeholder="Search by name or IMO..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ width: '100%', paddingLeft: '40px' }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Filter size={18} color="var(--text-secondary)" />
                    <select
                        value={fleetFilter}
                        onChange={e => setFleetFilter(e.target.value)}
                        style={{ padding: '10px', borderRadius: '12px', color: 'var(--text-primary)' }}
                    >
                        <option value="all">All Fleets</option>
                        <option value="">Standalone</option>
                        {fleets.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                            <th style={{ padding: '16px', cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                                Vessel Name <ArrowUpDown size={14} style={{ opacity: sortField === 'name' ? 1 : 0.3 }} />
                            </th>
                            <th style={{ padding: '16px', cursor: 'pointer' }} onClick={() => toggleSort('imoNumber')}>
                                IMO Number <ArrowUpDown size={14} style={{ opacity: sortField === 'imoNumber' ? 1 : 0.3 }} />
                            </th>
                            <th style={{ padding: '16px' }}>Current Fleet</th>
                            <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredVessels.map(v => {
                            // Removing unused fleet variable
                            return (
                                <tr key={v.id} style={{ borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ background: 'var(--bg-card)', padding: '8px', borderRadius: '8px' }}>
                                                <Ship size={20} color="var(--accent-primary)" />
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
                                                <OfacBadge vessel={v} />
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                                        <Hash size={14} style={{ marginRight: '4px' }} /> {v.imoNumber}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <select
                                            value={v.fleetId || ''}
                                            onChange={e => handleUpdateFleet(v.id, e.target.value)}
                                            style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)' }}
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
