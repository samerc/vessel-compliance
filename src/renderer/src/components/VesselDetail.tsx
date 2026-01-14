import { useState, useEffect } from 'react'
import { ArrowLeft, Eye, CheckCircle, AlertCircle, Upload, Trash2, ShieldAlert, ShieldCheck, Calendar, FileSpreadsheet, FileText } from 'lucide-react'
import { Vessel, DocumentType, VesselDocument } from '../../../shared/types'

import { ReportService } from '../services/ReportService'

interface VesselDetailProps {
    vessel: Vessel
    onBack: () => void
}

export default function VesselDetail({ vessel, onBack }: VesselDetailProps) {
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [vesselDocs, setVesselDocs] = useState<VesselDocument[]>([])
    const [dragOverId, setDragOverId] = useState<string | null>(null)
    const [fileStatus, setFileStatus] = useState<Record<string, boolean>>({})

    useEffect(() => {
        loadData()
    }, [vessel])

    const loadData = async () => {
        const types = await window.api.getDocumentTypes()
        const docs = await window.api.getVesselDocuments(vessel.id)
        setDocTypes(types)
        setVesselDocs(docs)

        // Check if files exist on disk
        const status: Record<string, boolean> = {}
        for (const doc of docs) {
            if (doc.filePath) {
                status[doc.documentTypeId] = await window.api.fsExists(doc.filePath)
            }
        }
        setFileStatus(status)
    }

    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy'
        }
        if (dragOverId !== id) {
            console.log(`Dragging over row: ${id}`)
            setDragOverId(id)
        }
    }

    const handleDragEnter = (e: React.DragEvent, id: string) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy'
        }
        console.log(`Drag enter row: ${id}`)
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

        // Use the new getFilePath API for accuracy in modern Electron
        const filePath = window.api.getFilePath(file)

        if (!filePath) {
            console.error("Could not retrieve file path. Check Electron security settings.")
            return
        }

        // Get existing doc or create new one
        const existing = vesselDocs.find(d => d.documentTypeId === docTypeId)

        const newDoc: VesselDocument = {
            vesselId: vessel.id,
            documentTypeId: docTypeId,
            filePath: filePath,
            sent: existing?.sent || false,
            required: existing?.required || false,
            uploadedDate: new Date().toISOString(),
            uploadedBy: 'Current User'
        }

        if (!newDoc.filePath) {
            console.error("File path is missing from dropped file")
            return
        }

        await window.api.upsertVesselDocument(newDoc)
        loadData()
    }

    const handleToggleRequired = async (docTypeId: string) => {
        const existing = vesselDocs.find(d => d.documentTypeId === docTypeId)
        if (existing) {
            const updated = { ...existing, required: !existing.required }
            await window.api.upsertVesselDocument(updated)
        } else {
            const newDoc: VesselDocument = {
                vesselId: vessel.id,
                documentTypeId: docTypeId,
                filePath: '',
                sent: false,
                required: true,
                uploadedDate: new Date().toISOString(),
                uploadedBy: 'Default'
            }
            await window.api.upsertVesselDocument(newDoc)
        }
        loadData()
    }

    const handleUpdateExpiry = async (docTypeId: string, expiryDate: string) => {
        await window.api.updateVesselDocumentExpiry(vessel.id, docTypeId, expiryDate)
        loadData()
    }

    const handleUpdateReceivedDate = async (docTypeId: string, receivedDate: string) => {
        await window.api.updateVesselDocumentReceivedDate(vessel.id, docTypeId, receivedDate)
        loadData()
    }

    const handleDeleteDoc = async (doc: VesselDocument) => {
        if (confirm('Unlink this file? The document record will remain but the file path will be cleared.')) {
            const updated = { ...doc, filePath: '' }
            await window.api.upsertVesselDocument(updated)
            loadData()
        }
    }

    const openFile = (path: string) => {
        if (path) window.api.fsOpen(path)
    }

    return (
        <div className="fade-in">
            <button onClick={onBack} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                <ArrowLeft size={18} /> Back to Fleet
            </button>

            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{vessel.name}</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>IMO: {vessel.imoNumber}</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => ReportService.exportVesselToExcel(vessel, docTypes, vesselDocs)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileSpreadsheet size={18} /> Excel Report
                    </button>
                    <button onClick={() => ReportService.exportVesselToPDF(vessel, docTypes, vesselDocs)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={18} /> PDF Report
                    </button>
                </div>
            </header>

            <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '16px' }}>Document Name</th>
                            <th style={{ padding: '16px' }}>Requirement</th>
                            <th style={{ padding: '16px' }}>File Status</th>
                            <th style={{ padding: '16px' }}>Date of Receipt</th>
                            <th style={{ padding: '16px' }}>Expiry Date</th>
                            <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {docTypes.map(type => {
                            const doc = vesselDocs.find(d => d.documentTypeId === type.id)
                            const exists = fileStatus[type.id]
                            const isRequired = doc?.required || false
                            const hasFile = !!(doc?.filePath)

                            return (
                                <tr
                                    key={type.id}
                                    style={{
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        background: dragOverId === type.id
                                            ? 'rgba(0, 210, 255, 0.2)'
                                            : (isRequired && !hasFile) ? 'rgba(255, 77, 77, 0.05)' : 'transparent',
                                        outline: dragOverId === type.id ? '2px dashed var(--accent-primary)' : 'none',
                                        outlineOffset: '-2px',
                                        transition: 'all 0.2s ease',
                                        cursor: dragOverId === type.id ? 'copy' : 'default'
                                    }}
                                    onDragOver={e => handleDragOver(e, type.id)}
                                    onDragEnter={e => handleDragEnter(e, type.id)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={e => handleDrop(e, type.id)}
                                >
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontWeight: '600' }}>{type.name}</div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <button
                                            onClick={() => handleToggleRequired(type.id)}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid rgba(255,255,255,0.1)',
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
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        {hasFile ? (
                                            exists ? (
                                                <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={16} /> Linked</span>
                                            ) : (
                                                <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertCircle size={16} /> Missing</span>
                                            )
                                        ) : (
                                            <div style={{ color: 'var(--accent-primary)', opacity: 0.6, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px dashed rgba(0, 210, 255, 0.3)', padding: '4px 8px', borderRadius: '4px' }}>
                                                <Upload size={14} /> Drop File Here
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <input
                                            type="date"
                                            value={doc?.receivedDate || ''}
                                            onChange={e => handleUpdateReceivedDate(type.id, e.target.value)}
                                            style={{
                                                background: 'rgba(255,255,255,0.05)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                color: 'white',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.85rem'
                                            }}
                                        />
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Calendar size={14} color="var(--text-secondary)" />
                                            <input
                                                type="date"
                                                value={doc?.expiryDate || ''}
                                                onChange={e => handleUpdateExpiry(type.id, e.target.value)}
                                                style={{
                                                    background: 'rgba(255,255,255,0.05)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    color: 'white',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            {hasFile && (
                                                <>
                                                    <button onClick={() => openFile(doc!.filePath)} className="btn-secondary" style={{ padding: '6px' }} title="View File">
                                                        <Eye size={18} />
                                                    </button>
                                                    <button onClick={() => handleDeleteDoc(doc!)} className="btn-secondary" style={{ padding: '6px', color: 'var(--danger)' }} title="Unlink File">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
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
