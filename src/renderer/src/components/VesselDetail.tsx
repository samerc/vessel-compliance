import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Eye, CheckCircle, AlertCircle, Upload, Trash2, Calendar, FileSpreadsheet, FileText, ToggleLeft, ToggleRight, Trash, Copy, ChevronDown, ClipboardList, Download, StickyNote, Plus, X, Shield, RefreshCcw } from 'lucide-react'
//import { ArrowLeft, Eye, CheckCircle, AlertCircle, Upload, Trash2, Calendar, FileSpreadsheet, FileText, ToggleLeft, ToggleRight, Trash, Copy, ChevronDown, ClipboardList, Download, StickyNote, Plus, X, Shield, RefreshCcw } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { Vessel, DocumentType, VesselDocument, VesselNameHistory, FlagState, VesselCustomDocType, PolicyType, VesselPolicy, VesselDynamicPolicy, VesselAuditEntry, PolicyTypeCharacteristic, PolicyTypeCondition, Entity, ClassificationSociety, VesselType } from '../../../shared/types'
import { getFlagClass, countryNameToIso3 } from '../utils/countryCodeMap'
import 'flag-icons/css/flag-icons.min.css'

import { ReportService } from '../services/ReportService'
import AssuredManager from './AssuredManager'
import ConditionSurveyManager from './ConditionSurveyManager'
import ConfirmationModal from './ConfirmationModal'

interface VesselDetailProps {
    vessel: Vessel
    onBack: () => void
    backLabel?: string
    initialSection?: 'documents' | 'surveys' | 'policies'
}

export default function VesselDetail({ vessel, onBack, backLabel = 'Back to Vessels', initialSection }: VesselDetailProps) {
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
        const customTypes = await window.api.getVesselCustomDocTypes(vessel.id)

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
        setCustomDocTypes(customTypes)

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
        try {
            const cs = await window.api.getClassificationSocieties()
            setClassSocieties(cs || [])
        } catch { /* ignore */ }
        try {
            const vt = await window.api.getVesselTypes()
            setVesselTypes(vt || [])
        } catch { /* ignore */ }
        try {
            const [pt, vp] = await Promise.all([
                window.api.getPolicyTypes(),
                window.api.getVesselPolicies(vessel.id)
            ])
            setAllPolicyTypes(pt || [])
            setVesselPolicies(vp || [])
            setAssignedPolicyTypeIds(new Set((vp || []).map((p: VesselPolicy) => p.policyTypeId)))
        } catch { /* ignore */ }
    }

    const loadDynamicPolicies = async () => {
        try {
            const dp = await window.api.getVesselDynamicPolicies(vessel.id)
            setDynamicPolicies(dp || [])
        } catch { /* ignore */ }
    }

    const loadAuditLog = async () => {
        try {
            const log = await window.api.getVesselAuditLog(vessel.id)
            setAuditLog(log || [])
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
        const isCustom = customDocTypes.some(c => c.id === docTypeId)

        const newDoc: VesselDocument = {
            vesselId: vessel.id,
            documentTypeId: docTypeId,
            filePath: filePath,
            sent: existing?.sent || false,
            required: existing ? existing.required : (isCustom ? true : (docTypes.find(t => t.id === docTypeId)?.required || false)),
            expiryDate: existing?.expiryDate || undefined,
            uploadedDate: new Date().toISOString(),
            uploadedBy: user?.username || 'Unknown',
            receivedDate: new Date().toISOString().split('T')[0]
        }

        if (!newDoc.filePath) {
            console.error("File path is missing from dropped file")
            return
        }

        await window.api.upsertVesselDocument(newDoc)
        await loadData()
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
        const isCustom = customDocTypes.some(c => c.id === docTypeId)

        const newDoc: VesselDocument = {
            vesselId: vessel.id,
            documentTypeId: docTypeId,
            filePath: filePath,
            sent: existing?.sent || false,
            required: existing ? existing.required : (isCustom ? true : (docTypes.find(t => t.id === docTypeId)?.required || false)),
            expiryDate: existing?.expiryDate || undefined,
            uploadedDate: new Date().toISOString(),
            uploadedBy: user?.username || 'Unknown',
            receivedDate: new Date().toISOString().split('T')[0]
        }

        await window.api.upsertVesselDocument(newDoc)
        showSuccess('Document linked successfully')
        await loadData()
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
    const [detailView, setDetailView] = useState<'documents' | 'surveys' | 'policies' | 'history'>(initialSection || 'documents')
    const [dynamicPolicies, setDynamicPolicies] = useState<VesselDynamicPolicy[]>([])
    const [auditLog, setAuditLog] = useState<VesselAuditEntry[]>([])
    const [showExportMenu, setShowExportMenu] = useState(false)
    const [nameHistory, setNameHistory] = useState<VesselNameHistory[]>([])
    const [showNotesModal, setShowNotesModal] = useState(false)
    const [vesselNotes, setVesselNotes] = useState(vessel.notes || '')
    const [flagStates, setFlagStates] = useState<FlagState[]>([])
    const [selectedFlagStateId, setSelectedFlagStateId] = useState(vessel.flagStateId || '')
    const [showAddFlagModal, setShowAddFlagModal] = useState(false)
    const [newFlagName, setNewFlagName] = useState('')
    const [newFlagIso3, setNewFlagIso3] = useState('')
    const [newFlagAddress, setNewFlagAddress] = useState('')
    const [newFlagEmail, setNewFlagEmail] = useState('')
    const [editBuiltYear, setEditBuiltYear] = useState(vessel.builtYear?.toString() || '')
    const [editGrossTonnage, setEditGrossTonnage] = useState(vessel.grossTonnage?.toString() || '')
    const [editVesselType, setEditVesselType] = useState(vessel.vesselType || '')
    const [editClassification, setEditClassification] = useState(vessel.classificationSociety || '')
    const [editCallSign, setEditCallSign] = useState(vessel.callSign || '')
    const [classSocieties, setClassSocieties] = useState<ClassificationSociety[]>([])
    const [vesselTypes, setVesselTypes] = useState<VesselType[]>([])
    const [customDocTypes, setCustomDocTypes] = useState<VesselCustomDocType[]>([])
    const [showAddCustomDoc, setShowAddCustomDoc] = useState(false)
    const [newCustomDocName, setNewCustomDocName] = useState('')
    const [showPoliciesModal, setShowPoliciesModal] = useState(false)
    const [allPolicyTypes, setAllPolicyTypes] = useState<PolicyType[]>([])
    const [vesselPolicies, setVesselPolicies] = useState<VesselPolicy[]>([])
    const [assignedPolicyTypeIds, setAssignedPolicyTypeIds] = useState<Set<string>>(new Set())

    const handleTogglePolicy = async (policyTypeId: string) => {
        try {
            if (assignedPolicyTypeIds.has(policyTypeId)) {
                // Remove
                const vp = vesselPolicies.find(p => p.policyTypeId === policyTypeId)
                if (vp) {
                    await window.api.deleteVesselPolicy(vp.id)
                    setVesselPolicies(prev => prev.filter(p => p.id !== vp.id))
                    setAssignedPolicyTypeIds(prev => { const n = new Set(prev); n.delete(policyTypeId); return n })
                }
            } else {
                // Add
                const vp = await window.api.addVesselPolicy(vessel.id, policyTypeId)
                setVesselPolicies(prev => [...prev, vp])
                setAssignedPolicyTypeIds(prev => new Set([...prev, policyTypeId]))
            }
        } catch (err: any) {
            showError(err.message || 'Failed to update policies')
        }
    }

    const handleAddFlag = async () => {
        if (!newFlagName.trim() || !newFlagIso3.trim()) return
        try {
            const created = await window.api.addFlagState({
                name: newFlagName.trim(),
                iso3Code: newFlagIso3.trim().toUpperCase(),
                address: newFlagAddress.trim() || undefined,
                email: newFlagEmail.trim() || undefined
            })
            setFlagStates(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
            setSelectedFlagStateId(created.id)
            vessel.flagStateId = created.id
            await window.api.updateVessel(vessel.id, { flagStateId: created.id as any })
            setShowAddFlagModal(false)
            setNewFlagName('')
            setNewFlagIso3('')
            setNewFlagAddress('')
            setNewFlagEmail('')
            showSuccess('Flag state created and assigned')
        } catch (err: any) {
            showError(err.message || 'Failed to create flag state')
        }
    }

    const handleAddCustomDocType = async () => {
        if (!newCustomDocName.trim()) return
        await window.api.addVesselCustomDocType({
            vesselId: vessel.id,
            name: newCustomDocName.trim(),
            order: customDocTypes.length
        })
        setNewCustomDocName('')
        setShowAddCustomDoc(false)
        showSuccess('Custom document type added')
        loadData()
    }

    const handleDeleteCustomDocType = async (customType: VesselCustomDocType) => {
        setConfirmation({
            show: true,
            title: 'Remove Custom Document Type?',
            message: `Are you sure you want to remove "${customType.name}"? Any linked file will also be removed.`,
            isDangerous: true,
            onConfirm: async () => {
                // Delete any vessel document linked to this custom type
                const linkedDoc = vesselDocs.find(d => d.documentTypeId === customType.id)
                if (linkedDoc?.id) {
                    await window.api.deleteVesselDocumentById(linkedDoc.id)
                }
                await window.api.deleteVesselCustomDocType(customType.id)
                showSuccess('Custom document type removed')
                loadData()
                setConfirmation(prev => ({ ...prev, show: false }))
            }
        })
    }

    const handleSaveVessel = async () => {
        if (!editName.trim() || !editImo.trim()) return
        await window.api.updateVessel(vessel.id, {
            name: editName,
            imoNumber: editImo,
            builtYear: editBuiltYear ? parseInt(editBuiltYear) : null,
            grossTonnage: editGrossTonnage ? parseFloat(editGrossTonnage) : null,
            vesselType: editVesselType || null,
            classificationSociety: editClassification || null,
            callSign: editCallSign || null,
            flagStateId: selectedFlagStateId || null
        } as any)
        vessel.name = editName
        vessel.imoNumber = editImo
        vessel.builtYear = editBuiltYear ? parseInt(editBuiltYear) : undefined
        vessel.grossTonnage = editGrossTonnage ? parseFloat(editGrossTonnage) : undefined
        vessel.vesselType = editVesselType || undefined
        vessel.classificationSociety = editClassification || undefined
        vessel.callSign = editCallSign || undefined
        vessel.flagStateId = selectedFlagStateId || undefined
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
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Built:</span>
                                    <input type="number" value={editBuiltYear} onChange={e => setEditBuiltYear(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', width: '80px' }} aria-label="Built year" />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>GT:</span>
                                    <input type="number" value={editGrossTonnage} onChange={e => setEditGrossTonnage(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', width: '100px' }} aria-label="Gross tonnage" />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Type:</span>
                                    <select
                                        value={editVesselType}
                                        onChange={e => setEditVesselType(e.target.value)}
                                        style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', width: '160px' }}
                                        aria-label="Vessel type"
                                    >
                                        <option value="">No type</option>
                                        {vesselTypes.map(vt => (
                                            <option key={vt.id} value={vt.name}>{vt.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Class:</span>
                                    <select
                                        value={editClassification}
                                        onChange={e => setEditClassification(e.target.value)}
                                        style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', width: '160px' }}
                                        aria-label="Classification society"
                                    >
                                        <option value="">No class</option>
                                        {classSocieties.map(cs => (
                                            <option key={cs.id} value={cs.abbreviation || cs.name}>{cs.name}{cs.abbreviation ? ` (${cs.abbreviation})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Call Sign:</span>
                                    <input type="text" value={editCallSign} onChange={e => setEditCallSign(e.target.value.toUpperCase())} style={{ padding: '4px 8px', borderRadius: '4px', width: '100px', textTransform: 'uppercase' }} aria-label="Call sign" />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Flag:</span>
                                    <select
                                        value={selectedFlagStateId}
                                        onChange={e => setSelectedFlagStateId(e.target.value)}
                                        style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                                        aria-label="Flag state"
                                    >
                                        <option value="">No flag</option>
                                        {flagStates.map(fs => (
                                            <option key={fs.id} value={fs.id}>{fs.name} ({fs.iso3Code})</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => setShowAddFlagModal(true)}
                                        title="Add new flag state"
                                        style={{ background: 'none', border: '1px solid var(--glass-border)', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {vessel.name}
                                {(() => {
                                    const currentFlag = flagStates.find(f => f.id === selectedFlagStateId)
                                    const flagCls = currentFlag ? getFlagClass(currentFlag.iso3Code) : ''
                                    return flagCls ? <span className={flagCls} style={{ fontSize: '1.4rem' }}></span> : null
                                })()}
                            </h1>
                            <p style={{ color: 'var(--text-secondary)' }}>IMO: {vessel.imoNumber}</p>
                            {(vessel.builtYear || vessel.grossTonnage || vessel.vesselType || vessel.classificationSociety || vessel.callSign) && (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                                    {[
                                        vessel.builtYear && `Built ${vessel.builtYear}`,
                                        vessel.grossTonnage && `GT ${vessel.grossTonnage}`,
                                        vessel.vesselType,
                                        vessel.classificationSociety && `Class: ${vessel.classificationSociety}`,
                                        vessel.callSign && `Call Sign: ${vessel.callSign}`
                                    ].filter(Boolean).join(' · ')}
                                </p>
                            )}
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
                        </>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {isEditing ? (
                        <>
                            <button onClick={handleSaveVessel} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckCircle size={18} /> Save Changes
                            </button>
                            <button onClick={() => { setIsEditing(false); setEditName(vessel.name); setEditImo(vessel.imoNumber); setEditBuiltYear(vessel.builtYear?.toString() || ''); setEditGrossTonnage(vessel.grossTonnage?.toString() || ''); setEditVesselType(vessel.vesselType || ''); setEditClassification(vessel.classificationSociety || ''); setEditCallSign(vessel.callSign || ''); }} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setIsEditing(true)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.82rem' }}>
                                Edit Details
                            </button>
                            <button
                                onClick={handleToggleVesselActive}
                                className="btn-secondary"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    fontSize: '0.82rem',
                                    color: vesselActive ? 'var(--accent-primary)' : 'var(--text-secondary)'
                                }}
                            >
                                {vesselActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                {vesselActive ? 'Active' : 'Inactive'}
                            </button>
                            <button
                                onClick={() => setShowNotesModal(true)}
                                className="btn-secondary"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    fontSize: '0.82rem',
                                    position: 'relative',
                                    color: vesselNotes ? 'var(--accent-primary)' : undefined
                                }}
                            >
                                <StickyNote size={16} /> Notes
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
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                    className="btn-secondary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.82rem' }}
                                >
                                    <Download size={16} /> Export <ChevronDown size={14} />
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
                            {isAdmin && (
                                <button
                                    type="button"
                                    onClick={handleDeleteVessel}
                                    className="btn-secondary"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 12px',
                                        fontSize: '0.82rem',
                                        color: 'var(--danger)',
                                        borderColor: 'rgba(255, 77, 77, 0.3)'
                                    }}
                                >
                                    <Trash size={16} /> Delete
                                </button>
                            )}
                        </>
                    )}
                </div>
            </header>

            {/* Section navigation tabs */}
            <div style={{
                display: 'flex',
                gap: '0',
                borderBottom: '2px solid var(--table-border)',
                marginBottom: '16px'
            }}>
                {(['documents', 'surveys', 'policies', 'history'] as const).map(view => (
                    <button
                        key={view}
                        onClick={() => {
                            setDetailView(view)
                            if (view === 'policies') loadDynamicPolicies()
                            if (view === 'history') loadAuditLog()
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 20px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: detailView === view ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            marginBottom: '-2px',
                            color: detailView === view ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            fontWeight: detailView === view ? '600' : '400',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'var(--transition)'
                        }}
                    >
                        {view === 'documents' && <FileText size={18} />}
                        {view === 'surveys' && <ClipboardList size={18} />}
                        {view === 'policies' && <Shield size={18} />}
                        {view === 'history' && <Calendar size={18} />}
                        {view.charAt(0).toUpperCase() + view.slice(1)}
                    </button>
                ))}
            </div>

            {detailView === 'documents' && <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                    <caption className="sr-only">Document compliance</caption>
                    <thead>
                        <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                            <th scope="col" style={{ padding: '18px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    Document Name
                                    <button
                                        onClick={() => setShowAddCustomDoc(!showAddCustomDoc)}
                                        style={{
                                            background: isLight ? 'rgba(0, 119, 163, 0.12)' : 'rgba(0, 210, 255, 0.12)',
                                            border: `1px solid ${isLight ? 'rgba(0, 119, 163, 0.3)' : 'rgba(0, 210, 255, 0.3)'}`,
                                            borderRadius: '6px',
                                            padding: '3px 8px',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            color: 'var(--accent-primary)',
                                            fontSize: '0.75rem',
                                            fontWeight: '600'
                                        }}
                                        title="Add custom document type"
                                    >
                                        <Plus size={14} />
                                        Custom
                                    </button>
                                </div>
                            </th>
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
                                                        background: isRequired ? 'rgba(128, 128, 128, 0.1)' : 'transparent',
                                                        border: '1px solid var(--table-border)',
                                                        padding: '4px 8px',
                                                        borderRadius: '20px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        color: 'var(--text-secondary)',
                                                        fontSize: '0.75rem',
                                                        cursor: 'pointer'
                                                    }}
                                                    title="Toggle Mandatory"
                                                >
                                                    {isRequired ? 'Mandatory' : 'Optional'}
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
                                            {rowType.annualRenewal ? (
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Annual</span>
                                            ) : !rowHasFile ? (
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>-</span>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Calendar size={14} color="var(--text-secondary)" />
                                                    <input
                                                        type="date"
                                                        value={rowDoc?.expiryDate || ''}
                                                        onChange={e => handleUpdateExpiry(rowType.id, e.target.value)}
                                                        style={{
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.85rem'
                                                        }}
                                                        aria-label={`Expiry date for ${rowType.name}`}
                                                    />
                                                </div>
                                            )}
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
                        {customDocTypes.map(customType => {
                            const doc = vesselDocs.find(d => d.documentTypeId === customType.id)
                            const rowHasFile = !!(doc?.filePath)
                            const rowExists = fileStatus[customType.id]

                            return (
                                <tr
                                    key={customType.id}
                                    style={{
                                        borderBottom: '1px solid var(--table-border)',
                                        background: dragOverId === customType.id
                                            ? 'rgba(0, 210, 255, 0.2)'
                                            : (!rowHasFile) ? 'rgba(255, 77, 77, 0.05)' : 'transparent',
                                        outline: dragOverId === customType.id ? '2px dashed var(--accent-primary)' : 'none',
                                        outlineOffset: '-2px',
                                        transition: 'all 0.2s ease',
                                        cursor: dragOverId === customType.id ? 'copy' : 'default'
                                    }}
                                    onDragOver={e => handleDragOver(e, customType.id)}
                                    onDragEnter={e => handleDragEnter(e, customType.id)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={e => handleDrop(e, customType.id)}
                                >
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {customType.name}
                                            <span style={{
                                                fontSize: '0.65rem',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: isLight ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.2)',
                                                color: isLight ? '#3b82f6' : '#93c5fd',
                                                fontWeight: '500'
                                            }}>Custom</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CUSTOM</span>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        {rowHasFile ? (
                                            rowExists ? (
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
                                                onClick={() => handleClickUpload(customType.id)}
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
                                            {doc?.receivedDate ? new Date(doc.receivedDate).toLocaleDateString() : '-'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        {!rowHasFile ? (
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>-</span>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Calendar size={14} color="var(--text-secondary)" />
                                                <input
                                                    type="date"
                                                    value={doc?.expiryDate || ''}
                                                    onChange={e => handleUpdateExpiry(customType.id, e.target.value)}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.85rem'
                                                    }}
                                                    aria-label={`Expiry date for ${customType.name}`}
                                                />
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            {rowHasFile && (
                                                <>
                                                    <button onClick={() => openFile(doc!.filePath)} className="btn-secondary" style={{ padding: '6px' }} title="View File" aria-label="View file">
                                                        <Eye size={18} />
                                                    </button>
                                                    <button onClick={() => handleDeleteDoc(doc!)} className="btn-secondary" style={{ padding: '6px', color: 'var(--danger)' }} title="Unlink File" aria-label="Unlink file">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </>
                                            )}
                                            <button onClick={() => handleDeleteCustomDocType(customType)} className="btn-secondary" style={{ padding: '6px', color: 'var(--danger)' }} title="Remove custom document type" aria-label="Remove custom document type">
                                                <X size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                        {showAddCustomDoc && (
                            <tr style={{ borderBottom: '1px solid var(--table-border)', background: isLight ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.1)' }}>
                                <td colSpan={6} style={{ padding: '12px 16px' }}>
                                    <form
                                        onSubmit={e => { e.preventDefault(); handleAddCustomDocType() }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
                                    >
                                        <input
                                            type="text"
                                            value={newCustomDocName}
                                            onChange={e => setNewCustomDocName(e.target.value)}
                                            placeholder="Custom document type name..."
                                            style={{ flex: 1, padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem' }}
                                            autoFocus
                                            aria-label="Custom document type name"
                                        />
                                        <button
                                            type="submit"
                                            className="btn-primary"
                                            style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                                            disabled={!newCustomDocName.trim()}
                                        >
                                            Add
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                            onClick={() => { setShowAddCustomDoc(false); setNewCustomDocName('') }}
                                        >
                                            Cancel
                                        </button>
                                    </form>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>}

            {detailView === 'documents' && <AssuredManager vessel={vessel} />}

            {detailView === 'surveys' && <ConditionSurveyManager vessel={vessel} />}

            {detailView === 'policies' && (
                <DynamicPoliciesView
                    vesselId={vessel.id}
                    dynamicPolicies={dynamicPolicies}
                    isLight={isLight}
                    onReload={loadDynamicPolicies}
                    showSuccess={showSuccess}
                    showError={showError}
                />
            )}

            {detailView === 'history' && (
                <VesselHistoryView auditLog={auditLog} isLight={isLight} />
            )}

            {confirmation.show && (
                <ConfirmationModal
                    title={confirmation.title}
                    message={confirmation.message}
                    isDangerous={confirmation.isDangerous}
                    onConfirm={confirmation.onConfirm}
                    onCancel={() => setConfirmation(prev => ({ ...prev, show: false }))}
                />
            )}

            {showAddFlagModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', zIndex: 1000
                }} onClick={() => setShowAddFlagModal(false)}>
                    <div style={{
                        background: isLight ? '#ffffff' : '#1e222a',
                        borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '90vw',
                        border: '1px solid var(--glass-border)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '16px' }}>Add Flag State</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Country *</label>
                                <select
                                    value={newFlagIso3}
                                    onChange={e => {
                                        const iso3 = e.target.value
                                        setNewFlagIso3(iso3)
                                        const country = countryNameToIso3.find(c => c.iso3 === iso3)
                                        setNewFlagName(country ? country.name : '')
                                    }}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                                    autoFocus
                                >
                                    <option value="">Select a country...</option>
                                    {countryNameToIso3.map(c => (
                                        <option key={c.iso3} value={c.iso3}>{c.name} ({c.iso3})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Address</label>
                                <input
                                    value={newFlagAddress}
                                    onChange={e => setNewFlagAddress(e.target.value)}
                                    placeholder="Optional"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Email</label>
                                <input
                                    value={newFlagEmail}
                                    onChange={e => setNewFlagEmail(e.target.value)}
                                    placeholder="Optional"
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                                />
                            </div>
                        </div>
                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button onClick={() => setShowAddFlagModal(false)} className="btn-secondary">Cancel</button>
                            <button
                                onClick={handleAddFlag}
                                disabled={!newFlagName.trim() || !newFlagIso3.trim()}
                                className="btn-primary"
                                style={{ opacity: (!newFlagName.trim() || !newFlagIso3.trim()) ? 0.5 : 1 }}
                            >
                                Add Flag State
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPoliciesModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', zIndex: 1000
                }} onClick={() => setShowPoliciesModal(false)}>
                    <div style={{
                        background: isLight ? '#ffffff' : '#1e222a',
                        borderRadius: '16px', padding: '24px', width: '400px', maxWidth: '90vw',
                        border: '1px solid var(--glass-border)'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '16px' }}>Assign Policy Types</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            Toggle policy types for this vessel. Used by the Dynamic Address Book.
                        </p>
                        {allPolicyTypes.map(pt => (
                            <label key={pt.id} style={{
                                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px',
                                borderRadius: '8px', cursor: 'pointer', marginBottom: '4px',
                                background: assignedPolicyTypeIds.has(pt.id) ? 'rgba(0, 210, 255, 0.08)' : 'transparent'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={assignedPolicyTypeIds.has(pt.id)}
                                    onChange={() => handleTogglePolicy(pt.id)}
                                    style={{ accentColor: 'var(--accent-primary)' }}
                                />
                                <span>{pt.name}</span>
                            </label>
                        ))}
                        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowPoliciesModal(false)} className="btn-secondary">Done</button>
                        </div>
                    </div>
                </div>
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

// ==================== Dynamic Policies View ====================

function formatCurrency(value?: number, currency?: string): string {
    if (value == null) return '-'
    const sym = currency === 'EUR' ? '\u20AC' : '$'
    return `${sym}${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function DynamicPoliciesView({ vesselId, dynamicPolicies, isLight, onReload, showSuccess, showError }: {
    vesselId: string
    dynamicPolicies: VesselDynamicPolicy[]
    isLight: boolean
    onReload: () => void
    showSuccess: (msg: string) => void
    showError: (msg: string) => void
}) {
    const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
    const [characteristics, setCharacteristics] = useState<PolicyTypeCharacteristic[]>([])
    const [conditions, setConditions] = useState<PolicyTypeCondition[]>([])
    const [entities, setEntities] = useState<Entity[]>([])
    const [activeTypeTab, setActiveTypeTab] = useState<string>('current')
    const [collapsedPolicies, setCollapsedPolicies] = useState<Set<string>>(new Set())
    const [showAddModal, setShowAddModal] = useState(false)
    const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null)

    // Add/edit form state
    const [formTypeId, setFormTypeId] = useState('')
    const [formNumber, setFormNumber] = useState('')
    const [formConditionId, setFormConditionId] = useState('')
    const [formStatus, setFormStatus] = useState<'active' | 'expired' | 'cancelled'>('active')
    const [formCurrency, setFormCurrency] = useState('USD')
    const [formBrokerId, setFormBrokerId] = useState('')
    const [formNotes, setFormNotes] = useState('')
    const [formValues, setFormValues] = useState<Record<string, any>>({})
    const modalRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        loadMeta()
    }, [])

    // Focus trap for modal
    useEffect(() => {
        if (!showAddModal) return
        const modal = modalRef.current
        if (!modal) return

        // Small timeout to allow render
        setTimeout(() => {
            const focusable = modal.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            first?.focus()

            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') { setShowAddModal(false); return }
                if (e.key === 'Tab') {
                    if (e.shiftKey) {
                        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
                    } else {
                        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
                    }
                }
            }
            document.addEventListener('keydown', handleKeyDown)
            return () => document.removeEventListener('keydown', handleKeyDown)
        }, 50)
    }, [showAddModal])

    const loadMeta = async () => {
        try {
            const [pt, allChars, allConds, ent] = await Promise.all([
                window.api.getPolicyTypes(),
                window.api.getPolicyTypeCharacteristics(),
                window.api.getPolicyTypeConditions(),
                window.api.getEntities()
            ])
            setPolicyTypes(pt || [])
            setCharacteristics(allChars || [])
            setConditions(allConds || [])
            setEntities(ent || [])
        } catch { /* ignore */ }
    }

    const toggleCollapse = (id: string) => {
        setCollapsedPolicies(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }

    // Filter policies
    const filtered = dynamicPolicies.filter(p => {
        if (activeTypeTab === 'current') return p.status === 'active'
        return p.policyTypeId === activeTypeTab
    })

    // Group by policy type
    const groupedByType = new Map<string, VesselDynamicPolicy[]>()
    for (const p of filtered) {
        const key = p.policyTypeName || p.policyTypeId
        if (!groupedByType.has(key)) groupedByType.set(key, [])
        groupedByType.get(key)!.push(p)
    }

    const openAddModal = () => {
        setEditingPolicyId(null)
        setFormTypeId(policyTypes[0]?.id || '')
        setFormNumber('')
        setFormConditionId('')
        setFormStatus('active')
        setFormCurrency('USD')
        setFormBrokerId('')
        setFormNotes('')
        setFormValues({})

        setShowAddModal(true)
    }

    const openEditModal = (p: VesselDynamicPolicy) => {
        console.log('Opening edit modal for policy:', p)
        setEditingPolicyId(p.id)
        setFormTypeId(p.policyTypeId)
        // Strip the warning suffix if present so it doesn't persist after edit
        const rawNumber = p.policyNumber || ''
        setFormNumber(rawNumber.replace(' (RENEWED - PLEASE VERIFY)', ''))
        setFormConditionId(p.conditionId || '')
        setFormStatus(p.status)
        setFormCurrency(p.currency)
        setFormBrokerId(p.brokerEntityId || '')
        setFormNotes(p.notes || '')
        const vals: Record<string, any> = {}
        if (p.values) {
            for (const v of p.values) {
                if (v.fieldType === 'amount') vals[v.characteristicId] = v.valueAmount
                else if (v.fieldType === 'date') vals[v.characteristicId] = v.valueDate
                else if (v.fieldType === 'boolean') vals[v.characteristicId] = v.valueBoolean
                else vals[v.characteristicId] = v.valueText
            }
        }
        console.log('Initial form values:', vals)
        setFormValues(vals)

        setShowAddModal(true)
    }

    const handleSavePolicy = async () => {
        if (!formTypeId) return
        try {
            const typeChars = characteristics.filter(c => c.policyTypeId === formTypeId)
            if (editingPolicyId) {
                await window.api.updateVesselDynamicPolicy(editingPolicyId, {
                    policyNumber: formNumber, conditionId: formConditionId || undefined,
                    status: formStatus, currency: formCurrency,
                    brokerEntityId: formBrokerId || undefined, notes: formNotes
                })
                const vals = typeChars.map(c => ({
                    characteristicId: c.id,
                    valueText: c.fieldType === 'text' || c.fieldType === 'select' ? (formValues[c.id] || '') : undefined,
                    valueAmount: c.fieldType === 'amount' ? (parseFloat(formValues[c.id]) || undefined) : undefined,
                    valueDate: c.fieldType === 'date' ? (formValues[c.id] || undefined) : undefined,
                    valueBoolean: c.fieldType === 'boolean' ? (formValues[c.id] || false) : undefined
                }))
                await window.api.setVesselDynamicPolicyValues(editingPolicyId, vals)
                showSuccess('Policy updated')
            } else {
                const newId = await window.api.addVesselDynamicPolicy({
                    vesselId, policyTypeId: formTypeId, policyNumber: formNumber,
                    conditionId: formConditionId || undefined, status: formStatus,
                    currency: formCurrency, brokerEntityId: formBrokerId || undefined, notes: formNotes
                })
                const vals = typeChars.map(c => ({
                    characteristicId: c.id,
                    valueText: c.fieldType === 'text' || c.fieldType === 'select' ? (formValues[c.id] || '') : undefined,
                    valueAmount: c.fieldType === 'amount' ? (parseFloat(formValues[c.id]) || undefined) : undefined,
                    valueDate: c.fieldType === 'date' ? (formValues[c.id] || undefined) : undefined,
                    valueBoolean: c.fieldType === 'boolean' ? (formValues[c.id] || false) : undefined
                }))
                await window.api.setVesselDynamicPolicyValues(newId, vals)
                showSuccess('Policy added')
            }
            setShowAddModal(false)
            onReload()
        } catch (err: any) {
            showError(err.message || 'Failed to save policy')
        }
    }

    const handleDeletePolicy = async (id: string) => {
        if (!confirm('Delete this policy?')) return
        await window.api.deleteVesselDynamicPolicy(id)
        showSuccess('Policy deleted')
        onReload()
    }

    const handleRenewPolicy = async (p: VesselDynamicPolicy) => {
        if (!confirm('Renew this policy? A new copy will be created with incremented dates.')) return

        try {
            // 1. Conditionally expire old policy
            // Find expiry date characteristic
            const expiryChar = characteristics.find(c => c.name.toLowerCase().includes('expiry') || c.name.toLowerCase().includes('expiration'))
            let shouldExpire = false

            if (expiryChar && p.values) {
                const expiryVal = p.values.find(v => v.characteristicId === expiryChar.id)
                if (expiryVal && expiryVal.valueDate) {
                    const todayStr = new Date().toISOString().split('T')[0]
                    if (expiryVal.valueDate > todayStr) {
                        shouldExpire = true
                    }
                }
            }

            if (shouldExpire) {
                await window.api.updateVesselDynamicPolicy(p.id, { status: 'expired' })
            }

            // 2. Create new policy
            const newId = await window.api.addVesselDynamicPolicy({
                vesselId: p.vesselId,
                policyTypeId: p.policyTypeId,
                policyNumber: (p.policyNumber || '') + ' (RENEWED - PLEASE VERIFY)',
                conditionId: p.conditionId,
                status: 'active',
                currency: p.currency,
                brokerEntityId: p.brokerEntityId,
                notes: p.notes
            })

            // 3. Copy and increment values
            if (p.values) {
                const newVals = p.values.map(v => {
                    let valDate = v.valueDate
                    // Increment date by 1 year if it's a date field
                    if (v.fieldType === 'date' && v.valueDate) {
                        try {
                            const d = new Date(v.valueDate)
                            d.setFullYear(d.getFullYear() + 1)
                            valDate = d.toISOString().split('T')[0]
                        } catch (e) {
                            console.error("Failed to parse date", v.valueDate)
                        }
                    }

                    return {
                        characteristicId: v.characteristicId,
                        valueText: v.valueText,
                        valueAmount: v.valueAmount,
                        valueDate: valDate,
                        valueBoolean: v.valueBoolean
                    }
                })
                await window.api.setVesselDynamicPolicyValues(newId, newVals)
            }

            // 4. Reload and notify
            onReload()
            showSuccess('Policy renewed. Please review and edit the new policy details.')

        } catch (err: any) {
            showError(err.message || 'Failed to renew policy')
        }
    }

    const typeCharsForForm = characteristics.filter(c => c.policyTypeId === formTypeId)
    const typeCondsForForm = conditions.filter(c => c.policyTypeId === formTypeId)

    const statusColors: Record<string, { bg: string; color: string }> = {
        active: { bg: 'rgba(0, 200, 100, 0.1)', color: isLight ? '#008c46' : '#00ff88' },
        expired: { bg: 'rgba(128, 128, 128, 0.1)', color: 'var(--text-secondary)' },
        cancelled: { bg: 'rgba(255, 77, 77, 0.1)', color: isLight ? '#c00000' : '#ff4d4d' }
    }

    return (
        <div>
            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button onClick={openAddModal} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                    <Plus size={16} /> Add Policy
                </button>
            </div>

            {/* Type tabs: Current + per-type */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button onClick={() => setActiveTypeTab('current')} className={activeTypeTab === 'current' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: '0.8rem', padding: '4px 12px' }}>Current</button>
                {policyTypes.map(pt => (
                    <button key={pt.id} onClick={() => setActiveTypeTab(pt.id)} className={activeTypeTab === pt.id ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: '0.8rem', padding: '4px 12px' }}>{pt.name}</button>
                ))}
            </div>

            {/* Dynamic policies */}
            {filtered.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filtered.map(p => {
                        const isCollapsed = collapsedPolicies.has(p.id)
                        const sc = statusColors[p.status] || statusColors.active
                        return (
                            <div key={p.id} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                                {/* Header */}
                                <div onClick={() => toggleCollapse(p.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', cursor: 'pointer', background: isCollapsed ? 'transparent' : 'rgba(0,210,255,0.03)' }}>
                                    <ChevronDown size={16} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-secondary)' }} />
                                    <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{p.policyTypeName}</span>
                                    {p.policyNumber && <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>#{p.policyNumber.replace(' (RENEWED - PLEASE VERIFY)', '')}</span>}
                                    {p.conditionName && <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(0,210,255,0.1)', color: 'var(--accent-primary)' }}>{p.conditionName}</span>}
                                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: sc.bg, color: sc.color, fontWeight: '600', textTransform: 'uppercase' }}>{p.status}</span>
                                    {p.policyNumber && p.policyNumber.includes('RENEWED') && (
                                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: 'var(--danger)', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <AlertCircle size={10} /> NEEDS EDITING
                                        </span>
                                    )}
                                    {p.brokerName && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>via {p.brokerName}</span>}
                                </div>
                                {/* Body */}
                                {!isCollapsed && (
                                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--table-border)' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', paddingTop: '12px' }}>
                                            {p.values && p.values.map(v => (
                                                <div key={v.id} style={{ fontSize: '0.85rem' }}>
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{v.characteristicName}</span>
                                                    <div style={{ fontWeight: '500' }}>
                                                        {v.fieldType === 'amount' ? formatCurrency(v.valueAmount, p.currency) :
                                                            v.fieldType === 'boolean' ? (v.valueBoolean ? 'Yes' : 'No') :
                                                                v.fieldType === 'date' ? (v.valueDate || '-') :
                                                                    (v.valueText || '-')}
                                                    </div>
                                                </div>
                                            ))}
                                            <div style={{ fontSize: '0.85rem' }}>
                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Currency</span>
                                                <div style={{ fontWeight: '500' }}>{p.currency}</div>
                                            </div>
                                        </div>
                                        {p.notes && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', fontStyle: 'italic' }}>{p.notes}</p>}
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                            <button onClick={() => openEditModal(p)} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>Edit</button>
                                            <button onClick={() => handleRenewPolicy(p)} className="btn-primary" style={{ fontSize: '0.8rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <RefreshCcw size={14} /> Renew
                                            </button>
                                            <button onClick={() => handleDeletePolicy(p.id)} style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: '4px', fontSize: '0.8rem', padding: '4px 12px', cursor: 'pointer' }}>Delete</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '32px' }}>
                    {dynamicPolicies.length > 0 ? 'No policies match the current filter.' : 'No policies added yet.'}
                </p>
            )}

            {/* Add/Edit Modal */}
            {/* Add/Edit Modal */}
            {showAddModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }} onClick={() => setShowAddModal(false)}>
                    <div
                        ref={modalRef}
                        role="dialog"
                        aria-modal="true"
                        onClick={e => e.stopPropagation()}
                        style={{ background: isLight ? '#ffffff' : '#1a1e26', borderRadius: '12px', padding: '24px', width: '600px', maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--glass-border)' }}
                    >
                        <h3 style={{ marginBottom: '16px' }}>{editingPolicyId ? 'Edit Policy' : 'Add Policy'}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {!editingPolicyId && (
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Policy Type</label>
                                    <select name="policyType" value={formTypeId} onChange={e => { setFormTypeId(e.target.value); setFormConditionId(''); setFormValues({}) }} style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                                        {policyTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Policy Number</label>
                                    <input
                                        type="text"
                                        value={formNumber}
                                        onChange={e => {
                                            console.log('Policy Number Change:', e.target.value)
                                            setFormNumber(e.target.value)
                                        }}
                                        onFocus={() => console.log('Policy Number Focused')}
                                        style={{ width: '100%', padding: '8px', borderRadius: '4px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Status</label>
                                    <select value={formStatus} onChange={e => setFormStatus(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                                        <option value="active">Active</option>
                                        <option value="expired">Expired</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Currency</label>
                                    <select value={formCurrency} onChange={e => setFormCurrency(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                                        <option value="USD">USD ($)</option>
                                        <option value="EUR">EUR (\u20AC)</option>
                                        <option value="GBP">GBP (\u00A3)</option>
                                    </select>
                                </div>
                                {typeCondsForForm.length > 0 && (
                                    <div>
                                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Condition</label>
                                        <select value={formConditionId} onChange={e => setFormConditionId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                                            <option value="">None</option>
                                            {typeCondsForForm.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Broker</label>
                                    <select value={formBrokerId} onChange={e => setFormBrokerId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                                        <option value="">Direct (No broker)</option>
                                        {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Dynamic characteristic fields */}
                            {typeCharsForForm.length > 0 && (
                                <div>
                                    <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>Characteristics</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        {typeCharsForForm.map(c => (
                                            <div key={c.id}>
                                                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{c.name} {c.isRequired && '*'}</label>
                                                {c.fieldType === 'text' && (
                                                    <input type="text" name={`policy_${c.id}`} value={formValues[c.id] || ''} onChange={e => {
                                                        console.log('Changing text input:', c.id, e.target.value)
                                                        setFormValues(prev => ({ ...prev, [c.id]: e.target.value }))
                                                    }} style={{ width: '100%', padding: '8px', borderRadius: '4px' }} />
                                                )}
                                                {c.fieldType === 'date' && (
                                                    <input type="date" value={formValues[c.id] || ''} onChange={e => setFormValues(prev => ({ ...prev, [c.id]: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }} />
                                                )}
                                                {c.fieldType === 'amount' && (
                                                    <input type="number" step="0.01" value={formValues[c.id] || ''} onChange={e => setFormValues(prev => ({ ...prev, [c.id]: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '4px' }} />
                                                )}
                                                {c.fieldType === 'boolean' && (
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                        <input type="checkbox" checked={!!formValues[c.id]} onChange={e => setFormValues(prev => ({ ...prev, [c.id]: e.target.checked }))} /> Yes
                                                    </label>
                                                )}
                                                {c.fieldType === 'select' && c.selectOptions && (
                                                    <select value={formValues[c.id] || ''} onChange={e => setFormValues(prev => ({ ...prev, [c.id]: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                                                        <option value="">Select...</option>
                                                        {c.selectOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Notes</label>
                                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '8px', borderRadius: '4px', resize: 'vertical' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
                                <button onClick={handleSavePolicy} className="btn-primary">{editingPolicyId ? 'Update' : 'Add'} Policy</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ==================== Vessel History View ====================

function VesselHistoryView({ auditLog, isLight }: { auditLog: VesselAuditEntry[]; isLight: boolean }) {
    if (auditLog.length === 0) {
        return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '32px' }}>No changes recorded yet.</p>
    }

    return (
        <div style={{ position: 'relative', paddingLeft: '24px' }}>
            {/* Vertical timeline line */}
            <div style={{ position: 'absolute', left: '8px', top: '4px', bottom: '4px', width: '2px', background: 'var(--glass-border)' }} />

            {auditLog.map((entry, i) => {
                const date = new Date(entry.changedAt)
                return (
                    <div key={entry.id} style={{ position: 'relative', marginBottom: '16px', paddingLeft: '16px' }}>
                        {/* Dot */}
                        <div style={{
                            position: 'absolute', left: '-20px', top: '6px', width: '12px', height: '12px',
                            borderRadius: '50%', background: i === 0 ? 'var(--accent-primary)' : 'var(--glass-border)',
                            border: '2px solid ' + (isLight ? '#fff' : '#1a1e26')
                        }} />
                        <div className="glass-card" style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>{entry.fieldName}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>by {entry.changedBy}</span>
                            </div>
                            <div style={{ fontSize: '0.85rem' }}>
                                {entry.oldValue && <span style={{ textDecoration: 'line-through', color: 'var(--text-secondary)' }}>{entry.oldValue}</span>}
                                {entry.oldValue && entry.newValue && <span style={{ margin: '0 6px', color: 'var(--text-secondary)' }}>&rarr;</span>}
                                {entry.newValue && <span style={{ fontWeight: '500' }}>{entry.newValue}</span>}
                                {!entry.oldValue && entry.newValue && <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}> (set)</span>}
                                {entry.oldValue && !entry.newValue && <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}> (cleared)</span>}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

