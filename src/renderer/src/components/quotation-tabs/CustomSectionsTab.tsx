import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, Save } from 'lucide-react'
import { Quotation, QuotationCustomSection } from '../../../../shared/types'
import RichTextEditor from '../RichTextEditor'

export default function CustomSectionsTab({ quotation, showSuccess, showError, isLight }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
    const [sections, setSections] = useState<QuotationCustomSection[]>([])
    const [newTitle, setNewTitle] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editText, setEditText] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const result = await window.api.getQuotationCustomSections(quotation.id)
        setSections(Array.isArray(result) ? result : [])
    }

    const handleAdd = async () => {
        if (!newTitle.trim()) return
        try {
            const result = await window.api.addQuotationCustomSection({
                quotationId: quotation.id,
                title: newTitle.trim(),
                text: '',
                order: sections.length
            })
            if ((result as any).error) { showError((result as any).message); return }
            setNewTitle('')
            showSuccess('Section added')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add section') }
    }

    const handleDelete = async (id: string) => {
        try {
            await window.api.deleteQuotationCustomSection(id)
            showSuccess('Section deleted')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to delete') }
    }

    const handleSaveEdit = async () => {
        if (!editingId || !editTitle.trim()) return
        try {
            await window.api.updateQuotationCustomSection(editingId, { title: editTitle.trim(), text: editText })
            showSuccess('Section updated')
            setEditingId(null)
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to update') }
    }

    const handleMove = async (index: number, dir: 'up' | 'down') => {
        const newSections = [...sections]
        const swapIdx = dir === 'up' ? index - 1 : index + 1
        if (swapIdx < 0 || swapIdx >= newSections.length) return
        ;[newSections[index], newSections[swapIdx]] = [newSections[swapIdx], newSections[index]]
        setSections(newSections)
        try {
            await window.api.reorderQuotationCustomSections(newSections.map(s => s.id))
        } catch (err: any) { showError(err.message || 'Failed to reorder') }
    }

    const startEdit = (section: QuotationCustomSection) => {
        setEditingId(section.id)
        setEditTitle(section.title)
        setEditText(section.text || '')
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Custom Sections</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Add custom sections that will appear in the exported quotation document.
            </p>

            {/* Add form */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Section title..."
                    style={{ flex: 1 }}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                />
                <button onClick={handleAdd} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={16} /> Add Section
                </button>
            </div>

            {sections.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No custom sections yet. Add one above.
                </div>
            )}

            {sections.map((section, i) => (
                <div key={section.id} style={{
                    padding: '16px', borderRadius: '8px', border: '1px solid var(--table-border)',
                    marginBottom: '12px', background: editingId === section.id ? (isLight ? '#f0f4ff' : 'rgba(0,150,255,0.05)') : 'transparent'
                }}>
                    {editingId === section.id ? (
                        <>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={e => setEditTitle(e.target.value)}
                                    style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem' }}
                                />
                                <button onClick={handleSaveEdit} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', padding: '6px 12px' }}>
                                    <Save size={14} /> Save
                                </button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                                    Cancel
                                </button>
                            </div>
                            <RichTextEditor value={editText} onChange={setEditText} placeholder="Section content..." showFontSize showAlignment showLineSpacing />
                        </>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={16} /></button>
                                <button onClick={() => handleMove(i, 'down')} disabled={i === sections.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === sections.length - 1 ? 0.3 : 1 }}><ChevronDown size={16} /></button>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '4px' }}>{section.title}</div>
                                {section.text ? (
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                        dangerouslySetInnerHTML={{ __html: section.text.substring(0, 200) }}
                                    />
                                ) : (
                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No content</span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={() => startEdit(section)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '4px' }}><Pencil size={15} /></button>
                                <button onClick={() => handleDelete(section.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}><Trash2 size={15} /></button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

