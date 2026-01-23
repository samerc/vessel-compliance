import { useState, useEffect } from 'react'
import { Plus, Trash2, FileText, UserCheck, ChevronUp, ChevronDown, Shield, X } from 'lucide-react'
import { DocumentType, AssuredRole, FileTypeSettings } from '../../../shared/types'

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

    useEffect(() => {
        loadData()
        loadFileTypeSettings()
    }, [])

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

            <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 0.4fr', gap: '32px' }}>
                <div>
                    <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={20} color="var(--accent-primary)" /> Define Document Type
                        </h3>
                        <form onSubmit={handleAddDocType} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 300px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    style={{ width: '100%', marginBottom: '12px' }}
                                    placeholder="e.g. Safety Management Certificate"
                                />
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Description (optional)</label>
                                <textarea
                                    value={newDescription}
                                    onChange={e => setNewDescription(e.target.value)}
                                    style={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
                                    placeholder="Brief description of the document purposes..."
                                />
                            </div>
                            <div style={{ width: '80px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Order</label>
                                <input
                                    type="number"
                                    value={newOrder}
                                    onChange={e => setNewOrder(parseInt(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', width: '100%', marginTop: '12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={required}
                                        onChange={e => setRequired(e.target.checked)}
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                    />
                                    Required by default
                                </label>
                                <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                                    <Plus size={18} /> Add Document Type
                                </button>
                            </div>
                        </form>
                    </section>

                    <section className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th style={{ padding: '16px', width: '80px' }}>Order</th>
                                    <th style={{ padding: '16px' }}>Document Type</th>
                                    <th style={{ padding: '16px' }}>Status</th>
                                    <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
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
                                                    >
                                                        <ChevronUp size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); moveStep(index, 'down'); }}
                                                        style={{ background: 'transparent', padding: 0, color: index === docTypes.length - 1 ? '#333' : 'var(--accent-primary)', cursor: index === docTypes.length - 1 ? 'default' : 'pointer', border: 'none' }}
                                                        disabled={index === docTypes.length - 1}
                                                    >
                                                        <ChevronDown size={16} />
                                                    </button>
                                                </div>
                                                <input
                                                    type="number"
                                                    value={doc.order}
                                                    onChange={(e) => handleUpdateOrder(doc.id, e.target.value)}
                                                    style={{ width: '40px', background: 'transparent', border: 'none', color: 'var(--text-primary)', textAlign: 'center', fontSize: '0.9rem' }}
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
                                                    />
                                                    <textarea
                                                        value={editDocDescription}
                                                        onChange={e => setEditDocDescription(e.target.value)}
                                                        placeholder="Description..."
                                                        style={{ width: '100%', minHeight: '60px', borderRadius: '8px' }}
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
                                            <button onClick={() => handleDeleteDocType(doc.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </div>

                <div>
                    <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UserCheck size={20} color="var(--accent-primary)" /> Define Assured Role
                        </h3>
                        <form onSubmit={handleAddRole} style={{ display: 'flex', gap: '16px' }}>
                            <input
                                type="text"
                                value={newRole}
                                onChange={e => setNewRole(e.target.value)}
                                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '8px' }}
                                placeholder="e.g. Technical Manager"
                            />
                            <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Plus size={18} /> Add Role
                            </button>
                        </form>
                    </section>

                    <section className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th style={{ padding: '16px' }}>Role</th>
                                    <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
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
                                                />
                                            ) : (
                                                <span onClick={() => startEditingRole(role)} style={{ cursor: 'pointer' }}>{role.name}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <button onClick={() => handleDeleteRole(role.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </div>
            </div>

            {/* File Type Settings Section */}
            <section className="glass-card" style={{ padding: '24px', marginTop: '32px' }}>
                <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={20} color="var(--accent-primary)" /> File Upload Security
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
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
                    {/* Allowed Extensions */}
                    <div>
                        <h4 style={{ marginBottom: '12px', fontSize: '1rem', color: 'var(--success)' }}>
                            ✓ Allowed File Types
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
                            />
                            <button type="submit" className="btn-primary" style={{ padding: '0 16px' }}>
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

                    {/* Blocked Extensions */}
                    <div>
                        <h4 style={{ marginBottom: '12px', fontSize: '1rem', color: 'var(--danger)' }}>
                            ✗ Blocked File Types
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
                            />
                            <button type="submit" className="btn-primary" style={{ padding: '0 16px', background: 'var(--danger)' }}>
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
            </section>
        </div >
    )
}
