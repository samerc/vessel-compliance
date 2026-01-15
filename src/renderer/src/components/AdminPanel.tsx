import { useState, useEffect } from 'react'
import { Plus, Trash2, FileText } from 'lucide-react'
import { DocumentType } from '../../../shared/types'

export default function AdminPanel() {
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [newName, setNewName] = useState('')
    const [required, setRequired] = useState(false)

    useEffect(() => {
        loadDocTypes()
    }, [])

    const loadDocTypes = async () => {
        const data = await window.api.getDocumentTypes()
        setDocTypes(data)
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName.trim()) return
        await window.api.addDocumentType({ name: newName, required })
        setNewName('')
        setRequired(false)
        loadDocTypes()
    }

    const handleDelete = async (id: string) => {
        if (confirm('Delete this document type? It will be removed from all vessels.')) {
            await window.api.deleteDocumentType(id)
            loadDocTypes()
        }
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Admin Panel</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Manage the global list of document types available for tracking.</p>
            </header>

            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={20} color="var(--accent-primary)" /> Define New Document Type
                </h3>
                <form onSubmit={handleAdd} style={{ display: 'flex', gap: '16px' }}>
                    <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', borderRadius: '8px' }}
                        placeholder="e.g. Safety Management Certificate"
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        <input
                            type="checkbox"
                            checked={required}
                            onChange={e => setRequired(e.target.checked)}
                            style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                        />
                        Required by default
                    </label>
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Plus size={18} /> Add Type
                    </button>
                </form>
            </section>

            <section className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '16px' }}>Document Type Name</th>
                            <th style={{ padding: '16px' }}>Default Status</th>
                            <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {docTypes.map(doc => (
                            <tr key={doc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ fontWeight: '600' }}>{doc.name}</div>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <span style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        background: doc.required ? 'rgba(255, 77, 77, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                        color: doc.required ? 'var(--danger)' : 'var(--text-secondary)',
                                        border: doc.required ? '1px solid rgba(255, 77, 77, 0.2)' : '1px solid rgba(255, 255, 255, 0.1)'
                                    }}>
                                        {doc.required ? 'REQUIRED' : 'OPTIONAL'}
                                    </span>
                                </td>
                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                    <button
                                        onClick={() => handleDelete(doc.id)}
                                        style={{ background: 'transparent', color: 'var(--danger)', padding: '6px', borderRadius: '4px' }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {docTypes.length === 0 && (
                            <tr>
                                <td colSpan={2} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    No document types defined. Add one above to start tracking.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    )
}
