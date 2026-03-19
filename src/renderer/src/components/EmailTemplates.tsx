import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Mail, Plus, Trash2, Save, Copy, ChevronUp, ChevronDown, Lock, Tag } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import RichTextEditor from './RichTextEditor'
import type { EmailTemplate } from '../../../shared/types'

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'renewals', label: 'Renewals' },
  { id: 'warranties', label: 'Warranties' },
  { id: 'documents', label: 'Documents' },
  { id: 'compliance', label: 'Compliance' }
]

const PLACEHOLDERS = [
  '{vesselName}', '{imoNumber}', '{vesselType}', '{flagState}',
  '{customerName}', '{customerEmail}',
  '{policyType}', '{policyNumber}', '{policyEndDate}',
  '{documentName}', '{documentExpiry}',
  '{warrantyDescription}', '{warrantyDeadline}',
  '{userName}', '{companyName}', '{today}'
]

const CATEGORY_COLORS: Record<string, string> = {
  general: '#6b7280',
  renewals: '#f59e0b',
  warranties: '#8b5cf6',
  documents: '#3b82f6',
  compliance: '#10b981'
}

export default function EmailTemplates(): React.JSX.Element {
  const { theme } = useTheme()
  const { hasPermission } = useAuth()
  const { showSuccess, showError } = useToast()
  const isLight = theme === 'light'
  const canManage = hasPermission('admin:settings')

  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('all')
  const [loading, setLoading] = useState(true)

  // Editor state
  const [editName, setEditName] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editCategory, setEditCategory] = useState('general')
  const [dirty, setDirty] = useState(false)
  const skipDirtyRef = useRef(false)
  // bodyRef removed — now using RichTextEditor

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true)
      const cat = activeCategory === 'all' ? undefined : activeCategory
      const result = await window.api.emailGetTemplates(cat)
      if (Array.isArray(result)) {
        setTemplates(result)
      }
    } catch {
      showError('Failed to load email templates')
    } finally {
      setLoading(false)
    }
  }, [activeCategory])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  const selected = templates.find(t => t.id === selectedId) || null

  // Sync editor fields when selection changes
  useEffect(() => {
    if (selected) {
      skipDirtyRef.current = true
      setEditName(selected.name)
      setEditSubject(selected.subject || '')
      setEditBody(selected.body)
      setEditCategory(selected.category)
      setDirty(false)
    }
  }, [selectedId])

  const handleSelect = (id: string) => {
    if (dirty && selectedId) {
      if (!confirm('You have unsaved changes. Discard them?')) return
    }
    setSelectedId(id)
  }

  const handleAdd = async () => {
    if (!canManage) return
    try {
      const newTemplate = await window.api.emailAddTemplate({
        name: 'New Template',
        subject: '',
        body: '',
        category: activeCategory === 'all' ? 'general' : activeCategory
      })
      if (newTemplate && !(newTemplate as any).error) {
        await loadTemplates()
        setSelectedId(newTemplate.id)
        showSuccess('Template created')
      }
    } catch {
      showError('Failed to create template')
    }
  }

  const handleSave = async () => {
    if (!canManage || !selectedId) return
    try {
      await window.api.emailUpdateTemplate(selectedId, {
        name: editName,
        subject: editSubject || null,
        body: editBody,
        category: editCategory
      })
      setDirty(false)
      await loadTemplates()
      showSuccess('Template saved')
    } catch {
      showError('Failed to save template')
    }
  }

  const handleDelete = async () => {
    if (!canManage || !selectedId || selected?.isSystem) return
    if (!confirm(`Delete "${selected?.name}"?`)) return
    try {
      await window.api.emailDeleteTemplate(selectedId)
      setSelectedId(null)
      await loadTemplates()
      showSuccess('Template deleted')
    } catch (err: any) {
      showError(err?.message || 'Failed to delete template')
    }
  }

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const idx = templates.findIndex(t => t.id === id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= templates.length) return
    const newOrder = templates.map(t => t.id)
    ;[newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]]
    try {
      await window.api.emailReorderTemplates(newOrder)
      await loadTemplates()
    } catch {
      showError('Failed to reorder')
    }
  }

  const insertPlaceholder = (placeholder: string) => {
    // Insert into RichTextEditor via execCommand on the contenteditable
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      // Check if selection is inside our editor
      const editorEl = document.querySelector('[contenteditable="true"]')
      if (editorEl && editorEl.contains(range.commonAncestorContainer)) {
        range.deleteContents()
        range.insertNode(document.createTextNode(placeholder))
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
        // Trigger change by dispatching input event
        editorEl.dispatchEvent(new Event('input', { bubbles: true }))
        setDirty(true)
        return
      }
    }
    // Fallback: append to end
    setEditBody(editBody + placeholder)
    setDirty(true)
  }

  const handleCopyToClipboard = () => {
    if (!selected) return
    const tmp = document.createElement('div')
    tmp.innerHTML = editBody
    const plainBody = tmp.textContent || tmp.innerText || ''
    const text = `Subject: ${editSubject || '(no subject)'}\n\n${plainBody}`
    navigator.clipboard.writeText(text)
    showSuccess('Template copied to clipboard')
  }

  const markDirty = () => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return }
    if (!dirty) setDirty(true)
  }

  const filteredTemplates = templates

  const categoryBadge = (cat: string) => {
    const color = CATEGORY_COLORS[cat] || '#6b7280'
    return (
      <span style={{
        display: 'inline-block',
        fontSize: '0.65rem',
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: '4px',
        background: `${color}22`,
        color: color,
        border: `1px solid ${color}44`,
        textTransform: 'uppercase',
        letterSpacing: '0.3px'
      }}>
        {cat}
      </span>
    )
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Mail size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Email Templates</h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Manage reusable email templates with placeholder substitution
            </p>
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setActiveCategory(cat.id); setSelectedId(null) }}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: activeCategory === cat.id ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)',
              background: activeCategory === cat.id ? 'rgba(0,210,255,0.1)' : 'transparent',
              color: activeCategory === cat.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: activeCategory === cat.id ? 600 : 400,
              transition: 'all 0.15s ease'
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Main layout: list + editor */}
      <div style={{ display: 'flex', gap: '16px', minHeight: '500px' }}>
        {/* Template list panel */}
        <div style={{
          width: '300px',
          flexShrink: 0,
          background: isLight ? '#f4f6fb' : '#14172a',
          border: '1px solid var(--glass-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* List header */}
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Templates ({filteredTemplates.length})
            </span>
            {canManage && (
              <button
                onClick={handleAdd}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', borderRadius: '6px',
                  border: '1px solid var(--accent-primary)',
                  background: 'rgba(0,210,255,0.1)',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600
                }}
              >
                <Plus size={13} /> Add
              </button>
            )}
          </div>

          {/* Template items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                Loading...
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                No templates found
              </div>
            ) : (
              filteredTemplates.map((t, idx) => (
                <div
                  key={t.id}
                  onClick={() => handleSelect(t.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginBottom: '2px',
                    background: selectedId === t.id ? 'rgba(0,210,255,0.08)' : 'transparent',
                    border: selectedId === t.id ? '1px solid rgba(0,210,255,0.2)' : '1px solid transparent',
                    transition: 'all 0.12s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.82rem',
                      fontWeight: selectedId === t.id ? 600 : 500,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      {t.isSystem && <Lock size={11} style={{ opacity: 0.5, flexShrink: 0 }} />}
                      {t.name}
                    </div>
                    <div style={{ marginTop: '3px' }}>
                      {categoryBadge(t.category)}
                    </div>
                  </div>
                  {canManage && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReorder(t.id, 'up') }}
                        disabled={idx === 0}
                        style={{
                          background: 'transparent', border: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                          color: 'var(--text-secondary)', padding: '1px', opacity: idx === 0 ? 0.2 : 0.6
                        }}
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReorder(t.id, 'down') }}
                        disabled={idx === filteredTemplates.length - 1}
                        style={{
                          background: 'transparent', border: 'none',
                          cursor: idx === filteredTemplates.length - 1 ? 'default' : 'pointer',
                          color: 'var(--text-secondary)', padding: '1px',
                          opacity: idx === filteredTemplates.length - 1 ? 0.2 : 0.6
                        }}
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Editor panel */}
        <div style={{
          flex: 1,
          background: isLight ? '#f4f6fb' : '#14172a',
          border: '1px solid var(--glass-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {!selected ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)', fontSize: '0.9rem'
            }}>
              <div style={{ textAlign: 'center' }}>
                <Mail size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
                <div>Select a template to edit</div>
                <div style={{ fontSize: '0.78rem', marginTop: '4px', opacity: 0.6 }}>
                  Or create a new one with the Add button
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Editor header */}
              <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--glass-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                    {selected.isSystem ? 'System Template' : 'Edit Template'}
                  </span>
                  {selected.isSystem && (
                    <span style={{
                      fontSize: '0.65rem', padding: '2px 7px', borderRadius: '4px',
                      background: 'rgba(0,210,255,0.1)', color: 'var(--accent-primary)',
                      border: '1px solid rgba(0,210,255,0.2)', fontWeight: 600
                    }}>
                      SYSTEM
                    </span>
                  )}
                  {dirty && (
                    <span style={{
                      fontSize: '0.65rem', padding: '2px 7px', borderRadius: '4px',
                      background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                      border: '1px solid rgba(245,158,11,0.2)', fontWeight: 600
                    }}>
                      UNSAVED
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={handleCopyToClipboard}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '5px 12px', borderRadius: '6px',
                      border: '1px solid var(--input-border)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: '0.75rem'
                    }}
                    title="Copy to clipboard"
                  >
                    <Copy size={13} /> Copy
                  </button>
                  {canManage && (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={!dirty}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '5px 12px', borderRadius: '6px',
                          border: '1px solid var(--accent-primary)',
                          background: dirty ? 'var(--accent-primary)' : 'transparent',
                          color: dirty ? '#fff' : 'var(--text-secondary)',
                          cursor: dirty ? 'pointer' : 'default', fontSize: '0.75rem',
                          fontWeight: 600, opacity: dirty ? 1 : 0.4
                        }}
                      >
                        <Save size={13} /> Save
                      </button>
                      {!selected.isSystem && (
                        <button
                          onClick={handleDelete}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '5px 12px', borderRadius: '6px',
                            border: '1px solid var(--danger)',
                            background: 'transparent',
                            color: 'var(--danger)',
                            cursor: 'pointer', fontSize: '0.75rem'
                          }}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Editor form */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
                {/* Name */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); markDirty() }}
                    disabled={!canManage}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '6px',
                      border: '1px solid var(--input-border)',
                      background: isLight ? '#fff' : 'rgba(255,255,255,0.05)',
                      color: 'var(--text-primary)', fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Category */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => { setEditCategory(e.target.value); markDirty() }}
                    disabled={!canManage}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '6px',
                      border: '1px solid var(--input-border)',
                      background: isLight ? '#fff' : 'rgba(255,255,255,0.05)',
                      color: 'var(--text-primary)', fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  >
                    {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Subject */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => { setEditSubject(e.target.value); markDirty() }}
                    disabled={!canManage}
                    placeholder="e.g. Renewal Reminder - {vesselName}"
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '6px',
                      border: '1px solid var(--input-border)',
                      background: isLight ? '#fff' : 'rgba(255,255,255,0.05)',
                      color: 'var(--text-primary)', fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Body */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Body
                  </label>
                  <RichTextEditor
                    value={editBody}
                    onChange={(html) => { setEditBody(html); markDirty() }}
                    placeholder="Write your email template body here..."
                    minHeight={250}
                    showFontSize
                    showFontFamily
                    showAlignment
                    showLineSpacing
                  />
                </div>

                {/* Placeholders */}
                <div>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)',
                    marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px'
                  }}>
                    <Tag size={12} /> Available Placeholders
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {PLACEHOLDERS.map(p => (
                      <button
                        key={p}
                        onClick={() => insertPlaceholder(p)}
                        disabled={!canManage}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '5px',
                          border: '1px solid var(--input-border)',
                          background: isLight ? '#fff' : 'rgba(255,255,255,0.04)',
                          color: 'var(--accent-primary)',
                          cursor: canManage ? 'pointer' : 'default',
                          fontSize: '0.73rem',
                          fontFamily: 'monospace',
                          fontWeight: 500,
                          transition: 'all 0.12s ease'
                        }}
                        title={`Insert ${p} at cursor position`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '6px', opacity: 0.7 }}>
                    Click a placeholder to insert it at the cursor position in the body
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
