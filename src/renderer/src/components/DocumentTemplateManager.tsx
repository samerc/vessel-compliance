import React, { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Trash2,
  Save,
  ChevronUp,
  ChevronDown,
  Tag,
  Plus,
  Copy,
  FileDown,
  Mail
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import type { DocumentTemplate } from '../../../shared/types'
import { TEMPLATE_PLACEHOLDERS, TEMPLATE_CATEGORIES } from '../../../shared/types'
import RichTextEditor from './RichTextEditor'
import { confirmDialog } from './DialogHost'
import { PageHeader, Modal, Field, EmptyState } from './ui'

const CATEGORY_TABS = [
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'policy', label: 'Policy' },
  { id: 'quotation', label: 'Quotation' },
  { id: 'vessel', label: 'Vessel' },
  { id: 'entity', label: 'Entity' },
  { id: 'certificate', label: 'Certificate' },
  { id: 'email', label: 'Email' }
]

const CATEGORY_COLORS: Record<string, string> = {
  general: '#6b7280',
  policy: '#3b82f6',
  quotation: '#8b5cf6',
  vessel: '#0ea5e9',
  entity: '#f59e0b',
  certificate: '#10b981',
  email: '#ec4899'
}

const PLACEHOLDER_ITEMS = TEMPLATE_PLACEHOLDERS.map((p) => ({
  key: p.key,
  label: p.label,
  category: p.category
}))

export default function DocumentTemplateManager(): React.JSX.Element {
  const { hasPermission } = useAuth()
  const { showSuccess, showError } = useToast()
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
  // True for a short moment after the editor fields are synced from a template, so the
  // rich text editor's own content normalisation does not count as an edit
  const [suppressDirty, setSuppressDirty] = useState(false)
  // Template id the editor fields were last synced for
  const [syncedId, setSyncedId] = useState<string | null>(null)

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createCategory, setCreateCategory] = useState('general')
  const [creating, setCreating] = useState(false)

  // Generate/Copy modal
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateMode, setGenerateMode] = useState<'docx' | 'copy'>('docx')

  // Used by handlers that need to await the reload (create); the effect below does the initial load
  const loadTemplates = useCallback(async (): Promise<void> => {
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
  }, [activeCategory, showError])

  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      setLoading(true)
      try {
        const cat = activeCategory === 'all' ? undefined : activeCategory
        const result = await window.api.docTemplateGetAll(cat)
        if (alive && Array.isArray(result)) {
          setTemplates(result)
        }
      } catch {
        if (alive) showError('Failed to load document templates')
      } finally {
        if (alive) setLoading(false)
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [activeCategory, showError])

  const selected = templates.find((t) => t.id === selectedId) || null

  // Sync editor fields when the selected template changes (adjust state during render)
  const currentSelectedId = selected?.id ?? null
  if (currentSelectedId !== syncedId) {
    setSyncedId(currentSelectedId)
    if (selected) {
      setEditName(selected.name)
      setEditDescription(selected.description || '')
      setEditCategory(selected.category)
      setEditBody(selected.body || '')
      setDirty(false)
      setSuppressDirty(true)
    }
  }

  // End the post-sync window after 50ms
  useEffect(() => {
    if (!suppressDirty) return
    const t = setTimeout(() => setSuppressDirty(false), 50)
    return () => clearTimeout(t)
  }, [suppressDirty, syncedId])

  // Track dirty state on every edit (compared against the stored template)
  const trackDirty = (next: {
    name?: string
    description?: string
    category?: string
    body?: string
  }): void => {
    if (suppressDirty || !selected) return
    const name = next.name ?? editName
    const description = next.description ?? editDescription
    const category = next.category ?? editCategory
    const body = next.body ?? editBody
    setDirty(
      name !== selected.name ||
        description !== (selected.description || '') ||
        category !== selected.category ||
        body !== (selected.body || '')
    )
  }

  const handleSave = async (): Promise<void> => {
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

  const handleDelete = async (): Promise<void> => {
    if (!selected) return
    if (!(await confirmDialog(`Delete template "${selected.name}"?`))) return
    try {
      await window.api.docTemplateDelete(selected.id)
      setSelectedId(null)
      showSuccess('Template deleted')
      loadTemplates()
    } catch {
      showError('Failed to delete template')
    }
  }

  const handleCreate = async (): Promise<void> => {
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

  const handleReorder = async (id: string, direction: 'up' | 'down'): Promise<void> => {
    const idx = templates.findIndex((t) => t.id === id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= templates.length) return
    const newList = [...templates]
    ;[newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]]
    setTemplates(newList)
    try {
      await window.api.docTemplateReorder(newList.map((t) => t.id))
    } catch {
      loadTemplates()
    }
  }

  const filteredTemplates =
    activeCategory === 'all' ? templates : templates.filter((t) => t.category === activeCategory)

  // Grouped placeholders for reference
  const groupedPlaceholders = TEMPLATE_PLACEHOLDERS.reduce<
    Record<string, (typeof TEMPLATE_PLACEHOLDERS)[number][]>
  >((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {})

  return (
    <div className="page">
      <PageHeader
        icon={<Mail size={26} />}
        title="Templates"
        subtitle="Create and manage document and email templates with placeholders"
        actions={
          canManage && (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New Template
            </button>
          )
        }
      />

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {CATEGORY_TABS.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setActiveCategory(cat.id)
              setSelectedId(null)
            }}
            className={activeCategory === cat.id ? 'chip active' : 'chip'}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Two-panel layout */}
      <div style={{ display: 'flex', gap: '20px', minHeight: '500px' }}>
        {/* Left: Template List */}
        <div
          style={{
            width: '340px',
            flexShrink: 0,
            borderRadius: '12px',
            border: 'var(--glass-border)',
            background: 'var(--bg-card)',
            overflow: 'hidden'
          }}
        >
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <EmptyState
              compact
              icon={<FileText size={32} />}
              title="No templates found"
              text={canManage ? 'Click "New Template" to get started' : undefined}
            />
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
                    background: selectedId === t.id ? 'var(--row-selected)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'background 0.15s ease'
                  }}
                  className="hover-effect"
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: `${CATEGORY_COLORS[t.category] || '#6b7280'}22`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <FileText
                      size={18}
                      style={{ color: CATEGORY_COLORS[t.category] || '#6b7280' }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: '0.88rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {t.name}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '6px',
                        alignItems: 'center',
                        marginTop: '2px'
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: `${CATEGORY_COLORS[t.category] || '#6b7280'}22`,
                          color: CATEGORY_COLORS[t.category] || '#6b7280',
                          fontWeight: 500
                        }}
                      >
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
                        title="Move up"
                        aria-label="Move up"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleReorder(t.id, 'up')
                        }}
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
                        title="Move down"
                        aria-label="Move down"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleReorder(t.id, 'down')
                        }}
                        disabled={i === filteredTemplates.length - 1}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color:
                            i === filteredTemplates.length - 1
                              ? 'var(--text-secondary)'
                              : 'var(--accent-primary)',
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
        <div
          style={{
            flex: 1,
            borderRadius: '12px',
            border: 'var(--glass-border)',
            background: 'var(--bg-card)',
            overflow: 'hidden'
          }}
        >
          {!selected ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%'
              }}
            >
              <EmptyState icon={<FileText size={40} />} title="Select a template to view details" />
            </div>
          ) : (
            <div style={{ padding: '24px', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
              {/* Template Info */}
              <div
                className="form-grid"
                style={{ gridTemplateColumns: 'minmax(0, 1fr) 140px', marginBottom: '16px' }}
              >
                <Field label="Template name">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value)
                      trackDirty({ name: e.target.value })
                    }}
                    disabled={!canManage}
                    style={{ fontSize: '1rem', fontWeight: 500 }}
                  />
                </Field>
                <Field label="Category">
                  <select
                    value={editCategory}
                    onChange={(e) => {
                      setEditCategory(e.target.value)
                      trackDirty({ category: e.target.value })
                    }}
                    disabled={!canManage}
                  >
                    {TEMPLATE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Description" span="all">
                  <textarea
                    value={editDescription}
                    onChange={(e) => {
                      setEditDescription(e.target.value)
                      trackDirty({ description: e.target.value })
                    }}
                    disabled={!canManage}
                    rows={2}
                    style={{ resize: 'vertical' }}
                  />
                </Field>
                {/* Rich Text Body */}
                <Field label="Template body" span="all">
                  <RichTextEditor
                    value={editBody}
                    onChange={(html) => {
                      setEditBody(html)
                      trackDirty({ body: html })
                    }}
                    placeholder="Write your template content here... Use Insert Field to add placeholders."
                    minHeight={250}
                    showFontSize
                    showFontFamily
                    showAlignment
                    showLineSpacing
                    showPlaceholders
                    placeholderItems={PLACEHOLDER_ITEMS}
                  />
                </Field>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {canManage && dirty && (
                  <button className="btn-primary btn-sm" onClick={handleSave}>
                    <Save size={14} /> Save Changes
                  </button>
                )}
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setGenerateMode('docx')
                    setShowGenerate(true)
                  }}
                  disabled={!editBody}
                >
                  <FileDown size={14} /> Generate DOCX
                </button>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setGenerateMode('copy')
                    setShowGenerate(true)
                  }}
                  disabled={!editBody}
                >
                  <Copy size={14} /> Copy Text
                </button>
                {canManage && (
                  <button
                    className="btn-secondary btn-sm"
                    style={{ color: 'var(--danger)' }}
                    onClick={handleDelete}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>

              {/* Available Placeholders Reference */}
              <div>
                <h3
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Tag size={14} /> Available Placeholders Reference
                </h3>
                {Object.entries(groupedPlaceholders).map(([category, items]) => (
                  <div key={category} style={{ marginBottom: '12px' }}>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-secondary)',
                        marginBottom: '6px'
                      }}
                    >
                      {category}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {items.map((item) => (
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
        <Modal
          title="New Template"
          icon={<Plus size={18} />}
          onClose={() => setShowCreate(false)}
          width={460}
          closeOnOverlay={false}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={creating || !createName.trim()}
              >
                {creating ? (
                  'Creating...'
                ) : (
                  <>
                    <Plus size={14} /> Create
                  </>
                )}
              </button>
            </>
          }
        >
          <div className="form-grid cols-2">
            <Field label="Name" span="all">
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Template name"
              />
            </Field>
            <Field label="Description (optional)" span="all">
              <textarea
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                rows={2}
                style={{ resize: 'vertical' }}
              />
            </Field>
            <Field label="Category">
              <select value={createCategory} onChange={(e) => setCreateCategory(e.target.value)}>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {/* Generate / Copy Modal */}
      {showGenerate && selected && (
        <GenerateModal
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
function GenerateModal({
  mode,
  templateName,
  bodyHtml,
  onClose,
  showSuccess,
  showError
}: {
  mode: 'docx' | 'copy'
  templateName: string
  bodyHtml: string
  onClose: () => void
  showSuccess: (msg: string) => void
  showError: (msg: string) => void
}): React.JSX.Element {
  const [vessels, setVessels] = useState<{ id: string; name: string }[]>([])
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([])
  const [selectedVesselId, setSelectedVesselId] = useState('')
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [policies, setPolicies] = useState<{ id: string; label: string }[]>([])
  const [selectedPolicyId, setSelectedPolicyId] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    window.api
      .getVessels()
      .then((v) => {
        if (Array.isArray(v)) setVessels(v.map((x) => ({ id: x.id, name: x.name })))
      })
      .catch(() => {})
    window.api
      .getEntities()
      .then((e) => {
        if (Array.isArray(e)) setEntities(e.map((x) => ({ id: x.id, name: x.name })))
      })
      .catch(() => {})
  }, [])

  // Load policies when vessel changes
  useEffect(() => {
    // Clearing the vessel resets the policy list in the select's onChange
    if (!selectedVesselId) return
    window.api
      .getVesselDynamicPolicies(selectedVesselId)
      .then((p) => {
        if (Array.isArray(p)) {
          setPolicies(
            p.map((x) => ({
              id: x.id,
              label: `${x.policyTypeName || 'Policy'} - ${x.policyNumber || 'No number'}`
            }))
          )
        }
      })
      .catch(() => {})
  }, [selectedVesselId])

  const handleAction = async (): Promise<void> => {
    try {
      setProcessing(true)
      const {
        resolveTemplatePlaceholders,
        htmlToPlainText,
        buildTemplateContext,
        generateTemplateDocx
      } = await import('../services/DocumentTemplateExportService')
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

  return (
    <Modal
      title={mode === 'docx' ? 'Generate DOCX' : 'Copy Text'}
      icon={mode === 'docx' ? <FileDown size={18} /> : <Copy size={18} />}
      onClose={onClose}
      width={480}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={processing} onClick={handleAction}>
            {processing ? (
              mode === 'docx' ? (
                'Generating...'
              ) : (
                'Copying...'
              )
            ) : mode === 'docx' ? (
              <>
                <FileDown size={14} /> Generate
              </>
            ) : (
              <>
                <Copy size={14} /> Copy
              </>
            )}
          </button>
        </>
      }
    >
      <div
        style={{
          padding: '10px 14px',
          borderRadius: '8px',
          background: 'var(--input-bg)',
          marginBottom: '16px',
          fontSize: '0.88rem'
        }}
      >
        <strong>{templateName}</strong>
      </div>

      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Select context data to fill template placeholders. Leave empty for blank values.
      </p>

      <div className="form-grid cols-2">
        <Field label="Vessel" span="all">
          <select
            value={selectedVesselId}
            onChange={(e) => {
              setSelectedVesselId(e.target.value)
              if (!e.target.value) {
                setPolicies([])
                setSelectedPolicyId('')
              }
            }}
          >
            <option value="">-- None --</option>
            {vessels.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>

        {policies.length > 0 && (
          <Field label="Policy" span="all">
            <select value={selectedPolicyId} onChange={(e) => setSelectedPolicyId(e.target.value)}>
              <option value="">-- None --</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Entity" span="all">
          <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)}>
            <option value="">-- None --</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  )
}
