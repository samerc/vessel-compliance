import { useState, useEffect } from 'react'
import { FolderPlus, Trash2, Folder, Ship, FileSpreadsheet, FileText, Eye } from 'lucide-react'
import { Fleet, Vessel, VesselDocument, DocumentType } from '../../../shared/types'
import { ReportService } from '../services/ReportService'
import FleetDetail from './FleetDetail'

export default function FleetManager() {
    const [fleets, setFleets] = useState<Fleet[]>([])
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [allDocs, setAllDocs] = useState<VesselDocument[]>([])
    const [newFleetName, setNewFleetName] = useState('')
    const [selectedFleet, setSelectedFleet] = useState<Fleet | null>(null)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const fData = await window.api.getFleets()
        const vData = await window.api.getVessels()
        const dTypes = await window.api.getDocumentTypes()
        const docs = await window.api.getVesselDocuments()
        setFleets(fData)
        setVessels(vData)
        setDocTypes(dTypes)
        setAllDocs(docs)
    }

    const handleAddFleet = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newFleetName.trim()) return
        await window.api.addFleet({ name: newFleetName })
        setNewFleetName('')
        loadData()
    }

    const handleDeleteFleet = async (id: string) => {
        if (confirm('Delete this fleet? Vessels will be moved to "Standalone".')) {
            await window.api.deleteFleet(id)
            loadData()
        }
    }

    if (selectedFleet) {
        return <FleetDetail fleet={selectedFleet} onBack={() => setSelectedFleet(null)} />
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Fleet Management</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Manage your organizational divisions and check vessel counts.</p>
            </header>

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
                    />
                    <button type="submit" className="btn-primary">Add Fleet</button>
                </form>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {fleets.map(fleet => {
                    const count = vessels.filter(v => v.fleetId === fleet.id).length
                    return (
                        <div key={fleet.id} className="glass-card" style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '12px' }}>
                                    <Folder size={24} color="var(--accent-primary)" />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => setSelectedFleet(fleet)}
                                        style={{ background: 'transparent', color: 'var(--accent-primary)', padding: '4px' }}
                                        title="View Fleet"
                                    >
                                        <Eye size={20} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteFleet(fleet.id)}
                                        style={{ background: 'transparent', color: 'var(--danger)', padding: '4px' }}
                                        title="Delete Fleet"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                            <h3 style={{ marginBottom: '8px' }}>{fleet.name}</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                                <Ship size={14} /> {count} Vessels Assigned
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={() => ReportService.exportFleetToExcel(fleet, vessels.filter(v => v.fleetId === fleet.id), docTypes, allDocs)}
                                    className="btn-secondary"
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
                                >
                                    <FileSpreadsheet size={16} /> Excel
                                </button>
                                <button
                                    onClick={() => ReportService.exportFleetToPDF(fleet, vessels.filter(v => v.fleetId === fleet.id), docTypes, allDocs)}
                                    className="btn-secondary"
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
                                >
                                    <FileText size={16} /> PDF
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
