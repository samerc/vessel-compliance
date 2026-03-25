import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText, Trash2, Save, ChevronUp, ChevronDown,
  Tag, X, Plus, Copy, FileDown
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import type { DocumentTemplate } from '../../../shared/types'
import { TEMPLATE_PLACEHOLDERS, TEMPLATE_CATEGORIES } from '../../../shared/types'
import RichTextEditor from './RichTextEditor'
import {
  resolveTemplatePlaceholders,
  htmlToPlainText,
  buildTemplateContext,
  generateTemplateDocx
} from '../services/DocumentTemplateExportService'

const CATEGORY_TABS = [
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'policy', label: 'Policy' },
  { id: 'quotation', label: 'Quotation' },
  { id: 'vessel', label: 'Vessel' },
  { id: 'entity', label: 'Entity' },
  { id: 'certificate', label: 'Certificate' },
  { id: 'email', label: 'Email' },
]

const CATEGORY_COLORS: Record<string, string> = {
  general: '#6b7280',
  policy: '#3b82f6',
  quotation: '#8b5cf6',
  vessel: '#0ea5e9',
  entity: '#f59e0b',
  certificate: '#10b981',
  email: '#ec4899',
}

const PLACEHOLDER_ITEMS = TEMPLATE_PLACEHOLDERS.map(p => ({
  key: p.key,
  label: p.label,
  category: p.category
}))

export default function DocumentTemplateManager(): React.JSX.Element {
  const { theme } = useTheme()
  const { hasPermission } = useAuth()
  const { showSuccess, showError } = useToast()
  const isLight = theme === 'light'
  const canManage = hasPermission('admin:settings')

  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('all')
  const [loading, setLoading] = useState(true)

  // Editor state
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCategory, setEditCategory] = useState('general')
  const [editBody, setEditBody] = useState('')
  const [dirty, setDirty] = useState(false)
  const skipDirtyRef = useRef(false)

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createCategory, setCreateCategory] = useState('general')
  const [creating, setCreating] = useState(false)

  // Generate/Copy modal
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateMode, setGenerateMode] = useState<'docx' | 'copy'>('docx')

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true)
      const cat = activeCategory === 'all' ? undefined : activeCategory
      const result = await window.api.docTemplateGetAll(cat)
      if (Array.isArray(result)) {
        setTemplates(result)
      }
    } catch {
      showError('Failed to load document templates')
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
      setEditDescription(selected.description || '')
      setEditCategory(selected.category)
      setEditBody(selected.body || '')
      setDirty(false)
      setTimeout(() => { skipDirtyRef.current = false }, 50)
    }
  }, [selectedId, selected?.id])

  // Track dirty state
  useEffect(() => {
    if (skipDirtyRef.current) return
    if (selected) {
      const changed = editName !== selected.name
        || editDescription !== (selected.description || '')
        || editCategory !== selected.category
        || editBody !== (selected.body || '')
      setDirty(changed)
    }
  }, [editName, editDescription, editCategory, editBody])

  const handleSave = async () => {
    if (!selected || !dirty) return
    try {
      await window.api.docTemplateUpdate(selected.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        category: editCategory,
        body: editBody || null
      })
      setDirty(false)
      showSuccess('Template updated')
      loadTemplates()
    } catch {
      showError('Failed to save template')
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    if (!confirm(`Delete template "${selected.name}"?`)) return
    try {
      await window.api.docTemplateDelete(selected.id)
      setSelectedId(null)
      showSuccess('Template deleted')
      loadTemplates()
    } catch {
      showError('Failed to delete template')
    }
  }

  const handleCreate = async () => {
    if (!createName.trim()) return
    try {
      setCreating(true)
      const result = await window.api.docTemplateAdd({
        name: createName.trim(),
        description: createDescription.trim() || null,
        category: createCategory,
        body: null
      })
      showSuccess('Template created')
      setShowCreate(false)
      setCreateName('')
      setCreateDescription('')
      setCreateCategory('general')
      await loadTemplates()
      if (result?.id) setSelectedId(result.id)
    } catch {
      showError('Failed to create template')
    } finally {
      setCreating(false)
    }
  }

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const idx = templates.findIndex(t => t.id === id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= templates.length) return
    const newList = [...templates]
    ;[newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]]
    setTemplates(newList)
    try {
      await window.api.docTemplateReorder(newList.map(t => t.id))
    } catch {
      loadTemplates()
    }
  }

  const filteredTemplates = activeCategory === 'all'
    ? templates
    : templates.filter(t => t.category === activeCategory)

  // Grouped placeholders for reference
  const groupedPlaceholders = TEMPLATE_PLACEHOLDERS.reduce<Record<string, typeof TEMPLATE_PLACEHOLDERS[number][]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {})

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <FileText size={28} /> Templates
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Create and manage document and email templates with placeholders
          </p>
        </div>
        {canManage && (
          <button
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={16} /> New Template
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {CATEGORY_TABS.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setActiveCategory(cat.id); setSelectedId(null) }}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: activeCategory === cat.id
                ? '1px solid var(--accent-primary)'
                : '1px solid var(--input-border)',
              background: activeCategory === cat.id
                ? 'rgba(0,210,255,0.1)'
                : 'transparent',
              color: activeCategory === cat.id
                ? 'var(--accent-primary)'
                : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: activeCategory === cat.id ? 600 : 400,
              transition: 'all 0.15s ease'
            }}
            className="hover-effect"
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Two-panel layout */}
      <div style={{ display: 'flex', gap: '20px', minHeight: '500px' }}>
        {/* Left: Template List */}
        <div style={{
          width: '340px',
          flexShrink: 0,
          borderRadius: '12px',
          border: 'var(--glass-border)',
          background: 'var(--bg-card)',
          overflow: 'hidden'
        }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <FileText size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p>No templates found</p>
              {canManage && (
                <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                  Click &quot;New Template&quot; to get started
                </p>
              )}
            </div>
          ) : (
            <div style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
              {filteredTemplates.map((t, i) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--table-border)',
                    background: selectedId === t.id
                      ? 'rgba(0,210,255,0.06)'
                      : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'background 0.15s ease'
                  }}
                  className="hover-effect"
                >
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: `${CATEGORY_COLORS[t.category] || '#6b7280'}22`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <FileText size={18} style={{ color: CATEGORY_COLORS[t.category] || '#6b7280' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: `${CATEGORY_COLORS[t.category] || '#6b7280'}22`,
                        color: CATEGORY_COLORS[t.category] || '#6b7280',
                        fontWeight: 500
                      }}>
                        {t.category}
                      </span>
                      {t.body && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          Rich text
                        </span>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReorder(t.id, 'up') }}
                        disabled={i === 0}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: i === 0 ? 'var(--text-secondary)' : 'var(--accent-primary)',
                          cursor: i === 0 ? 'default' : 'pointer',
                          padding: '2px',
                          opacity: i === 0 ? 0.3 : 1
                        }}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReorder(t.id, 'down') }}
                        disabled={i === filteredTemplates.length - 1}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: i === filteredTemplates.length - 1 ? 'var(--text-secondary)' : 'var(--accent-primary)',
                          cursor: i === filteredTemplates.length - 1 ? 'default' : 'pointer',
                          padding: '2px',
                          opacity: i === filteredTemplates.length - 1 ? 0.3 : 1
                        }}
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Detail Panel */}
        <div style={{
          flex: 1,
          borderRadius: '12px',
          border: 'var(--glass-border)',
          background: 'var(--bg-card)',
          overflow: 'hidden'
        }}>
          {!selected ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-secondary)',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <FileText size={40} style={{ opacity: 0.2 }} />
              <p>Select a template to view details</p>
            </div>
          ) : (
            <div style={{ padding: '24px', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
              {/* Template Info */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={!canManage}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '1rem',
                      fontWeight: 500
                    }}
                  />
                </div>
                <div style={{ width: '140px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                    Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    disabled={!canManage}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem'
                    }}
                  >
                    {TEMPLATE_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  disabled={!canManage}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '0.88rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Rich Text Body */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                  Template Body
                </label>
                <RichTextEditor
                  value={editBody}
                  onChange={setEditBody}
                  placeholder="Write your template content here... Use Insert Field to add placeholders."
                  minHeight={250}
                  showFontSize
                  showFontFamily
                  showAlignment
                  showLineSpacing
                  showPlaceholders
                  placeholderItems={PLACEHOLDER_ITEMS}
                />
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {canManage && dirty && (
                  <button
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                    onClick={handleSave}
                  >
                    <Save size={14} /> Save Changes
                  </button>
                )}
                <button
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                  onClick={() => { setGenerateMode('docx'); setShowGenerate(true) }}
                  disabled={!editBody}
                >
                  <FileDown size={14} /> Generate DOCX
                </button>
                <button
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                  onClick={() => { setGenerateMode('copy'); setShowGenerate(true) }}
                  disabled={!editBody}
                >
                  <Copy size={14} /> Copy Text
                </button>
                {canManage && (
                  <button
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--danger)' }}
                    onClick={handleDelete}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>

              {/* Available Placeholders Reference */}
              <div>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tag size={14} /> Available Placeholders Reference
                </h3>
                {Object.entries(groupedPlaceholders).map(([category, items]) => (
                  <div key={category} style={{ marginBottom: '12px' }}>
                    <div style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-secondary)',
                      marginBottom: '6px'
                    }}>
                      {category}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {items.map(item => (
                        <span
                          key={item.key}
                          title={item.label}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontFamily: 'monospace',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--input-border)',
                            color: 'var(--text-primary)',
                            cursor: 'default'
                          }}
                        >
                          {item.key}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: isLight ? '#ffffff' : '#1a1d28',
            borderRadius: '12px',
            padding: '24px',
            width: '460px',
            maxWidth: '90vw',
            border: 'var(--glass-border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={20} /> New Template
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                Name
              </label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Template name"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                Description (optional)
              </label>
              <textarea
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                Category
              </label>
              <select
                value={createCategory}
                onChange={(e) => setCreateCategory(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem'
                }}
              >
                {TEMPLATE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={creating || !createName.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {creating ? 'Creating...' : <><Plus size={14} /> Create</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate / Copy Modal */}
      {showGenerate && selected && (
        <GenerateModal
          isLight={isLight}
          mode={generateMode}
          templateName={selected.name}
          bodyHtml={editBody}
          onClose={() => setShowGenerate(false)}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}
    </div>
  )
}

// Separate generate/copy modal component
function GenerateModal({ isLight, mode, templateName, bodyHtml, onClose, showSuccess, showError }: {
  isLight: boolean
  mode: 'docx' | 'copy'
  templateName: string
  bodyHtml: string
  onClose: () => void
  showSuccess: (msg: string) => void
  showError: (msg: string) => void
}) {
  const [vessels, setVessels] = useState<{ id: string; name: string }[]>([])
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([])
  const [selectedVesselId, setSelectedVesselId] = useState('')
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [policies, setPolicies] = useState<{ id: string; label: string }[]>([])
  const [selectedPolicyId, setSelectedPolicyId] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    window.api.getVessels().then(v => {
      if (Array.isArray(v)) setVessels(v.map((x: any) => ({ id: x.id, name: x.name })))
    }).catch(() => {})
    window.api.getEntities().then(e => {
      if (Array.isArray(e)) setEntities(e.map((x: any) => ({ id: x.id, name: x.name })))
    }).catch(() => {})
  }, [])

  // Load policies when vessel changes
  useEffect(() => {
    if (!selectedVesselId) { setPolicies([]); setSelectedPolicyId(''); return }
    window.api.getVesselDynamicPolicies(selectedVesselId).then(p => {
      if (Array.isArray(p)) {
        setPolicies(p.map((x: any) => ({
          id: x.id,
          label: `${x.policyTypeName || 'Policy'} - ${x.policyNumber || 'No number'}`
        })))
      }
    }).catch(() => {})
  }, [selectedVesselId])

  const handleAction = async () => {
    try {
      setProcessing(true)
      const ctx = await buildTemplateContext({
        vesselId: selectedVesselId || undefined,
        policyId: selectedPolicyId || undefined,
        entityId: selectedEntityId || undefined
      })
      const resolvedHtml = resolveTemplatePlaceholders(bodyHtml, ctx)

      if (mode === 'docx') {
        const fileName = `${templateName.replace(/[^a-zA-Z0-9 _-]/g, '')}_generated.docx`
        await generateTemplateDocx(resolvedHtml, fileName)
        showSuccess('Document generated and downloaded')
      } else {
        const plainText = htmlToPlainText(resolvedHtml)
        await navigator.clipboard.writeText(plainText)
        showSuccess('Text copied to clipboard')
      }
      onClose()
    } catch {
      showError(mode === 'docx' ? 'Failed to generate document' : 'Failed to copy text')
    } finally {
      setProcessing(false)
    }
  }

  const selectStyle = {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '0.88rem'
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: isLight ? '#ffffff' : '#1a1d28',
        borderRadius: '12px',
        padding: '24px',
        width: '480px',
        maxWidth: '90vw',
        border: 'var(--glass-border)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {mode === 'docx'
              ? <><FileDown size={20} /> Generate DOCX</>
              : <><Copy size={20} /> Copy Text</>
            }
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          background: 'var(--input-bg)',
          marginBottom: '16px',
          fontSize: '0.88rem'
        }}>
          <strong>{templateName}</strong>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Select context data to fill template placeholders. Leave empty for blank values.
        </p>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
            Vessel
          </label>
          <select value={selectedVesselId} onChange={(e) => setSelectedVesselId(e.target.value)} style={selectStyle}>
            <option value="">-- None --</option>
            {vessels.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>

        {policies.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
              Policy
            </label>
            <select value={selectedPolicyId} onChange={(e) => setSelectedPolicyId(e.target.value)} style={selectStyle}>
              <option value="">-- None --</option>
              {policies.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
            Entity
          </label>
          <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)} style={selectStyle}>
            <option value="">-- None --</option>
            {entities.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={processing}
            onClick={handleAction}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {processing
              ? (mode === 'docx' ? 'Generating...' : 'Copying...')
              : mode === 'docx'
                ? <><FileDown size={14} /> Generate</>
                : <><Copy size={14} /> Copy</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
