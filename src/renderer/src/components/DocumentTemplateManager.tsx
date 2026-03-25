import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText, Trash2, Save, Upload, Download, ChevronUp, ChevronDown,
  Tag, RefreshCw, X, File
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import type { DocumentTemplate } from '../../../shared/types'
import { TEMPLATE_PLACEHOLDERS, TEMPLATE_CATEGORIES } from '../../../shared/types'

const CATEGORY_TABS = [
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'policy', label: 'Policy' },
  { id: 'quotation', label: 'Quotation' },
  { id: 'vessel', label: 'Vessel' },
  { id: 'entity', label: 'Entity' },
  { id: 'certificate', label: 'Certificate' },
]

const CATEGORY_COLORS: Record<string, string> = {
  general: '#6b7280',
  policy: '#3b82f6',
  quotation: '#8b5cf6',
  vessel: '#0ea5e9',
  entity: '#f59e0b',
  certificate: '#10b981',
}

function detectPlaceholders(xmlContent: string): string[] {
  const matches = xmlContent.match(/\{\{(\w+)\}\}/g)
  return [...new Set(matches || [])]
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// Extract text from docx XML to detect placeholders — handles split runs
function extractTextFromDocx(xml: string): string {
  // Get all <w:t> content
  const texts: string[] = []
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    texts.push(m[1])
  }
  return texts.join('')
}

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
  const [dirty, setDirty] = useState(false)
  const skipDirtyRef = useRef(false)

  // Upload modal
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadCategory, setUploadCategory] = useState('general')
  const [uploadPlaceholders, setUploadPlaceholders] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateTemplateId, setGenerateTemplateId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceFileInputRef = useRef<HTMLInputElement>(null)

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
      setDirty(changed)
    }
  }, [editName, editDescription, editCategory])

  const handleSave = async () => {
    if (!selected || !dirty) return
    try {
      await window.api.docTemplateUpdate(selected.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        category: editCategory
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

  // Handle file selection for upload
  const handleFileSelected = async (file: File) => {
    if (!file.name.endsWith('.docx')) {
      showError('Only .docx files are supported')
      return
    }

    setUploadFile(file)
    setUploadName(file.name.replace('.docx', ''))

    // Read file and detect placeholders
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(buffer)
      const docXml = zip.file('word/document.xml')
      if (docXml) {
        const xml = await docXml.async('string')
        const fullText = extractTextFromDocx(xml)
        const detected = detectPlaceholders(fullText)
        setUploadPlaceholders(detected)
      }
    } catch {
      // Placeholder detection is best-effort
      setUploadPlaceholders([])
    }

    setShowUpload(true)
  }

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) return
    try {
      setUploading(true)
      const buffer = await readFileAsArrayBuffer(uploadFile)
      const fileData = Array.from(new Uint8Array(buffer))
      await window.api.docTemplateAdd({
        name: uploadName.trim(),
        description: uploadDescription.trim() || null,
        category: uploadCategory,
        fileName: uploadFile.name,
        fileData,
        placeholders: uploadPlaceholders.length > 0 ? uploadPlaceholders : null
      })
      showSuccess('Template uploaded')
      setShowUpload(false)
      setUploadFile(null)
      setUploadName('')
      setUploadDescription('')
      setUploadCategory('general')
      setUploadPlaceholders([])
      loadTemplates()
    } catch {
      showError('Failed to upload template')
    } finally {
      setUploading(false)
    }
  }

  const handleReplaceFile = async (file: File) => {
    if (!selected) return
    if (!file.name.endsWith('.docx')) {
      showError('Only .docx files are supported')
      return
    }
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(buffer)
      let placeholders: string[] = []
      const docXml = zip.file('word/document.xml')
      if (docXml) {
        const xml = await docXml.async('string')
        const fullText = extractTextFromDocx(xml)
        placeholders = detectPlaceholders(fullText)
      }
      const fileData = Array.from(new Uint8Array(buffer))
      await window.api.docTemplateReplaceFile(selected.id, {
        fileName: file.name,
        fileData,
        placeholders: placeholders.length > 0 ? placeholders : null
      })
      showSuccess('Template file replaced')
      loadTemplates()
    } catch {
      showError('Failed to replace file')
    }
  }

  const handleGenerate = async (templateId: string) => {
    setGenerateTemplateId(templateId)
    setShowGenerate(true)
  }

  const doGenerate = async (context: { vesselId?: string; policyId?: string; entityId?: string }) => {
    if (!generateTemplateId) return
    try {
      setGenerating(true)
      const result = await window.api.docTemplateGenerate(generateTemplateId, context)
      if (result && result.data) {
        // Download the generated file
        const blob = new Blob([new Uint8Array(result.data)], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = result.fileName.replace('.docx', '_generated.docx')
        a.click()
        URL.revokeObjectURL(url)
        showSuccess('Document generated and downloaded')
        setShowGenerate(false)
      }
    } catch {
      showError('Failed to generate document')
    } finally {
      setGenerating(false)
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

  // Grouped placeholders
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
            <FileText size={28} /> Document Templates
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Upload Word templates with {'{{placeholder}}'} markers for auto-filled document generation
          </p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} /> Upload Template
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelected(file)
                e.target.value = ''
              }}
            />
          </div>
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
          width: '380px',
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
                  Upload a .docx file to get started
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
                    <File size={18} style={{ color: CATEGORY_COLORS[t.category] || '#6b7280' }} />
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
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {t.fileName}
                      </span>
                      {t.placeholders && t.placeholders.length > 0 && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          {t.placeholders.length} placeholder{t.placeholders.length !== 1 ? 's' : ''}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
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

              <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                    Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    disabled={!canManage}
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
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                    File
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      {selected.fileName}
                    </span>
                    {canManage && (
                      <>
                        <button
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => replaceFileInputRef.current?.click()}
                        >
                          <RefreshCw size={12} /> Replace
                        </button>
                        <input
                          ref={replaceFileInputRef}
                          type="file"
                          accept=".docx"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleReplaceFile(file)
                            e.target.value = ''
                          }}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
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
                  onClick={() => handleGenerate(selected.id)}
                >
                  <Download size={14} /> Generate Preview
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

              {/* Detected Placeholders */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tag size={14} /> Detected Placeholders
                </h3>
                {selected.placeholders && selected.placeholders.length > 0 ? (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {selected.placeholders.map(p => {
                      const known = TEMPLATE_PLACEHOLDERS.find(tp => tp.key === p)
                      return (
                        <span
                          key={p}
                          style={{
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontFamily: 'monospace',
                            background: known
                              ? 'rgba(0,210,255,0.1)'
                              : 'rgba(255,204,0,0.1)',
                            border: known
                              ? '1px solid rgba(0,210,255,0.3)'
                              : '1px solid rgba(255,204,0,0.3)',
                            color: known
                              ? 'var(--accent-primary)'
                              : 'var(--warning)'
                          }}
                          title={known ? known.label : 'Custom placeholder'}
                        >
                          {p}
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    No placeholders detected in template
                  </p>
                )}
              </div>

              {/* Available Placeholders Reference */}
              <div>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px' }}>
                  Available Placeholders Reference
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

      {/* Upload Modal */}
      {showUpload && (
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
            width: '500px',
            maxWidth: '90vw',
            border: 'var(--glass-border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={20} /> Upload Template
              </h2>
              <button
                onClick={() => { setShowUpload(false); setUploadFile(null) }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                File
              </label>
              <div style={{
                padding: '8px 12px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: '8px',
                fontSize: '0.88rem',
                color: 'var(--text-primary)'
              }}>
                {uploadFile?.name || 'No file selected'}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                Name
              </label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
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
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
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

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
                Category
              </label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
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

            {uploadPlaceholders.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
                  Detected Placeholders ({uploadPlaceholders.length})
                </label>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {uploadPlaceholders.map(p => (
                    <span
                      key={p}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        background: 'rgba(0,210,255,0.1)',
                        border: '1px solid rgba(0,210,255,0.3)',
                        color: 'var(--accent-primary)'
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className="btn-secondary"
                onClick={() => { setShowUpload(false); setUploadFile(null) }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={uploading || !uploadName.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {uploading ? 'Uploading...' : <><Upload size={14} /> Upload</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {showGenerate && (
        <GenerateModal
          isLight={isLight}
          generating={generating}
          templateId={generateTemplateId}
          templates={templates}
          onGenerate={doGenerate}
          onClose={() => { setShowGenerate(false); setGenerateTemplateId(null) }}
        />
      )}
    </div>
  )
}

// Separate generate modal component
function GenerateModal({ isLight, generating, templateId, templates, onGenerate, onClose }: {
  isLight: boolean
  generating: boolean
  templateId: string | null
  templates: DocumentTemplate[]
  onGenerate: (context: { vesselId?: string; policyId?: string; entityId?: string }) => void
  onClose: () => void
}) {
  const [vessels, setVessels] = useState<{ id: string; name: string }[]>([])
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([])
  const [selectedVesselId, setSelectedVesselId] = useState('')
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [policies, setPolicies] = useState<{ id: string; label: string }[]>([])
  const [selectedPolicyId, setSelectedPolicyId] = useState('')

  const template = templates.find(t => t.id === templateId)

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
            <Download size={20} /> Generate Document
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {template && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'var(--input-bg)',
            marginBottom: '16px',
            fontSize: '0.88rem'
          }}>
            <strong>{template.name}</strong>
            <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '0.8rem' }}>
              {template.fileName}
            </span>
          </div>
        )}

        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Select context data to fill template placeholders. Leave empty for sample/blank values.
        </p>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
            Vessel
          </label>
          <select
            value={selectedVesselId}
            onChange={(e) => setSelectedVesselId(e.target.value)}
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
            <select
              value={selectedPolicyId}
              onChange={(e) => setSelectedPolicyId(e.target.value)}
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
          <select
            value={selectedEntityId}
            onChange={(e) => setSelectedEntityId(e.target.value)}
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
            disabled={generating}
            onClick={() => onGenerate({
              vesselId: selectedVesselId || undefined,
              policyId: selectedPolicyId || undefined,
              entityId: selectedEntityId || undefined
            })}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {generating ? 'Generating...' : <><Download size={14} /> Generate</>}
          </button>
        </div>
      </div>
    </div>
  )
}
