import { useState, useEffect, useRef, useMemo } from 'react'
import { CheckCircle, AlertCircle, Upload, Eye, Copy, Trash2, Calendar, Plus, X, Pencil, Loader2, Info, FolderOpen } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import type { Vessel, DocumentType, VesselDocument, VesselCustomDocType, VesselDynamicPolicy } from '../../../shared/types'
import { resolveEffectivePolicyExpiry, getActivePIPolicies } from '../utils/policyUtils'
import { formatDate } from '../utils/dateUtils'

interface Props {
  vessel: Vessel
  dynamicPolicies?: VesselDynamicPolicy[]
  onReload?: () => void
}

const isExpired = (d: string | null | undefined) => {
  if (!d) return false
  return new Date(d) < new Date(new Date().setHours(0, 0, 0, 0))
}
const isExpiringSoon = (d: string | null | undefined) => {
  if (!d) return false
  const today = new Date(new Date().setHours(0, 0, 0, 0))
  const exp = new Date(d)
  const threshold = new Date(today); threshold.setDate(today.getDate() + 60)
  return exp >= today && exp <= threshold
}

// If the gap between receipt and expiry is < 60 days the document was placed knowing the
// policy renews soon — treat it as compliant rather than "expiring soon".
const annualShortCycle = (expiryDate: string | null | undefined, receivedDate: string | null | undefined) => {
  if (!expiryDate || !receivedDate) return false
  const span = (new Date(expiryDate).getTime() - new Date(receivedDate).getTime()) / (1000 * 60 * 60 * 24)
  return span < 60
}

type DocStatus = 'compliant' | 'expiring' | 'expired' | 'missing' | 'optional'

function getDocStatus(
  hasFile: boolean,
  expiryDate: string | null | undefined,
  required: boolean,
  annualRenewal = false,
  receivedDate?: string,
): DocStatus {
  if (!hasFile) return required ? 'missing' : 'optional'
  if (isExpired(expiryDate)) return 'expired'
  if (isExpiringSoon(expiryDate)) {
    if (annualRenewal && annualShortCycle(expiryDate, receivedDate)) return 'compliant'
    return 'expiring'
  }
  return 'compliant'
}

export default function VesselDocumentsView({ vessel, dynamicPolicies, onReload }: Props) {
  const { theme } = useTheme()
  const { user, hasPermission } = useAuth()
  const { showSuccess, showError } = useToast()
  const isLight = theme === 'light' || theme === 'aurora' || theme === 'premium'

  // Multi-P&I policy support: if multiple P&I policies exist, let user pick
  const piPolicies = useMemo(() => getActivePIPolicies(dynamicPolicies || []), [dynamicPolicies])
  const [preferredPIPolicyId, setPreferredPIPolicyId] = useState<string | undefined>(undefined)

  // Auto-select first P&I policy with an end date if none selected
  useEffect(() => {
    if (piPolicies.length > 0 && !preferredPIPolicyId) {
      const withDate = piPolicies.find(pp => pp.endDate)
      if (withDate) setPreferredPIPolicyId(withDate.policy.id)
    }
  }, [piPolicies, preferredPIPolicyId])

  // Resolve P&I expiry from dynamic policies first, fall back to legacy vessel field
  const effectivePolicyExpiry = useMemo(
    () => resolveEffectivePolicyExpiry(dynamicPolicies || [], preferredPIPolicyId) || vessel.policyExpiryDate || undefined,
    [dynamicPolicies, vessel.policyExpiryDate, preferredPIPolicyId]
  )

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingDocTypeId = useRef<string | null>(null)

  const [docTypes, setDocTypes] = useState<DocumentType[]>([])
  const [vesselDocs, setVesselDocs] = useState<VesselDocument[]>([])
  const [customDocTypes, setCustomDocTypes] = useState<VesselCustomDocType[]>([])
  const [fileStatus, setFileStatus] = useState<Record<string, boolean>>({})
  const [editingExpiry, setEditingExpiry] = useState<Record<string, string>>({})
  const [editingReceived, setEditingReceived] = useState<Record<string, string>>({})
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [newCustomName, setNewCustomName] = useState('')
  const [expandedDesc, setExpandedDesc] = useState<Set<string>>(new Set())

  const loadData = async () => {
    const [types, docs, customTypes] = await Promise.all([
      window.api.getDocumentTypes(),
      window.api.getVesselDocuments(vessel.id),
      window.api.getVesselCustomDocTypes(vessel.id),
    ])
    const sorted = [...types].sort((a, b) => {
      const dA = docs.find((d: VesselDocument) => d.documentTypeId === a.id)
      const dB = docs.find((d: VesselDocument) => d.documentTypeId === b.id)
      const rA = dA ? dA.required : a.required
      const rB = dB ? dB.required : b.required
      if (rA !== rB) return rA ? -1 : 1
      return a.order - b.order
    })
    setDocTypes(sorted)
    setVesselDocs(docs)
    setCustomDocTypes(customTypes)
    const status: Record<string, boolean> = {}
    for (const doc of docs) {
      if (doc.filePath) status[doc.documentTypeId] = await window.api.fsExists(doc.filePath)
    }
    setFileStatus(status)
  }

  useEffect(() => { loadData() }, [vessel.id])

  const uploadDoc = async (docTypeId: string, filePath: string) => {
    setUploadingId(docTypeId)
    try {
      const validation = await window.api.fileTypesValidateFile(filePath)
      if (!validation.valid) { showError(`File rejected: ${validation.reason}`); return }
      const existing = vesselDocs.find(d => d.documentTypeId === docTypeId)
      const isCustom = customDocTypes.some(c => c.id === docTypeId)
      await window.api.upsertVesselDocument({
        vesselId: vessel.id,
        documentTypeId: docTypeId,
        filePath,
        sent: existing?.sent || false,
        required: existing ? existing.required : (isCustom ? true : (docTypes.find(t => t.id === docTypeId)?.required || false)),
        expiryDate: undefined,
        uploadedDate: new Date().toISOString(),
        uploadedBy: user?.username || 'Unknown',
        receivedDate: new Date().toISOString().split('T')[0],
      })
      showSuccess('Document linked successfully')
      loadData()
      onReload?.()
    } finally {
      setUploadingId(null)
    }
  }

  const handleDrop = async (e: React.DragEvent, docTypeId: string) => {
    e.preventDefault(); e.stopPropagation(); setDragOverId(null)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const filePath = window.api.getFilePath(file)
    if (!filePath) return
    await uploadDoc(docTypeId, filePath)
  }

  const handleClickUpload = async (docTypeId: string) => {
    const filePath = await window.api.dialogOpenFileAny()
    if (!filePath) return
    await uploadDoc(docTypeId, filePath)
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pendingDocTypeId.current) return
    const filePath = window.api.getFilePath(file)
    if (filePath) await uploadDoc(pendingDocTypeId.current, filePath)
    e.target.value = ''
    pendingDocTypeId.current = null
  }

  const handleToggleRequired = async (docTypeId: string) => {
    const existing = vesselDocs.find(d => d.documentTypeId === docTypeId)
    const docType = docTypes.find(t => t.id === docTypeId)
    if (existing) {
      await window.api.upsertVesselDocument({ ...existing, required: !existing.required })
    } else {
      await window.api.upsertVesselDocument({
        vesselId: vessel.id, documentTypeId: docTypeId, filePath: '', sent: false,
        required: docType ? !docType.required : true,
        uploadedDate: new Date().toISOString(), uploadedBy: user?.username || 'System',
      })
    }
    loadData()
  }

  const handleUnlinkFile = async (doc: VesselDocument) => {
    if (!confirm('Unlink this file? The record will remain.')) return
    await window.api.upsertVesselDocument({ ...doc, filePath: '' })
    loadData(); onReload?.()
  }

  const handleDuplicate = async (doc: VesselDocument) => {
    try {
      await window.api.duplicateVesselDocument(doc.id!, user?.username || 'Unknown')
      showSuccess('Document duplicated'); loadData()
    } catch (err: any) { showError(err.message || 'Failed to duplicate') }
  }

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCustomName.trim()) return
    await window.api.addVesselCustomDocType({ vesselId: vessel.id, name: newCustomName.trim(), description: '', order: customDocTypes.length })
    setNewCustomName(''); setShowAddCustom(false); loadData()
  }

  const handleDeleteCustomType = async (id: string) => {
    if (!confirm('Delete this custom document type?')) return
    await window.api.deleteVesselCustomDocType(id)
    loadData()
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const allDocs = [
    ...docTypes.map(t => {
      const d = vesselDocs.find(v => v.documentTypeId === t.id)
      const isReq = d ? d.required : t.required
      return { id: t.id, required: isReq, doc: d }
    }),
    ...customDocTypes.map(t => {
      const d = vesselDocs.find(v => v.documentTypeId === t.id)
      return { id: t.id, required: true, doc: d }
    }),
  ]
  const requiredDocs = allDocs.filter(d => d.required)
  const compliantCount = requiredDocs.filter(d => d.doc?.filePath && fileStatus[d.id] !== false).length
  const missingCount = requiredDocs.filter(d => !d.doc?.filePath).length
  const pct = requiredDocs.length > 0 ? Math.round((compliantCount / requiredDocs.length) * 100) : 100

  // ── Color helpers ──────────────────────────────────────────────────────────
  const statusMeta: Record<DocStatus, { border: string; bg: string; badge: string; label: string }> = {
    compliant: {
      border: 'transparent',
      bg: 'transparent',
      badge: isLight ? 'rgba(0,140,70,0.12)' : 'rgba(0,194,100,0.12)',
      label: 'COMPLIANT',
    },
    expiring: {
      border: isLight ? '#b45309' : '#f59e0b',
      bg: isLight ? 'rgba(180,83,9,0.04)' : 'rgba(245,158,11,0.04)',
      badge: isLight ? 'rgba(180,83,9,0.12)' : 'rgba(245,158,11,0.12)',
      label: 'EXPIRING SOON',
    },
    expired: {
      border: isLight ? '#c00000' : '#ff4d4d',
      bg: isLight ? 'rgba(192,0,0,0.04)' : 'rgba(255,77,77,0.04)',
      badge: isLight ? 'rgba(192,0,0,0.12)' : 'rgba(255,77,77,0.12)',
      label: 'EXPIRED',
    },
    missing: {
      border: isLight ? '#c00000' : '#ff4d4d',
      bg: isLight ? 'rgba(192,0,0,0.04)' : 'rgba(255,77,77,0.04)',
      badge: isLight ? 'rgba(192,0,0,0.12)' : 'rgba(255,77,77,0.12)',
      label: 'MISSING',
    },
    optional: {
      border: 'transparent',
      bg: 'transparent',
      badge: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
      label: 'OPTIONAL',
    },
  }

  const cardBorder = isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)'

  // ── Card renderer ──────────────────────────────────────────────────────────
  const renderCard = (
    id: string,
    name: string,
    required: boolean,
    doc: VesselDocument | undefined,
    chips: React.ReactNode,
    isCustom = false,
    annualRenewal = false,
    description?: string,
  ) => {
    const hasFile = !!doc?.filePath
    const fileExists = fileStatus[id] !== false
    // Annual docs inherit the P&I policy expiry; fall back to the stored expiry date
    const effectiveExpiry = annualRenewal ? (effectivePolicyExpiry || doc?.expiryDate) : doc?.expiryDate
    const status: DocStatus = getDocStatus(hasFile && fileExists, effectiveExpiry, required, annualRenewal, doc?.receivedDate)
    const meta = statusMeta[status]
    const isDragOver = dragOverId === id

    return (
      <div
        key={id}
        onDragOver={e => { e.preventDefault(); setDragOverId(id) }}
        onDragLeave={() => setDragOverId(null)}
        onDrop={e => handleDrop(e, id)}
        style={{
          borderRadius: '10px',
          border: isDragOver ? '2px dashed var(--accent-primary)' : cardBorder,
          borderLeft: isDragOver ? '4px solid var(--accent-primary)' : `4px solid ${meta.border}`,
          background: isDragOver ? (isLight ? 'rgba(26,115,232,0.05)' : 'rgba(0,210,255,0.05)') : meta.bg,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {name}
              {annualRenewal && (
                <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: isLight ? 'rgba(124,58,237,0.1)' : 'rgba(167,139,250,0.18)', color: isLight ? '#7c3aed' : '#a78bfa', fontWeight: '600' }}>
                  Annual
                </span>
              )}
              {hasFile && !annualRenewal && (!doc?.expiryDate || doc.expiryDate === '0000-00-00') && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', fontWeight: 600, color: isLight ? '#008c46' : '#10b981', background: isLight ? 'rgba(0,140,70,0.08)' : 'rgba(16,185,129,0.1)', border: `1px solid ${isLight ? 'rgba(0,140,70,0.2)' : 'rgba(16,185,129,0.2)'}`, borderRadius: '4px', padding: '2px 6px' }}>
                  <CheckCircle size={9} /> No expiry
                </span>
              )}
              {chips}
            </div>
            {description && (
              <button
                onClick={() => setExpandedDesc(prev => {
                  const next = new Set(prev)
                  next.has(id) ? next.delete(id) : next.add(id)
                  return next
                })}
                title={expandedDesc.has(id) ? 'Hide description' : 'Show description'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '3px', padding: '1px 5px', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.68rem', cursor: 'pointer' }}
              >
                <Info size={10} />
                {expandedDesc.has(id) ? 'Hide info' : 'Info'}
              </button>
            )}
            {description && expandedDesc.has(id) && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: 1.5 }}>{description}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px', flexWrap: 'wrap' }}>
              {hasFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Pencil size={10} color="var(--text-secondary)" />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Received:</span>
                  <input
                    type="date"
                    title="Click to change received date (backdating allowed)"
                    value={editingReceived[id] !== undefined ? editingReceived[id] : (doc?.receivedDate?.split('T')[0] || '')}
                    onFocus={() => setEditingReceived(prev => ({ ...prev, [id]: doc?.receivedDate?.split('T')[0] || '' }))}
                    onChange={e => setEditingReceived(prev => ({ ...prev, [id]: e.target.value }))}
                    onBlur={async e => {
                      const val = e.target.value
                      setEditingReceived(prev => { const n = { ...prev }; delete n[id]; return n })
                      if (val) { await window.api.updateVesselDocumentReceivedDate(vessel.id, id, val); loadData() }
                    }}
                    style={{ fontSize: '0.74rem', padding: '2px 5px', borderRadius: '5px', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', colorScheme: isLight ? 'light' as const : 'dark' as const }}
                  />
                </div>
              )}
              {doc?.sent && (
                <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: isLight ? 'rgba(0,119,163,0.1)' : 'rgba(0,210,255,0.12)', color: isLight ? '#0077a3' : 'var(--accent-primary)', fontWeight: '600' }}>
                  Sent
                </span>
              )}
            </div>
          </div>
          {/* Status badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '3px 8px', borderRadius: '6px',
            background: meta.badge, flexShrink: 0,
            fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase' as const,
            color: meta.border,
          }}>
            {status === 'compliant' && <CheckCircle size={11} />}
            {(status === 'missing' || status === 'expired' || status === 'expiring') && <AlertCircle size={11} />}
            {meta.label}
          </div>
        </div>

        {/* Expiry row — annual docs: P&I reference badge (read-only) + always-editable document date */}
        {hasFile && annualRenewal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {effectivePolicyExpiry && (
              <span style={{
                fontSize: '0.7rem', fontWeight: 600, padding: '1px 7px', borderRadius: '4px',
                background: 'rgba(0, 210, 255, 0.1)', color: 'var(--accent-primary)',
                border: '1px solid rgba(0, 210, 255, 0.2)',
                display: 'inline-flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-start',
              }}>
                P&I · {formatDate(effectivePolicyExpiry)}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={12} color="var(--text-secondary)" />
              <input
                type="date"
                value={editingExpiry[id] !== undefined ? editingExpiry[id] : (doc?.expiryDate || '')}
                onFocus={() => setEditingExpiry(prev => ({ ...prev, [id]: doc?.expiryDate || '' }))}
                onChange={e => setEditingExpiry(prev => ({ ...prev, [id]: e.target.value }))}
                onBlur={async e => {
                  const val = e.target.value
                  setEditingExpiry(prev => { const n = { ...prev }; delete n[id]; return n })
                  await window.api.updateVesselDocumentExpiry(vessel.id, id, val || null); loadData()
                }}
                min="1900-01-01" max="2100-12-31"
                style={{ fontSize: '0.78rem', padding: '3px 6px', borderRadius: '5px', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', colorScheme: isLight ? 'light' as const : 'dark' as const }}
              />
              {doc?.expiryDate && (
                <button
                  title="Clear expiry date"
                  onClick={async () => { await window.api.updateVesselDocumentExpiry(vessel.id, id, null); loadData() }}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', padding: 0, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}
        {hasFile && !annualRenewal && (!doc?.expiryDate || doc.expiryDate === '0000-00-00') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', fontWeight: 600, color: isLight ? '#008c46' : '#10b981', background: isLight ? 'rgba(0,140,70,0.08)' : 'rgba(16,185,129,0.1)', border: `1px solid ${isLight ? 'rgba(0,140,70,0.2)' : 'rgba(16,185,129,0.2)'}`, borderRadius: '4px', padding: '1px 6px' }}>
              <CheckCircle size={10} /> No expiry
            </span>
            <Calendar size={12} color="var(--text-secondary)" />
            <input
              type="date"
              placeholder="Set expiry date"
              value={editingExpiry[id] !== undefined ? editingExpiry[id] : ''}
              onFocus={() => setEditingExpiry(prev => ({ ...prev, [id]: '' }))}
              onChange={e => setEditingExpiry(prev => ({ ...prev, [id]: e.target.value }))}
              onBlur={async e => {
                const val = e.target.value
                setEditingExpiry(prev => { const n = { ...prev }; delete n[id]; return n })
                if (val) { await window.api.updateVesselDocumentExpiry(vessel.id, id, val); loadData() }
                // no-op if still empty (user focused without entering anything)
              }}
              min="1900-01-01" max="2100-12-31"
              style={{ fontSize: '0.78rem', padding: '3px 6px', borderRadius: '5px', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', colorScheme: isLight ? 'light' as const : 'dark' as const }}
            />
          </div>
        )}
        {hasFile && !annualRenewal && doc?.expiryDate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={12} color="var(--text-secondary)" />
            <input
              type="date"
              value={editingExpiry[id] !== undefined ? editingExpiry[id] : (doc.expiryDate || '')}
              onFocus={() => setEditingExpiry(prev => ({ ...prev, [id]: doc.expiryDate || '' }))}
              onChange={e => setEditingExpiry(prev => ({ ...prev, [id]: e.target.value }))}
              onBlur={async e => {
                const val = e.target.value
                setEditingExpiry(prev => { const n = { ...prev }; delete n[id]; return n })
                await window.api.updateVesselDocumentExpiry(vessel.id, id, val || null); loadData()
              }}
              min="1900-01-01" max="2100-12-31"
              style={{ fontSize: '0.78rem', padding: '3px 6px', borderRadius: '5px', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', colorScheme: isLight ? 'light' as const : 'dark' as const }}
            />
            <button
              title="Clear expiry date"
              onClick={async () => {
                await window.api.updateVesselDocumentExpiry(vessel.id, id, null)
                loadData()
              }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', padding: 0, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const }}>
          {!hasFile ? (
            hasPermission('documents:upload') ? (
              <button
                onClick={() => handleClickUpload(id)}
                disabled={uploadingId === id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: required ? '5px 14px' : '4px 10px',
                  borderRadius: '6px', fontSize: '0.78rem', fontWeight: required ? '600' : '500',
                  cursor: uploadingId === id ? 'not-allowed' : 'pointer',
                  opacity: uploadingId === id ? 0.65 : 1,
                  background: required
                    ? (isLight ? 'rgba(0,119,163,0.1)' : 'rgba(0,210,255,0.1)')
                    : 'transparent',
                  border: required
                    ? `1px solid ${isLight ? 'rgba(0,119,163,0.5)' : 'rgba(0,210,255,0.4)'}`
                    : `1px dashed ${isLight ? 'rgba(0,119,163,0.3)' : 'rgba(0,210,255,0.3)'}`,
                  color: isLight ? '#0077a3' : 'var(--accent-primary)',
                }}
              >
                {uploadingId === id ? <Loader2 size={12} className="spinner" /> : <Upload size={12} />}
                {uploadingId === id ? 'Uploading...' : 'Upload File'}
              </button>
            ) : null
          ) : (
            <>
              <button onClick={() => window.api.fsOpen(doc!.filePath)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Open file">
                <Eye size={13} /> View
              </button>
              <button onClick={() => window.api.shellShowItemInFolder(doc!.filePath)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Open file location">
                <FolderOpen size={13} />
              </button>
              <button onClick={() => handleDuplicate(doc!)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Duplicate">
                <Copy size={13} /> Copy
              </button>
              <button onClick={() => handleUnlinkFile(doc!)} style={{ padding: '4px 8px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.25)', borderRadius: '6px', color: 'var(--danger)', cursor: 'pointer' }} title="Unlink file">
                <Trash2 size={13} />
              </button>
            </>
          )}
          {!isCustom && (
            <button
              onClick={() => handleToggleRequired(id)}
              style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: '0.72rem', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: '1px solid var(--table-border)', color: 'var(--text-secondary)' }}
              title="Toggle required/optional"
            >
              {required ? 'Set Optional' : 'Set Required'}
            </button>
          )}
          {isCustom && (
            <button onClick={() => handleDeleteCustomType(id)} style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: '0.72rem', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,77,77,0.3)', color: 'var(--danger)' }}>
              Remove Type
            </button>
          )}
        </div>
      </div>
    )
  }

  const requiredDocTypes = docTypes.filter(t => {
    const d = vesselDocs.find(v => v.documentTypeId === t.id)
    return d ? d.required : t.required
  })
  const optionalDocTypes = docTypes.filter(t => {
    const d = vesselDocs.find(v => v.documentTypeId === t.id)
    return !(d ? d.required : t.required)
  })

  const pctColor = pct === 100 ? (isLight ? '#008c46' : '#00c264') : pct >= 70 ? (isLight ? '#b45309' : '#f59e0b') : (isLight ? '#c00000' : '#ff4d4d')

  const sectionHeader = (title: string, count: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', marginTop: '4px' }}>
      <span style={{ fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
      <span style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: '10px', background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', fontWeight: '600' }}>{count}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileInput} />

      {/* P&I policy picker when multiple P&I policies exist */}
      {piPolicies.length > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px',
          background: 'rgba(0, 210, 255, 0.06)', border: '1px solid rgba(0, 210, 255, 0.15)',
          borderRadius: '8px', fontSize: '0.85rem'
        }}>
          <Info size={16} color="var(--accent-primary)" />
          <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>P&I policy for annual docs:</span>
          <select
            value={preferredPIPolicyId || ''}
            onChange={e => setPreferredPIPolicyId(e.target.value || undefined)}
            style={{
              flex: 1, padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem',
              background: 'var(--input-bg)', color: 'var(--text-primary)',
              border: '1px solid var(--input-border)', maxWidth: '400px'
            }}
          >
            {piPolicies.map(pp => (
              <option key={pp.policy.id} value={pp.policy.id}>
                {pp.policy.policyNumber || pp.policy.policyTypeName || 'P&I'} — {pp.endDate ? formatDate(pp.endDate) : 'No end date'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Compliance summary */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'stretch' }}>
        {[
          { label: 'Total Required', value: requiredDocs.length, color: 'var(--text-primary)' },
          { label: 'Compliant', value: compliantCount, color: isLight ? '#008c46' : '#00c264' },
          { label: 'Missing', value: missingCount, color: missingCount > 0 ? (isLight ? '#c00000' : '#ff4d4d') : 'var(--text-secondary)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '12px 20px', background: 'var(--bg-card)', borderRadius: '10px', border: cardBorder, textAlign: 'center', minWidth: '100px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
        <div style={{ flex: 1, minWidth: '160px', padding: '12px 20px', background: 'var(--bg-card)', borderRadius: '10px', border: cardBorder, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Compliance Rate</span>
            <span style={{ fontWeight: '700', fontSize: '1rem', color: pctColor }}>{pct}%</span>
          </div>
          <div style={{ height: '6px', borderRadius: '3px', background: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: '3px', background: pctColor, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Required documents */}
      {requiredDocTypes.length > 0 && (
        <div>
          {sectionHeader('Required Documents', requiredDocTypes.length)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
            {requiredDocTypes.map(t => {
              const doc = vesselDocs.find(d => d.documentTypeId === t.id)
              return renderCard(t.id, t.name, true, doc, null, false, t.annualRenewal, t.description)
            })}
          </div>
        </div>
      )}

      {/* Optional documents */}
      {optionalDocTypes.length > 0 && (
        <div>
          {sectionHeader('Optional Documents', optionalDocTypes.length)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
            {optionalDocTypes.map(t => {
              const doc = vesselDocs.find(d => d.documentTypeId === t.id)
              return renderCard(t.id, t.name, false, doc, null, false, t.annualRenewal, t.description)
            })}
          </div>
        </div>
      )}

      {/* Custom documents */}
      {(customDocTypes.length > 0 || showAddCustom) && (
        <div>
          {sectionHeader('Custom Documents', customDocTypes.length)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
            {customDocTypes.map(t => {
              const doc = vesselDocs.find(d => d.documentTypeId === t.id)
              const chip = (
                <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: isLight ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.2)', color: isLight ? '#3b82f6' : '#93c5fd', fontWeight: '500' }}>
                  Custom
                </span>
              )
              return renderCard(t.id, t.name, true, doc, chip, true)
            })}
          </div>
        </div>
      )}

      {/* Add custom button / form */}
      {showAddCustom ? (
        <form onSubmit={handleAddCustom} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={newCustomName}
            onChange={e => setNewCustomName(e.target.value)}
            placeholder="Custom document name"
            autoFocus
            style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
          />
          <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>Add</button>
          <button type="button" onClick={() => { setShowAddCustom(false); setNewCustomName('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '8px' }}><X size={16} /></button>
        </form>
      ) : (
        <button
          onClick={() => setShowAddCustom(true)}
          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', fontSize: '0.85rem', background: 'transparent', border: `1px dashed ${isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)'}`, color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          <Plus size={14} /> Add Custom Document Type
        </button>
      )}
    </div>
  )
}
