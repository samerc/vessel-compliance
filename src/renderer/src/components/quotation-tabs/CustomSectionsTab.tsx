import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, Save } from 'lucide-react'
import { Quotation, QuotationCustomSection } from '../../../../shared/types'
import { confirmDelete } from './sharedUtils'
import RichTextEditor from '../RichTextEditor'
import { sanitizeHtml } from '../../utils/sanitize'
import { isIpcError } from '../../utils/ipc'
import { useDragSort, DragHandle, moveInArray } from '../ui'

export default function CustomSectionsTab({
  quotation,
  showSuccess,
  showError
}: {
  quotation: Quotation
  showSuccess: (m: string) => void
  showError: (m: string) => void
  isLight: boolean
}): React.JSX.Element {
  const [sections, setSections] = useState<QuotationCustomSection[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editText, setEditText] = useState('')

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      const result = await window.api.getQuotationCustomSections(quotation.id)
      setSections(Array.isArray(result) ? result : [])
    }
    loadData()
  }, [quotation.id, reloadKey])
  const reload = (): void => setReloadKey((k) => k + 1)

  const handleAdd = async (): Promise<void> => {
    if (!newTitle.trim()) return
    try {
      const result = await window.api.addQuotationCustomSection({
        quotationId: quotation.id,
        title: newTitle.trim(),
        text: '',
        order: sections.length
      })
      if (isIpcError(result)) {
        showError(result.message as string)
        return
      }
      setNewTitle('')
      showSuccess('Section added')
      reload()
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to add section')
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    const s = sections.find((x) => x.id === id)
    if (!(await confirmDelete('section', s ? `${s.title}${s.text ? ': ' + s.text : ''}` : '')))
      return
    try {
      await window.api.deleteQuotationCustomSection(id)
      showSuccess('Section deleted')
      reload()
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to delete')
    }
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!editingId || !editTitle.trim()) return
    try {
      await window.api.updateQuotationCustomSection(editingId, {
        title: editTitle.trim(),
        text: editText
      })
      showSuccess('Section updated')
      setEditingId(null)
      reload()
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to update')
    }
  }

  const handleMove = async (from: number, to: number): Promise<void> => {
    const newSections = moveInArray(sections, from, to)
    setSections(newSections)
    try {
      await window.api.reorderQuotationCustomSections(newSections.map((s) => s.id))
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to reorder')
    }
  }

  // Drag a section by its handle (or Up / Down on it)
  const sort = useDragSort(sections.length, (from, to) => void handleMove(from, to), {
    disabled: (i) => sections[i]?.id === editingId
  })

  const startEdit = (section: QuotationCustomSection): void => {
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
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Section title..."
          style={{ flex: 1 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
        />
        <button
          onClick={handleAdd}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} /> Add Section
        </button>
      </div>

      {sections.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem'
          }}
        >
          No custom sections yet. Add one above.
        </div>
      )}

      {sections.map((section, i) => (
        <div
          key={section.id}
          {...sort.rowProps(i)}
          style={{
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid var(--table-border)',
            marginBottom: '12px',
            background:
              editingId === section.id ? 'rgba(var(--accent-primary-rgb), 0.05)' : 'transparent'
          }}
        >
          {editingId === section.id ? (
            <>
              <div
                style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}
              >
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem' }}
                />
                <button
                  onClick={handleSaveEdit}
                  className="btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.8rem',
                    padding: '6px 12px'
                  }}
                >
                  <Save size={14} /> Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  Cancel
                </button>
              </div>
              <RichTextEditor
                value={editText}
                onChange={setEditText}
                placeholder="Section content..."
                showFontSize
                showAlignment
                showLineSpacing
              />
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ paddingTop: '3px' }}>
                <DragHandle {...sort.handleProps(i, `Move section ${section.title}`)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '4px' }}>
                  {section.title}
                </div>
                {section.text ? (
                  <div
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--text-secondary)',
                      maxHeight: '60px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(section.text.substring(0, 200))
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--text-secondary)',
                      fontStyle: 'italic'
                    }}
                  >
                    No content
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  title="Edit"
                  aria-label="Edit"
                  onClick={() => startEdit(section)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--accent-primary)',
                    padding: '4px'
                  }}
                >
                  <Pencil size={15} />
                </button>
                <button
                  title="Delete"
                  aria-label="Delete"
                  onClick={() => handleDelete(section.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--danger)',
                    padding: '4px'
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
