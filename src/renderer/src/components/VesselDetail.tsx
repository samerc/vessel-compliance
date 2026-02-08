import { useState, useEffect } from 'react'
import { ArrowLeft, Eye, CheckCircle, AlertCircle, Upload, Trash2, ShieldAlert, ShieldCheck, Calendar, FileSpreadsheet, FileText, ToggleLeft, ToggleRight, Trash, Copy, ChevronDown, ClipboardList, Download, StickyNote } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { Vessel, DocumentType, VesselDocument, VesselNameHistory, FlagState } from '../../../shared/types'
import { getFlagClass } from '../utils/countryCodeMap'
import 'flag-icons/css/flag-icons.min.css'

import { ReportService } from '../services/ReportService'
import AssuredManager from './AssuredManager'
import ConditionSurveyManager from './ConditionSurveyManager'
import ConfirmationModal from './ConfirmationModal'

interface VesselDetailProps {
    vessel: Vessel
    onBack: () => void
    backLabel?: string
}

export default function VesselDetail({ vessel, onBack, backLabel = 'Back to Vessels' }: VesselDetailProps) {
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [vesselDocs, setVesselDocs] = useState<VesselDocument[]>([])
    const [dragOverId, setDragOverId] = useState<string | null>(null)
    const [fileStatus, setFileStatus] = useState<Record<string, boolean>>({})
    const [vesselActive, setVesselActive] = useState(vessel.isActive)

    // Confirmation modal state
    const [confirmation, setConfirmation] = useState<{
        show: boolean
        title: string
        message: string
        onConfirm: () => void
        isDangerous?: boolean
    }>({ show: false, title: '', message: '', onConfirm: () => { } })
    const { theme } = useTheme()
    const { user, isAdmin } = useAuth()
    const { showSuccess, showError } = useToast()
    const isLight = theme === 'light'

    useEffect(() => {
        loadData()
    }, [vessel])


    const loadData = async () => {
        const types = await window.api.getDocumentTypes()
        const docs = await window.api.getVesselDocuments(vessel.id)

        // Custom sort: Required first, then by the 'order' defined in Admin.
        const sortedTypes = [...types].sort((a, b) => {
            const docA = docs.find(d => d.documentTypeId === a.id)
            const docB = docs.find(d => d.documentTypeId === b.id)
            const isReqA = docA ? docA.required : a.required
            const isReqB = docB ? docB.required : b.required

            if (isReqA !== isReqB) {
                return isReqA ? -1 : 1 // Required comes first
            }
            return a.order - b.order // Then by defined order
        })

        setDocTypes(sortedTypes)
        setVesselDocs(docs)

        // Check if files exist on disk
        const status: Record<string, boolean> = {}
        for (const doc of docs) {
            if (doc.filePath) {
                status[doc.documentTypeId] = await window.api.fsExists(doc.filePath)
            }
        }
        setFileStatus(status)

        // Load supplementary data separately so failures don't break core functionality
        try {
            const history = await window.api.getVesselNameHistory(vessel.id)
            setNameHistory(history || [])
        } catch { /* ignore */ }
        try {
            const fs = await window.api.getFlagStates()
            setFlagStates(fs || [])
        } catch { /* ignore */ }
    }

    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy'
        }
        if (dragOverId !== id) {
            setDragOverId(id)
        }
    }

    const handleDragEnter = (e: React.DragEvent, id: string) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy'
        }
        setDragOverId(id)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOverId(null)
    }

    const handleDrop = async (e: React.DragEvent, docTypeId: string) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOverId(null)

        const files = e.dataTransfer.files
        if (files.length === 0) return
        const file = files[0]

        const filePath = window.api.getFilePath(file)

        if (!filePath) {
            console.error("Could not retrieve file path. Check Electron security settings.")
            return
        }

        // Security: Validate file type
        const validation = await window.api.fileTypesValidateFile(filePath)
        if (!validation.valid) {
            alert(`File rejected: ${validation.reason}`)
            return
        }

        const existing = vesselDocs.find(d => d.documentTypeId === docTypeId)

        const newDoc: VesselDocument = {
            vesselId: vessel.id,
            documentTypeId: docTypeId,
            filePath: filePath,
            sent: existing?.sent || false,
            required: existing ? existing.required : (docTypes.find(t => t.id === docTypeId)?.required || false),
            uploadedDate: new Date().toISOString(),
            uploadedBy: user?.username || 'Unknown',
            receivedDate: new Date().toISOString().split('T')[0]
        }

        if (!newDoc.filePath) {
            console.error("File path is missing from dropped file")
            return
        }

        await window.api.upsertVesselDocument(newDoc)
        loadData()
    }

    const handleClickUpload = async (docTypeId: string) => {
        const filePath = await window.api.dialogOpenFileAny()
        if (!filePath) return

        const validation = await window.api.fileTypesValidateFile(filePath)
        if (!validation.valid) {
            showError(`File rejected: ${validation.reason}`)
            return
        }

        const existing = vesselDocs.find(d => d.documentTypeId === docTypeId)

        const newDoc: VesselDocument = {
            vesselId: vessel.id,
            documentTypeId: docTypeId,
            filePath: filePath,
            sent: existing?.sent || false,
            required: existing ? existing.required : (docTypes.find(t => t.id === docTypeId)?.required || false),
            uploadedDate: new Date().toISOString(),
            uploadedBy: user?.username || 'Unknown',
            receivedDate: new Date().toISOString().split('T')[0]
        }

        await window.api.upsertVesselDocument(newDoc)
        showSuccess('Document linked successfully')
        loadData()
    }

    const handleToggleRequired = async (docTypeId: string) => {
        const existing = vesselDocs.find(d => d.documentTypeId === docTypeId)
        const docType = docTypes.find(t => t.id === docTypeId)

        if (existing) {
            const updated = { ...existing, required: !existing.required }
            await window.api.upsertVesselDocument(updated)
        } else {
            const newDoc: VesselDocument = {
                vesselId: vessel.id,
                documentTypeId: docTypeId,
                filePath: '',
                sent: false,
                required: docType ? !docType.required : true,
                uploadedDate: new Date().toISOString(),
                uploadedBy: user?.username || 'System'
            }
            await window.api.upsertVesselDocument(newDoc)
        }
        loadData()
    }

    const handleUpdateExpiry = async (docTypeId: string, expiryDate: string) => {
        await window.api.updateVesselDocumentExpiry(vessel.id, docTypeId, expiryDate)
        loadData()
    }

    const handleDeleteDoc = async (doc: VesselDocument) => {
        setConfirmation({
            show: true,
            title: 'Unlink File?',
            message: 'Are you sure you want to unlink this file? The document record will remain but the file path will be cleared.',
            onConfirm: async () => {
                const updated = { ...doc, filePath: '' }
                await window.api.upsertVesselDocument(updated)
                loadData()
                setConfirmation(prev => ({ ...prev, show: false }))
            }
        })
    }

    const handleDuplicateDoc = async (doc: VesselDocument) => {
        try {
            await window.api.duplicateVesselDocument(doc.id!, user?.username || 'Unknown')
            showSuccess('Document duplicated')
            loadData()
        } catch (error: any) {
            showError(error.message || 'Failed to duplicate document')
        }
    }

    const handleDeleteDocById = async (doc: VesselDocument) => {
        setConfirmation({
            show: true,
            title: 'Remove Document?',
            message: 'Are you sure you want to remove this document entry?',
            isDangerous: true,
            onConfirm: async () => {
                await window.api.deleteVesselDocumentById(doc.id!)
                loadData()
                setConfirmation(prev => ({ ...prev, show: false }))
            }
        })
    }

    const openFile = (path: string) => {
        if (path) window.api.fsOpen(path)
    }

    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState(vessel.name)
    const [editImo, setEditImo] = useState(vessel.imoNumber)
    const [detailView, setDetailView] = useState<'documents' | 'surveys'>('documents')
    const [showExportMenu, setShowExportMenu] = useState(false)
    const [nameHistory, setNameHistory] = useState<VesselNameHistory[]>([])
    const [showNotesModal, setShowNotesModal] = useState(false)
    const [vesselNotes, setVesselNotes] = useState(vessel.notes || '')
    const [flagStates, setFlagStates] = useState<FlagState[]>([])
    const [selectedFlagStateId, setSelectedFlagStateId] = useState(vessel.flagStateId || '')

    const handleSaveVessel = async () => {
        if (!editName.trim() || !editImo.trim()) return
        await window.api.updateVessel(vessel.id, { name: editName, imoNumber: editImo })
        vessel.name = editName
        vessel.imoNumber = editImo
        setIsEditing(false)
        showSuccess('Vessel details updated')
        // Reload to refresh name history
        const history = await window.api.getVesselNameHistory(vessel.id)
        setNameHistory(history || [])
    }

    const handleToggleVesselActive = async () => {
        const newStatus = !vesselActive
        await window.api.updateVessel(vessel.id, { isActive: newStatus })
        setVesselActive(newStatus)
        vessel.isActive = newStatus
        showSuccess(`Vessel is now ${newStatus ? 'ACTIVE' : 'INACTIVE'}`)
    }

    const handleDeleteVessel = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const confirmMsg = 'Are you sure you want to delete this vessel? \n\nThis will also delete all its documents and linked assureds that are not associated with other vessels. \n\nTHIS ACTION CANNOT BE UNDONE.'

        setConfirmation({
            show: true,
            title: 'Delete Vessel?',
            message: confirmMsg,
            isDangerous: true,
            onConfirm: async () => {
                const result = await window.api.deleteVessel(vessel.id)
                if (result.success) {
                    showSuccess('Vessel deleted successfully')
                    onBack()
                } else {
                    showError(result.message || 'Failed to delete vessel')
                }
                setConfirmation(prev => ({ ...prev, show: false }))
            }
        })
    }

    return (
        <div className="fade-in">
            <button onClick={onBack} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                <ArrowLeft size={18} /> {backLabel}
            </button>

            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value.toUpperCase())}
                                style={{ fontSize: '2.5rem', width: '100%', textTransform: 'uppercase' }}
                                aria-label="Vessel name"
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>IMO:</span>
                                <input
                                    type="text"
                                    value={editImo}
                                    onChange={e => setEditImo(e.target.value)}
                                    style={{ padding: '4px 8px', borderRadius: '4px' }}
                                    aria-label="IMO number"
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{vessel.name}</h1>
                            <p style={{ color: 'var(--text-secondary)' }}>IMO: {vessel.imoNumber}</p>
                            {nameHistory.length > 0 && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                    Former name{nameHistory.length > 1 ? 's' : ''}: {nameHistory.map((h, i) => (
                                        <span key={h.id}>
                                            <em>{h.previousName}</em>
                                            <span style={{ fontSize: '0.7rem', opacity: 0.7 }}> ({new Date(h.changedAt).toLocaleDateString()})</span>
                                            {i < nameHistory.length - 1 ? ', ' : ''}
                                        </span>
                                    ))}
                                </p>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Policy Expiry:</span>
                                <input
                                    type="date"
                                    value={vessel.policyExpiryDate || ''}
                                    onChange={async (e) => {
                                        await window.api.updateVessel(vessel.id, { policyExpiryDate: e.target.value })
                                        vessel.policyExpiryDate = e.target.value
                                        showSuccess('Policy expiry date updated')
                                    }}
                                    style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}
                                    aria-label="Policy expiry date"
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Flag:</span>
                                {(() => {
                                    const currentFlag = flagStates.find(f => f.id === selectedFlagStateId)
                                    const flagCls = currentFlag ? getFlagClass(currentFlag.iso3Code) : ''
                                    return flagCls ? <span className={flagCls} style={{ fontSize: '1.1rem' }}></span> : null
                                })()}
                                <select
                                    value={selectedFlagStateId}
                                    onChange={async (e) => {
                                        const newId = e.target.value || null
                                        await window.api.updateVessel(vessel.id, { flagStateId: newId as any })
                                        vessel.flagStateId = newId || undefined
                                        setSelectedFlagStateId(e.target.value)
                                        showSuccess('Flag state updated')
                                    }}
                                    style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', background: 'var(--table-header-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                                    aria-label="Flag state"
                                >
                                    <option value="">No flag</option>
                                    {flagStates.map(fs => (
                                        <option key={fs.id} value={fs.id}>{fs.name} ({fs.iso3Code})</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {isEditing ? (
                        <>
                            <button onClick={handleSaveVessel} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckCircle size={18} /> Save Changes
                            </button>
                            <button onClick={() => { setIsEditing(false); setEditName(vessel.name); setEditImo(vessel.imoNumber); }} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setIsEditing(true)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Edit Details
                            </button>
                            <button
                                onClick={handleToggleVesselActive}
                                className="btn-secondary"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    color: vesselActive ? 'var(--accent-primary)' : 'var(--text-secondary)'
                                }}
                            >
                                {vesselActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                {vesselActive ? 'Active' : 'Inactive'}
                            </button>
                            {isAdmin && (
                                <button
                                    type="button"
                                    onClick={handleDeleteVessel}
                                    className="btn-secondary"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        color: 'var(--danger)',
                                        borderColor: 'rgba(255, 77, 77, 0.3)'
                                    }}
                                >
                                    <Trash size={18} /> Delete Vessel
                                </button>
                            )}
                            <button
                                onClick={() => setShowNotesModal(true)}
                                className="btn-secondary"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    position: 'relative',
                                    color: vesselNotes ? 'var(--accent-primary)' : undefined
                                }}
                            >
                                <StickyNote size={18} /> Notes
                                {vesselNotes && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-2px',
                                        right: '-2px',
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: 'var(--accent-primary)'
                                    }} />
                                )}
                            </button>
                            <button
                                onClick={() => setDetailView(detailView === 'documents' ? 'surveys' : 'documents')}
                                className="btn-secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                {detailView === 'documents' ? (
                                    <><ClipboardList size={18} /> Surveys</>
                                ) : (
                                    <><FileText size={18} /> Documents</>
                                )}
                            </button>
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                    className="btn-secondary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <Download size={18} /> Export <ChevronDown size={14} />
                                </button>
                                {showExportMenu && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        marginTop: '4px',
                                        background: isLight ? '#ffffff' : '#1e222a',
                                        border: '1px solid var(--glass-border)',
                                        borderRadius: '8px',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                                        zIndex: 100,
                                        minWidth: '160px',
                                        overflow: 'hidden'
                                    }}>
                                        <button
                                            onClick={() => { ReportService.exportVesselToExcel(vessel, docTypes, vesselDocs); setShowExportMenu(false); }}
                                            style={{
                                                width: '100%',
                                                padding: '10px 16px',
                                                textAlign: 'left',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                background: 'transparent',
                                                border: 'none',
                                                borderBottom: '1px solid var(--glass-border)',
                                                color: 'var(--text-primary)',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                            className="hover-effect"
                                        >
                                            <FileSpreadsheet size={16} /> Excel Report
                                        </button>
                                        <button
                                            onClick={() => { ReportService.exportVesselToPDF(vessel, docTypes, vesselDocs); setShowExportMenu(false); }}
                                            style={{
                                                width: '100%',
                                                padding: '10px 16px',
                                                textAlign: 'left',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-primary)',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                            className="hover-effect"
                                        >
                                            <FileText size={16} /> PDF Report
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </header>

            {detailView === 'documents' && <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                    <caption className="sr-only">Document compliance</caption>
                    <thead>
                        <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                            <th scope="col" style={{ padding: '18px 16px' }}>Document Name</th>
                            <th scope="col" style={{ padding: '18px 16px' }}>Requirement</th>
                            <th scope="col" style={{ padding: '18px 16px' }}>File Status</th>
                            <th scope="col" style={{ padding: '18px 16px' }}>Date of Receipt</th>
                            <th scope="col" style={{ padding: '18px 16px' }}>Expiry Date</th>
                            <th scope="col" style={{ padding: '18px 16px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {docTypes.map(type => {
                            const docsForType = vesselDocs.filter(d => d.documentTypeId === type.id)
                            const doc = docsForType[0]
                            const extraDocs = docsForType.slice(1)
                            const isRequired = doc ? doc.required : (type.required || false)

                            const renderDocRow = (rowDoc: VesselDocument | undefined, rowType: DocumentType, isExtra: boolean, key: string) => {
                                const rowHasFile = !!(rowDoc?.filePath)
                                const rowExists = fileStatus[rowType.id]

                                return (
                                    <tr
                                        key={key}
                                        style={{
                                            borderBottom: '1px solid var(--table-border)',
                                            background: dragOverId === rowType.id
                                                ? 'rgba(0, 210, 255, 0.2)'
                                                : (isRequired && !rowHasFile && !isExtra) ? 'rgba(255, 77, 77, 0.1)' : 'transparent',
                                            outline: dragOverId === rowType.id ? '2px dashed var(--accent-primary)' : 'none',
                                            outlineOffset: '-2px',
                                            transition: 'all 0.2s ease',
                                            cursor: dragOverId === rowType.id ? 'copy' : 'default'
                                        }}
                                        onDragOver={e => handleDragOver(e, rowType.id)}
                                        onDragEnter={e => handleDragEnter(e, rowType.id)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={e => handleDrop(e, rowType.id)}
                                    >
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ fontWeight: isExtra ? '400' : '600', paddingLeft: isExtra ? '20px' : '0', color: isExtra ? 'var(--text-secondary)' : 'inherit' }}>
                                                {isExtra ? `${rowType.name} (copy)` : rowType.name}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            {!isExtra && (
                                                <button
                                                    onClick={() => handleToggleRequired(rowType.id)}
                                                    style={{
                                                        background: 'transparent',
                                                        border: '1px solid var(--table-border)',
                                                        padding: '4px 8px',
                                                        borderRadius: '20px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        color: isRequired ? 'var(--danger)' : 'var(--text-secondary)',
                                                        fontSize: '0.75rem'
                                                    }}
                                                    title="Toggle Mandatory"
                                                >
                                                    {isRequired ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                                                    {isRequired ? 'REQUIRED' : 'OPTIONAL'}
                                                </button>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            {rowHasFile ? (
                                                (isExtra || rowExists) ? (
                                                    <div
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            padding: '4px 10px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                            background: isLight ? 'rgba(0, 140, 70, 0.12)' : 'rgba(0, 255, 136, 0.1)',
                                                            border: isLight ? '1px solid rgba(0, 140, 70, 0.35)' : '1px solid rgba(0, 255, 136, 0.3)',
                                                            color: isLight ? '#008c46' : '#00ff88',
                                                            textTransform: 'uppercase'
                                                        }}
                                                    >
                                                        <CheckCircle size={14} />
                                                        LINKED
                                                    </div>
                                                ) : (
                                                    <div
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            padding: '4px 10px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                            background: isLight ? 'rgba(200, 0, 0, 0.12)' : 'rgba(255, 77, 77, 0.1)',
                                                            border: isLight ? '1px solid rgba(200, 0, 0, 0.35)' : '1px solid rgba(255, 77, 77, 0.3)',
                                                            color: isLight ? '#c00000' : '#ff4d4d',
                                                            textTransform: 'uppercase'
                                                        }}
                                                    >
                                                        <AlertCircle size={14} />
                                                        MISSING
                                                    </div>
                                                )
                                            ) : (
                                                <button
                                                    onClick={() => handleClickUpload(rowType.id)}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '500',
                                                        background: isLight ? 'rgba(0, 119, 163, 0.05)' : 'rgba(0, 210, 255, 0.05)',
                                                        border: `1px dashed ${isLight ? 'rgba(0, 119, 163, 0.3)' : 'rgba(0, 210, 255, 0.3)'}`,
                                                        color: isLight ? '#0077a3' : '#00d2ff',
                                                        textTransform: 'uppercase',
                                                        cursor: 'pointer'
                                                    }}
                                                    title="Click to browse or drag a file here"
                                                >
                                                    <Upload size={14} />
                                                    UPLOAD FILE
                                                </button>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                {rowDoc?.receivedDate ? new Date(rowDoc.receivedDate).toLocaleDateString() : '-'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Calendar size={14} color="var(--text-secondary)" />
                                                <input
                                                    type="date"
                                                    value={rowDoc?.expiryDate || ''}
                                                    onChange={e => handleUpdateExpiry(rowType.id, e.target.value)}
                                                    onFocus={() => {
                                                        if (rowType.annualRenewal && !rowDoc?.expiryDate && vessel.policyExpiryDate) {
                                                            handleUpdateExpiry(rowType.id, vessel.policyExpiryDate)
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.85rem',
                                                        ...(rowType.annualRenewal ? { borderColor: 'rgba(59, 130, 246, 0.3)' } : {})
                                                    }}
                                                    aria-label={`Expiry date for ${rowType.name}`}
                                                />
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                {rowHasFile && (
                                                    <>
                                                        <button onClick={() => openFile(rowDoc!.filePath)} className="btn-secondary" style={{ padding: '6px' }} title="View File" aria-label="View file">
                                                            <Eye size={18} />
                                                        </button>
                                                        <button onClick={() => handleDuplicateDoc(rowDoc!)} className="btn-secondary" style={{ padding: '6px' }} title="Duplicate Document" aria-label="Duplicate document">
                                                            <Copy size={18} />
                                                        </button>
                                                        {isExtra ? (
                                                            <button onClick={() => handleDeleteDocById(rowDoc!)} className="btn-secondary" style={{ padding: '6px', color: 'var(--danger)' }} title="Remove Document" aria-label="Remove document">
                                                                <Trash2 size={18} />
                                                            </button>
                                                        ) : (
                                                            <button onClick={() => handleDeleteDoc(rowDoc!)} className="btn-secondary" style={{ padding: '6px', color: 'var(--danger)' }} title="Unlink File" aria-label="Unlink file">
                                                                <Trash2 size={18} />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            }

                            return [
                                renderDocRow(doc, type, false, type.id),
                                ...extraDocs.map(ed => renderDocRow(ed, type, true, ed.id!))
                            ]
                        })}
                    </tbody>
                </table>
            </div>}

            {detailView === 'documents' && <AssuredManager vessel={vessel} />}

            {detailView === 'surveys' && <ConditionSurveyManager vessel={vessel} />}

            {confirmation.show && (
                <ConfirmationModal
                    title={confirmation.title}
                    message={confirmation.message}
                    isDangerous={confirmation.isDangerous}
                    onConfirm={confirmation.onConfirm}
                    onCancel={() => setConfirmation(prev => ({ ...prev, show: false }))}
                />
            )}

            {showNotesModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', zIndex: 1000
                }} onClick={() => setShowNotesModal(false)}>
                    <div style={{
                        background: isLight ? '#ffffff' : '#1e222a',
                        borderRadius: '16px', padding: '24px', width: '500px', maxWidth: '90vw',
                        border: '1px solid var(--glass-border)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <StickyNote size={20} color="var(--accent-primary)" /> Vessel Notes
                        </h3>
                        <textarea
                            value={vesselNotes}
                            onChange={e => setVesselNotes(e.target.value)}
                            placeholder="Add notes about this vessel..."
                            rows={8}
                            style={{
                                width: '100%', resize: 'vertical',
                                marginBottom: '16px', fontSize: '0.9rem'
                            }}
                            aria-label="Vessel notes"
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                onClick={() => {
                                    setVesselNotes(vessel.notes || '')
                                    setShowNotesModal(false)
                                }}
                                className="btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    await window.api.updateVessel(vessel.id, { notes: vesselNotes })
                                    vessel.notes = vesselNotes
                                    showSuccess('Notes saved')
                                    setShowNotesModal(false)
                                }}
                                className="btn-primary"
                            >
                                Save Notes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
