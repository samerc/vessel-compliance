import { useState, useEffect } from 'react'
import { Plus, Trash2, FileText, UserCheck, ChevronUp, ChevronDown, ChevronRight, Shield, X, Database, Clock, Play, Loader2, Bell } from 'lucide-react'
import { DocumentType, AssuredRole, FileTypeSettings, ComplianceScheduleSettings, ReminderSettings } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'

export default function AdminPanel() {
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [newName, setNewName] = useState('')
    const [newDescription, setNewDescription] = useState('')
    const [required, setRequired] = useState(false)
    const [newOrder, setNewOrder] = useState(0)
    const [roles, setRoles] = useState<AssuredRole[]>([])
    const [newRole, setNewRole] = useState('')
    const [importing, setImporting] = useState(false)
    const [importStatus, setImportStatus] = useState<string>('')
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
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
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

        // Check if we need to fix the orders (if they are not unique sequential 0, 1, 2...)
        let needsFix = false
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].order !== i) {
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
        setNewOrder(sorted.length + 1)
    }

    const loadRoles = async () => {
        const data = await window.api.getAssuredRoles()
        setRoles(data)
    }

    const handleAddDocType = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName.trim()) return
        await window.api.addDocumentType({ name: newName, description: newDescription, required, order: newOrder })
        setNewName('')
        setNewDescription('')
        setRequired(false)
        await loadDocTypes()
    }

    const handleDeleteDocType = async (id: string) => {
        if (confirm('Delete this document type? It will be removed from all vessels.')) {
            await window.api.deleteDocumentType(id)
            await loadDocTypes()
        }
    }

    const handleUpdateOrder = async (id: string, val: string) => {
        const order = parseInt(val)
        if (isNaN(order)) return
        await window.api.updateDocumentType(id, { order })
        // After manual order edit, we should probably re-sort and re-normalize to avoid conflicts
        await loadDocTypes()
    }

    const moveStep = async (index: number, direction: 'up' | 'down') => {
        const newDocTypes = [...docTypes]
        const targetIndex = direction === 'up' ? index - 1 : index + 1

        if (targetIndex < 0 || targetIndex >= newDocTypes.length) return

        // Swap entries in local array
        const temp = newDocTypes[index]
        newDocTypes[index] = newDocTypes[targetIndex]
        newDocTypes[targetIndex] = temp

        // Save new sequential orders starting at 1
        for (let i = 0; i < newDocTypes.length; i++) {
            await window.api.updateDocumentType(newDocTypes[i].id, { order: i + 1 })
        }

        await loadDocTypes()
    }

    const handleAddRole = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newRole.trim()) return
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

    const handleImportExcel = async () => {
        try {
            setImporting(true)
            setImportStatus('Opening file dialog...')

            const filePath = await window.api.dialogOpenFile()
            if (!filePath) {
                setImportStatus('')
                setImporting(false)
                return
            }

            setImportStatus('Importing data from Excel...')
            const result = await window.api.excelImport(filePath)

            if (result.success) {
                setImportStatus(`✓ ${result.message}\n\nVessels Created: ${result.stats.vesselsCreated}\nVessels Updated: ${result.stats.vesselsUpdated}\nDocuments Imported: ${result.stats.documentsImported}\nEntities Created: ${result.stats.entitiesCreated}\nAssureds Linked: ${result.stats.assuredsLinked}`)
                await loadDocTypes()
                setTimeout(() => setImportStatus(''), 8000)
            } else {
                setImportStatus(`✗ ${result.message}`)
                setTimeout(() => setImportStatus(''), 5000)
            }
        } catch (error: any) {
            setImportStatus(`✗ Error: ${error.message}`)
            setTimeout(() => setImportStatus(''), 5000)
        } finally {
            setImporting(false)
        }
    }

    const [editingDocId, setEditingDocId] = useState<string | null>(null)
    const [editDocName, setEditDocName] = useState('')
    const [editDocDescription, setEditDocDescription] = useState('')
    const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
    const [editRoleName, setEditRoleName] = useState('')

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

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Admin Panel</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Configure global document types, their display order, and assured roles.</p>
                </div>
                <button
                    onClick={handleImportExcel}
                    disabled={importing}
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
                >
                    <FileText size={18} />
                    {importing ? 'Importing...' : 'Import from Excel'}
                </button>
            </header>

            {importStatus && (
                <div className="glass-card" style={{
                    padding: '16px 24px',
                    marginBottom: '24px',
                    background: importStatus.startsWith('✓') ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                    border: importStatus.startsWith('✓') ? '1px solid rgba(0, 255, 136, 0.3)' : '1px solid rgba(255, 77, 77, 0.3)',
                    whiteSpace: 'pre-line'
                }}>
                    {importStatus}
                </div>
            )}

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
                    <div style={{ width: '80px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Order</label>
                        <input
                            type="number"
                            value={newOrder}
                            onChange={e => setNewOrder(parseInt(e.target.value))}
                            style={{ width: '100%' }}
                            aria-label="Document type display order"
                        />
                    </div>
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
                                <th scope="col" style={{ padding: '16px', width: '120px' }}>Order</th>
                                <th scope="col" style={{ padding: '16px' }}>Document Type</th>
                                <th scope="col" style={{ padding: '16px' }}>Status</th>
                                <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {docTypes.map((doc, index) => (
                                <tr key={doc.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                    <td style={{ padding: '20px 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); moveStep(index, 'up'); }}
                                                    style={{ background: 'transparent', padding: 0, color: index === 0 ? '#333' : 'var(--accent-primary)', cursor: index === 0 ? 'default' : 'pointer', border: 'none' }}
                                                    disabled={index === 0}
                                                    aria-label="Move up"
                                                >
                                                    <ChevronUp size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); moveStep(index, 'down'); }}
                                                    style={{ background: 'transparent', padding: 0, color: index === docTypes.length - 1 ? '#333' : 'var(--accent-primary)', cursor: index === docTypes.length - 1 ? 'default' : 'pointer', border: 'none' }}
                                                    disabled={index === docTypes.length - 1}
                                                    aria-label="Move down"
                                                >
                                                    <ChevronDown size={16} />
                                                </button>
                                            </div>
                                            <input
                                                type="number"
                                                value={doc.order}
                                                onChange={(e) => handleUpdateOrder(doc.id, e.target.value)}
                                                style={{ width: '50px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'center', fontSize: '0.9rem' }}
                                                aria-label="Display order"
                                            />
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
                                <th scope="col" style={{ padding: '16px' }}>Role</th>
                                <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roles.map(role => (
                                <tr key={role.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                    <td style={{ padding: '16px' }}>
                                        {editingRoleId === role.id ? (
                                            <input
                                                type="text"
                                                value={editRoleName}
                                                onChange={e => setEditRoleName(e.target.value)}
                                                onBlur={() => saveRoleEdit(role.id)}
                                                onKeyDown={e => e.key === 'Enter' && saveRoleEdit(role.id)}
                                                autoFocus
                                                style={{ width: '100%' }}
                                                aria-label="Edit role name"
                                            />
                                        ) : (
                                            <span onClick={() => startEditingRole(role)} style={{ cursor: 'pointer' }}>{role.name}</span>
                                        )}
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

            {/* 3. Sanctions Check Scheduler */}
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
            <section className="glass-card" style={{ padding: '24px' }}>
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
        </div >
    )
}
