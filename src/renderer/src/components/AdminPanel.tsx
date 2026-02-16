import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, FileText, UserCheck, ChevronDown, ChevronRight, ChevronUp, Shield, X, Database, Clock, Play, Loader2, Bell, ClipboardCheck, ArrowLeft, Ship, GripVertical, Tag, Edit3, Upload } from 'lucide-react'
import { DocumentType, AssuredRole, FileTypeSettings, ComplianceScheduleSettings, ReminderSettings, ConditionSurveyType, PolicyType, ClassificationSociety, VesselType, PolicyTypeCharacteristic, PolicyTypeCondition } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'

export default function AdminPanel({ onNavigateToVessel }: { onNavigateToVessel?: (vesselId: string) => void }) {
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [newName, setNewName] = useState('')
    const [newDescription, setNewDescription] = useState('')
    const [required, setRequired] = useState(false)
    const [annualRenewal, setAnnualRenewal] = useState(false)
    const [roles, setRoles] = useState<AssuredRole[]>([])
    const [newRole, setNewRole] = useState('')
    const [surveyTypes, setSurveyTypes] = useState<ConditionSurveyType[]>([])
    const [newSurveyType, setNewSurveyType] = useState('')
    const [fileTypeSettings, setFileTypeSettings] = useState<FileTypeSettings>({ allowedExtensions: [], blockedExtensions: [] })
    const [newAllowedExt, setNewAllowedExt] = useState('')
    const [newBlockedExt, setNewBlockedExt] = useState('')
    const [fileTypeStatus, setFileTypeStatus] = useState('')
    const [configPath, setConfigPath] = useState<string | null>(null)
    const { showSuccess, showError } = useToast()

    // Compliance schedule state
    const [complianceSettings, setComplianceSettings] = useState<ComplianceScheduleSettings>({
        enabled: false,
        dayOfWeek: 1,
        timeOfDay: '09:00',
        threshold: 85,
        includeVessels: true,
        skipCleared: true
    })
    const [savingCompliance, setSavingCompliance] = useState(false)
    const [runningManualCheck, setRunningManualCheck] = useState(false)

    // Collapsible sections
    const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
    const [newPolicyType, setNewPolicyType] = useState('')
    const [editingPolicyTypeId, setEditingPolicyTypeId] = useState<string | null>(null)
    const [editPolicyTypeName, setEditPolicyTypeName] = useState('')

    // Classification Societies
    const [classSocieties, setClassSocieties] = useState<ClassificationSociety[]>([])
    const [newClassName, setNewClassName] = useState('')
    const [newClassAbbr, setNewClassAbbr] = useState('')
    const [newClassIacs, setNewClassIacs] = useState(false)
    const [editingClassId, setEditingClassId] = useState<string | null>(null)
    const [editClassName, setEditClassName] = useState('')
    const [editClassAbbr, setEditClassAbbr] = useState('')
    const [editClassIacs, setEditClassIacs] = useState(false)

    // Vessel Types
    const [vesselTypes, setVesselTypes] = useState<VesselType[]>([])
    const [newVesselTypeName, setNewVesselTypeName] = useState('')
    const [editingVesselTypeId, setEditingVesselTypeId] = useState<string | null>(null)
    const [editVesselTypeName, setEditVesselTypeName] = useState('')

    // Policy type characteristics and conditions
    const [expandedPolicyTypeId, setExpandedPolicyTypeId] = useState<string | null>(null)
    const [ptCharacteristics, setPtCharacteristics] = useState<PolicyTypeCharacteristic[]>([])
    const [ptConditions, setPtConditions] = useState<PolicyTypeCondition[]>([])
    const [newCharName, setNewCharName] = useState('')
    const [newCharType, setNewCharType] = useState<'text' | 'date' | 'amount' | 'boolean' | 'select'>('text')
    const [newCharRequired, setNewCharRequired] = useState(false)
    const [newCondName, setNewCondName] = useState('')

    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['docTypes', 'roles', 'surveyTypes', 'vesselTypes', 'classSocieties', 'policyTypes', 'compliance', 'reminders', 'fileTypes', 'dbConfig', 'dataImport', 'dangerZone']))
    const toggleSection = (id: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // Reminder settings state
    const DEFAULT_TEMPLATE = `Vessel: {vesselName} (IMO: {imoNumber})\n\nVessel Documents:\n{vesselDocuments}\n\nAssured Documents:\n{assuredDocuments}`
    const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({ periodDays: 7, reminderTemplate: DEFAULT_TEMPLATE })
    const [savingReminder, setSavingReminder] = useState(false)

    useEffect(() => {
        loadData()
        loadFileTypeSettings()
        loadConfigPath()
        loadComplianceSettings()
        loadReminderSettings()
    }, [])

    const loadConfigPath = async () => {
        const path = await window.api.setupGetConfigPath()
        setConfigPath(path)
    }

    const loadComplianceSettings = async () => {
        const settings = await window.api.complianceGetScheduleSettings()
        setComplianceSettings(settings)
    }

    const handleSaveComplianceSettings = async () => {
        setSavingCompliance(true)
        try {
            const result = await window.api.complianceSetScheduleSettings(complianceSettings)
            if (result.success) {
                showSuccess('Compliance schedule settings saved')
                loadComplianceSettings()
            } else {
                showError(result.message || 'Failed to save settings')
            }
        } catch (error: any) {
            showError(error.message || 'Failed to save settings')
        } finally {
            setSavingCompliance(false)
        }
    }

    const handleRunManualCheck = async () => {
        setRunningManualCheck(true)
        try {
            const result = await window.api.complianceRunManualCheck()
            if (result.success) {
                showSuccess('Compliance check started. You will be notified when complete.')
            } else {
                showError(result.message || 'Failed to start compliance check')
            }
        } catch (error: any) {
            showError(error.message || 'Failed to start compliance check')
        } finally {
            setRunningManualCheck(false)
        }
    }



    const loadReminderSettings = async () => {
        const settings = await window.api.remindersGetSettings()
        setReminderSettings(settings)
    }

    const handleSaveReminderSettings = async () => {
        setSavingReminder(true)
        try {
            await window.api.remindersSetSettings(reminderSettings)
            showSuccess('Reminder settings saved')
        } catch (error: any) {
            showError(error.message || 'Failed to save reminder settings')
        } finally {
            setSavingReminder(false)
        }
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    const loadData = async () => {
        await loadDocTypes()
        await loadRoles()
        await loadSurveyTypes()
        await loadClassSocieties()
        await loadVesselTypes()
        await loadPolicyTypes()
    }

    const loadPolicyTypes = async () => {
        const data = await window.api.getPolicyTypes()
        setPolicyTypes(data)
    }

    const handleAddPolicyType = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newPolicyType.trim()) return
        await window.api.addPolicyType(newPolicyType.trim())
        setNewPolicyType('')
        loadPolicyTypes()
        showSuccess('Policy type added')
    }

    const handleDeletePolicyType = async (id: string) => {
        if (!confirm('Delete this policy type? It will be removed from all vessels.')) return
        await window.api.deletePolicyType(id)
        loadPolicyTypes()
        showSuccess('Policy type deleted')
    }

    const startEditingPolicyType = (pt: PolicyType) => {
        setEditingPolicyTypeId(pt.id)
        setEditPolicyTypeName(pt.name)
    }

    const savePolicyTypeEdit = async (id: string) => {
        if (!editPolicyTypeName.trim()) return
        await window.api.updatePolicyType(id, { name: editPolicyTypeName.trim() })
        setEditingPolicyTypeId(null)
        loadPolicyTypes()
        showSuccess('Policy type updated')
    }

    const handleMovePolicyType = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...policyTypes]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
            ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setPolicyTypes(newOrder)
        await window.api.reorderPolicyTypes(newOrder.map(p => p.id))
    }

    // --- Classification Societies ---
    const loadClassSocieties = async () => {
        const data = await window.api.getClassificationSocieties()
        setClassSocieties(data)
    }

    const handleAddClassSociety = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newClassName.trim()) return
        await window.api.addClassificationSociety({ name: newClassName.trim(), abbreviation: newClassAbbr.trim(), isIacs: newClassIacs, order: classSocieties.length })
        setNewClassName(''); setNewClassAbbr(''); setNewClassIacs(false)
        loadClassSocieties()
        showSuccess('Classification society added')
    }

    const handleDeleteClassSociety = async (id: string) => {
        if (!confirm('Delete this classification society?')) return
        await window.api.deleteClassificationSociety(id)
        loadClassSocieties()
        showSuccess('Classification society deleted')
    }

    const handleMoveClassSociety = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...classSocieties]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
            ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setClassSocieties(newOrder)
        await window.api.reorderClassificationSocieties(newOrder.map(c => c.id))
    }

    const saveClassSocietyEdit = async (id: string) => {
        if (!editClassName.trim()) return
        await window.api.updateClassificationSociety(id, { name: editClassName.trim(), abbreviation: editClassAbbr.trim(), isIacs: editClassIacs })
        setEditingClassId(null)
        loadClassSocieties()
        showSuccess('Classification society updated')
    }

    // --- Vessel Types ---
    const loadVesselTypes = async () => {
        const data = await window.api.getVesselTypes()
        setVesselTypes(data)
    }

    const handleAddVesselType = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newVesselTypeName.trim()) return
        await window.api.addVesselType({ name: newVesselTypeName.trim(), order: vesselTypes.length })
        setNewVesselTypeName('')
        loadVesselTypes()
        showSuccess('Vessel type added')
    }

    const handleDeleteVesselType = async (id: string) => {
        if (!confirm('Delete this vessel type?')) return
        await window.api.deleteVesselType(id)
        loadVesselTypes()
        showSuccess('Vessel type deleted')
    }

    const handleMoveVesselType = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...vesselTypes]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
            ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setVesselTypes(newOrder)
        await window.api.reorderVesselTypes(newOrder.map(v => v.id))
    }

    const saveVesselTypeEdit = async (id: string) => {
        if (!editVesselTypeName.trim()) return
        await window.api.updateVesselType(id, { name: editVesselTypeName.trim() })
        setEditingVesselTypeId(null)
        loadVesselTypes()
        showSuccess('Vessel type updated')
    }

    // --- Policy Type Characteristics & Conditions ---
    const loadPolicyTypeDetails = async (policyTypeId: string) => {
        const [chars, conds] = await Promise.all([
            window.api.getPolicyTypeCharacteristics(policyTypeId),
            window.api.getPolicyTypeConditions(policyTypeId)
        ])
        setPtCharacteristics(chars)
        setPtConditions(conds)
    }

    const toggleExpandPolicyType = async (ptId: string) => {
        if (expandedPolicyTypeId === ptId) {
            setExpandedPolicyTypeId(null)
        } else {
            setExpandedPolicyTypeId(ptId)
            await loadPolicyTypeDetails(ptId)
        }
    }

    const handleAddCharacteristic = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newCharName.trim() || !expandedPolicyTypeId) return
        await window.api.addPolicyTypeCharacteristic({
            policyTypeId: expandedPolicyTypeId,
            name: newCharName.trim(),
            fieldType: newCharType,
            isRequired: newCharRequired,
            order: ptCharacteristics.length
        })
        setNewCharName(''); setNewCharType('text'); setNewCharRequired(false)
        loadPolicyTypeDetails(expandedPolicyTypeId)
        showSuccess('Characteristic added')
    }

    const handleDeleteCharacteristic = async (id: string) => {
        if (!expandedPolicyTypeId) return
        await window.api.deletePolicyTypeCharacteristic(id)
        loadPolicyTypeDetails(expandedPolicyTypeId)
        showSuccess('Characteristic deleted')
    }

    const handleAddCondition = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newCondName.trim() || !expandedPolicyTypeId) return
        await window.api.addPolicyTypeCondition({
            policyTypeId: expandedPolicyTypeId,
            name: newCondName.trim(),
            order: ptConditions.length
        })
        setNewCondName('')
        loadPolicyTypeDetails(expandedPolicyTypeId)
        showSuccess('Condition added')
    }

    const handleDeleteCondition = async (id: string) => {
        if (!expandedPolicyTypeId) return
        await window.api.deletePolicyTypeCondition(id)
        loadPolicyTypeDetails(expandedPolicyTypeId)
        showSuccess('Condition deleted')
    }

    const loadDocTypes = async () => {
        const data = await window.api.getDocumentTypes()

        // Normalize orders: ensure every doc has a unique sequential order
        // Sort by existing order first, handling undefined/NaN
        const sorted = [...data].sort((a, b) => {
            const oa = (a.order === undefined || isNaN(a.order)) ? 999 : a.order
            const ob = (b.order === undefined || isNaN(b.order)) ? 999 : b.order
            return oa - ob
        })

        // Check if we need to fix the orders (if they are not unique sequential 1, 2, 3...)
        let needsFix = false
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].order !== i + 1) {
                needsFix = true
                break
            }
        }

        if (needsFix && sorted.length > 0) {
            // Apply new sequential orders starting at 1
            for (let i = 0; i < sorted.length; i++) {
                const newOrderVal = i + 1
                await window.api.updateDocumentType(sorted[i].id, { order: newOrderVal })
                sorted[i].order = newOrderVal
            }
        }

        setDocTypes(sorted)
    }

    const loadRoles = async () => {
        const data = await window.api.getAssuredRoles()
        setRoles(data)
    }

    const loadSurveyTypes = async () => {
        const data = await window.api.getConditionSurveyTypes()
        setSurveyTypes(data)
    }

    const handleAddDocType = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName.trim()) return
        await window.api.addDocumentType({ name: newName, description: newDescription, required, annualRenewal, order: docTypes.length + 1 })
        setNewName('')
        setNewDescription('')
        setRequired(false)
        setAnnualRenewal(false)
        await loadDocTypes()
    }

    const handleDeleteDocType = async (id: string) => {
        if (confirm('Delete this document type? It will be removed from all vessels.')) {
            await window.api.deleteDocumentType(id)
            await loadDocTypes()
        }
    }

    const handleDocDragStart = (index: number) => {
        dragDocIndex.current = index
    }

    const handleDocDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (dragOverDocIndex !== index) setDragOverDocIndex(index)
    }

    const handleDocDrop = async (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault()
        setDragOverDocIndex(null)
        const fromIndex = dragDocIndex.current
        if (fromIndex === null || fromIndex === targetIndex) return
        dragDocIndex.current = null

        const reordered = [...docTypes]
        const [moved] = reordered.splice(fromIndex, 1)
        reordered.splice(targetIndex, 0, moved)

        // Optimistic UI update
        for (let i = 0; i < reordered.length; i++) {
            reordered[i] = { ...reordered[i], order: i + 1 }
        }
        setDocTypes(reordered)

        // Persist to DB
        for (let i = 0; i < reordered.length; i++) {
            await window.api.updateDocumentType(reordered[i].id, { order: i + 1 })
        }
    }

    const handleRoleDragStart = (index: number) => {
        dragRoleIndex.current = index
    }

    const handleRoleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (dragOverRoleIndex !== index) setDragOverRoleIndex(index)
    }

    const handleRoleDrop = async (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault()
        setDragOverRoleIndex(null)
        const fromIndex = dragRoleIndex.current
        if (fromIndex === null || fromIndex === targetIndex) return
        dragRoleIndex.current = null

        const reordered = [...roles]
        const [moved] = reordered.splice(fromIndex, 1)
        reordered.splice(targetIndex, 0, moved)

        // Optimistic UI update
        setRoles(reordered)

        // Persist to DB
        await window.api.reorderAssuredRoles(reordered.map(r => r.id))
    }

    const handleAddRole = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newRole.trim()) return
        if (roles.some(r => r.name.toLowerCase() === newRole.trim().toLowerCase())) {
            showError('This role already exists')
            return
        }
        await window.api.addAssuredRole({ name: newRole })
        setNewRole('')
        await loadRoles()
    }

    const handleDeleteRole = async (id: string) => {
        if (confirm('Delete this role? Existing vessel assignments will keep the name but the role will be removed from suggestions.')) {
            await window.api.deleteAssuredRole(id)
            await loadRoles()
        }
    }

    const [roleVesselPopup, setRoleVesselPopup] = useState<{ roleName: string; vessels: { id: string; name: string; imoNumber: string }[] } | null>(null)

    const handleShowRoleVessels = async (role: AssuredRole) => {
        if ((role.vesselCount || 0) === 0) return
        const vessels = await window.api.getVesselsByRole(role.name)
        setRoleVesselPopup({ roleName: role.name, vessels })
    }

    const handleAddSurveyType = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newSurveyType.trim()) return
        await window.api.addConditionSurveyType(newSurveyType)
        setNewSurveyType('')
        await loadSurveyTypes()
    }

    const handleDeleteSurveyType = async (id: string) => {
        if (confirm('Delete this survey type? Existing surveys will keep their type.')) {
            await window.api.deleteConditionSurveyType(id)
            await loadSurveyTypes()
        }
    }



    const [editingDocId, setEditingDocId] = useState<string | null>(null)
    const [editDocName, setEditDocName] = useState('')
    const [editDocDescription, setEditDocDescription] = useState('')
    const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
    const [editRoleName, setEditRoleName] = useState('')

    // Drag-to-reorder state
    const dragDocIndex = useRef<number | null>(null)
    const dragRoleIndex = useRef<number | null>(null)
    const [dragOverDocIndex, setDragOverDocIndex] = useState<number | null>(null)
    const [dragOverRoleIndex, setDragOverRoleIndex] = useState<number | null>(null)

    const startEditingDoc = (doc: DocumentType) => {
        setEditingDocId(doc.id)
        setEditDocName(doc.name)
        setEditDocDescription(doc.description || '')
    }

    const saveDocEdit = async (id: string) => {
        if (!editDocName.trim()) return
        await window.api.updateDocumentType(id, { name: editDocName, description: editDocDescription })
        setEditingDocId(null)
        await loadDocTypes()
    }

    const startEditingRole = (role: AssuredRole) => {
        setEditingRoleId(role.id)
        setEditRoleName(role.name)
    }

    const saveRoleEdit = async (id: string) => {
        if (!editRoleName.trim()) return
        await window.api.updateAssuredRole(id, { name: editRoleName })
        setEditingRoleId(null)
        await loadRoles()
    }

    const handleToggleDocRequired = async (doc: DocumentType) => {
        await window.api.updateDocumentType(doc.id, { required: !doc.required })
        await loadDocTypes()
    }

    const handleToggleAnnualRenewal = async (doc: DocumentType) => {
        await window.api.updateDocumentType(doc.id, { annualRenewal: !doc.annualRenewal })
        await loadDocTypes()
    }

    const loadFileTypeSettings = async () => {
        const settings = await window.api.fileTypesGetSettings()
        setFileTypeSettings(settings)
    }

    const handleAddAllowedExt = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newAllowedExt.trim()) return

        const ext = newAllowedExt.trim().toLowerCase().startsWith('.') ? newAllowedExt.trim().toLowerCase() : `.${newAllowedExt.trim().toLowerCase()}`

        if (fileTypeSettings.allowedExtensions.includes(ext)) {
            setFileTypeStatus('Extension already in allowed list')
            setTimeout(() => setFileTypeStatus(''), 3000)
            return
        }

        const updated = {
            ...fileTypeSettings,
            allowedExtensions: [...fileTypeSettings.allowedExtensions, ext]
        }

        const saved = await window.api.fileTypesSetSettings(updated)
        setFileTypeSettings(saved)
        setNewAllowedExt('')
        setFileTypeStatus('✓ Allowed extension added')
        setTimeout(() => setFileTypeStatus(''), 3000)
    }

    const handleAddBlockedExt = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newBlockedExt.trim()) return

        const ext = newBlockedExt.trim().toLowerCase().startsWith('.') ? newBlockedExt.trim().toLowerCase() : `.${newBlockedExt.trim().toLowerCase()}`

        if (fileTypeSettings.blockedExtensions.includes(ext)) {
            setFileTypeStatus('Extension already in blocked list')
            setTimeout(() => setFileTypeStatus(''), 3000)
            return
        }

        const updated = {
            ...fileTypeSettings,
            blockedExtensions: [...fileTypeSettings.blockedExtensions, ext]
        }

        const saved = await window.api.fileTypesSetSettings(updated)
        setFileTypeSettings(saved)
        setNewBlockedExt('')
        setFileTypeStatus('✓ Blocked extension added')
        setTimeout(() => setFileTypeStatus(''), 3000)
    }

    const handleRemoveAllowedExt = async (ext: string) => {
        const updated = {
            ...fileTypeSettings,
            allowedExtensions: fileTypeSettings.allowedExtensions.filter(e => e !== ext)
        }

        const saved = await window.api.fileTypesSetSettings(updated)
        setFileTypeSettings(saved)
        setFileTypeStatus('✓ Allowed extension removed')
        setTimeout(() => setFileTypeStatus(''), 3000)
    }

    const handleRemoveBlockedExt = async (ext: string) => {
        const updated = {
            ...fileTypeSettings,
            blockedExtensions: fileTypeSettings.blockedExtensions.filter(e => e !== ext)
        }

        const saved = await window.api.fileTypesSetSettings(updated)
        setFileTypeSettings(saved)
        setFileTypeStatus('✓ Blocked extension removed')
        setTimeout(() => setFileTypeStatus(''), 3000)
    }

    const handleBrowseConfigFile = async () => {
        const filePath = await window.api.setupSelectConfigFile()
        if (filePath) {
            const result = await window.api.setupLoadConfigFromFile(filePath)
            if (result.success) {
                window.location.reload()
            } else {
                alert(result.message || 'Failed to load configuration')
            }
        }
    }

    const handleBrowseConfigDir = async () => {
        const dir = await window.api.setupSelectDirectory()
        if (dir) {
            const result = await window.api.setupLoadConfigFromDir(dir)
            if (result.success) {
                window.location.reload()
            } else {
                alert(result.message || 'Failed to load configuration')
            }
        }
    }

    // Full-page view for vessels by role
    if (roleVesselPopup) {
        return (
            <div className="fade-in">
                <button onClick={() => setRoleVesselPopup(null)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                    <ArrowLeft size={18} /> Back to Settings
                </button>
                <header style={{ marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Vessels with role: {roleVesselPopup.roleName}</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>{roleVesselPopup.vessels.length} vessel{roleVesselPopup.vessels.length !== 1 ? 's' : ''} assigned</p>
                </header>
                {roleVesselPopup.vessels.length === 0 ? (
                    <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <Ship size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                        <p>No vessels found with this role.</p>
                    </div>
                ) : (
                    <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Vessels with role {roleVesselPopup.roleName}</caption>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th scope="col" style={{ padding: '16px' }}>Vessel Name</th>
                                    <th scope="col" style={{ padding: '16px' }}>IMO Number</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roleVesselPopup.vessels.map(v => (
                                    <tr key={v.id} style={{ borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
                                        <td style={{ padding: '16px', fontWeight: '600' }}>{v.name}</td>
                                        <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{v.imoNumber}</td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            {onNavigateToVessel && (
                                                <button
                                                    onClick={() => {
                                                        setRoleVesselPopup(null)
                                                        onNavigateToVessel(v.id)
                                                    }}
                                                    className="btn-primary"
                                                    style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                                >
                                                    Open
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Admin Panel</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Configure global document types, their display order, and assured roles.</p>
            </header>


            {/* 1. Document Types */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('docTypes')}
                    style={{ marginBottom: collapsedSections.has('docTypes') ? 0 : '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('docTypes') ? <ChevronRight size={20} color="var(--accent-primary)" /> : <ChevronDown size={20} color="var(--accent-primary)" />}
                    <FileText size={20} color="var(--accent-primary)" /> Document Types
                </h3>
                {!collapsedSections.has('docTypes') && <><form onSubmit={handleAddDocType} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
                    <div style={{ flex: '1 1 300px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Name</label>
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            style={{ width: '100%', marginBottom: '12px' }}
                            placeholder="e.g. Safety Management Certificate"
                            aria-label="Document type name"
                        />
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Description (optional)</label>
                        <textarea
                            value={newDescription}
                            onChange={e => setNewDescription(e.target.value)}
                            style={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
                            placeholder="Brief description of the document purposes..."
                            aria-label="Document type description"
                        />
                    </div>
                    <div style={{ width: '1px' }}></div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', width: '100%', marginTop: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <input
                                type="checkbox"
                                checked={required}
                                onChange={e => setRequired(e.target.checked)}
                                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                aria-label="Required by default"
                            />
                            Required by default
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <input
                                type="checkbox"
                                checked={annualRenewal}
                                onChange={e => setAnnualRenewal(e.target.checked)}
                                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                aria-label="Annual renewal"
                            />
                            Annual Renewal
                        </label>
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                            <Plus size={18} /> Add Document Type
                        </button>
                    </div>
                </form>

                    <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Document types configuration</caption>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th scope="col" style={{ padding: '16px', width: '60px' }}>#</th>
                                    <th scope="col" style={{ padding: '16px' }}>Document Type</th>
                                    <th scope="col" style={{ padding: '16px' }}>Status</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {docTypes.map((doc, index) => (
                                    <tr
                                        key={doc.id}
                                        draggable
                                        onDragStart={() => handleDocDragStart(index)}
                                        onDragOver={(e) => handleDocDragOver(e, index)}
                                        onDrop={(e) => handleDocDrop(e, index)}
                                        onDragEnd={() => { dragDocIndex.current = null; setDragOverDocIndex(null) }}
                                        style={{
                                            borderBottom: '1px solid var(--table-border)',
                                            opacity: dragDocIndex.current === index ? 0.5 : 1,
                                            background: dragOverDocIndex === index ? 'rgba(0, 210, 255, 0.1)' : 'transparent',
                                            cursor: 'grab'
                                        }}
                                    >
                                        <td style={{ padding: '20px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <GripVertical size={16} color="var(--text-secondary)" style={{ opacity: 0.5 }} />
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', minWidth: '20px', textAlign: 'center' }}>{index + 1}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '20px 16px' }}>
                                            {editingDocId === doc.id ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <input
                                                        type="text"
                                                        value={editDocName}
                                                        onChange={e => setEditDocName(e.target.value)}
                                                        autoFocus
                                                        style={{ width: '100%' }}
                                                        aria-label="Edit document type name"
                                                    />
                                                    <textarea
                                                        value={editDocDescription}
                                                        onChange={e => setEditDocDescription(e.target.value)}
                                                        placeholder="Description..."
                                                        style={{ width: '100%', minHeight: '60px', borderRadius: '8px' }}
                                                        aria-label="Edit document type description"
                                                    />
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button onClick={() => saveDocEdit(doc.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Save</button>
                                                        <button onClick={() => setEditingDocId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div onClick={() => startEditingDoc(doc)} style={{ cursor: 'pointer' }}>
                                                    <div style={{ fontWeight: '600' }}>{doc.name}</div>
                                                    {doc.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{doc.description}</div>}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '20px 16px' }}>
                                            <span
                                                onClick={() => handleToggleDocRequired(doc)}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    background: doc.required ? 'rgba(255, 77, 77, 0.1)' : 'var(--table-header-bg)',
                                                    color: doc.required ? 'var(--danger)' : 'var(--text-secondary)',
                                                    border: doc.required ? '1px solid rgba(255, 77, 77, 0.2)' : '1px solid var(--table-border)',
                                                    cursor: 'pointer'
                                                }}
                                            >{doc.required ? 'REQUIRED' : 'OPTIONAL'}</span>
                                            {' '}
                                            <span
                                                onClick={() => handleToggleAnnualRenewal(doc)}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    background: doc.annualRenewal ? 'rgba(59, 130, 246, 0.1)' : 'var(--table-header-bg)',
                                                    color: doc.annualRenewal ? '#60a5fa' : 'var(--text-secondary)',
                                                    border: doc.annualRenewal ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid var(--table-border)',
                                                    cursor: 'pointer',
                                                    marginLeft: '4px'
                                                }}
                                            >{doc.annualRenewal ? 'ANNUAL' : 'ONE-TIME'}</span>
                                        </td>
                                        <td style={{ padding: '20px 16px', textAlign: 'right' }}>
                                            <button onClick={() => handleDeleteDocType(doc.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete document type"><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>}
            </section>

            {/* 2. Assured Roles */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('roles')}
                    style={{ marginBottom: collapsedSections.has('roles') ? 0 : '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('roles') ? <ChevronRight size={20} color="var(--accent-primary)" /> : <ChevronDown size={20} color="var(--accent-primary)" />}
                    <UserCheck size={20} color="var(--accent-primary)" /> Assured Roles
                </h3>
                {!collapsedSections.has('roles') && <><form onSubmit={handleAddRole} style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                    <input
                        type="text"
                        value={newRole}
                        onChange={e => setNewRole(e.target.value)}
                        style={{ flex: 1 }}
                        placeholder="e.g. Technical Manager"
                        aria-label="Assured role name"
                    />
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Plus size={18} /> Add Role
                    </button>
                </form>

                    <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Assured roles</caption>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th scope="col" style={{ padding: '16px', width: '60px' }}>#</th>
                                    <th scope="col" style={{ padding: '16px' }}>Role</th>
                                    <th scope="col" style={{ padding: '16px', width: '120px' }}>Vessels</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roles.map((role, index) => (
                                    <tr
                                        key={role.id}
                                        draggable
                                        onDragStart={() => handleRoleDragStart(index)}
                                        onDragOver={(e) => handleRoleDragOver(e, index)}
                                        onDrop={(e) => handleRoleDrop(e, index)}
                                        onDragEnd={() => { dragRoleIndex.current = null; setDragOverRoleIndex(null) }}
                                        style={{
                                            borderBottom: '1px solid var(--table-border)',
                                            opacity: dragRoleIndex.current === index ? 0.5 : 1,
                                            background: dragOverRoleIndex === index ? 'rgba(0, 210, 255, 0.1)' : 'transparent',
                                            cursor: 'grab'
                                        }}
                                    >
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <GripVertical size={16} color="var(--text-secondary)" style={{ opacity: 0.5 }} />
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', minWidth: '20px', textAlign: 'center' }}>{index + 1}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            {editingRoleId === role.id ? (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input
                                                        type="text"
                                                        value={editRoleName}
                                                        onChange={e => setEditRoleName(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && saveRoleEdit(role.id)}
                                                        onKeyDownCapture={e => e.key === 'Escape' && setEditingRoleId(null)}
                                                        autoFocus
                                                        style={{ flex: 1 }}
                                                        aria-label="Edit role name"
                                                    />
                                                    <button onClick={() => saveRoleEdit(role.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Save</button>
                                                    <button onClick={() => setEditingRoleId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Cancel</button>
                                                </div>
                                            ) : (
                                                <span onClick={() => startEditingRole(role)} style={{ cursor: 'pointer' }}>{role.name}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <span
                                                onClick={() => handleShowRoleVessels(role)}
                                                style={{
                                                    fontSize: '0.85rem',
                                                    color: (role.vesselCount || 0) > 0 ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                                    fontWeight: (role.vesselCount || 0) > 0 ? '600' : '400',
                                                    cursor: (role.vesselCount || 0) > 0 ? 'pointer' : 'default',
                                                    textDecoration: (role.vesselCount || 0) > 0 ? 'underline' : 'none'
                                                }}
                                            >
                                                {role.vesselCount || 0}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <button onClick={() => handleDeleteRole(role.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete role"><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>}
            </section>

            {/* 3. Condition Survey Types */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('surveyTypes')}
                    style={{ marginBottom: collapsedSections.has('surveyTypes') ? 0 : '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('surveyTypes') ? <ChevronRight size={20} color="var(--accent-primary)" /> : <ChevronDown size={20} color="var(--accent-primary)" />}
                    <ClipboardCheck size={20} color="var(--accent-primary)" /> Condition Survey Types
                </h3>
                {!collapsedSections.has('surveyTypes') && <><form onSubmit={handleAddSurveyType} style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                    <input
                        type="text"
                        value={newSurveyType}
                        onChange={e => setNewSurveyType(e.target.value)}
                        style={{ flex: 1 }}
                        placeholder="e.g. Annual Condition Survey"
                        aria-label="Survey type name"
                    />
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Plus size={18} /> Add Type
                    </button>
                </form>

                    <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Condition survey types</caption>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th scope="col" style={{ padding: '16px' }}>Survey Type</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {surveyTypes.map(type => (
                                    <tr key={type.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                        <td style={{ padding: '16px' }}>{type.name}</td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <button onClick={() => handleDeleteSurveyType(type.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete survey type"><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>}
            </section>

            {/* 4. Sanctions Check Scheduler */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('compliance')}
                    style={{ marginBottom: collapsedSections.has('compliance') ? 0 : '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('compliance') ? <ChevronRight size={20} color="var(--accent-primary)" /> : <ChevronDown size={20} color="var(--accent-primary)" />}
                    <Clock size={20} color="var(--accent-primary)" /> Scheduled Compliance Check
                </h3>
                {!collapsedSections.has('compliance') && <><p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    Automatically check all entities and vessels against sanctions lists on a weekly schedule.
                </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={complianceSettings.enabled}
                                        onChange={e => setComplianceSettings({ ...complianceSettings, enabled: e.target.checked })}
                                        style={{ width: '20px', height: '20px', accentColor: 'var(--accent-primary)' }}
                                        aria-label="Enable weekly compliance check"
                                    />
                                    <span style={{ fontWeight: '600' }}>Enable Weekly Compliance Check</span>
                                </label>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Day of Week</label>
                                    <select
                                        value={complianceSettings.dayOfWeek}
                                        onChange={e => setComplianceSettings({ ...complianceSettings, dayOfWeek: parseInt(e.target.value) })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                        disabled={!complianceSettings.enabled}
                                        aria-label="Day of week"
                                    >
                                        {dayNames.map((day, i) => (
                                            <option key={i} value={i}>{day}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Time</label>
                                    <input
                                        type="time"
                                        value={complianceSettings.timeOfDay}
                                        onChange={e => setComplianceSettings({ ...complianceSettings, timeOfDay: e.target.value })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                        disabled={!complianceSettings.enabled}
                                        aria-label="Time of day"
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                    Match Score Threshold: {complianceSettings.threshold}%
                                </label>
                                <input
                                    type="range"
                                    min="50"
                                    max="100"
                                    step="5"
                                    value={complianceSettings.threshold}
                                    onChange={e => setComplianceSettings({ ...complianceSettings, threshold: parseInt(e.target.value) })}
                                    style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                                    disabled={!complianceSettings.enabled}
                                    aria-label="Match score threshold"
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    <span>50% (More matches)</span>
                                    <span>100% (Exact only)</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '12px' }}>
                                    <input
                                        type="checkbox"
                                        checked={complianceSettings.includeVessels}
                                        onChange={e => setComplianceSettings({ ...complianceSettings, includeVessels: e.target.checked })}
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                        disabled={!complianceSettings.enabled}
                                        aria-label="Include vessels in check"
                                    />
                                    <span>Include vessels in check</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={complianceSettings.skipCleared}
                                        onChange={e => setComplianceSettings({ ...complianceSettings, skipCleared: e.target.checked })}
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                        disabled={!complianceSettings.enabled}
                                    />
                                    <span>Skip already cleared/confirmed entities</span>
                                </label>
                            </div>

                            {complianceSettings.lastRunAt && (
                                <div style={{ padding: '12px', background: 'rgba(0, 210, 255, 0.1)', border: '1px solid rgba(0, 210, 255, 0.2)', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
                                    <div style={{ marginBottom: '4px' }}>
                                        <strong>Last run:</strong> {new Date(complianceSettings.lastRunAt).toLocaleString()}
                                    </div>
                                    {complianceSettings.nextRunAt && (
                                        <div>
                                            <strong>Next run:</strong> {new Date(complianceSettings.nextRunAt).toLocaleString()}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={handleSaveComplianceSettings}
                                    disabled={savingCompliance}
                                    className="btn-primary"
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                >
                                    {savingCompliance && <Loader2 size={16} className="spinner" />}
                                    Save Settings
                                </button>
                                <button
                                    onClick={handleRunManualCheck}
                                    disabled={runningManualCheck}
                                    className="btn-secondary"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                >
                                    {runningManualCheck ? <Loader2 size={16} className="spinner" /> : <Play size={16} />}
                                    Run Now
                                </button>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(0, 255, 136, 0.1)', border: '1px solid rgba(0, 255, 136, 0.2)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <strong>How it works:</strong> The system will check all entities{complianceSettings.includeVessels ? ' and vessels' : ''} against sanctions lists.
                        Matches above {complianceSettings.threshold}% confidence will be flagged as "Potential Match" for review.
                        Results can be viewed in the Compliance Center.
                    </div>
                </>}
            </section>

            {/* 4. Vessel Reminder Settings */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('reminders')}
                    style={{ marginBottom: collapsedSections.has('reminders') ? 0 : '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('reminders') ? <ChevronRight size={20} color="var(--accent-primary)" /> : <ChevronDown size={20} color="var(--accent-primary)" />}
                    <Bell size={20} color="var(--accent-primary)" /> Vessel Reminder Settings
                </h3>
                {!collapsedSections.has('reminders') && <><p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    Configure the snooze period and copy-to-clipboard template for document reminders.
                </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '20px', marginBottom: '20px' }}>
                        <div>
                            <label htmlFor="admin-reminder-period" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Snooze Period (days)</label>
                            <input
                                id="admin-reminder-period"
                                type="number"
                                min={1}
                                max={90}
                                value={reminderSettings.periodDays}
                                onChange={e => setReminderSettings({ ...reminderSettings, periodDays: Number(e.target.value) })}
                                style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                            />
                        </div>
                        <div>
                            <label htmlFor="admin-reminder-template" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                Copy Template
                                <span style={{ marginLeft: '8px', fontSize: '0.8rem', opacity: 0.7 }}>
                                    Placeholders: {'{vesselName}'}, {'{imoNumber}'}, {'{vesselDocuments}'}, {'{assuredDocuments}'}
                                </span>
                            </label>
                            <textarea
                                id="admin-reminder-template"
                                value={reminderSettings.reminderTemplate}
                                onChange={e => setReminderSettings({ ...reminderSettings, reminderTemplate: e.target.value })}
                                rows={6}
                                style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleSaveReminderSettings}
                            disabled={savingReminder}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            {savingReminder && <Loader2 size={16} className="spinner" />}
                            Save Settings
                        </button>
                    </div>
                </>}
            </section>

            {/* 5. File Types */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('fileTypes')}
                    style={{ marginBottom: collapsedSections.has('fileTypes') ? 0 : '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('fileTypes') ? <ChevronRight size={20} color="var(--accent-primary)" /> : <ChevronDown size={20} color="var(--accent-primary)" />}
                    <Shield size={20} color="var(--accent-primary)" /> File Upload Security
                </h3>
                {!collapsedSections.has('fileTypes') && <><p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    Control which file types users can upload for vessel documents and passport/ID files.
                </p>

                    {fileTypeStatus && (
                        <div style={{
                            padding: '12px 16px',
                            marginBottom: '16px',
                            background: fileTypeStatus.startsWith('✓') ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                            border: fileTypeStatus.startsWith('✓') ? '1px solid rgba(0, 255, 136, 0.3)' : '1px solid rgba(255, 77, 77, 0.3)',
                            borderRadius: '8px',
                            fontSize: '0.9rem'
                        }}>
                            {fileTypeStatus}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div>
                            <h4 style={{ marginBottom: '12px', fontSize: '1rem', color: 'var(--success)' }}>
                                Allowed File Types
                            </h4>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                Only these file types can be uploaded. Leave empty to allow all (except blocked).
                            </p>

                            <form onSubmit={handleAddAllowedExt} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                <input
                                    type="text"
                                    value={newAllowedExt}
                                    onChange={e => setNewAllowedExt(e.target.value)}
                                    placeholder=".pdf or pdf"
                                    style={{ flex: 1 }}
                                    aria-label="Allowed file extension"
                                />
                                <button type="submit" className="btn-primary" style={{ padding: '0 16px' }} aria-label="Add allowed extension">
                                    <Plus size={16} />
                                </button>
                            </form>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {fileTypeSettings.allowedExtensions.map(ext => (
                                    <div
                                        key={ext}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '6px 12px',
                                            background: 'rgba(0, 255, 136, 0.1)',
                                            border: '1px solid rgba(0, 255, 136, 0.3)',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            fontFamily: 'monospace'
                                        }}
                                    >
                                        <span>{ext}</span>
                                        <button
                                            onClick={() => handleRemoveAllowedExt(ext)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                padding: '0',
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}
                                            aria-label={`Remove allowed extension ${ext}`}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                {fileTypeSettings.allowedExtensions.length === 0 && (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                        All file types allowed (except blocked)
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h4 style={{ marginBottom: '12px', fontSize: '1rem', color: 'var(--danger)' }}>
                                Blocked File Types
                            </h4>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                These file types are always rejected, even if in allowed list.
                            </p>

                            <form onSubmit={handleAddBlockedExt} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                <input
                                    type="text"
                                    value={newBlockedExt}
                                    onChange={e => setNewBlockedExt(e.target.value)}
                                    placeholder=".exe or exe"
                                    style={{ flex: 1 }}
                                    aria-label="Blocked file extension"
                                />
                                <button type="submit" className="btn-primary" style={{ padding: '0 16px', background: 'var(--danger)' }} aria-label="Add blocked extension">
                                    <Plus size={16} />
                                </button>
                            </form>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {fileTypeSettings.blockedExtensions.map(ext => (
                                    <div
                                        key={ext}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '6px 12px',
                                            background: 'rgba(255, 77, 77, 0.1)',
                                            border: '1px solid rgba(255, 77, 77, 0.3)',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            fontFamily: 'monospace'
                                        }}
                                    >
                                        <span>{ext}</span>
                                        <button
                                            onClick={() => handleRemoveBlockedExt(ext)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                padding: '0',
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}
                                            aria-label={`Remove blocked extension ${ext}`}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                {fileTypeSettings.blockedExtensions.length === 0 && (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                        No blocked file types
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>}
            </section>

            {/* 6. Database Configuration */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('dbConfig')}
                    style={{ marginBottom: collapsedSections.has('dbConfig') ? 0 : '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('dbConfig') ? <ChevronRight size={20} color="var(--accent-primary)" /> : <ChevronDown size={20} color="var(--accent-primary)" />}
                    <Database size={20} color="var(--accent-primary)" /> Database Configuration
                </h3>
                {!collapsedSections.has('dbConfig') && <><p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    View and manage the MySQL database connection settings.
                </p>

                    <div style={{ marginBottom: '24px' }}>
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Current Configuration File</div>
                        <div className="px-4 py-3 bg-black/20 rounded-lg text-sm text-gray-300 font-mono border border-white/5 break-all">
                            {configPath || 'Not configured'}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <button
                            onClick={handleBrowseConfigFile}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            <Database size={18} />
                            Browse for Config File
                        </button>
                        <button
                            onClick={handleBrowseConfigDir}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'rgba(100, 100, 255, 0.2)' }}
                        >
                            <Database size={18} />
                            Load from Directory
                        </button>
                    </div>

                    <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255, 165, 0, 0.1)', border: '1px solid rgba(255, 165, 0, 0.3)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Changing database configuration will reload the application. Make sure all work is saved.
                    </div>
                </>}
            </section>

            {/* 7. Vessel Types */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('vesselTypes')}
                    style={{ marginBottom: collapsedSections.has('vesselTypes') ? 0 : '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('vesselTypes') ? <ChevronRight size={20} color="var(--accent-primary)" /> : <ChevronDown size={20} color="var(--accent-primary)" />}
                    <Ship size={20} color="var(--accent-primary)" /> Vessel Types
                </h3>
                {!collapsedSections.has('vesselTypes') && <>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                        Manage vessel types (e.g. Bulk Carrier, Container Ship, Tanker).
                    </p>
                    <form onSubmit={handleAddVesselType} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                        <input type="text" value={newVesselTypeName} onChange={e => setNewVesselTypeName(e.target.value)} placeholder="Vessel type name" style={{ flex: 1 }} aria-label="Vessel type name" />
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={18} /> Add
                        </button>
                    </form>
                    {vesselTypes.length > 0 && (
                        <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <caption className="sr-only">Vessel types</caption>
                                <thead>
                                    <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                        <th scope="col" style={{ padding: '16px', width: '60px' }}>#</th>
                                        <th scope="col" style={{ padding: '16px' }}>Name</th>
                                        <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vesselTypes.map((vt, index) => (
                                        <tr key={vt.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <button onClick={() => handleMoveVesselType(index, 'up')} disabled={index === 0} style={{ background: 'transparent', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '0', opacity: index === 0 ? 0.3 : 1 }} aria-label="Move up"><ChevronUp size={14} color="var(--text-secondary)" /></button>
                                                        <button onClick={() => handleMoveVesselType(index, 'down')} disabled={index === vesselTypes.length - 1} style={{ background: 'transparent', border: 'none', cursor: index === vesselTypes.length - 1 ? 'default' : 'pointer', padding: '0', opacity: index === vesselTypes.length - 1 ? 0.3 : 1 }} aria-label="Move down"><ChevronDown size={14} color="var(--text-secondary)" /></button>
                                                    </div>
                                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{index + 1}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                {editingVesselTypeId === vt.id ? (
                                                    <input type="text" value={editVesselTypeName} onChange={e => setEditVesselTypeName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveVesselTypeEdit(vt.id)} autoFocus style={{ width: '100%' }} />
                                                ) : vt.name}
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                    {editingVesselTypeId === vt.id ? (
                                                        <>
                                                            <button onClick={() => saveVesselTypeEdit(vt.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Save</button>
                                                            <button onClick={() => setEditingVesselTypeId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Cancel</button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => { setEditingVesselTypeId(vt.id); setEditVesselTypeName(vt.name) }} style={{ background: 'transparent', color: 'var(--accent-primary)', border: 'none', cursor: 'pointer' }} aria-label="Edit"><Edit3 size={18} /></button>
                                                            <button onClick={() => handleDeleteVesselType(vt.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete"><Trash2 size={18} /></button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>}
            </section>

            {/* 8. Classification Societies */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('classSocieties')}
                    style={{ marginBottom: collapsedSections.has('classSocieties') ? 0 : '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('classSocieties') ? <ChevronRight size={20} color="var(--accent-primary)" /> : <ChevronDown size={20} color="var(--accent-primary)" />}
                    <Shield size={20} color="var(--accent-primary)" /> Classification Societies
                </h3>
                {!collapsedSections.has('classSocieties') && <>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                        Manage classification societies. Vessels can be assigned to one or more classes.
                    </p>
                    <form onSubmit={handleAddClassSociety} style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="Name (e.g. Lloyd's Register)" style={{ flex: 2, minWidth: '150px' }} aria-label="Class name" />
                        <input type="text" value={newClassAbbr} onChange={e => setNewClassAbbr(e.target.value)} placeholder="Abbreviation (e.g. LR)" style={{ flex: 1, minWidth: '80px' }} aria-label="Abbreviation" />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <input type="checkbox" checked={newClassIacs} onChange={e => setNewClassIacs(e.target.checked)} /> IACS
                        </label>
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={18} /> Add
                        </button>
                    </form>
                    {classSocieties.length > 0 && (
                        <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <caption className="sr-only">Classification societies</caption>
                                <thead>
                                    <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                        <th scope="col" style={{ padding: '16px', width: '60px' }}>#</th>
                                        <th scope="col" style={{ padding: '16px' }}>Name</th>
                                        <th scope="col" style={{ padding: '16px' }}>Abbreviation</th>
                                        <th scope="col" style={{ padding: '16px' }}>IACS</th>
                                        <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {classSocieties.map((cs, index) => (
                                        <tr key={cs.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <button onClick={() => handleMoveClassSociety(index, 'up')} disabled={index === 0} style={{ background: 'transparent', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '0', opacity: index === 0 ? 0.3 : 1 }} aria-label="Move up"><ChevronUp size={14} color="var(--text-secondary)" /></button>
                                                        <button onClick={() => handleMoveClassSociety(index, 'down')} disabled={index === classSocieties.length - 1} style={{ background: 'transparent', border: 'none', cursor: index === classSocieties.length - 1 ? 'default' : 'pointer', padding: '0', opacity: index === classSocieties.length - 1 ? 0.3 : 1 }} aria-label="Move down"><ChevronDown size={14} color="var(--text-secondary)" /></button>
                                                    </div>
                                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{index + 1}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                {editingClassId === cs.id ? (
                                                    <input type="text" value={editClassName} onChange={e => setEditClassName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveClassSocietyEdit(cs.id)} autoFocus style={{ width: '100%' }} />
                                                ) : cs.name}
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                {editingClassId === cs.id ? (
                                                    <input type="text" value={editClassAbbr} onChange={e => setEditClassAbbr(e.target.value)} style={{ width: '80px' }} />
                                                ) : cs.abbreviation}
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                {editingClassId === cs.id ? (
                                                    <input type="checkbox" checked={editClassIacs} onChange={e => setEditClassIacs(e.target.checked)} />
                                                ) : cs.isIacs ? 'Yes' : 'No'}
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                    {editingClassId === cs.id ? (
                                                        <>
                                                            <button onClick={() => saveClassSocietyEdit(cs.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Save</button>
                                                            <button onClick={() => setEditingClassId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Cancel</button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => { setEditingClassId(cs.id); setEditClassName(cs.name); setEditClassAbbr(cs.abbreviation); setEditClassIacs(cs.isIacs) }} style={{ background: 'transparent', color: 'var(--accent-primary)', border: 'none', cursor: 'pointer' }} aria-label="Edit"><Edit3 size={18} /></button>
                                                            <button onClick={() => handleDeleteClassSociety(cs.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete"><Trash2 size={18} /></button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>}
            </section>

            {/* 8. Policy Types */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('policyTypes')}
                    style={{ marginBottom: collapsedSections.has('policyTypes') ? 0 : '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('policyTypes') ? <ChevronRight size={20} color="var(--accent-primary)" /> : <ChevronDown size={20} color="var(--accent-primary)" />}
                    <Tag size={20} color="var(--accent-primary)" /> Policy Types
                </h3>
                {!collapsedSections.has('policyTypes') && <>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                        Define policy types that can be assigned to vessels. Used by the Dynamic Address Book for building distribution lists.
                    </p>
                    <form onSubmit={handleAddPolicyType} style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                        <input
                            type="text"
                            value={newPolicyType}
                            onChange={e => setNewPolicyType(e.target.value)}
                            style={{ flex: 1 }}
                            placeholder="e.g. Hull & Machinery"
                            aria-label="Policy type name"
                        />
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={18} /> Add Policy Type
                        </button>
                    </form>

                    {policyTypes.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {policyTypes.map((pt, index) => (
                                <div key={pt.id} style={{ border: '1px solid var(--table-border)', borderRadius: '8px', overflow: 'hidden' }}>
                                    {/* Policy type header row */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: expandedPolicyTypeId === pt.id ? 'var(--table-header-bg)' : 'transparent' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <button onClick={() => handleMovePolicyType(index, 'up')} disabled={index === 0} style={{ background: 'transparent', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '0', opacity: index === 0 ? 0.3 : 1 }} aria-label="Move up"><ChevronUp size={14} color="var(--text-secondary)" /></button>
                                            <button onClick={() => handleMovePolicyType(index, 'down')} disabled={index === policyTypes.length - 1} style={{ background: 'transparent', border: 'none', cursor: index === policyTypes.length - 1 ? 'default' : 'pointer', padding: '0', opacity: index === policyTypes.length - 1 ? 0.3 : 1 }} aria-label="Move down"><ChevronDown size={14} color="var(--text-secondary)" /></button>
                                        </div>
                                        <button onClick={() => toggleExpandPolicyType(pt.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0' }}>
                                            {expandedPolicyTypeId === pt.id ? <ChevronDown size={16} color="var(--accent-primary)" /> : <ChevronRight size={16} color="var(--text-secondary)" />}
                                        </button>
                                        <div style={{ flex: 1 }}>
                                            {editingPolicyTypeId === pt.id ? (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input type="text" value={editPolicyTypeName} onChange={e => setEditPolicyTypeName(e.target.value)} onKeyDown={e => e.key === 'Enter' && savePolicyTypeEdit(pt.id)} autoFocus style={{ flex: 1 }} aria-label="Edit policy type name" />
                                                    <button onClick={() => savePolicyTypeEdit(pt.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Save</button>
                                                    <button onClick={() => setEditingPolicyTypeId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Cancel</button>
                                                </div>
                                            ) : (
                                                <span onClick={() => toggleExpandPolicyType(pt.id)} style={{ cursor: 'pointer', fontWeight: '600' }}>{pt.name}</span>
                                            )}
                                        </div>
                                        {expandedPolicyTypeId !== pt.id && (
                                            <span onClick={() => toggleExpandPolicyType(pt.id)} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer', opacity: 0.7 }}>Click to configure fields &amp; conditions</span>
                                        )}
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => startEditingPolicyType(pt)} style={{ background: 'transparent', color: 'var(--accent-primary)', border: 'none', cursor: 'pointer' }} aria-label="Edit"><Edit3 size={16} /></button>
                                            <button onClick={() => handleDeletePolicyType(pt.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete"><Trash2 size={16} /></button>
                                        </div>
                                    </div>

                                    {/* Expanded: Characteristics + Conditions */}
                                    {expandedPolicyTypeId === pt.id && (
                                        <div style={{ padding: '16px', borderTop: '1px solid var(--table-border)', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                            {/* Characteristics */}
                                            <div style={{ flex: 2, minWidth: '300px' }}>
                                                <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>Characteristics (Fields)</h4>
                                                <form onSubmit={handleAddCharacteristic} style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                                    <input type="text" value={newCharName} onChange={e => setNewCharName(e.target.value)} placeholder="Field name" style={{ flex: 2, minWidth: '120px', fontSize: '0.85rem', padding: '4px 8px' }} />
                                                    <select value={newCharType} onChange={e => setNewCharType(e.target.value as any)} style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                                                        <option value="text">Text</option>
                                                        <option value="date">Date</option>
                                                        <option value="amount">Amount</option>
                                                        <option value="boolean">Boolean</option>
                                                        <option value="select">Select</option>
                                                    </select>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        <input type="checkbox" checked={newCharRequired} onChange={e => setNewCharRequired(e.target.checked)} /> Req
                                                    </label>
                                                    <button type="submit" className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Add</button>
                                                </form>
                                                {ptCharacteristics.length > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {ptCharacteristics.map(c => (
                                                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', background: 'rgba(128,128,128,0.05)', border: '1px solid var(--table-border)' }}>
                                                                <span style={{ flex: 1, fontSize: '0.85rem' }}>{c.name}</span>
                                                                <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,210,255,0.1)', color: 'var(--accent-primary)' }}>{c.fieldType}</span>
                                                                {c.isRequired && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>req</span>}
                                                                <button onClick={() => handleDeleteCharacteristic(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0' }}><X size={14} /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No characteristics defined</p>
                                                )}
                                            </div>

                                            {/* Conditions */}
                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>Conditions</h4>
                                                <form onSubmit={handleAddCondition} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                                    <input type="text" value={newCondName} onChange={e => setNewCondName(e.target.value)} placeholder="Condition name" style={{ flex: 1, fontSize: '0.85rem', padding: '4px 8px' }} />
                                                    <button type="submit" className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Add</button>
                                                </form>
                                                {ptConditions.length > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {ptConditions.map(c => (
                                                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', background: 'rgba(128,128,128,0.05)', border: '1px solid var(--table-border)' }}>
                                                                <span style={{ flex: 1, fontSize: '0.85rem' }}>{c.name}</span>
                                                                <button onClick={() => handleDeleteCondition(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0' }}><X size={14} /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No conditions defined</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>}
            </section>

            {/* 8. Data Import */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('dataImport')}
                    style={{ marginBottom: collapsedSections.has('dataImport') ? 0 : '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('dataImport') ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                    <Upload size={20} /> Data Import
                </h3>
                {!collapsedSections.has('dataImport') && <DataImportSection showSuccess={showSuccess} showError={showError} />}
            </section>

            {/* 9. Danger Zone – Purge Data */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3
                    onClick={() => toggleSection('dangerZone')}
                    style={{ marginBottom: collapsedSections.has('dangerZone') ? 0 : '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {collapsedSections.has('dangerZone') ? <ChevronRight size={20} color="#e74c3c" /> : <ChevronDown size={20} color="#e74c3c" />}
                    <Trash2 size={20} color="#e74c3c" /> Danger Zone
                </h3>
                {!collapsedSections.has('dangerZone') && <>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                        Permanently delete all vessels, entities, and related data (assureds, documents, surveys, UBOs). This action cannot be undone.
                    </p>
                    <button
                        onClick={async () => {
                            const first = confirm('Are you sure you want to delete ALL vessels and entities? This cannot be undone.')
                            if (!first) return
                            const second = confirm('This will permanently remove all vessels, entities, documents, surveys, and related data. Type OK to proceed.')
                            if (!second) return
                            try {
                                const result = await window.api.purgeAllVesselsAndEntities()
                                showSuccess(`Purged ${result.vesselsDeleted} vessels and ${result.entitiesDeleted} entities.`)
                            } catch (err: any) {
                                showError(err.message || 'Failed to purge data')
                            }
                        }}
                        className="btn-secondary"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'rgba(231, 76, 60, 0.15)',
                            border: '1px solid rgba(231, 76, 60, 0.4)',
                            color: '#e74c3c',
                            marginBottom: '16px'
                        }}
                    >
                        <Trash2 size={18} /> Purge All Vessels & Entities
                    </button>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '16px 0', paddingTop: '16px' }}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                            Adjust all policy inception and expiry dates by adding exactly one day. Use this to fix date offsets from imports.
                        </p>
                        <button
                            onClick={async () => {
                                const confirmed = confirm('Are you sure you want to add 1 day to ALL policy inception and expiry dates?')
                                if (!confirmed) return
                                try {
                                    const result = await window.api.maintenanceAddOneDayToAllPolicies()
                                    showSuccess(`Successfully updated ${result.updatedValues} policy field values and ${result.updatedVessels} vessel summary records.`)
                                } catch (err: any) {
                                    showError(err.message || 'Failed to update policy dates')
                                }
                            }}
                            className="btn-secondary"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: 'rgba(52, 152, 219, 0.15)',
                                border: '1px solid rgba(52, 152, 219, 0.4)',
                                color: '#3498db'
                            }}
                        >
                            <Calendar size={18} /> Add 1 Day to All Policy Dates
                        </button>
                    </div>

                </>}
            </section>

        </div >
    )
}

// ==================== Data Import Section ====================

function DataImportSection({ showSuccess, showError }: { showSuccess: (m: string) => void; showError: (m: string) => void }) {
    const [importing, setImporting] = useState(false)
    const [reimporting, setReimporting] = useState(false)
    const [result, setResult] = useState<{ imported: number; totalRows: number; unmatched: { ship: string; imo: string; broker: string; fleet: string }[] } | null>(null)
    const [reimportResult, setReimportResult] = useState<{ updated: number; totalRows: number; createdFlags: number; createdClasses: number; createdTypes: number } | null>(null)

    const handleImport = async () => {
        try {
            const filePath = await window.api.dialogOpenFile()
            if (!filePath) return
            setImporting(true)
            setResult(null)
            const res = await window.api.importInsurancePoliciesFromExcel(filePath)
            setResult(res)
            showSuccess(`Imported ${res.imported} policy records from ${res.totalRows} rows. ${res.unmatched.length} unmatched.`)
        } catch (err: any) {
            showError(err.message || 'Import failed')
        } finally {
            setImporting(false)
        }
    }

    const handleReimportDetails = async () => {
        try {
            const filePath = await window.api.dialogOpenFile()
            if (!filePath) return
            setReimporting(true)
            setReimportResult(null)
            const res = await window.api.reimportVesselDetails(filePath)
            setReimportResult(res)
            const parts: string[] = [`Updated ${res.updated} vessels from ${res.totalRows} rows.`]
            if (res.createdFlags) parts.push(`Created ${res.createdFlags} flag states.`)
            if (res.createdClasses) parts.push(`Created ${res.createdClasses} classification societies.`)
            if (res.createdTypes) parts.push(`Created ${res.createdTypes} vessel types.`)
            showSuccess(parts.join(' '))
        } catch (err: any) {
            showError(err.message || 'Re-import failed')
        } finally {
            setReimporting(false)
        }
    }

    return (
        <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                Import vessel insurance policy data from an Excel file. Matches vessels by IMO number. Cancelled vessels are skipped.
            </p>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button
                    onClick={handleImport}
                    disabled={importing}
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    {importing ? <><Loader2 size={16} className="spinning" /> Importing...</> : <><Upload size={16} /> Import Vessel Excel</>}
                </button>
                <button
                    onClick={handleReimportDetails}
                    disabled={reimporting}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    {reimporting ? <><Loader2 size={16} className="spinning" /> Re-importing...</> : <><Upload size={16} /> Re-import Vessel Details</>}
                </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '16px', marginTop: '-8px' }}>
                <strong>Re-import Vessel Details</strong> updates Type, Flag, and Class from an Excel file for all matched vessels (overwrites existing values). Missing settings entries are auto-created.
            </p>

            {result && (
                <div>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <div style={{ padding: '12px 20px', borderRadius: '8px', background: 'rgba(46, 204, 113, 0.1)', border: '1px solid rgba(46, 204, 113, 0.3)' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{result.imported}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Policy records imported</div>
                        </div>
                        <div style={{ padding: '12px 20px', borderRadius: '8px', background: 'rgba(52, 152, 219, 0.1)', border: '1px solid rgba(52, 152, 219, 0.3)' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{result.totalRows}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Active rows processed</div>
                        </div>
                        {result.unmatched.length > 0 && (
                            <div style={{ padding: '12px 20px', borderRadius: '8px', background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)' }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{result.unmatched.length}</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Unmatched vessels</div>
                            </div>
                        )}
                    </div>

                    {result.unmatched.length > 0 && (
                        <div>
                            <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Unmatched Vessels (no matching IMO found)</h4>
                            <div style={{ maxHeight: '300px', overflow: 'auto', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--table-header-bg)' }}>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--table-border)' }}>Ship Name</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--table-border)' }}>IMO</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--table-border)' }}>Broker</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--table-border)' }}>Fleet</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.unmatched.map((u, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                                <td style={{ padding: '6px 12px' }}>{u.ship}</td>
                                                <td style={{ padding: '6px 12px', fontFamily: 'monospace' }}>{u.imo || '-'}</td>
                                                <td style={{ padding: '6px 12px' }}>{u.broker || '-'}</td>
                                                <td style={{ padding: '6px 12px' }}>{u.fleet || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {reimportResult && (
                <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ padding: '12px 20px', borderRadius: '8px', background: 'rgba(46, 204, 113, 0.1)', border: '1px solid rgba(46, 204, 113, 0.3)' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{reimportResult.updated}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Vessels updated</div>
                        </div>
                        <div style={{ padding: '12px 20px', borderRadius: '8px', background: 'rgba(52, 152, 219, 0.1)', border: '1px solid rgba(52, 152, 219, 0.3)' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{reimportResult.totalRows}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Rows processed</div>
                        </div>
                        {(reimportResult.createdFlags > 0 || reimportResult.createdClasses > 0 || reimportResult.createdTypes > 0) && (
                            <div style={{ padding: '12px 20px', borderRadius: '8px', background: 'rgba(155, 89, 182, 0.1)', border: '1px solid rgba(155, 89, 182, 0.3)' }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {reimportResult.createdFlags + reimportResult.createdClasses + reimportResult.createdTypes}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Settings auto-created</div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
