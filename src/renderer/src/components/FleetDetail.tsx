import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Ship, FileSpreadsheet, FileText, ExternalLink, Hash, Plus, Search, X, UserMinus, Loader2, CheckSquare, Square } from 'lucide-react'
import { Fleet, Vessel, VesselDocument, DocumentType } from '../../../shared/types'
import JSZip from 'jszip'
import { ReportService } from '../services/ReportService'
import VesselDetail from './VesselDetail'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import ColumnSelector, { useColumnPrefs, ColumnDef } from './ColumnSelector'
import { confirmDialog } from './DialogHost'

interface FleetDetailProps {
    fleet: Fleet
    onBack: () => void
}

export default function FleetDetail({ fleet, onBack }: FleetDetailProps) {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [allVessels, setAllVessels] = useState<Vessel[]>([])
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [allDocs, setAllDocs] = useState<VesselDocument[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null)
    const { showSuccess, showError } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light' || theme === 'aurora'
    const { hasPermission } = useAuth()
    const canManageFleets = hasPermission('fleets:manage')

    // Column preferences for fleet detail vessel table
    const FLEET_DETAIL_COLUMNS: ColumnDef[] = [
        { id: 'name', label: 'Vessel Name', defaultVisible: true },
        { id: 'imo', label: 'IMO Number', defaultVisible: true },
        { id: 'actions', label: 'Actions', defaultVisible: true },
    ]
    const { visibleColumns: fdVisibleCols, setVisibleColumns: setFdVisibleCols } = useColumnPrefs('fleet-detail', FLEET_DETAIL_COLUMNS)
    const fdVisibleSet = new Set(fdVisibleCols)

    // Individual PDF export state
    const [exportingIndividual, setExportingIndividual] = useState(false)
    const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null)

    // Export vessel selection modal state
    const [showZipModal, setShowZipModal] = useState(false)
    const [zipSelectedIds, setZipSelectedIds] = useState<Set<string>>(new Set())
    const [zipSearch, setZipSearch] = useState('')
    const [exportMode, setExportMode] = useState<'zip' | 'pdf' | 'excel'>('zip')

    // Quick-add state
    const [showQuickAdd, setShowQuickAdd] = useState(false)
    const [quickAddSearch, setQuickAddSearch] = useState('')

    useEffect(() => {
        loadData()
    }, [fleet])

    const loadData = async () => {
        setLoading(true)
        try {
            const allV = await window.api.getVessels()
            const fVessels = allV.filter(v => v.fleetId === fleet.id)
            const dTypes = await window.api.getDocumentTypes()
            const docs = await window.api.getVesselDocuments()

            setAllVessels(Array.isArray(allV) ? allV : [])
            setVessels(Array.isArray(fVessels) ? fVessels : [])
            setDocTypes(Array.isArray(dTypes) ? dTypes : [])
            setAllDocs(Array.isArray(docs) ? docs : [])
        } finally {
            setLoading(false)
        }
    }

    const handleAddVessel = async (vessel: Vessel) => {
        await window.api.updateVessel(vessel.id, { fleetId: fleet.id })
        setQuickAddSearch('')
        setShowQuickAdd(false)
        showSuccess(`${vessel.name} added to fleet`)
        loadData()
    }

    const handleRemoveVessel = async (vessel: Vessel) => {
        if (await confirmDialog(`Remove ${vessel.name} from this fleet?`)) {
            await window.api.updateVessel(vessel.id, { fleetId: null as any })
            showSuccess(`${vessel.name} removed from fleet`)
            loadData()
        }
    }

    const activeVessels = useMemo(() => vessels.filter(v => v.isActive), [vessels])
    const inactiveVessels = useMemo(() => vessels.filter(v => !v.isActive), [vessels])

    const filteredZipVessels = useMemo(() => {
        const base = exportMode === 'zip' ? activeVessels : vessels
        if (!zipSearch.trim()) return base
        const q = zipSearch.toLowerCase()
        return base.filter(v =>
            v.name.toLowerCase().includes(q) ||
            v.imoNumber.toLowerCase().includes(q)
        )
    }, [activeVessels, vessels, zipSearch, exportMode])

    // Filter vessels not already in this fleet for quick-add
    const availableVessels = useMemo(() => quickAddSearch.trim()
        ? allVessels.filter(v =>
            v.fleetId !== fleet.id &&
            (v.name.toLowerCase().includes(quickAddSearch.toLowerCase()) ||
                v.imoNumber.toLowerCase().includes(quickAddSearch.toLowerCase()))
        ).slice(0, 8)
        : []
    , [quickAddSearch, allVessels, fleet.id])

    if (selectedVessel) {
        return <VesselDetail vessel={selectedVessel} backLabel="Back to Fleet" onBack={() => { setSelectedVessel(null); loadData(); }} />
    }

    const handleOpenExportModal = (mode: 'zip' | 'pdf' | 'excel') => {
        const vList = mode === 'zip' ? activeVessels : vessels
        if (vList.length === 0) return
        setZipSelectedIds(new Set(vList.map(v => v.id)))
        setZipSearch('')
        setExportMode(mode)
        setShowZipModal(true)
    }

    const handleExportIndividualPDFs = async () => {
        const selectedVessels = activeVessels.filter(v => zipSelectedIds.has(v.id))
        if (selectedVessels.length === 0) return
        setShowZipModal(false)
        setExportingIndividual(true)
        setExportProgress({ current: 0, total: selectedVessels.length })
        const zip = new JSZip()
        let failed = 0
        for (let i = 0; i < selectedVessels.length; i++) {
            const v = selectedVessels[i]
            setExportProgress({ current: i + 1, total: selectedVessels.length })
            try {
                const vesselDocs = allDocs.filter(d => d.vesselId === v.id)
                const bytes = await ReportService.exportVesselToPDF(v, docTypes, vesselDocs, { returnBytes: true })
                zip.file(`${v.name}_Compliance_Report.pdf`, bytes as Uint8Array)
            } catch {
                failed++
            }
        }
        setExportingIndividual(false)
        setExportProgress(null)
        if (failed > 0) {
            showError(`${failed} vessel PDF${failed > 1 ? 's' : ''} failed to generate`)
        } else {
            const blob = await zip.generateAsync({ type: 'blob' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${fleet.name}_Individual_Reports.zip`
            a.click()
            URL.revokeObjectURL(url)
            showSuccess(`${selectedVessels.length} PDFs zipped and downloaded`)
        }
    }

    const renderVesselTable = (vesselList: Vessel[], title: string, showRemove: boolean) => {
        if (vesselList.length === 0) return null
        return (
            <div style={{ marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                    {title} ({vesselList.length})
                </h3>
                <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <caption className="sr-only">{title}</caption>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                {fdVisibleSet.has('name') && <th scope="col" style={{ padding: '16px' }}>Vessel Name</th>}
                                {fdVisibleSet.has('imo') && <th scope="col" style={{ padding: '16px' }}>IMO Number</th>}
                                {fdVisibleSet.has('actions') ? (
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                            Actions
                                            <ColumnSelector pageKey="fleet-detail" allColumns={FLEET_DETAIL_COLUMNS} visibleColumns={fdVisibleCols} onChange={setFdVisibleCols} />
                                        </div>
                                    </th>
                                ) : (
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>
                                        <ColumnSelector pageKey="fleet-detail" allColumns={FLEET_DETAIL_COLUMNS} visibleColumns={fdVisibleCols} onChange={setFdVisibleCols} />
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {vesselList.map(v => (
                                <tr key={v.id} style={{ borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
                                    {fdVisibleSet.has('name') && (
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
                                    )}
                                    {fdVisibleSet.has('imo') && (
                                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Hash size={14} /> {v.imoNumber}
                                        </div>
                                    </td>
                                    )}
                                    {fdVisibleSet.has('actions') && (
                                    <td style={{ padding: '16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn-secondary"
                                                style={{ padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                                                onClick={() => setSelectedVessel(v)}
                                            >
                                                Details <ExternalLink size={14} />
                                            </button>
                                            {showRemove && canManageFleets && (
                                                <button
                                                    onClick={() => handleRemoveVessel(v)}
                                                    style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}
                                                    title="Remove from fleet"
                                                    aria-label="Remove from fleet"
                                                >
                                                    <UserMinus size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }

    return (
        <div className="fade-in">
            <button onClick={onBack} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                <ArrowLeft size={18} /> Back to Fleets
            </button>

            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{fleet.name}</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        {activeVessels.length} active vessel{activeVessels.length !== 1 ? 's' : ''}
                        {inactiveVessels.length > 0 && ` · ${inactiveVessels.length} inactive`}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    {canManageFleets && (
                        <button
                            onClick={() => setShowQuickAdd(!showQuickAdd)}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <Plus size={18} /> Add Vessel
                        </button>
                    )}
                    <button
                        onClick={() => handleOpenExportModal('excel')}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        disabled={loading || vessels.length === 0}
                    >
                        <FileSpreadsheet size={18} /> Excel
                    </button>
                    <button
                        onClick={() => handleOpenExportModal('pdf')}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        disabled={loading || vessels.length === 0}
                    >
                        <FileText size={18} /> Fleet PDF
                    </button>
                    <button
                        onClick={() => handleOpenExportModal('zip')}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        disabled={loading || exportingIndividual || activeVessels.length === 0}
                        title={activeVessels.length === 0 ? 'No active vessels' : `Export one PDF per vessel (${activeVessels.length})`}
                    >
                        {exportingIndividual
                            ? <><Loader2 size={18} className="spinner" /> {exportProgress ? `${exportProgress.current}/${exportProgress.total}` : 'Exporting...'}</>
                            : <><FileText size={18} /> Individual PDFs</>
                        }
                    </button>
                </div>
            </header>

            {/* Quick-add vessel search */}
            {showQuickAdd && (
                <div className="glass-card" style={{ padding: '16px', marginBottom: '24px', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <Search size={16} color="var(--text-secondary)" />
                        <input
                            type="text"
                            value={quickAddSearch}
                            onChange={e => setQuickAddSearch(e.target.value)}
                            placeholder="Search vessels by name or IMO to add..."
                            style={{ flex: 1 }}
                            autoFocus
                            aria-label="Search vessels to add"
                        />
                        <button
                            onClick={() => { setShowQuickAdd(false); setQuickAddSearch('') }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                    {availableVessels.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--table-border)', paddingTop: '8px' }}>
                            {availableVessels.map(v => (
                                <div
                                    key={v.id}
                                    onClick={() => handleAddVessel(v)}
                                    style={{
                                        padding: '10px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        cursor: 'pointer',
                                        borderRadius: '6px'
                                    }}
                                    className="hover-effect"
                                >
                                    <Ship size={16} color="var(--accent-primary)" />
                                    <span style={{ fontWeight: '600' }}>{v.name}</span>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>IMO {v.imoNumber}</span>
                                    {!v.isActive && (
                                        <span style={{ fontSize: '0.6rem', background: 'rgba(0,0,0,0.1)', padding: '1px 5px', borderRadius: '3px', color: 'var(--text-secondary)' }}>INACTIVE</span>
                                    )}
                                    <Plus size={14} color="var(--accent-primary)" style={{ marginLeft: 'auto' }} />
                                </div>
                            ))}
                        </div>
                    )}
                    {quickAddSearch.trim() && availableVessels.length === 0 && (
                        <div style={{ padding: '12px', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.9rem' }}>
                            No matching vessels found outside this fleet.
                        </div>
                    )}
                </div>
            )}

            {loading ? (
                <div style={{ color: 'var(--text-secondary)' }}>Loading fleet details...</div>
            ) : (
                <>
                    {renderVesselTable(activeVessels, 'Active Vessels', true)}
                    {renderVesselTable(inactiveVessels, 'Inactive Vessels', true)}

                    {vessels.length === 0 && (
                        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <Ship size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                            <p>No vessels in this fleet yet. Use &quot;Add Vessel&quot; to assign vessels.</p>
                        </div>
                    )}
                </>
            )}

            {/* ZIP Export Vessel Selection Modal */}
            {showZipModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setShowZipModal(false) }}
                >
                    <div style={{
                        background: isLight ? '#ffffff' : '#1a1d28',
                        borderRadius: '16px',
                        width: '520px',
                        maxHeight: '70vh',
                        display: 'flex',
                        flexDirection: 'column',
                        border: '1px solid var(--glass-border)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '20px 24px 16px',
                            borderBottom: '1px solid var(--glass-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexShrink: 0
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Select Vessels for {exportMode === 'excel' ? 'Excel' : exportMode === 'pdf' ? 'Fleet PDF' : 'Individual PDFs'}</h2>
                                <span style={{
                                    background: 'var(--accent-primary)',
                                    color: '#fff',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    padding: '2px 10px',
                                    borderRadius: '12px'
                                }}>
                                    {zipSelectedIds.size} / {exportMode === 'zip' ? activeVessels.length : vessels.length}
                                </span>
                            </div>
                            <button
                                onClick={() => setShowZipModal(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--text-secondary)',
                                    padding: '4px'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search */}
                        <div style={{
                            padding: '12px 24px',
                            borderBottom: '1px solid var(--glass-border)',
                            flexShrink: 0
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: isLight ? '#f0f2f5' : 'rgba(255,255,255,0.05)',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                border: '1px solid var(--input-border)'
                            }}>
                                <Search size={16} color="var(--text-secondary)" />
                                <input
                                    type="text"
                                    value={zipSearch}
                                    onChange={e => setZipSearch(e.target.value)}
                                    placeholder="Search by vessel name or IMO..."
                                    style={{
                                        flex: 1,
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.9rem'
                                    }}
                                    autoFocus
                                />
                                {zipSearch && (
                                    <button
                                        onClick={() => setZipSearch('')}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: 'var(--text-secondary)',
                                            padding: '2px'
                                        }}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Vessel List */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '8px 16px'
                        }}>
                            {filteredZipVessels.map(v => (
                                <div
                                    key={v.id}
                                    onClick={() => {
                                        setZipSelectedIds(prev => {
                                            const next = new Set(prev)
                                            if (next.has(v.id)) next.delete(v.id)
                                            else next.add(v.id)
                                            return next
                                        })
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        background: zipSelectedIds.has(v.id)
                                            ? (isLight ? 'rgba(0,170,200,0.08)' : 'rgba(0,210,255,0.06)')
                                            : 'transparent',
                                        transition: 'background 0.15s'
                                    }}
                                    className="hover-effect"
                                >
                                    {zipSelectedIds.has(v.id)
                                        ? <CheckSquare size={18} color="var(--accent-primary)" />
                                        : <Square size={18} color="var(--text-secondary)" />
                                    }
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontWeight: 600,
                                            fontSize: '0.95rem',
                                            color: 'var(--text-primary)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {v.name}
                                        </div>
                                        <div style={{
                                            fontSize: '0.8rem',
                                            color: 'var(--text-secondary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            <Hash size={12} /> {v.imoNumber}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {filteredZipVessels.length === 0 && zipSearch.trim() && (
                                <div style={{
                                    padding: '24px',
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.9rem'
                                }}>
                                    No vessels match your search.
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '16px 24px',
                            borderTop: '1px solid var(--glass-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexShrink: 0
                        }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    className="btn-secondary"
                                    style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                                    onClick={() => setZipSelectedIds(new Set((exportMode === 'zip' ? activeVessels : vessels).map(v => v.id)))}
                                >
                                    Select All
                                </button>
                                <button
                                    className="btn-secondary"
                                    style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                                    onClick={() => setZipSelectedIds(new Set())}
                                >
                                    Deselect All
                                </button>
                            </div>
                            <button
                                className="btn-primary"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 20px',
                                    fontSize: '0.9rem'
                                }}
                                disabled={zipSelectedIds.size === 0}
                                onClick={() => {
                                    const selectedVessels = vessels.filter(v => zipSelectedIds.has(v.id))
                                    if (selectedVessels.length === 0) return
                                    setShowZipModal(false)
                                    if (exportMode === 'excel') {
                                        const selectedDocs = allDocs.filter(d => zipSelectedIds.has(d.vesselId))
                                        ReportService.exportFleetToExcel(fleet, selectedVessels, docTypes, selectedDocs)
                                    } else if (exportMode === 'pdf') {
                                        const selectedDocs = allDocs.filter(d => zipSelectedIds.has(d.vesselId))
                                        ReportService.exportFleetToPDF(fleet, selectedVessels, docTypes, selectedDocs)
                                    } else {
                                        handleExportIndividualPDFs()
                                    }
                                }}
                            >
                                {exportMode === 'excel' ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
                                {exportMode === 'zip' ? 'Export' : exportMode === 'pdf' ? 'Fleet PDF' : 'Excel'} {zipSelectedIds.size} Vessel{zipSelectedIds.size !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
