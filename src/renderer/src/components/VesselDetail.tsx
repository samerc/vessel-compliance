import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Eye, CheckCircle, AlertCircle, Upload, Trash2, Calendar, FileSpreadsheet, FileText, ToggleLeft, ToggleRight, Trash, Copy, ChevronDown, ClipboardList, Download, Plus, X, Shield, RefreshCcw, Users, MessageSquare, LayoutGrid, List, Search, Clock, ArrowRight, Hash, Tag, FolderSearch, FolderOpen } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { Vessel, DocumentType, VesselDocument, VesselNameHistory, FlagState, VesselCustomDocType, PolicyType, VesselPolicy, VesselDynamicPolicy, VesselAuditEntry, PolicyTypeCharacteristic, PolicyTypeCondition, Entity, ClassificationSociety, VesselType } from '../../../shared/types'
import { getFlagClass, countryNameToIso3 } from '../utils/countryCodeMap'
import { formatDate, formatDateTime, formatDateShort, formatDateLong } from '../utils/dateUtils'
import { resolveEffectivePolicyExpiry } from '../utils/policyUtils'
import 'flag-icons/css/flag-icons.min.css'

import { ReportService } from '../services/ReportService'
import { ReportServiceV2 } from '../services/ReportServiceV2'
import VesselDocumentsView from './VesselDocumentsView'
import AssuredManager from './AssuredManager'
import ConditionSurveyManager from './ConditionSurveyManager'
import WarrantyManager from './WarrantyManager'
import ConfirmationModal from './ConfirmationModal'
import RemapFilePathsModal from './RemapFilePathsModal'

interface VesselDetailProps {
    vessel: Vessel
    onBack: () => void
    backLabel?: string
    initialSection?: 'documents' | 'assureds' | 'surveys' | 'policies' | 'history'
    initialEditing?: boolean
}

export default function VesselDetail({ vessel, onBack, backLabel = 'Back to Vessels', initialSection, initialEditing = false }: VesselDetailProps) {
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [vesselDocs, setVesselDocs] = useState<VesselDocument[]>([])
    const [dragOverId, setDragOverId] = useState<string | null>(null)
    const [fileStatus, setFileStatus] = useState<Record<string, boolean>>({})
    const [vesselActive, setVesselActive] = useState(vessel.isActive)
    const [showRemapModal, setShowRemapModal] = useState(false)

    // Confirmation modal state
    const [confirmation, setConfirmation] = useState<{
        show: boolean
        title: string
        message: string
        onConfirm: () => void
        isDangerous?: boolean
    }>({ show: false, title: '', message: '', onConfirm: () => { } })
    const { theme } = useTheme()
    const { user, hasPermission } = useAuth()
    const { showSuccess, showError } = useToast()
    const isLight = theme === 'light'

    useEffect(() => {
        loadData()
    }, [vessel])

    // Track recent item view
    useEffect(() => {
        window.api.recentItemsAdd('vessel', vessel.id, vessel.name, vessel.imoNumber ? 'IMO: ' + vessel.imoNumber : undefined).then(() => {
            window.dispatchEvent(new Event('recent-item-added'))
        }).catch(() => {})
    }, [vessel.id])


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
            setNameHistory(Array.isArray(history) ? history : [])
        } catch { /* ignore */ }
        try {
            const fs = await window.api.getFlagStates()
            setFlagStates(Array.isArray(fs) ? fs : [])
        } catch { /* ignore */ }
        try {
            const cs = await window.api.getClassificationSocieties()
            setClassSocieties(Array.isArray(cs) ? [...cs].sort((a, b) => a.name.localeCompare(b.name)) : [])
        } catch { /* ignore */ }
        try {
            const vcs = await window.api.getVesselClassifications(vessel.id)
            setVesselClassificationIds(new Set(Array.isArray(vcs) ? vcs.map((vc: any) => vc.classificationSocietyId) : []))
        } catch { /* ignore */ }
        try {
            const vt = await window.api.getVesselTypes()
            setVesselTypes(Array.isArray(vt) ? vt : [])
        } catch { /* ignore */ }
        try {
            const [pt, vp] = await Promise.all([
                window.api.getPolicyTypes(),
                window.api.getVesselPolicies(vessel.id)
            ])
            setAllPolicyTypes(Array.isArray(pt) ? pt : [])
            setVesselPolicies(Array.isArray(vp) ? vp : [])
            setAssignedPolicyTypeIds(new Set(Array.isArray(vp) ? vp.map((p: VesselPolicy) => p.policyTypeId) : []))
        } catch { /* ignore */ }
        try {
            const dp = await window.api.getVesselDynamicPolicies(vessel.id)
            setDynamicPolicies(Array.isArray(dp) ? dp : [])
        } catch { /* ignore */ }
        try {
            const notes = await window.api.getVesselNotes(vessel.id)
            setVesselNoteCount(Array.isArray(notes) ? notes.length : 0)
        } catch { /* ignore */ }
    }

    const loadDynamicPolicies = async () => {
        try {
            const dp = await window.api.getVesselDynamicPolicies(vessel.id)
            setDynamicPolicies(Array.isArray(dp) ? dp : [])
        } catch { /* ignore */ }
    }

    const loadAuditLog = async () => {
        try {
            const log = await window.api.getVesselAuditLog(vessel.id)
            setAuditLog(Array.isArray(log) ? log : [])
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
            expiryDate: undefined,
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
            expiryDate: undefined,
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

    const [isEditing, setIsEditing] = useState(initialEditing)
    useEffect(() => { if (initialEditing) setIsEditing(true) }, [initialEditing])
    const [editName, setEditName] = useState(vessel.name)
    const [editImo, setEditImo] = useState(vessel.imoNumber)
    const [editingExpiry, setEditingExpiry] = useState<Record<string, string>>({})
    const [editingReceived, setEditingReceived] = useState<Record<string, string>>({})
    const [detailView, setDetailView] = useState<'documents' | 'assureds' | 'surveys' | 'policies' | 'history'>(initialSection || 'documents')
    useEffect(() => {
        if (initialSection) {
            setDetailView(initialSection)
            if (initialSection === 'policies' || initialSection === 'surveys') loadDynamicPolicies()
            if (initialSection === 'history') loadAuditLog()
        }
    }, [initialSection])
    const [dynamicPolicies, setDynamicPolicies] = useState<VesselDynamicPolicy[]>([])
    const [auditLog, setAuditLog] = useState<VesselAuditEntry[]>([])
    const [showExportMenu, setShowExportMenu] = useState(false)
    const [nameHistory, setNameHistory] = useState<VesselNameHistory[]>([])
    const [showNotesModal, setShowNotesModal] = useState(false)
    const [vesselNotesList, setVesselNotesList] = useState<any[]>([])
    const [vesselNotesLoading, setVesselNotesLoading] = useState(false)
    const [newVesselNoteText, setNewVesselNoteText] = useState('')
    const [vesselNotesSaving, setVesselNotesSaving] = useState(false)
    const [replyingToNoteId, setReplyingToNoteId] = useState<string | null>(null)
    const [replyText, setReplyText] = useState('')
    const [mentionUsers, setMentionUsers] = useState<{ id: string; username: string }[]>([])
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionTarget, setMentionTarget] = useState<'new' | 'reply'>('new')
    const [vesselNoteCount, setVesselNoteCount] = useState(0)
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
    const [vesselClassificationIds, setVesselClassificationIds] = useState<Set<string>>(new Set())
    const [classDropdownOpen, setClassDropdownOpen] = useState(false)
    const [classSearch, setClassSearch] = useState('')
    const [flagDropdownOpen, setFlagDropdownOpen] = useState(false)
    const [flagSearch, setFlagSearch] = useState('')
    const [editCallSign, setEditCallSign] = useState(vessel.callSign || '')
    const [classSocieties, setClassSocieties] = useState<ClassificationSociety[]>([])
    const [vesselTypes, setVesselTypes] = useState<VesselType[]>([])
    const [customDocTypes, setCustomDocTypes] = useState<VesselCustomDocType[]>([])
    const [useCardDocs, setUseCardDocs] = useState(() => localStorage.getItem('vessel_doc_card_view') === '1')
    const [showAddCustomDoc, setShowAddCustomDoc] = useState(false)
    const [newCustomDocName, setNewCustomDocName] = useState('')
    const [showPoliciesModal, setShowPoliciesModal] = useState(false)

    // Seed classification IDs from legacy text field if junction table is empty OR has stale IDs
    // (stale = IDs exist in junction but don't match any current classSociety record)
    useEffect(() => {
        if (classSocieties.length === 0) return
        const validIds = classSocieties.filter(cs => vesselClassificationIds.has(cs.id))
        if (validIds.length === 0 && vessel.classificationSociety) {
            const text = vessel.classificationSociety.trim().toLowerCase()
            const matched = classSocieties.find(cs =>
                cs.name.toLowerCase() === text ||
                (cs.abbreviation && cs.abbreviation.toLowerCase() === text)
            )
            if (matched) setVesselClassificationIds(new Set([matched.id]))
        }
    }, [classSocieties, vessel.classificationSociety])
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
        await window.api.setVesselClassifications(vessel.id, [...vesselClassificationIds])
        setIsEditing(false)
        showSuccess('Vessel details updated')
        // Reload to refresh name history
        const history = await window.api.getVesselNameHistory(vessel.id)
        setNameHistory(Array.isArray(history) ? history : [])
    }

    const handleToggleVesselActive = async () => {
        const newStatus = !vesselActive
        await window.api.updateVessel(vessel.id, { isActive: newStatus })
        setVesselActive(newStatus)
        vessel.isActive = newStatus
        showSuccess(`Vessel is now ${newStatus ? 'ACTIVE' : 'INACTIVE'}`)
        // Refresh policies so cascade changes (active ↔ inactive) are reflected immediately
        loadDynamicPolicies()
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

    const handleOpenVesselNotes = async () => {
        setShowNotesModal(true)
        setVesselNotesList([])
        setNewVesselNoteText('')
        setReplyingToNoteId(null)
        setReplyText('')
        setVesselNotesLoading(true)
        try {
            const [data, users] = await Promise.all([
                window.api.getVesselNotes(vessel.id),
                window.api.notificationsGetUsernames().catch(() => [])
            ])
            const list = Array.isArray(data) ? data : []
            setVesselNotesList(list)
            setVesselNoteCount(list.length)
            setMentionUsers(Array.isArray(users) ? users : [])
        } finally {
            setVesselNotesLoading(false)
        }
    }

    const handleAddVesselNote = async () => {
        if (!newVesselNoteText.trim()) return
        setVesselNotesSaving(true)
        try {
            const note = await window.api.addVesselNote(vessel.id, newVesselNoteText.trim())
            setVesselNotesList(prev => { const next = [...prev, note]; setVesselNoteCount(next.length); return next })
            setNewVesselNoteText('')
        } finally {
            setVesselNotesSaving(false)
        }
    }

    const handleDeleteVesselNote = async (noteId: string) => {
        await window.api.deleteVesselNote(noteId)
        setVesselNotesList(prev => { const next = prev.filter(n => n.id !== noteId && n.parentNoteId !== noteId); setVesselNoteCount(next.length); return next })
    }

    const handleAddReply = async (parentId: string) => {
        if (!replyText.trim()) return
        setVesselNotesSaving(true)
        try {
            const note = await window.api.addVesselNote(vessel.id, replyText.trim(), parentId)
            setVesselNotesList(prev => [...prev, note])
            setReplyText('')
            setReplyingToNoteId(null)
        } finally {
            setVesselNotesSaving(false)
        }
    }

    const handleMentionCheck = (text: string, target: 'new' | 'reply') => {
        if (target === 'new') setNewVesselNoteText(text)
        else setReplyText(text)
        setMentionTarget(target)
        const cursorEl = document.activeElement as HTMLTextAreaElement
        const cursorPos = cursorEl?.selectionStart || 0
        const textBefore = text.slice(0, cursorPos)
        const atMatch = textBefore.match(/@(\w*)$/)
        if (atMatch) setMentionQuery(atMatch[1].toLowerCase())
        else setMentionQuery(null)
    }

    const insertMention = (username: string) => {
        const getter = mentionTarget === 'new' ? newVesselNoteText : replyText
        const setter = mentionTarget === 'new' ? setNewVesselNoteText : setReplyText
        const cursorEl = document.activeElement as HTMLTextAreaElement
        const cursorPos = cursorEl?.selectionStart || getter.length
        const textBefore = getter.slice(0, cursorPos)
        const atMatch = textBefore.match(/@(\w*)$/)
        if (atMatch) {
            const before = textBefore.slice(0, textBefore.length - atMatch[0].length)
            const after = getter.slice(cursorPos)
            setter(before + '@' + username + ' ' + after)
        }
        setMentionQuery(null)
    }

    const filteredMentionUsers = mentionQuery !== null
        ? mentionUsers.filter(u => u.username.toLowerCase().includes(mentionQuery) && u.id !== user?.id).slice(0, 6)
        : []

    const renderMentionDropdown = () => {
        if (mentionQuery === null || filteredMentionUsers.length === 0) return null
        return (
            <div style={{
                position: 'absolute', bottom: '100%', left: 0, zIndex: 200,
                background: isLight ? '#ffffff' : '#1a1d28',
                border: '1px solid var(--glass-border)', borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)', maxHeight: '150px',
                overflowY: 'auto', minWidth: '160px'
            }}>
                {filteredMentionUsers.map(u => (
                    <div key={u.id} onClick={() => insertMention(u.username)}
                        style={{ padding: '6px 12px', cursor: 'pointer', fontSize: '0.82rem' }}
                        className="hover-effect"
                    >@{u.username}</div>
                ))}
            </div>
        )
    }

    const highlightMentions = (text: string) => {
        const parts = text.split(/(@\w+)/g)
        return parts.map((part, i) =>
            part.startsWith('@') ? <span key={i} style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{part}</span> : part
        )
    }

    // Group notes into threads
    const parentVesselNotes = vesselNotesList.filter(n => !n.parentNoteId)
    const vesselRepliesMap = new Map<string, any[]>()
    for (const n of vesselNotesList) {
        if (n.parentNoteId) {
            const existing = vesselRepliesMap.get(n.parentNoteId) || []
            existing.push(n)
            vesselRepliesMap.set(n.parentNoteId, existing)
        }
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
                                        style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)', width: '160px' }}
                                        aria-label="Vessel type"
                                    >
                                        <option value="">No type</option>
                                        {vesselTypes.map(vt => (
                                            <option key={vt.id} value={vt.name}>
                                                {vt.description ? `${vt.name} – ${vt.description}` : vt.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', paddingTop: '6px', flexShrink: 0 }}>Class:</span>
                                    <div style={{ position: 'relative' }}>
                                        {/* Trigger button */}
                                        <button
                                            type="button"
                                            onClick={() => { if (classDropdownOpen) setClassSearch(''); setClassDropdownOpen(o => !o) }}
                                            onBlur={e => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setTimeout(() => { setClassDropdownOpen(false); setClassSearch('') }, 150) }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', cursor: 'pointer', minWidth: '220px', justifyContent: 'space-between' }}
                                        >
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                                                {vesselClassificationIds.size === 0
                                                    ? 'None'
                                                    : classSocieties.filter(cs => vesselClassificationIds.has(cs.id)).map(cs => cs.abbreviation || cs.name).join(', ')}
                                            </span>
                                            <ChevronDown size={13} style={{ flexShrink: 0, transform: classDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                                        </button>
                                        {/* Dropdown list */}
                                        {classDropdownOpen && (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, marginTop: '4px', background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--input-border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: '220px', maxHeight: '264px', display: 'flex', flexDirection: 'column' }}>
                                                {classSocieties.length > 6 && (
                                                    <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--table-border)', flexShrink: 0 }}>
                                                        <input
                                                            type="text"
                                                            placeholder="Search…"
                                                            value={classSearch}
                                                            onChange={e => setClassSearch(e.target.value)}
                                                            onMouseDown={e => e.stopPropagation()}
                                                            autoFocus
                                                            style={{ width: '100%', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--input-border)', background: isLight ? '#f0f2f5' : '#0f1118', color: 'var(--text-primary)', fontSize: '0.8rem', boxSizing: 'border-box', outline: 'none' }}
                                                        />
                                                    </div>
                                                )}
                                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                                    {(() => {
                                                        const filtered = classSearch.trim()
                                                            ? classSocieties.filter(cs => cs.name.toLowerCase().includes(classSearch.toLowerCase()) || cs.abbreviation?.toLowerCase().includes(classSearch.toLowerCase()))
                                                            : classSocieties
                                                        if (filtered.length === 0) return (
                                                            <div style={{ padding: '10px 12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                                                {classSearch ? 'No matches' : 'No classification societies defined'}
                                                            </div>
                                                        )
                                                        return filtered.map(cs => {
                                                            const checked = vesselClassificationIds.has(cs.id)
                                                            return (
                                                                <div
                                                                    key={cs.id}
                                                                    onMouseDown={e => {
                                                                        e.preventDefault()
                                                                        setVesselClassificationIds(prev => {
                                                                            const next = new Set(prev)
                                                                            if (checked) next.delete(cs.id); else next.add(cs.id)
                                                                            return next
                                                                        })
                                                                    }}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', cursor: 'pointer', background: checked ? (isLight ? 'rgba(0,119,163,0.08)' : 'rgba(0,210,255,0.08)') : 'transparent', borderBottom: '1px solid var(--table-border)' }}
                                                                >
                                                                    <input type="checkbox" readOnly checked={checked} style={{ accentColor: 'var(--accent-primary)', pointerEvents: 'none', flexShrink: 0 }} />
                                                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                                                        {cs.abbreviation ? <><strong>{cs.abbreviation}</strong> – {cs.name}</> : cs.name}
                                                                    </span>
                                                                </div>
                                                            )
                                                        })
                                                    })()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Call Sign:</span>
                                    <input type="text" value={editCallSign} onChange={e => setEditCallSign(e.target.value.toUpperCase())} style={{ padding: '4px 8px', borderRadius: '4px', width: '100px', textTransform: 'uppercase' }} aria-label="Call sign" />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Flag:</span>
                                    <div
                                        style={{ position: 'relative' }}
                                        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setFlagDropdownOpen(false); setFlagSearch('') } }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => { if (flagDropdownOpen) setFlagSearch(''); setFlagDropdownOpen(o => !o) }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem', background: 'var(--input-bg)', color: selectedFlagStateId ? 'var(--text-primary)' : 'var(--text-secondary)', border: '1px solid var(--input-border)', cursor: 'pointer', minWidth: '180px', justifyContent: 'space-between' }}
                                        >
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                                                {selectedFlagStateId ? (flagStates.find(f => f.id === selectedFlagStateId)?.name || 'Unknown') : 'No flag'}
                                            </span>
                                            <ChevronDown size={13} style={{ flexShrink: 0, transform: flagDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                                        </button>
                                        {flagDropdownOpen && (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, marginTop: '4px', background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--input-border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: '220px', maxHeight: '264px', display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--table-border)', flexShrink: 0 }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Search flags…"
                                                        value={flagSearch}
                                                        onChange={e => setFlagSearch(e.target.value)}
                                                        onMouseDown={e => e.stopPropagation()}
                                                        autoFocus
                                                        style={{ width: '100%', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--input-border)', background: isLight ? '#f0f2f5' : '#0f1118', color: 'var(--text-primary)', fontSize: '0.8rem', boxSizing: 'border-box', outline: 'none' }}
                                                    />
                                                </div>
                                                <div style={{ overflowY: 'auto', flex: 1 }}>
                                                    <div
                                                        onMouseDown={e => { e.preventDefault(); setSelectedFlagStateId(''); setFlagDropdownOpen(false); setFlagSearch('') }}
                                                        style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', cursor: 'pointer', background: !selectedFlagStateId ? (isLight ? 'rgba(0,119,163,0.08)' : 'rgba(0,210,255,0.08)') : 'transparent', borderBottom: '1px solid var(--table-border)' }}
                                                    >
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No flag</span>
                                                    </div>
                                                    {flagStates
                                                        .filter(fs => !flagSearch.trim() || fs.name.toLowerCase().includes(flagSearch.toLowerCase()) || fs.iso3Code.toLowerCase().includes(flagSearch.toLowerCase()))
                                                        .map(fs => (
                                                            <div
                                                                key={fs.id}
                                                                onMouseDown={e => { e.preventDefault(); setSelectedFlagStateId(fs.id); setFlagDropdownOpen(false); setFlagSearch('') }}
                                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px', cursor: 'pointer', background: selectedFlagStateId === fs.id ? (isLight ? 'rgba(0,119,163,0.08)' : 'rgba(0,210,255,0.08)') : 'transparent', borderBottom: '1px solid var(--table-border)' }}
                                                            >
                                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                                                    {fs.name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>({fs.iso3Code})</span>
                                                                </span>
                                                            </div>
                                                        ))
                                                    }
                                                    {flagSearch.trim() && flagStates.filter(fs => fs.name.toLowerCase().includes(flagSearch.toLowerCase()) || fs.iso3Code.toLowerCase().includes(flagSearch.toLowerCase())).length === 0 && (
                                                        <div style={{ padding: '10px 12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No matches</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
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
                            {(vessel.builtYear || vessel.grossTonnage || vessel.vesselType || vesselClassificationIds.size > 0 || vessel.classificationSociety || vessel.callSign) && (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                                    {[
                                        vessel.builtYear && `Built ${vessel.builtYear}`,
                                        vessel.grossTonnage && `GT ${vessel.grossTonnage.toLocaleString('en-US')}`,
                                        vessel.vesselType && (() => { const vt = vesselTypes.find(t => t.name === vessel.vesselType); return vt?.description ? `${vt.name} (${vt.description})` : vt?.name || vessel.vesselType })(),
                                        vesselClassificationIds.size > 0
                                            ? `Class: ${classSocieties.filter(cs => vesselClassificationIds.has(cs.id)).map(cs => cs.abbreviation || cs.name).join(' / ')}`
                                            : (vessel.classificationSociety && `Class: ${vessel.classificationSociety}`),
                                        vessel.callSign && `Call Sign: ${vessel.callSign}`
                                    ].filter(Boolean).join(' · ')}
                                </p>
                            )}
                            {nameHistory.length > 0 && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                    Former name{nameHistory.length > 1 ? 's' : ''}: {nameHistory.map((h, i) => (
                                        <span key={h.id}>
                                            <em>{h.previousName}</em>
                                            <span style={{ fontSize: '0.7rem', opacity: 0.7 }}> ({formatDate(h.changedAt)})</span>
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
                            <button onClick={async () => { setIsEditing(false); setEditName(vessel.name); setEditImo(vessel.imoNumber); setEditBuiltYear(vessel.builtYear?.toString() || ''); setEditGrossTonnage(vessel.grossTonnage?.toString() || ''); setEditVesselType(vessel.vesselType || ''); setEditClassification(vessel.classificationSociety || ''); setEditCallSign(vessel.callSign || ''); const vcs = await window.api.getVesselClassifications(vessel.id); setVesselClassificationIds(new Set((vcs || []).map((vc: any) => vc.classificationSocietyId))); }} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            {hasPermission('vessels:edit') && (
                                <button onClick={() => setIsEditing(true)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.82rem' }}>
                                    Edit Details
                                </button>
                            )}
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
                                onClick={handleOpenVesselNotes}
                                className="btn-secondary"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    fontSize: '0.82rem',
                                    position: 'relative'
                                }}
                            >
                                <MessageSquare size={16} /> Notes
                                {vesselNoteCount > 0 && (
                                    <span style={{
                                        position: 'absolute', top: '-6px', right: '-6px',
                                        background: 'var(--accent-primary)', color: '#fff',
                                        fontSize: '0.65rem', fontWeight: 700,
                                        minWidth: '16px', height: '16px',
                                        borderRadius: '8px', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                        padding: '0 4px'
                                    }}>{vesselNoteCount}</span>
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
                                                borderBottom: '1px solid var(--glass-border)',
                                                color: 'var(--text-primary)',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                            className="hover-effect"
                                        >
                                            <FileText size={16} /> PDF Report
                                        </button>
                                        <button
                                            onClick={() => { ReportServiceV2.exportVesselToPDF(vessel, docTypes, vesselDocs); setShowExportMenu(false); }}
                                            style={{
                                                width: '100%',
                                                padding: '10px 16px',
                                                textAlign: 'left',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--accent-primary)',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                            className="hover-effect"
                                        >
                                            <FileText size={16} /> PDF Report (Pro)
                                        </button>
                                    </div>
                                )}
                            </div>
                            {hasPermission('vessels:delete') && (
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
                marginBottom: '16px',
                alignItems: 'center'
            }}>
                {(['documents', 'assureds', 'surveys', 'policies', 'history'] as const).map(view => (
                    <button
                        key={view}
                        onClick={() => {
                            setDetailView(view)
                            if (view === 'policies' || view === 'surveys') loadDynamicPolicies()
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
                        {view === 'assureds' && <Users size={18} />}
                        {view === 'surveys' && <ClipboardList size={18} />}
                        {view === 'policies' && <Shield size={18} />}
                        {view === 'history' && <Calendar size={18} />}
                        {view === 'assureds' ? 'Assured' : view.charAt(0).toUpperCase() + view.slice(1)}
                    </button>
                ))}
                {detailView === 'documents' && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            onClick={() => setShowRemapModal(true)}
                            title="Remap file paths for this vessel"
                            style={{
                                marginBottom: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: '8px',
                                color: 'var(--text-secondary)',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                            }}
                        >
                            <FolderSearch size={15} />
                            Remap Files
                        </button>
                        <button
                            onClick={() => {
                                const next = !useCardDocs
                                setUseCardDocs(next)
                                localStorage.setItem('vessel_doc_card_view', next ? '1' : '0')
                            }}
                            title={useCardDocs ? 'Switch to table view' : 'Switch to card view'}
                            style={{
                                marginBottom: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: '8px',
                                color: 'var(--text-secondary)',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                            }}
                        >
                            {useCardDocs ? <List size={15} /> : <LayoutGrid size={15} />}
                            {useCardDocs ? 'Table View' : 'Card View'}
                        </button>
                    </div>
                )}
            </div>

            {detailView === 'documents' && useCardDocs && (
                <VesselDocumentsView vessel={vessel} dynamicPolicies={dynamicPolicies} onReload={loadData} />
            )}

            {detailView === 'documents' && !useCardDocs && <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
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
                                // Determine left border color based on document status
                                const getRowBorderColor = () => {
                                    if (isExtra) return 'transparent'
                                    if (isRequired && (!rowHasFile || !rowExists)) return 'var(--danger)' // missing
                                    if (rowDoc?.expiryDate) {
                                        const exp = new Date(rowDoc.expiryDate)
                                        const now = new Date()
                                        if (exp < now) return 'var(--danger)' // expired
                                        const soon = new Date()
                                        soon.setDate(soon.getDate() + 30)
                                        if (exp < soon) return '#e6a800' // expiring soon
                                    }
                                    return 'transparent' // compliant
                                }

                                return (
                                    <tr
                                        key={key}
                                        style={{
                                            borderBottom: '1px solid var(--table-border)',
                                            borderLeft: `4px solid ${getRowBorderColor()}`,
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
                                                            color: 'var(--danger)',
                                                            textTransform: 'uppercase'
                                                        }}
                                                    >
                                                        <AlertCircle size={14} />
                                                        MISSING
                                                    </div>
                                                )
                                            ) : hasPermission('documents:upload') ? (
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
                                            ) : null}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            {rowHasFile ? (
                                                <input
                                                    type="date"
                                                    title="Click to change received date"
                                                    value={editingReceived[rowType.id] !== undefined ? editingReceived[rowType.id] : (rowDoc?.receivedDate?.split('T')[0] || '')}
                                                    onFocus={() => setEditingReceived(prev => ({ ...prev, [rowType.id]: rowDoc?.receivedDate?.split('T')[0] || '' }))}
                                                    onChange={e => setEditingReceived(prev => ({ ...prev, [rowType.id]: e.target.value }))}
                                                    onBlur={async e => {
                                                        const val = e.target.value
                                                        setEditingReceived(prev => { const n = { ...prev }; delete n[rowType.id]; return n })
                                                        if (val) { await window.api.updateVesselDocumentReceivedDate(vessel.id, rowType.id, val); loadData() }
                                                    }}
                                                    min="1900-01-01" max="2100-12-31"
                                                    style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', colorScheme: isLight ? 'light' as const : 'dark' as const }}
                                                />
                                            ) : (
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>-</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            {rowType.annualRenewal ? (
                                                rowHasFile ? (
                                                    (() => {
                                                        const piExpiry = resolveEffectivePolicyExpiry(dynamicPolicies) || vessel.policyExpiryDate
                                                        return piExpiry ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Calendar size={14} color="var(--text-secondary)" />
                                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                                Expires with P&I ·{' '}
                                                                <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                                                                    {formatDate(piExpiry)}
                                                                </span>
                                                            </span>
                                                        </div>
                                                    ) : rowDoc?.expiryDate ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Calendar size={14} color="var(--text-secondary)" />
                                                            <input
                                                                type="date"
                                                                value={editingExpiry[rowType.id] !== undefined ? editingExpiry[rowType.id] : (rowDoc.expiryDate || '')}
                                                                onFocus={() => setEditingExpiry(prev => ({ ...prev, [rowType.id]: rowDoc.expiryDate || '' }))}
                                                                onChange={e => setEditingExpiry(prev => ({ ...prev, [rowType.id]: e.target.value }))}
                                                                onBlur={async e => {
                                                                    const val = e.target.value
                                                                    setEditingExpiry(prev => { const n = { ...prev }; delete n[rowType.id]; return n })
                                                                    await window.api.updateVesselDocumentExpiry(vessel.id, rowType.id, val || null); loadData()
                                                                }}
                                                                min="1900-01-01" max="2100-12-31"
                                                                style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', colorScheme: isLight ? 'light' as const : 'dark' as const }}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Annual — P&I date not set</span>
                                                    )
                                                    })()
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Annual (P&I)</span>
                                                )
                                            ) : !rowHasFile ? (
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>-</span>
                                            ) : !rowDoc?.expiryDate || rowDoc.expiryDate === '0000-00-00' ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Calendar size={14} color="var(--text-secondary)" />
                                                    <input
                                                        type="date"
                                                        placeholder="Set expiry"
                                                        value={editingExpiry[rowType.id] !== undefined ? editingExpiry[rowType.id] : ''}
                                                        onFocus={() => setEditingExpiry(prev => ({ ...prev, [rowType.id]: '' }))}
                                                        onChange={e => setEditingExpiry(prev => ({ ...prev, [rowType.id]: e.target.value }))}
                                                        onBlur={async e => {
                                                            const val = e.target.value
                                                            setEditingExpiry(prev => { const n = { ...prev }; delete n[rowType.id]; return n })
                                                            if (val) { await handleUpdateExpiry(rowType.id, val) }
                                                        }}
                                                        min="1900-01-01" max="2100-12-31"
                                                        style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', colorScheme: isLight ? 'light' as const : 'dark' as const }}
                                                        aria-label={`Expiry date for ${rowType.name}`}
                                                    />
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Calendar size={14} color="var(--text-secondary)" />
                                                    <input
                                                        type="date"
                                                        value={editingExpiry[rowType.id] !== undefined ? editingExpiry[rowType.id] : (rowDoc?.expiryDate || '')}
                                                        onFocus={() => setEditingExpiry(prev => ({ ...prev, [rowType.id]: rowDoc?.expiryDate || '' }))}
                                                        onChange={e => setEditingExpiry(prev => ({ ...prev, [rowType.id]: e.target.value }))}
                                                        onBlur={async e => {
                                                            const val = e.target.value
                                                            setEditingExpiry(prev => { const n = { ...prev }; delete n[rowType.id]; return n })
                                                            await window.api.updateVesselDocumentExpiry(vessel.id, rowType.id, val || null); loadData()
                                                        }}
                                                        min="1900-01-01"
                                                        max="2100-12-31"
                                                        style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', colorScheme: isLight ? 'light' as const : 'dark' as const }}
                                                        aria-label={`Expiry date for ${rowType.name}`}
                                                    />
                                                    <button
                                                        title="Clear expiry date"
                                                        onClick={async () => { await window.api.updateVesselDocumentExpiry(vessel.id, rowType.id, null); loadData() }}
                                                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', padding: 0, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}
                                                    >
                                                        <X size={12} />
                                                    </button>
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
                                                        <button onClick={() => window.api.shellShowItemInFolder(rowDoc!.filePath)} className="btn-secondary" style={{ padding: '6px' }} title="Open file location" aria-label="Open file location">
                                                            <FolderOpen size={18} />
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
                                                        color: 'var(--danger)',
                                                        textTransform: 'uppercase'
                                                    }}
                                                >
                                                    <AlertCircle size={14} />
                                                    MISSING
                                                </div>
                                            )
                                        ) : hasPermission('documents:upload') ? (
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
                                        ) : null}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        {rowHasFile ? (
                                            <input
                                                type="date"
                                                title="Click to change received date"
                                                value={editingReceived[customType.id] !== undefined ? editingReceived[customType.id] : (doc?.receivedDate?.split('T')[0] || '')}
                                                onFocus={() => setEditingReceived(prev => ({ ...prev, [customType.id]: doc?.receivedDate?.split('T')[0] || '' }))}
                                                onChange={e => setEditingReceived(prev => ({ ...prev, [customType.id]: e.target.value }))}
                                                onBlur={async e => {
                                                    const val = e.target.value
                                                    setEditingReceived(prev => { const n = { ...prev }; delete n[customType.id]; return n })
                                                    if (val) { await window.api.updateVesselDocumentReceivedDate(vessel.id, customType.id, val); loadData() }
                                                }}
                                                min="1900-01-01" max="2100-12-31"
                                                style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', colorScheme: isLight ? 'light' as const : 'dark' as const }}
                                            />
                                        ) : (
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>-</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        {!rowHasFile ? (
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>-</span>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Calendar size={14} color="var(--text-secondary)" />
                                                <input
                                                    type="date"
                                                    value={editingExpiry[customType.id] !== undefined ? editingExpiry[customType.id] : (doc?.expiryDate || '')}
                                                    onFocus={() => setEditingExpiry(prev => ({ ...prev, [customType.id]: doc?.expiryDate || '' }))}
                                                    onChange={e => setEditingExpiry(prev => ({ ...prev, [customType.id]: e.target.value }))}
                                                    onBlur={async e => {
                                                        const val = e.target.value
                                                        setEditingExpiry(prev => { const n = { ...prev }; delete n[customType.id]; return n })
                                                        await window.api.updateVesselDocumentExpiry(vessel.id, customType.id, val || null); loadData()
                                                    }}
                                                    min="1900-01-01" max="2100-12-31"
                                                    style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', colorScheme: isLight ? 'light' as const : 'dark' as const }}
                                                    aria-label={`Expiry date for ${customType.name}`}
                                                />
                                                {doc?.expiryDate && doc.expiryDate !== '0000-00-00' && (
                                                    <button
                                                        title="Clear expiry date"
                                                        onClick={async () => { await window.api.updateVesselDocumentExpiry(vessel.id, customType.id, null); loadData() }}
                                                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', padding: 0, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                )}
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
                                                    <button onClick={() => window.api.shellShowItemInFolder(doc!.filePath)} className="btn-secondary" style={{ padding: '6px' }} title="Open file location" aria-label="Open file location">
                                                        <FolderOpen size={18} />
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

            {detailView === 'assureds' && <AssuredManager vessel={vessel} />}

            {detailView === 'surveys' && <ConditionSurveyManager vessel={vessel} />}

            {detailView === 'policies' && (
                <>
                    <DynamicPoliciesView
                        vesselId={vessel.id}
                        dynamicPolicies={dynamicPolicies}
                        isLight={isLight}
                        onReload={loadDynamicPolicies}
                        showSuccess={showSuccess}
                        showError={showError}
                    />

                    {/* Section divider between policies and warranties */}
                    <div style={{
                        margin: '32px 0 24px',
                        display: 'flex', alignItems: 'center', gap: '12px'
                    }}>
                        <div style={{ height: '1px', flex: 1, background: 'var(--glass-border)' }} />
                        <span style={{
                            fontSize: '0.8rem', fontWeight: 700, letterSpacing: '1px',
                            textTransform: 'uppercase', color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap'
                        }}>Survey Warranties</span>
                        <div style={{ height: '1px', flex: 1, background: 'var(--glass-border)' }} />
                    </div>

                    <WarrantyManager
                        vesselId={vessel.id}
                        dynamicPolicies={dynamicPolicies}
                        isLight={isLight}
                    />
                </>
            )}

            {detailView === 'history' && (
                <VesselHistoryView auditLog={auditLog} isLight={isLight} flagStates={flagStates} />
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
            {showRemapModal && (
                <RemapFilePathsModal
                    vesselId={vessel.id}
                    vesselName={vessel.name}
                    onClose={() => setShowRemapModal(false)}
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
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{
                        background: isLight ? '#ffffff' : '#1a1d28',
                        borderRadius: '16px', padding: '28px', width: '520px', maxWidth: '95vw', maxHeight: '80vh',
                        display: 'flex', flexDirection: 'column',
                        border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexShrink: 0 }}>
                            <div>
                                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <MessageSquare size={16} color="var(--accent-primary)" /> Vessel Notes
                                </h3>
                                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                    {vessel.name}
                                </p>
                            </div>
                            <button onClick={() => setShowNotesModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* New note input */}
                        <div style={{ flexShrink: 0, marginBottom: '16px', position: 'relative' }}>
                            <div style={{ position: 'relative' }}>
                                <textarea
                                    value={newVesselNoteText}
                                    onChange={e => handleMentionCheck(e.target.value, 'new')}
                                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddVesselNote() }}
                                    rows={3}
                                    placeholder="Add a note... (use @ to mention, Ctrl+Enter to submit)"
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', resize: 'none', fontFamily: 'inherit', fontSize: '0.9rem', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)', boxSizing: 'border-box' }}
                                />
                                {mentionTarget === 'new' && renderMentionDropdown()}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button onClick={handleAddVesselNote} disabled={vesselNotesSaving || !newVesselNoteText.trim()} className="btn-primary" style={{ padding: '6px 16px', fontSize: '0.85rem' }}>
                                    {vesselNotesSaving ? 'Saving...' : 'Add Note'}
                                </button>
                            </div>
                        </div>

                        {/* Notes thread */}
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {vesselNotesLoading ? (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '16px' }}>Loading...</p>
                            ) : parentVesselNotes.length === 0 ? (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '16px', fontStyle: 'italic' }}>No notes yet for this vessel.</p>
                            ) : parentVesselNotes.map(n => (
                                <div key={n.id}>
                                    {/* Parent note */}
                                    <div style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '12px 14px', borderLeft: '3px solid var(--accent-primary)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: '700', color: '#fff', flexShrink: 0 }}>
                                                {(n.createdByUsername || '?').charAt(0).toUpperCase()}
                                            </div>
                                            <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>{n.createdByUsername || 'Unknown'}</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{formatDateTime(n.createdAt)}</span>
                                            <button onClick={() => setReplyingToNoteId(replyingToNoteId === n.id ? null : n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '0.72rem', fontWeight: 600, padding: '2px 6px' }}>Reply</button>
                                            {n.createdByUserId === user?.id && (
                                                <button onClick={() => handleDeleteVesselNote(n.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', padding: '2px', flexShrink: 0 }}><Trash2 size={13} /></button>
                                            )}
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.88rem', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{highlightMentions(n.note)}</p>
                                    </div>

                                    {/* Replies */}
                                    {(vesselRepliesMap.get(n.id) || []).map(reply => (
                                        <div key={reply.id} style={{ marginLeft: '24px', marginTop: '6px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 12px', borderLeft: '2px solid var(--glass-border)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: '700', color: '#fff', flexShrink: 0 }}>
                                                    {(reply.createdByUsername || '?').charAt(0).toUpperCase()}
                                                </div>
                                                <span style={{ fontWeight: '600', fontSize: '0.82rem' }}>{reply.createdByUsername || 'Unknown'}</span>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{formatDateTime(reply.createdAt)}</span>
                                                {reply.createdByUserId === user?.id && (
                                                    <button onClick={() => handleDeleteVesselNote(reply.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', padding: '2px', flexShrink: 0 }}><Trash2 size={12} /></button>
                                                )}
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.84rem', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{highlightMentions(reply.note)}</p>
                                        </div>
                                    ))}

                                    {/* Reply input */}
                                    {replyingToNoteId === n.id && (
                                        <div style={{ marginLeft: '24px', marginTop: '6px', position: 'relative' }}>
                                            <div style={{ position: 'relative' }}>
                                                <textarea
                                                    value={replyText}
                                                    onChange={e => handleMentionCheck(e.target.value, 'reply')}
                                                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddReply(n.id) }}
                                                    rows={2}
                                                    placeholder="Reply... (@ to mention)"
                                                    autoFocus
                                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', resize: 'none', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)', boxSizing: 'border-box' }}
                                                />
                                                {mentionTarget === 'reply' && renderMentionDropdown()}
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                                <button onClick={() => handleAddReply(n.id)} disabled={vesselNotesSaving || !replyText.trim()} className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Reply</button>
                                                <button onClick={() => { setReplyingToNoteId(null); setReplyText('') }} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
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
    const sym = currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : '$'
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
    const [formStatus, setFormStatus] = useState<'active' | 'expired' | 'cancelled' | 'inactive'>('active')
    const [formCurrency, setFormCurrency] = useState('USD')
    const [formBrokerId, setFormBrokerId] = useState('')
    const [brokerSearch, setBrokerSearch] = useState('')
    const [brokerDropdownOpen, setBrokerDropdownOpen] = useState(false)
    const [formNotes, setFormNotes] = useState('')
    const [formValues, setFormValues] = useState<Record<string, any>>({})
    const modalRef = useRef<HTMLDivElement>(null)

    // Confirmation modal state
    const [confirmation, setConfirmation] = useState<{
        show: boolean
        title: string
        message: string
        onConfirm: () => void
        isDangerous?: boolean
    }>({ show: false, title: '', message: '', onConfirm: () => { } })

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
            setPolicyTypes(Array.isArray(pt) ? pt : [])
            setCharacteristics(Array.isArray(allChars) ? allChars : [])
            setConditions(Array.isArray(allConds) ? allConds : [])
            setEntities(Array.isArray(ent) ? ent : [])
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

    const handleDeletePolicy = (id: string) => {
        setConfirmation({
            show: true,
            title: 'Delete Policy',
            message: 'Delete this policy? This cannot be undone.',
            isDangerous: true,
            onConfirm: async () => {
                setConfirmation(prev => ({ ...prev, show: false }))
                await window.api.deleteVesselDynamicPolicy(id)
                showSuccess('Policy deleted')
                onReload()
            }
        })
    }

    const handleRenewPolicy = (p: VesselDynamicPolicy) => {
        setConfirmation({
            show: true,
            title: 'Renew Policy',
            message: 'Renew this policy? A new copy will be created with incremented dates.',
            onConfirm: async () => {
                setConfirmation(prev => ({ ...prev, show: false }))
                try {
                    // 1. Conditionally expire old policy
                    // Find expiry date characteristic (only from THIS policy type's characteristics)
                    const policyTypeChars = characteristics.filter(c => c.policyTypeId === p.policyTypeId)
                    const expiryChar = policyTypeChars.find(c => c.name.toLowerCase().includes('expiry') || c.name.toLowerCase().includes('expiration') || c.name.toLowerCase().includes('end date'))
                    let shouldExpire = false

                    if (expiryChar && p.values) {
                        const expiryVal = p.values.find(v => v.characteristicId === expiryChar.id)
                        if (expiryVal && expiryVal.valueDate) {
                            const todayStr = new Date().toISOString().split('T')[0]
                            if (expiryVal.valueDate <= todayStr) {
                                shouldExpire = true
                            }
                        }
                    }

                    if (shouldExpire) {
                        await window.api.updateVesselDynamicPolicy(p.id, { status: 'expired' })
                    }

                    // 2. Find old expiry date for new inception
                    const policyTypeCharsAll = characteristics.filter(c => c.policyTypeId === p.policyTypeId)
                    const endChar = policyTypeCharsAll.find(c => {
                        const n = c.name.toLowerCase()
                        return n.includes('end') || n.includes('expiry') || n.includes('expiration')
                    })

                    let oldExpiryDate: string | null = null
                    if (endChar && p.values) {
                        const ev = p.values.find(v => v.characteristicId === endChar.id)
                        if (ev?.valueDate) oldExpiryDate = ev.valueDate
                    }

                    // New inception = old expiry, new expiry = new inception + 1 year
                    let newInception: string | null = null
                    let newExpiry: string | null = null
                    if (oldExpiryDate) {
                        newInception = oldExpiryDate
                        const d = new Date(oldExpiryDate)
                        d.setFullYear(d.getFullYear() + 1)
                        newExpiry = d.toISOString().split('T')[0]
                    }

                    // Generate new policy number: type letter + inverted year from new inception
                    const policyType = policyTypes.find(pt => pt.id === p.policyTypeId)
                    const typeCode = policyType?.name?.charAt(0)?.toUpperCase() || 'P'
                    let newPolicyNumber = typeCode
                    if (newInception) {
                        const yr = newInception.substring(0, 4) // e.g., "2026"
                        newPolicyNumber += yr.substring(2, 4) + yr.substring(0, 2) // "2620"
                    }

                    // 3. Create new policy
                    const newId = await window.api.addVesselDynamicPolicy({
                        vesselId: p.vesselId,
                        policyTypeId: p.policyTypeId,
                        policyNumber: newPolicyNumber,
                        conditionId: p.conditionId,
                        status: 'active',
                        currency: p.currency,
                        brokerEntityId: p.brokerEntityId,
                        notes: p.notes
                    })

                    // 4. Copy values — only update inception/expiry dates, clear others
                    if (p.values) {
                        const newVals = p.values.map(v => {
                            const charName = policyTypeCharsAll.find(c => c.id === v.characteristicId)?.name?.toLowerCase() || ''
                            const isInception = charName.includes('inception') || charName.includes('start') || (charName.includes('from') && charName.includes('date'))
                            const isExpiry = charName.includes('end') || charName.includes('expiry') || charName.includes('expiration')

                            let valDate = v.valueDate
                            if (v.fieldType === 'date') {
                                if (isInception && newInception) {
                                    valDate = newInception
                                } else if (isExpiry && newExpiry) {
                                    valDate = newExpiry
                                } else {
                                    valDate = undefined // clear other dates for user to fill
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
        })
    }

    const typeCharsForForm = characteristics.filter(c => c.policyTypeId === formTypeId)
    const typeCondsForForm = conditions.filter(c => c.policyTypeId === formTypeId)

    const statusColors: Record<string, { bg: string; color: string }> = {
        active: { bg: 'rgba(0, 200, 100, 0.1)', color: isLight ? '#008c46' : '#00ff88' },
        expired: { bg: 'rgba(128, 128, 128, 0.1)', color: 'var(--text-secondary)' },
        cancelled: { bg: 'rgba(255, 77, 77, 0.1)', color: 'var(--danger)' },
        inactive: { bg: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }
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
                                    {(() => {
                                        const headerNum = p.policyNumber ||
                                            p.values?.find(v => /policy\s*(no\.?|num(ber)?)/i.test(v.characteristicName || '') && v.valueText)?.valueText
                                        return headerNum
                                            ? <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>#{headerNum.replace(' (RENEWED - PLEASE VERIFY)', '')}</span>
                                            : null
                                    })()}
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
                                            <button onClick={() => handleDeletePolicy(p.id)} style={{ background: 'rgba(255,77,77,0.12)', border: '1px solid rgba(255,77,77,0.35)', color: 'var(--danger)', borderRadius: '8px', fontSize: '0.8rem', padding: '4px 12px', cursor: 'pointer' }}>Delete</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-secondary)' }}>
                    <ClipboardList size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <div style={{ fontWeight: '600', fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
                        {dynamicPolicies.length > 0 ? 'No matching policies' : 'No policies yet'}
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>
                        {dynamicPolicies.length > 0 ? 'Try switching to a different type tab.' : 'Add a policy to start tracking insurance coverage.'}
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {/* Add/Edit Modal */}
            {showAddModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }} onClick={() => setShowAddModal(false)}>
                    <div
                        ref={modalRef}
                        role="dialog"
                        aria-modal="true"
                        onClick={e => e.stopPropagation()}
                        style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '16px', padding: '28px', width: '600px', maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)' }}
                    >
                        <h3 style={{ marginBottom: '16px' }}>{editingPolicyId ? 'Edit Policy' : 'Add Policy'}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {!editingPolicyId && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>Policy Type</label>
                                    <select name="policyType" value={formTypeId} onChange={e => { setFormTypeId(e.target.value); setFormConditionId(''); setFormValues({}) }} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)' }}>
                                        {policyTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>Policy Number</label>
                                    <input
                                        type="text"
                                        value={formNumber}
                                        onChange={e => setFormNumber(e.target.value)}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>Status</label>
                                    <select value={formStatus} onChange={e => setFormStatus(e.target.value as any)} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)' }}>
                                        <option value="active">Active</option>
                                        <option value="expired">Expired</option>
                                        <option value="cancelled">Cancelled</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>Currency</label>
                                    <select value={formCurrency} onChange={e => setFormCurrency(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)' }}>
                                        <option value="USD">USD ($)</option>
                                        <option value="EUR">EUR (\u20AC)</option>
                                        <option value="GBP">GBP (\u00A3)</option>
                                    </select>
                                </div>
                                {typeCondsForForm.length > 0 && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>Condition</label>
                                        <select value={formConditionId} onChange={e => setFormConditionId(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)' }}>
                                            <option value="">None</option>
                                            {typeCondsForForm.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>Broker</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            placeholder="Search broker..."
                                            value={brokerDropdownOpen ? brokerSearch : (entities.find(e => e.id === formBrokerId)?.name || '')}
                                            onFocus={() => { setBrokerDropdownOpen(true); setBrokerSearch('') }}
                                            onChange={e => setBrokerSearch(e.target.value)}
                                            onBlur={() => setTimeout(() => setBrokerDropdownOpen(false), 150)}
                                            style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)', boxSizing: 'border-box' }}
                                        />
                                        {brokerDropdownOpen && (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '200px', overflowY: 'auto', background: isLight ? '#ffffff' : '#1a1d28', border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                                                <div
                                                    onMouseDown={() => { setFormBrokerId(''); setBrokerDropdownOpen(false); setBrokerSearch('') }}
                                                    style={{ padding: '8px 12px', cursor: 'pointer', color: formBrokerId === '' ? 'var(--accent-primary)' : 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.9rem' }}
                                                >
                                                    Direct (No broker)
                                                </div>
                                                {entities.filter(e => e.name.toLowerCase().includes(brokerSearch.toLowerCase())).map(e => (
                                                    <div
                                                        key={e.id}
                                                        onMouseDown={() => { setFormBrokerId(e.id); setBrokerDropdownOpen(false); setBrokerSearch('') }}
                                                        style={{ padding: '8px 12px', cursor: 'pointer', color: e.id === formBrokerId ? 'var(--accent-primary)' : 'var(--text-primary)', background: e.id === formBrokerId ? (isLight ? 'rgba(0,119,163,0.1)' : 'rgba(0,210,255,0.1)') : 'transparent', fontSize: '0.9rem' }}
                                                    >
                                                        {e.name}
                                                    </div>
                                                ))}
                                                {entities.filter(e => e.name.toLowerCase().includes(brokerSearch.toLowerCase())).length === 0 && (
                                                    <div style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No matches</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Dynamic characteristic fields */}
                            {typeCharsForForm.length > 0 && (
                                <div>
                                    <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>Characteristics</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        {typeCharsForForm.map(c => (
                                            <div key={c.id}>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>{c.name} {c.isRequired && '*'}</label>
                                                {c.fieldType === 'text' && (
                                                    <input type="text" name={`policy_${c.id}`} value={formValues[c.id] || ''} onChange={e => setFormValues(prev => ({ ...prev, [c.id]: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)', boxSizing: 'border-box' }} />
                                                )}
                                                {c.fieldType === 'date' && (
                                                    <input type="date" value={formValues[c.id] || ''} onChange={e => setFormValues(prev => ({ ...prev, [c.id]: e.target.value }))} min="1900-01-01" max="2100-12-31" style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)' }} />
                                                )}
                                                {c.fieldType === 'amount' && (
                                                    <input type="number" step="0.01" value={formValues[c.id] || ''} onChange={e => setFormValues(prev => ({ ...prev, [c.id]: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)', boxSizing: 'border-box' }} />
                                                )}
                                                {c.fieldType === 'boolean' && (
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                        <input type="checkbox" checked={!!formValues[c.id]} onChange={e => setFormValues(prev => ({ ...prev, [c.id]: e.target.checked }))} /> Yes
                                                    </label>
                                                )}
                                                {c.fieldType === 'select' && c.selectOptions && (
                                                    <select value={formValues[c.id] || ''} onChange={e => setFormValues(prev => ({ ...prev, [c.id]: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)' }}>
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
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>Notes</label>
                                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)', resize: 'vertical', boxSizing: 'border-box' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--table-border)' }}>
                                <button onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
                                <button onClick={handleSavePolicy} className="btn-primary">{editingPolicyId ? 'Update' : 'Add'} Policy</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmation.show && (
                <ConfirmationModal
                    title={confirmation.title}
                    message={confirmation.message}
                    isDangerous={confirmation.isDangerous}
                    onConfirm={confirmation.onConfirm}
                    onCancel={() => setConfirmation(prev => ({ ...prev, show: false }))}
                />
            )}
        </div>
    )
}

// ==================== Vessel History View ====================

function VesselHistoryView({ auditLog, isLight, flagStates }: { auditLog: VesselAuditEntry[]; isLight: boolean; flagStates: FlagState[] }) {
    const [search, setSearch] = useState('')
    const [filterField, setFilterField] = useState('all')
    const [entityNameMap, setEntityNameMap] = useState<Map<string, string>>(new Map())

    // Resolve any UUID-valued Customer entries to entity names (covers legacy entries written before the fix)
    useEffect(() => {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        const ids = new Set<string>()
        for (const entry of auditLog) {
            if (entry.fieldName === 'Customer') {
                if (entry.oldValue && uuidPattern.test(entry.oldValue)) ids.add(entry.oldValue)
                if (entry.newValue && uuidPattern.test(entry.newValue)) ids.add(entry.newValue)
            }
        }
        if (ids.size === 0) return
        window.api.getEntities().then(ents => {
            const map = new Map<string, string>()
            for (const e of (ents || [])) if (ids.has(e.id)) map.set(e.id, e.name)
            setEntityNameMap(map)
        }).catch(() => {})
    }, [auditLog])

    const resolveFlagValue = (val: string | null) => {
        if (!val) return val
        const match = flagStates.find(fs => fs.id === val)
        return match ? `${match.name} (${match.iso3Code})` : val
    }

    const resolveEntityValue = (val: string | null) => {
        if (!val) return val
        return entityNameMap.get(val) ?? val
    }

    const getFieldMeta = (fieldName: string): { icon: React.ReactNode; color: string; bg: string } => {
        const fn = fieldName.toLowerCase()
        if (fn.includes('name'))
            return { icon: <FileText size={12} />, color: isLight ? '#2563eb' : '#60a5fa', bg: isLight ? 'rgba(37,99,235,0.1)' : 'rgba(96,165,250,0.12)' }
        if (fn.includes('flag'))
            return { icon: <Shield size={12} />, color: isLight ? '#7c3aed' : '#a78bfa', bg: isLight ? 'rgba(124,58,237,0.1)' : 'rgba(167,139,250,0.12)' }
        if (fn.includes('status') || fn.includes('active'))
            return { icon: <ToggleLeft size={12} />, color: isLight ? '#b45309' : '#f59e0b', bg: isLight ? 'rgba(180,83,9,0.1)' : 'rgba(245,158,11,0.12)' }
        if (fn.includes('imo'))
            return { icon: <Hash size={12} />, color: isLight ? '#0e7490' : '#22d3ee', bg: isLight ? 'rgba(14,116,144,0.1)' : 'rgba(34,211,238,0.12)' }
        if (fn.includes('class') || fn.includes('society'))
            return { icon: <ClipboardList size={12} />, color: isLight ? '#059669' : '#34d399', bg: isLight ? 'rgba(5,150,105,0.1)' : 'rgba(52,211,153,0.12)' }
        if (fn.includes('type') || fn.includes('vessel type'))
            return { icon: <Tag size={12} />, color: isLight ? '#db2777' : '#f472b6', bg: isLight ? 'rgba(219,39,119,0.1)' : 'rgba(244,114,182,0.12)' }
        return { icon: <Calendar size={12} />, color: isLight ? '#1a73e8' : 'var(--accent-primary)', bg: isLight ? 'rgba(26,115,232,0.1)' : 'rgba(0,210,255,0.1)' }
    }

    const uniqueFields = [...new Set(auditLog.map(e => e.fieldName))].sort()
    const uniqueUsers = new Set(auditLog.map(e => e.changedBy)).size
    const firstChange = auditLog.length > 0 ? new Date(auditLog[auditLog.length - 1].changedAt) : null

    const filtered = auditLog.filter(e => {
        const q = search.toLowerCase()
        const matchSearch = !q ||
            e.fieldName.toLowerCase().includes(q) ||
            e.changedBy.toLowerCase().includes(q) ||
            (e.newValue || '').toLowerCase().includes(q) ||
            (e.oldValue || '').toLowerCase().includes(q)
        const matchField = filterField === 'all' || e.fieldName === filterField
        return matchSearch && matchField
    })

    // Group by date
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const groups: { label: string; entries: VesselAuditEntry[] }[] = []
    const seenLabels = new Map<string, VesselAuditEntry[]>()
    for (const entry of filtered) {
        const d = new Date(entry.changedAt); d.setHours(0, 0, 0, 0)
        let label: string
        if (d.getTime() === today.getTime()) label = 'Today'
        else if (d.getTime() === yesterday.getTime()) label = 'Yesterday'
        else label = formatDateLong(entry.changedAt)
        if (!seenLabels.has(label)) { seenLabels.set(label, []); groups.push({ label, entries: seenLabels.get(label)! }) }
        seenLabels.get(label)!.push(entry)
    }

    if (auditLog.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '56px 32px', color: 'var(--text-secondary)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <Clock size={28} style={{ opacity: 0.25 }} />
                </div>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>No changes recorded yet</div>
                <div style={{ fontSize: '0.85rem' }}>Edit history will appear here after the first update.</div>
            </div>
        )
    }

    return (
        <div>
            {/* Stats strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Total Changes', value: auditLog.length, icon: <Clock size={16} />, accent: true },
                    { label: 'Contributors', value: uniqueUsers, icon: <Users size={16} />, accent: false },
                    { label: 'Since', value: firstChange ? formatDateShort(firstChange) : '—', icon: <Calendar size={16} />, accent: false },
                ].map(stat => (
                    <div key={stat.label} className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: stat.accent ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' : (isLight ? 'rgba(26,115,232,0.1)' : 'rgba(0,210,255,0.1)'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: stat.accent ? 'white' : 'var(--accent-primary)' }}>
                            {stat.icon}
                        </div>
                        <div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.1 }}>{stat.value}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{stat.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                        type="text"
                        placeholder="Search field, user, or value..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ width: '100%', paddingLeft: '32px', fontSize: '0.85rem' }}
                    />
                </div>
                <select value={filterField} onChange={e => setFilterField(e.target.value)} style={{ padding: '8px 10px', fontSize: '0.82rem', minWidth: '160px' }}>
                    <option value="all">All Fields</option>
                    {uniqueFields.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                {(search || filterField !== 'all') && (
                    <button onClick={() => { setSearch(''); setFilterField('all') }} className="btn-secondary" style={{ padding: '7px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                        <X size={13} /> Clear
                    </button>
                )}
            </div>

            {/* Empty filtered state */}
            {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    No entries match your search.
                </div>
            )}

            {/* Grouped timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {groups.map(group => (
                    <div key={group.label}>
                        {/* Date group header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {group.label}
                            </div>
                            <div style={{ flex: 1, height: '1px', background: 'var(--table-border)' }} />
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '8px', whiteSpace: 'nowrap' }}>
                                {group.entries.length} change{group.entries.length !== 1 ? 's' : ''}
                            </div>
                        </div>

                        {/* Entries */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {group.entries.map(entry => {
                                const isFlagField = entry.fieldName === 'Flag State'
                                const isCustomerField = entry.fieldName === 'Customer'
                                const displayOld = isFlagField ? resolveFlagValue(entry.oldValue) : isCustomerField ? resolveEntityValue(entry.oldValue) : entry.oldValue
                                const displayNew = isFlagField ? resolveFlagValue(entry.newValue) : isCustomerField ? resolveEntityValue(entry.newValue) : entry.newValue
                                const meta = getFieldMeta(entry.fieldName)
                                const entryTime = new Date(entry.changedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

                                return (
                                    <div key={entry.id} style={{
                                        display: 'flex', gap: '12px', alignItems: 'flex-start',
                                        padding: '12px 14px', borderRadius: '10px',
                                        border: '1px solid var(--table-border)',
                                        borderLeft: `3px solid ${meta.color}`,
                                        background: isLight ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.02)',
                                        transition: 'background 0.12s',
                                    }}>
                                        {/* Icon */}
                                        <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: meta.color, marginTop: '1px' }}>
                                            {meta.icon}
                                        </div>

                                        {/* Content */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: meta.color }}>{entry.fieldName}</span>
                                                <div style={{ flex: 1 }} />
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <Clock size={10} />{entryTime}
                                                </span>
                                            </div>

                                            {/* Value change */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.83rem' }}>
                                                {displayOld ? (
                                                    <span style={{ textDecoration: 'line-through', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{displayOld}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.78rem' }}>empty</span>
                                                )}
                                                <ArrowRight size={12} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                                                {displayNew ? (
                                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{displayNew}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.78rem' }}>cleared</span>
                                                )}
                                            </div>

                                            {/* By */}
                                            <div style={{ marginTop: '5px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                by <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.changedBy}</span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

