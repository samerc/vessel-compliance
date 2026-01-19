import { useState, useEffect } from 'react'
import { Ship, ChevronRight, Hash, Search, Filter, ArrowUpDown } from 'lucide-react'
import { Vessel, Fleet } from '../../../shared/types'
import VesselDetail from './VesselDetail'

export default function VesselManager() {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [fleets, setFleets] = useState<Fleet[]>([])
    const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null)

    // UI State
    const [searchTerm, setSearchTerm] = useState('')
    const [fleetFilter, setFleetFilter] = useState('all')
    const [sortField, setSortField] = useState<'name' | 'imoNumber'>('name')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

    // Add Mode
    const [newVessel, setNewVessel] = useState({ name: '', imo: '', fleetId: '' })

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
        await window.api.addVessel({
            name: newVessel.name,
            imoNumber: newVessel.imo,
            fleetId: newVessel.fleetId
        })
        setNewVessel({ name: '', imo: '', fleetId: '' })
        loadData()
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
                        onChange={e => setNewVessel({ ...newVessel, name: e.target.value })}
                        style={{ flex: 2, minWidth: '200px' }}
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
                        style={{ flex: 1, minWidth: '150px' }}
                    >
                        <option value="">Standalone</option>
                        {fleets.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                    <button type="submit" className="btn-primary">Register</button>
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
                        style={{ padding: '10px', borderRadius: '12px' }}
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
                                                    textDecoration: 'none'
                                                }}
                                                onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                                onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                            >
                                                {v.name}
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
                                            style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem' }}
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
        </div>
    )
}
