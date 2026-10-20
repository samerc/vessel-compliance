import { useState, useRef, useMemo, useEffect } from 'react'
import {
  CheckCircle,
  AlertCircle,
  Upload,
  Eye,
  Copy,
  Trash2,
  Calendar,
  Plus,
  X,
  Pencil,
  Loader2,
  Info,
  FolderOpen,
  History
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import type {
  Vessel,
  DocumentType,
  VesselDocument,
  VesselCustomDocType,
  VesselDynamicPolicy,
  DocumentHistoryEntry
} from '../../../shared/types'
import { resolveEffectivePolicyExpiry, getActivePIPolicies } from '../utils/policyUtils'
import { formatDate } from '../utils/dateUtils'
import { confirmDialog } from './DialogHost'
import MissingFilePath from './MissingFilePath'
import DocumentDatesModal, { type DocumentDatesRequest } from './DocumentDatesModal'
import DocumentHistoryModal from './DocumentHistoryModal'
import { getDocStatus as sharedDocStatus, type DocStatus } from '../utils/docStatus'

interface Props {
  vessel: Vessel
  dynamicPolicies?: VesselDynamicPolicy[]
  /** Loaded by the vessel page (sorted: required first) - this view does not fetch them again */
  docTypes: DocumentType[]
  vesselDocs: VesselDocument[]
  customDocTypes: VesselCustomDocType[]
  /** documentTypeId -> file exists on disk (missing key = not checked yet) */
  fileStatus: Record<string, boolean>
  /** Reloads the vessel page data after a change here */
  onReload: () => void
}

function getDocStatus(
  hasFile: boolean,
  expiryDate: string | null | undefined,
  required: boolean,
  annualRenewal = false,
  receivedDate?: string
): DocStatus {
  return sharedDocStatus({ hasFile, expiryDate, required, annualRenewal, receivedDate })
}

export default function VesselDocumentsView({
  vessel,
  dynamicPolicies,
  docTypes,
  vesselDocs,
  customDocTypes,
  fileStatus,
  onReload
}: Props): React.JSX.Element {
  const { theme } = useTheme()
  const { user, hasPermission } = useAuth()
  const { showSuccess, showError } = useToast()
  const isLight = theme === 'light' || theme === 'aurora'

  // Multi-P&I policy support: if multiple P&I policies exist, let user pick
  const piPolicies = useMemo(() => getActivePIPolicies(dynamicPolicies || []), [dynamicPolicies])
  const [preferredPIPolicyId, setPreferredPIPolicyId] = useState<string | undefined>(undefined)

  // Auto-select first P&I policy with an end date if none selected
  const selectedPIPolicyId =
    preferredPIPolicyId || piPolicies.find((pp) => pp.endDate)?.policy.id || undefined

  // Resolve P&I expiry from dynamic policies first, fall back to legacy vessel field
  const effectivePolicyExpiry = useMemo(
    () =>
      resolveEffectivePolicyExpiry(dynamicPolicies || [], selectedPIPolicyId) ||
      vessel.policyExpiryDate ||
      undefined,
    [dynamicPolicies, vessel.policyExpiryDate, selectedPIPolicyId]
  )

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingDocTypeId = useRef<string | null>(null)

  const [editingExpiry, setEditingExpiry] = useState<Record<string, string>>({})
  const [editingReceived, setEditingReceived] = useState<Record<string, string>>({})
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [newCustomName, setNewCustomName] = useState('')
  const [expandedDesc, setExpandedDesc] = useState<Set<string>>(new Set())
  // Show only documents with this status ('attention' = missing, expired or expiring)
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'attention' | 'missing' | 'expired' | 'expiring' | 'compliant'
  >('all')
  // Asked after a file is linked or replaced: its received and expiry dates
  const [datesRequest, setDatesRequest] = useState<DocumentDatesRequest | null>(null)
  // Earlier files per document type (kept when a file is replaced or unlinked)
  const [history, setHistory] = useState<DocumentHistoryEntry[]>([])
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null)
  useEffect(() => {
    let live = true
    window.api
      .docHistoryList('vessel', [vessel.id])
      .then((rows) => {
        if (live) setHistory(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {})
    return () => {
      live = false
    }
    // Reloaded with the documents: a replace or unlink adds an entry
  }, [vessel.id, vesselDocs])

  // Inline date edits: saved with a confirmation, failures reported
  const saveExpiry = async (docTypeId: string, name: string, val: string | null): Promise<void> => {
    try {
      await window.api.updateVesselDocumentExpiry(vessel.id, docTypeId, val)
      showSuccess(val ? `${name}: expiry ${formatDate(val)}` : `${name}: expiry cleared`)
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to save the expiry date')
    }
    loadData()
  }
  const saveReceived = async (docTypeId: string, name: string, val: string): Promise<void> => {
    try {
      await window.api.updateVesselDocumentReceivedDate(vessel.id, docTypeId, val)
      showSuccess(`${name}: received ${formatDate(val)}`)
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to save the received date')
    }
    loadData()
  }

  const loadData = onReload

  const uploadDoc = async (docTypeId: string, filePath: string): Promise<void> => {
    setUploadingId(docTypeId)
    try {
      const validation = await window.api.fileTypesValidateFile(filePath)
      if (!validation.valid) {
        showError(`File rejected: ${validation.reason}`)
        return
      }
      const existing = vesselDocs.find((d) => d.documentTypeId === docTypeId)
      const isCustom = customDocTypes.some((c) => c.id === docTypeId)
      await window.api.upsertVesselDocument({
        vesselId: vessel.id,
        documentTypeId: docTypeId,
        filePath,
        sent: existing?.sent || false,
        required: existing
          ? existing.required
          : isCustom
            ? true
            : docTypes.find((t) => t.id === docTypeId)?.required || false,
        expiryDate: undefined,
        uploadedDate: new Date().toISOString(),
        uploadedBy: user?.username || 'Unknown',
        receivedDate: new Date().toISOString().split('T')[0]
      })
      loadData()
      const type = docTypes.find((t) => t.id === docTypeId)
      // Annual documents expire with the policy: no date to ask (received = today already)
      if (type?.annualRenewal && effectivePolicyExpiry) {
        showSuccess(
          `${type.name} linked - expires with the policy on ${formatDate(effectivePolicyExpiry)}`
        )
        return
      }
      setDatesRequest({
        vesselId: vessel.id,
        documentTypeId: docTypeId,
        documentName:
          type?.name || customDocTypes.find((c) => c.id === docTypeId)?.name || 'The document',
        annualRenewal: !!type?.annualRenewal,
        piEndDate: effectivePolicyExpiry
      })
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to link the document')
    } finally {
      setUploadingId(null)
    }
  }

  const handleDrop = async (e: React.DragEvent, docTypeId: string): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverId(null)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const filePath = window.api.getFilePath(file)
    if (!filePath) return
    await uploadDoc(docTypeId, filePath)
  }

  const handleClickUpload = async (docTypeId: string): Promise<void> => {
    const filePath = await window.api.dialogOpenFileAny()
    if (!filePath) return
    await uploadDoc(docTypeId, filePath)
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file || !pendingDocTypeId.current) return
    const filePath = window.api.getFilePath(file)
    if (filePath) await uploadDoc(pendingDocTypeId.current, filePath)
    e.target.value = ''
    pendingDocTypeId.current = null
  }

  const handleToggleRequired = async (docTypeId: string): Promise<void> => {
    const existing = vesselDocs.find((d) => d.documentTypeId === docTypeId)
    const docType = docTypes.find((t) => t.id === docTypeId)
    if (existing) {
      await window.api.upsertVesselDocument({ ...existing, required: !existing.required })
    } else {
      await window.api.upsertVesselDocument({
        vesselId: vessel.id,
        documentTypeId: docTypeId,
        filePath: '',
        sent: false,
        required: docType ? !docType.required : true,
        uploadedDate: new Date().toISOString(),
        uploadedBy: user?.username || 'System'
      })
    }
    loadData()
  }

  const handleUnlinkFile = async (doc: VesselDocument): Promise<void> => {
    if (!(await confirmDialog('Unlink this file? The record will remain.'))) return
    await window.api.upsertVesselDocument({ ...doc, filePath: '' })
    loadData()
  }

  const handleDuplicate = async (doc: VesselDocument): Promise<void> => {
    try {
      await window.api.duplicateVesselDocument(doc.id!, user?.username || 'Unknown')
      showSuccess('Document duplicated')
      loadData()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to duplicate')
    }
  }

  const handleAddCustom = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!newCustomName.trim()) return
    await window.api.addVesselCustomDocType({
      vesselId: vessel.id,
      name: newCustomName.trim(),
      description: '',
      order: customDocTypes.length
    })
    setNewCustomName('')
    setShowAddCustom(false)
    loadData()
  }

  const handleDeleteCustomType = async (id: string): Promise<void> => {
    if (!(await confirmDialog('Delete this custom document type?'))) return
    await window.api.deleteVesselCustomDocType(id)
    loadData()
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const allDocs = [
    ...docTypes.map((t) => {
      const d = vesselDocs.find((v) => v.documentTypeId === t.id)
      const isReq = d ? d.required : t.required
      return { id: t.id, required: isReq, doc: d }
    }),
    ...customDocTypes.map((t) => {
      const d = vesselDocs.find((v) => v.documentTypeId === t.id)
      return { id: t.id, required: true, doc: d }
    })
  ]
  const requiredDocs = allDocs.filter((d) => d.required)
  const compliantCount = requiredDocs.filter(
    (d) => d.doc?.filePath && fileStatus[d.id] !== false
  ).length
  const missingCount = requiredDocs.filter((d) => !d.doc?.filePath).length
  const pct =
    requiredDocs.length > 0 ? Math.round((compliantCount / requiredDocs.length) * 100) : 100

  // ── Color helpers ──────────────────────────────────────────────────────────
  const statusMeta: Record<
    DocStatus,
    { border: string; bg: string; badge: string; label: string }
  > = {
    compliant: {
      border: 'transparent',
      bg: 'transparent',
      badge: 'color-mix(in srgb, var(--success) 12%, transparent)',
      label: 'COMPLIANT'
    },
    expiring: {
      border: 'var(--warning)',
      bg: 'color-mix(in srgb, var(--warning) 4%, transparent)',
      badge: 'color-mix(in srgb, var(--warning) 12%, transparent)',
      label: 'EXPIRING SOON'
    },
    expired: {
      border: 'var(--danger)',
      bg: 'color-mix(in srgb, var(--danger) 4%, transparent)',
      badge: 'color-mix(in srgb, var(--danger) 12%, transparent)',
      label: 'EXPIRED'
    },
    missing: {
      border: 'var(--danger)',
      bg: 'color-mix(in srgb, var(--danger) 4%, transparent)',
      badge: 'color-mix(in srgb, var(--danger) 12%, transparent)',
      label: 'MISSING'
    },
    optional: {
      border: 'transparent',
      bg: 'transparent',
      badge: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
      label: 'OPTIONAL'
    }
  }

  const cardBorder = isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)'

  // Status of one document card (same rule as the card itself)
  const cardStatus = (
    id: string,
    required: boolean,
    doc: VesselDocument | undefined,
    annualRenewal = false
  ): DocStatus => {
    const hasFile = !!doc?.filePath
    const fileExists = fileStatus[id] !== false
    const effectiveExpiry = annualRenewal
      ? effectivePolicyExpiry || doc?.expiryDate
      : doc?.expiryDate
    return getDocStatus(
      hasFile && fileExists,
      effectiveExpiry,
      required,
      annualRenewal,
      doc?.receivedDate
    )
  }

  // ── Card renderer ──────────────────────────────────────────────────────────
  const renderCard = (
    id: string,
    name: string,
    required: boolean,
    doc: VesselDocument | undefined,
    chips: React.ReactNode,
    isCustom = false,
    annualRenewal = false,
    description?: string
  ): React.JSX.Element | null => {
    const hasFile = !!doc?.filePath
    const fileExists = fileStatus[id] !== false
    const status: DocStatus = cardStatus(id, required, doc, annualRenewal)
    // Status filter: hide cards that do not match
    if (statusFilter === 'attention' && !['missing', 'expired', 'expiring'].includes(status))
      return null
    if (statusFilter !== 'all' && statusFilter !== 'attention' && status !== statusFilter)
      return null
    const meta = statusMeta[status]
    const isDragOver = dragOverId === id

    return (
      <div
        key={id}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOverId(id)
        }}
        onDragLeave={() => setDragOverId(null)}
        onDrop={(e) => handleDrop(e, id)}
        style={{
          borderRadius: '10px',
          border: isDragOver ? '2px dashed var(--accent-primary)' : cardBorder,
          borderLeft: isDragOver ? '4px solid var(--accent-primary)' : `4px solid ${meta.border}`,
          background: isDragOver
            ? isLight
              ? 'rgba(26,115,232,0.05)'
              : 'rgba(var(--accent-primary-rgb), 0.05)'
            : meta.bg,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          transition: 'border-color 0.15s, background 0.15s'
        }}
      >
        {/* Card header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '8px'
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: '600',
                fontSize: '0.9rem',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexWrap: 'wrap'
              }}
            >
              {name}
              {annualRenewal && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: isLight ? 'rgba(124,58,237,0.1)' : 'rgba(167,139,250,0.18)',
                    color: isLight ? '#7c3aed' : '#a78bfa',
                    fontWeight: '600'
                  }}
                >
                  Annual
                </span>
              )}
              {hasFile &&
                !annualRenewal &&
                (!doc?.expiryDate || doc.expiryDate === '0000-00-00') && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      color: 'var(--success)',
                      background: 'color-mix(in srgb, var(--success) 9%, transparent)',
                      border: `1px solid ${'color-mix(in srgb, var(--success) 20%, transparent)'}`,
                      borderRadius: '4px',
                      padding: '2px 6px'
                    }}
                  >
                    <CheckCircle size={9} /> No expiry
                  </span>
                )}
              {chips}
            </div>
            {description && (
              <button
                onClick={() =>
                  setExpandedDesc((prev) => {
                    const next = new Set(prev)
                    next.has(id) ? next.delete(id) : next.add(id)
                    return next
                  })
                }
                title={expandedDesc.has(id) ? 'Hide description' : 'Show description'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  marginTop: '3px',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  border: '1px solid var(--glass-border-color)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '0.68rem',
                  cursor: 'pointer'
                }}
              >
                <Info size={10} />
                {expandedDesc.has(id) ? 'Hide info' : 'Info'}
              </button>
            )}
            {description && expandedDesc.has(id) && (
              <div
                style={{
                  fontSize: '0.74rem',
                  color: 'var(--text-secondary)',
                  marginTop: '3px',
                  lineHeight: 1.5
                }}
              >
                {description}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: '3px',
                flexWrap: 'wrap'
              }}
            >
              {hasFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Pencil size={10} color="var(--text-secondary)" />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    Received:
                  </span>
                  <input
                    type="date"
                    title="Click to change received date (backdating allowed)"
                    value={
                      editingReceived[id] !== undefined
                        ? editingReceived[id]
                        : doc?.receivedDate?.split('T')[0] || ''
                    }
                    onFocus={() =>
                      setEditingReceived((prev) => ({
                        ...prev,
                        [id]: doc?.receivedDate?.split('T')[0] || ''
                      }))
                    }
                    onChange={(e) =>
                      setEditingReceived((prev) => ({ ...prev, [id]: e.target.value }))
                    }
                    onBlur={async (e) => {
                      const val = e.target.value
                      setEditingReceived((prev) => {
                        const n = { ...prev }
                        delete n[id]
                        return n
                      })
                      if (val && val !== (doc?.receivedDate?.split('T')[0] || ''))
                        await saveReceived(id, name, val)
                    }}
                    style={{
                      fontSize: '0.74rem',
                      padding: '2px 5px',
                      borderRadius: '5px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--input-border)',
                      colorScheme: isLight ? ('light' as const) : ('dark' as const)
                    }}
                  />
                </div>
              )}
              {doc?.sent && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'var(--accent-tint)',
                    color: 'var(--accent-primary)',
                    fontWeight: '600'
                  }}
                >
                  Sent
                </span>
              )}
            </div>
          </div>
          {/* Status badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              background: meta.badge,
              flexShrink: 0,
              fontSize: '0.7rem',
              fontWeight: '700',
              textTransform: 'uppercase' as const,
              color: meta.border
            }}
          >
            {status === 'compliant' && <CheckCircle size={11} />}
            {(status === 'missing' || status === 'expired' || status === 'expiring') && (
              <AlertCircle size={11} />
            )}
            {meta.label}
          </div>
        </div>

        {/* Expiry row — annual docs: P&I reference badge (read-only) + always-editable document date */}
        {hasFile && annualRenewal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {effectivePolicyExpiry && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '1px 7px',
                  borderRadius: '4px',
                  background: 'rgba(var(--accent-primary-rgb), 0.1)',
                  color: 'var(--accent-primary)',
                  border: '1px solid rgba(var(--accent-primary-rgb), 0.2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  alignSelf: 'flex-start'
                }}
              >
                P&I · {formatDate(effectivePolicyExpiry)}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={12} color="var(--text-secondary)" />
              <input
                type="date"
                value={editingExpiry[id] !== undefined ? editingExpiry[id] : doc?.expiryDate || ''}
                onFocus={() =>
                  setEditingExpiry((prev) => ({ ...prev, [id]: doc?.expiryDate || '' }))
                }
                onChange={(e) => setEditingExpiry((prev) => ({ ...prev, [id]: e.target.value }))}
                onBlur={async (e) => {
                  const val = e.target.value
                  setEditingExpiry((prev) => {
                    const n = { ...prev }
                    delete n[id]
                    return n
                  })
                  if (val !== (doc?.expiryDate || '')) await saveExpiry(id, name, val || null)
                }}
                min="1900-01-01"
                max="2100-12-31"
                style={{
                  fontSize: '0.78rem',
                  padding: '3px 6px',
                  borderRadius: '5px',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--input-border)',
                  colorScheme: isLight ? ('light' as const) : ('dark' as const)
                }}
              />
              {doc?.expiryDate && (
                <button
                  title="Clear expiry date"
                  onClick={() => void saveExpiry(id, name, null)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    padding: 0,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}
        {hasFile && !annualRenewal && (!doc?.expiryDate || doc.expiryDate === '0000-00-00') && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--success)',
                background: 'color-mix(in srgb, var(--success) 9%, transparent)',
                border: `1px solid ${'color-mix(in srgb, var(--success) 20%, transparent)'}`,
                borderRadius: '4px',
                padding: '1px 6px'
              }}
            >
              <CheckCircle size={10} /> No expiry
            </span>
            <Calendar size={12} color="var(--text-secondary)" />
            <input
              type="date"
              placeholder="Set expiry date"
              value={editingExpiry[id] !== undefined ? editingExpiry[id] : ''}
              onFocus={() => setEditingExpiry((prev) => ({ ...prev, [id]: '' }))}
              onChange={(e) => setEditingExpiry((prev) => ({ ...prev, [id]: e.target.value }))}
              onBlur={async (e) => {
                const val = e.target.value
                setEditingExpiry((prev) => {
                  const n = { ...prev }
                  delete n[id]
                  return n
                })
                // no-op if still empty (user focused without entering anything)
                if (val) await saveExpiry(id, name, val)
              }}
              min="1900-01-01"
              max="2100-12-31"
              style={{
                fontSize: '0.78rem',
                padding: '3px 6px',
                borderRadius: '5px',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--input-border)',
                colorScheme: isLight ? ('light' as const) : ('dark' as const)
              }}
            />
          </div>
        )}
        {hasFile && !annualRenewal && doc?.expiryDate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={12} color="var(--text-secondary)" />
            <input
              type="date"
              value={editingExpiry[id] !== undefined ? editingExpiry[id] : doc.expiryDate || ''}
              onFocus={() => setEditingExpiry((prev) => ({ ...prev, [id]: doc.expiryDate || '' }))}
              onChange={(e) => setEditingExpiry((prev) => ({ ...prev, [id]: e.target.value }))}
              onBlur={async (e) => {
                const val = e.target.value
                setEditingExpiry((prev) => {
                  const n = { ...prev }
                  delete n[id]
                  return n
                })
                if (val !== (doc.expiryDate || '')) await saveExpiry(id, name, val || null)
              }}
              min="1900-01-01"
              max="2100-12-31"
              style={{
                fontSize: '0.78rem',
                padding: '3px 6px',
                borderRadius: '5px',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--input-border)',
                colorScheme: isLight ? ('light' as const) : ('dark' as const)
              }}
            />
            <button
              title="Clear expiry date"
              onClick={() => void saveExpiry(id, name, null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '18px',
                height: '18px',
                padding: 0,
                borderRadius: '50%',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Action bar */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const }}
        >
          {!hasFile ? (
            hasPermission('documents:upload') ? (
              <button
                onClick={() => handleClickUpload(id)}
                disabled={uploadingId === id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: required ? '5px 14px' : '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: required ? '600' : '500',
                  cursor: uploadingId === id ? 'not-allowed' : 'pointer',
                  opacity: uploadingId === id ? 0.65 : 1,
                  background: required ? 'var(--accent-tint)' : 'transparent',
                  border: required
                    ? '1px solid var(--accent-border)'
                    : '1px dashed rgba(var(--accent-primary-rgb), 0.3)',
                  color: 'var(--accent-primary)'
                }}
              >
                {uploadingId === id ? (
                  <Loader2 size={12} className="spinner" />
                ) : (
                  <Upload size={12} />
                )}
                {uploadingId === id ? 'Uploading...' : 'Upload File'}
              </button>
            ) : null
          ) : hasFile && !fileExists ? (
            <>
              <MissingFilePath filePath={doc!.filePath} style={{ maxWidth: '320px' }} />
              {hasPermission('documents:upload') && (
                <button
                  onClick={() => handleClickUpload(id)}
                  className="btn-secondary"
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.78rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Replace with new file"
                >
                  <Upload size={13} /> Re-link
                </button>
              )}
              <button
                onClick={() => handleUnlinkFile(doc!)}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.78rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(255,77,77,0.08)',
                  border: '1px solid rgba(255,77,77,0.25)',
                  borderRadius: '6px',
                  color: 'var(--danger)',
                  cursor: 'pointer'
                }}
                title="Unlink file"
              >
                <Trash2 size={13} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={async () => {
                  console.log('[View] Opening:', doc!.filePath)
                  // fsOpen may resolve with an error object or a shell error string
                  const res: unknown = await window.api.fsOpen(doc!.filePath)
                  console.log('[View] Result:', res)
                  if (res && typeof res === 'object' && 'error' in res && res.error)
                    showError(
                      ('message' in res && typeof res.message === 'string' && res.message) ||
                        `Cannot open: ${doc!.filePath}`
                    )
                  else if (typeof res === 'string' && res) showError(`Failed to open: ${res}`)
                }}
                className="btn-secondary"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.78rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Open file"
              >
                <Eye size={13} /> View
              </button>
              {hasPermission('documents:upload') && (
                <button
                  onClick={() => handleClickUpload(id)}
                  disabled={uploadingId === id}
                  className="btn-secondary"
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.78rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Link a newer file in place of this one"
                >
                  <Upload size={13} /> Replace
                </button>
              )}
              <button
                onClick={() => window.api.shellShowItemInFolder(doc!.filePath)}
                className="btn-secondary"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.78rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Open file location"
              >
                <FolderOpen size={13} />
              </button>
              <button
                onClick={() => handleDuplicate(doc!)}
                className="btn-secondary"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.78rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Duplicate"
              >
                <Copy size={13} /> Copy
              </button>
              <button
                onClick={() => handleUnlinkFile(doc!)}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.78rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(255,77,77,0.08)',
                  border: '1px solid rgba(255,77,77,0.25)',
                  borderRadius: '6px',
                  color: 'var(--danger)',
                  cursor: 'pointer'
                }}
                title="Unlink file"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
          {(() => {
            const n = history.filter((h) => h.documentTypeId === id).length
            return n > 0 ? (
              <button
                onClick={() => setHistoryFor({ id, name })}
                className="btn-secondary"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.78rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Earlier files of this document"
              >
                <History size={13} /> History ({n})
              </button>
            ) : null
          })()}
          {!isCustom && (
            <button
              onClick={() => handleToggleRequired(id)}
              style={{
                marginLeft: 'auto',
                padding: '3px 8px',
                fontSize: '0.72rem',
                borderRadius: '6px',
                cursor: 'pointer',
                background: 'transparent',
                border: '1px solid var(--table-border)',
                color: 'var(--text-secondary)'
              }}
              title="Toggle required/optional"
            >
              {required ? 'Set Optional' : 'Set Required'}
            </button>
          )}
          {isCustom && (
            <button
              onClick={() => handleDeleteCustomType(id)}
              style={{
                marginLeft: 'auto',
                padding: '3px 8px',
                fontSize: '0.72rem',
                borderRadius: '6px',
                cursor: 'pointer',
                background: 'transparent',
                border: '1px solid rgba(255,77,77,0.3)',
                color: 'var(--danger)'
              }}
            >
              Remove Type
            </button>
          )}
        </div>
      </div>
    )
  }

  const requiredDocTypes = docTypes.filter((t) => {
    const d = vesselDocs.find((v) => v.documentTypeId === t.id)
    return d ? d.required : t.required
  })
  const optionalDocTypes = docTypes.filter((t) => {
    const d = vesselDocs.find((v) => v.documentTypeId === t.id)
    return !(d ? d.required : t.required)
  })

  const pctColor = pct === 100 ? 'var(--success)' : pct >= 70 ? 'var(--warning)' : 'var(--danger)'

  const sectionHeader = (title: string, count: number): React.JSX.Element => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px',
        marginTop: '4px'
      }}
    >
      <span
        style={{
          fontWeight: '700',
          fontSize: '0.85rem',
          color: 'var(--text-primary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: '0.72rem',
          padding: '2px 7px',
          borderRadius: '10px',
          background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)',
          color: 'var(--text-secondary)',
          fontWeight: '600'
        }}
      >
        {count}
      </span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
      {datesRequest && (
        <DocumentDatesModal
          request={datesRequest}
          onClose={() => setDatesRequest(null)}
          onSaved={loadData}
        />
      )}
      {historyFor && (
        <DocumentHistoryModal
          documentName={historyFor.name}
          entries={history.filter((h) => h.documentTypeId === historyFor.id)}
          canRestore={hasPermission('documents:upload')}
          onClose={() => setHistoryFor(null)}
          onRestored={loadData}
        />
      )}

      {/* P&I policy picker when multiple P&I policies exist */}
      {piPolicies.length > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 16px',
            background: 'rgba(var(--accent-primary-rgb), 0.06)',
            border: '1px solid rgba(var(--accent-primary-rgb), 0.15)',
            borderRadius: '8px',
            fontSize: '0.85rem'
          }}
        >
          <Info size={16} color="var(--accent-primary)" />
          <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            P&I policy for annual docs:
          </span>
          <select
            value={selectedPIPolicyId || ''}
            onChange={(e) => setPreferredPIPolicyId(e.target.value || undefined)}
            style={{
              flex: 1,
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--input-border)',
              maxWidth: '400px'
            }}
          >
            {piPolicies.map((pp) => (
              <option key={pp.policy.id} value={pp.policy.id}>
                {pp.policy.policyNumber || pp.policy.policyTypeName || 'P&I'} —{' '}
                {pp.endDate ? formatDate(pp.endDate) : 'No end date'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Compliance summary */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'stretch' }}>
        {[
          { label: 'Total Required', value: requiredDocs.length, color: 'var(--text-primary)' },
          { label: 'Compliant', value: compliantCount, color: 'var(--success)' },
          {
            label: 'Missing',
            value: missingCount,
            color: missingCount > 0 ? 'var(--danger)' : 'var(--text-secondary)'
          }
        ].map((s) => (
          <div
            key={s.label}
            style={{
              padding: '12px 20px',
              background: 'var(--bg-card)',
              borderRadius: '10px',
              border: cardBorder,
              textAlign: 'center',
              minWidth: '100px'
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: s.color }}>{s.value}</div>
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginTop: '2px'
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
        <div
          style={{
            flex: 1,
            minWidth: '160px',
            padding: '12px 20px',
            background: 'var(--bg-card)',
            borderRadius: '10px',
            border: cardBorder,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.4px'
              }}
            >
              Compliance Rate
            </span>
            <span style={{ fontWeight: '700', fontSize: '1rem', color: pctColor }}>{pct}%</span>
          </div>
          <div
            style={{
              height: '6px',
              borderRadius: '3px',
              background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                borderRadius: '3px',
                background: pctColor,
                transition: 'width 0.3s'
              }}
            />
          </div>
        </div>
      </div>

      {/* Status filter */}
      {(() => {
        const all = [
          ...requiredDocTypes.map((t) =>
            cardStatus(
              t.id,
              true,
              vesselDocs.find((d) => d.documentTypeId === t.id),
              t.annualRenewal
            )
          ),
          ...optionalDocTypes.map((t) =>
            cardStatus(
              t.id,
              false,
              vesselDocs.find((d) => d.documentTypeId === t.id),
              t.annualRenewal
            )
          ),
          ...customDocTypes.map((t) =>
            cardStatus(
              t.id,
              true,
              vesselDocs.find((d) => d.documentTypeId === t.id)
            )
          )
        ]
        const count = (s: string): number =>
          s === 'attention'
            ? all.filter((x) => x === 'missing' || x === 'expired' || x === 'expiring').length
            : all.filter((x) => x === s).length
        return (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {(
              [
                ['all', 'All'],
                ['attention', 'Needs attention'],
                ['missing', 'Missing'],
                ['expired', 'Expired'],
                ['expiring', 'Expiring'],
                ['compliant', 'Compliant']
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={statusFilter === key ? 'chip active' : 'chip'}
                aria-pressed={statusFilter === key}
                onClick={() => setStatusFilter(key)}
              >
                {label}
                {key !== 'all' && <span className="chip-count">{count(key)}</span>}
              </button>
            ))}
          </div>
        )
      })()}

      {/* Required documents */}
      {requiredDocTypes.length > 0 && (
        <div>
          {sectionHeader('Required Documents', requiredDocTypes.length)}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '10px'
            }}
          >
            {requiredDocTypes.map((t) => {
              const doc = vesselDocs.find((d) => d.documentTypeId === t.id)
              return renderCard(
                t.id,
                t.name,
                true,
                doc,
                null,
                false,
                t.annualRenewal,
                t.description
              )
            })}
          </div>
        </div>
      )}

      {/* Optional documents */}
      {optionalDocTypes.length > 0 && (
        <div>
          {sectionHeader('Optional Documents', optionalDocTypes.length)}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '10px'
            }}
          >
            {optionalDocTypes.map((t) => {
              const doc = vesselDocs.find((d) => d.documentTypeId === t.id)
              return renderCard(
                t.id,
                t.name,
                false,
                doc,
                null,
                false,
                t.annualRenewal,
                t.description
              )
            })}
          </div>
        </div>
      )}

      {/* Custom documents */}
      {(customDocTypes.length > 0 || showAddCustom) && (
        <div>
          {sectionHeader('Custom Documents', customDocTypes.length)}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '10px'
            }}
          >
            {customDocTypes.map((t) => {
              const doc = vesselDocs.find((d) => d.documentTypeId === t.id)
              const chip = (
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'color-mix(in srgb, var(--info) 15%, transparent)',
                    color: 'var(--info)',
                    fontWeight: '500'
                  }}
                >
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
        <form
          onSubmit={handleAddCustom}
          style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
        >
          <input
            type="text"
            value={newCustomName}
            onChange={(e) => setNewCustomName(e.target.value)}
            placeholder="Custom document name"
            autoFocus
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem'
            }}
          />
          <button
            type="submit"
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            Add
          </button>
          <button
            title="Cancel"
            aria-label="Cancel"
            type="button"
            onClick={() => {
              setShowAddCustom(false)
              setNewCustomName('')
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              padding: '8px'
            }}
          >
            <X size={16} />
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowAddCustom(true)}
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            background: 'transparent',
            border: `1px dashed ${'color-mix(in srgb, var(--text-primary) 20%, transparent)'}`,
            color: 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          <Plus size={14} /> Add Custom Document Type
        </button>
      )}
    </div>
  )
}
