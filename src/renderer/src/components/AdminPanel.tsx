import { useState, useEffect } from 'react'
import { Plus, Trash2, FileText, UserCheck, ChevronUp, ChevronDown } from 'lucide-react'
import { DocumentType, AssuredRole } from '../../../shared/types'

export default function AdminPanel() {
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [newName, setNewName] = useState('')
    const [required, setRequired] = useState(false)
    const [newOrder, setNewOrder] = useState(0)
    const [roles, setRoles] = useState<AssuredRole[]>([])
    const [newRole, setNewRole] = useState('')
    const [importing, setImporting] = useState(false)
    const [importStatus, setImportStatus] = useState<string>('')

    useEffect(() => {
        loadData()
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
        await window.api.addDocumentType({ name: newName, required, order: newOrder })
        setNewName('')
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

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '32px' }}>
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
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '8px' }}
                                    placeholder="e.g. Safety Management Certificate"
                                />
                            </div>
                            <div style={{ width: '80px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Order</label>
                                <input
                                    type="number"
                                    value={newOrder}
                                    onChange={e => setNewOrder(parseInt(e.target.value))}
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '8px' }}
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
                                <tr style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <th style={{ padding: '16px', width: '80px' }}>Order</th>
                                    <th style={{ padding: '16px' }}>Document Type</th>
                                    <th style={{ padding: '16px' }}>Status</th>
                                    <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {docTypes.map((doc, index) => (
                                    <tr key={doc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '16px' }}>
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
                                                    style={{ width: '40px', background: 'transparent', border: 'none', color: 'white', textAlign: 'center', fontSize: '0.9rem' }}
                                                />
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px' }}>{doc.name}</td>
                                        <td style={{ padding: '16px' }}>
                                            <span style={{
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                background: doc.required ? 'rgba(255, 77, 77, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                                color: doc.required ? 'var(--danger)' : 'var(--text-secondary)',
                                                border: doc.required ? '1px solid rgba(255, 77, 77, 0.2)' : '1px solid rgba(255, 255, 255, 0.1)'
                                            }}>{doc.required ? 'REQUIRED' : 'OPTIONAL'}</span>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
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
                                <tr style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <th style={{ padding: '16px' }}>Role</th>
                                    <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roles.map(role => (
                                    <tr key={role.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '16px' }}>{role.name}</td>
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
        </div>
    )
}
