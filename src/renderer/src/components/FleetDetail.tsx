import { useState, useEffect } from 'react'
import { ArrowLeft, Ship, FileSpreadsheet, FileText, ExternalLink, Hash } from 'lucide-react'
import { Fleet, Vessel, VesselDocument, DocumentType } from '../../../shared/types'
import { ReportService } from '../services/ReportService'
import VesselDetail from './VesselDetail'

interface FleetDetailProps {
    fleet: Fleet
    onBack: () => void
}

export default function FleetDetail({ fleet, onBack }: FleetDetailProps) {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [allDocs, setAllDocs] = useState<VesselDocument[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null)
    const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')

    useEffect(() => {
        loadData()
    }, [fleet])

    const loadData = async () => {
        setLoading(true)
        try {
            const allVessels = await window.api.getVessels()
            const fVessels = allVessels.filter(v => v.fleetId === fleet.id)
            const dTypes = await window.api.getDocumentTypes()
            const docs = await window.api.getVesselDocuments()

            setVessels(fVessels)
            setDocTypes(dTypes)
            setAllDocs(docs)
        } finally {
            setLoading(false)
        }
    }

    if (selectedVessel) {
        return <VesselDetail vessel={selectedVessel} backLabel="Back to Fleet" onBack={() => { setSelectedVessel(null); loadData(); }} />
    }

    const filteredVessels = vessels.filter(v => statusFilter === 'all' || v.isActive)

    return (
        <div className="fade-in">
            <button onClick={onBack} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                <ArrowLeft size={18} /> Back to Fleets
            </button>

            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{fleet.name}</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <p style={{ color: 'var(--text-secondary)' }}>{vessels.length} Vessels in this fleet</p>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as 'active' | 'all')}
                            className="input-field"
                            style={{ padding: '4px 12px', fontSize: '0.85rem', width: 'auto' }}
                        >
                            <option value="active">Active Only</option>
                            <option value="all">Show All</option>
                        </select>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => ReportService.exportFleetToExcel(fleet, vessels, docTypes, allDocs)}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        disabled={loading}
                    >
                        <FileSpreadsheet size={18} /> Export Excel
                    </button>
                    <button
                        onClick={() => ReportService.exportFleetToPDF(fleet, vessels, docTypes, allDocs)}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        disabled={loading}
                    >
                        <FileText size={18} /> Export PDF
                    </button>
                </div>
            </header>

            {loading ? (
                <div style={{ color: 'var(--text-secondary)' }}>Loading fleet details...</div>
            ) : (
                <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                <th style={{ padding: '16px' }}>Vessel Name</th>
                                <th style={{ padding: '16px' }}>IMO Number</th>
                                <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVessels.length === 0 ? (
                                <tr>
                                    <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        No {statusFilter === 'active' ? 'active' : ''} vessels found.
                                    </td>
                                </tr>
                            ) : (
                                filteredVessels.map(v => (
                                    <tr key={v.id} style={{ borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ background: 'var(--bg-card)', padding: '8px', borderRadius: '8px' }}>
                                                    <Ship size={20} color="var(--accent-primary)" />
                                                </div>
                                                <span
                                                    style={{ fontWeight: '600', cursor: 'pointer', color: 'var(--accent-primary)' }}
                                                    onClick={() => setSelectedVessel(v)}
                                                >
                                                    {v.name}
                                                </span>
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
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Hash size={14} /> {v.imoNumber}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <button
                                                className="btn-secondary"
                                                style={{ padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                                                onClick={() => setSelectedVessel(v)}
                                            >
                                                Details <ExternalLink size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
