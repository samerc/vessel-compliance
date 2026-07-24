import React, { useState, useEffect } from 'react'
import {
  Building2,
  User,
  Shield,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Loader2,
  Pencil,
  Save,
  Trash2,
  Upload,
  FolderOpen,
  Plus,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  UserCheck,
  Mail,
  Phone,
  Hash
} from 'lucide-react'
import {
  Entity,
  EntityUBO,
  SanctionsMatch,
  EntityAddress,
  EntityDocumentType,
  EntityDocument
} from '../../../shared/types'
import { OfacService } from '../services/OfacService'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import SanctionsModal from './SanctionsModal'
import { formatDateTime } from '../utils/dateUtils'
import { CaseToggleBtn } from './CaseToggle'
import { confirmDialog } from './DialogHost'

interface EntityEditPanelProps {
  /** The entity being edited (entity-level fields only — vessel-specific bits stay in the parent). */
  entityId: string
  /** Whether the current user may modify this entity (parent supplies its own permission gate). */
  canManage: boolean
  /** Called after any mutation so the parent can refresh its own aggregate lists / counts / badges. */
  onChanged: () => void
  /** Show the per-policy-type commission override editor (default true). */
  showCommissions?: boolean
}

/**
 * Shared entity editor used by BOTH the Entity Directory slide-in panel and the vessel
 * Assured tab panel, so the two surfaces stay identical. Self-contained: it loads its own
 * data for the given entity and calls `onChanged` after every mutation.
 *
 * Covers every ENTITY-LEVEL capability: core fields, sanctions, documents, addresses CRUD,
 * commission overrides, and full UBO management. Vessel-specific pieces (assured role,
 * assigning an address to the vessel_assured link) remain in the parent.
 */
export default function EntityEditPanel({
  entityId,
  canManage,
  onChanged,
  showCommissions = true
}: EntityEditPanelProps) {
  const { showError, showSuccess } = useToast()
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
  const { hasPermission } = useAuth()
  const canUploadDocs = hasPermission('documents:upload')
  const accentBg = isLight ? 'rgba(0,150,200,0.1)' : 'rgba(0,210,255,0.08)'

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [entities, setEntities] = useState<Entity[]>([])
  const [entity, setEntity] = useState<Entity | null>(null)
  const [docTypes, setDocTypes] = useState<EntityDocumentType[]>([])
  const [docs, setDocs] = useState<EntityDocument[]>([])
  const [addresses, setAddresses] = useState<EntityAddress[]>([])
  const [ubos, setUbos] = useState<EntityUBO[]>([])
  const [commissions, setCommissions] = useState<
    { policyTypeId: string; commissionPercent: number }[]
  >([])
  const [policyTypes, setPolicyTypes] = useState<{ id: string; name: string; code: string }[]>([])
  const [commDefaults, setCommDefaults] = useState<Record<string, number>>({})

  // ── Core fields edit ───────────────────────────────────────────────────────────
  const [editingCore, setEditingCore] = useState(false)
  const [form, setForm] = useState<{
    name: string
    type: 'company' | 'person'
    identifier: string
    email: string
    phone: string
  }>({ name: '', type: 'company', identifier: '', email: '', phone: '' })
  const [savingCore, setSavingCore] = useState(false)

  // ── Sanctions ───────────────────────────────────────────────────────────────────
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [sanctionsModal, setSanctionsModal] = useState<{
    show: boolean
    searchedName: string
    matches: SanctionsMatch[]
    entityId?: string
  }>({ show: false, searchedName: '', matches: [] })

  // ── Address ─────────────────────────────────────────────────────────────────────
  const [showAddAddress, setShowAddAddress] = useState(false)
  const [editingAddress, setEditingAddress] = useState<EntityAddress | null>(null)
  const [addrForm, setAddrForm] = useState({
    label: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    country: '',
    postalCode: ''
  })

  // ── UBO ───────────────────────────────────────────────────────────────────────
  const [newUBOName, setNewUBOName] = useState('')
  const [newUBOType, setNewUBOType] = useState<'company' | 'person'>('person')
  const [newUBOIdentifier, setNewUBOIdentifier] = useState('')
  const [newUBOEmail, setNewUBOEmail] = useState('')
  const [newUBOPhone, setNewUBOPhone] = useState('')
  const [selectedUBOId, setSelectedUBOId] = useState<string | null>(null)
  const [isAddingUBO, setIsAddingUBO] = useState(false)

  // ── Load ───────────────────────────────────────────────────────────────────────
  const loadEntityData = async () => {
    try {
      const [ents, dts, allDocs, addrs, allUbos] = await Promise.all([
        window.api.getEntities(),
        window.api.getEntityDocumentTypes(),
        window.api.getEntityDocuments(),
        window.api.getEntityAddresses(entityId),
        window.api.getEntityUBOs()
      ])
      const entList = Array.isArray(ents) ? ents : []
      setEntities(entList)
      setEntity(entList.find((e) => e.id === entityId) || null)
      setDocTypes(Array.isArray(dts) ? dts.filter((t: any) => t.isActive) : [])
      setDocs(Array.isArray(allDocs) ? allDocs : [])
      setAddresses(Array.isArray(addrs) ? addrs : [])
      setUbos(Array.isArray(allUbos) ? allUbos : [])
    } catch {
      /* ignore */
    }
    if (showCommissions) {
      try {
        const [co, pt, cd] = await Promise.all([
          window.api.commissionGetOverrides(entityId),
          window.api.getQuotationTypes(),
          window.api.commissionGetDefaults()
        ])
        setCommissions(
          Array.isArray(co)
            ? co.map((o: any) => ({
                policyTypeId: o.policyTypeId,
                commissionPercent: o.commissionPercent
              }))
            : []
        )
        if (Array.isArray(pt))
          setPolicyTypes(pt.map((t: any) => ({ id: t.id, name: t.name, code: t.code })))
        if (Array.isArray(cd)) {
          const m: Record<string, number> = {}
          for (const d of cd as any[]) m[d.policyTypeId] = d.commissionPercent
          setCommDefaults(m)
        }
      } catch {
        /* ignore */
      }
    }
  }

  useEffect(() => {
    setEditingCore(false)
    setShowAddAddress(false)
    setEditingAddress(null)
    setNewUBOName('')
    setSelectedUBOId(null)
    loadEntityData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId])

  // Reload the panel's own data AND notify the parent to refresh aggregate lists.
  const refresh = () => {
    loadEntityData()
    onChanged()
  }

  // ── Core field handlers ─────────────────────────────────────────────────────────
  const startEditCore = () => {
    if (!entity) return
    setForm({
      name: entity.name,
      type: entity.type,
      identifier: entity.identifier || '',
      email: entity.email || '',
      phone: entity.phone || ''
    })
    setEditingCore(true)
  }

  const handleSaveCore = async () => {
    if (!entity || !form.name.trim()) return
    setSavingCore(true)
    try {
      await window.api.updateEntity(entity.id, {
        name: form.name.trim(),
        type: form.type,
        identifier: form.identifier.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined
      })
      showSuccess('Entity updated')
      setEditingCore(false)
      refresh()
    } catch (e: any) {
      showError(e.message || 'Failed to update entity')
    } finally {
      setSavingCore(false)
    }
  }

  // ── Sanctions handlers ──────────────────────────────────────────────────────────
  const handleOfacRecheck = async (ent: Entity) => {
    setCheckingId(ent.id)
    try {
      const result = await OfacService.checkSanctions(ent.name)
      const autoMark = result.autoMarkCleanOnCheck ?? true
      if (result.status !== 'CLEARED' || autoMark) {
        await window.api.updateEntity(ent.id, {
          ofacCheckedAt: result.timestamp,
          ofacMatchFound: result.matchFound,
          ofacStatus: result.status
        })
        refresh()
      } else {
        showSuccess('Sanctions check complete: no matches found above threshold')
      }
      if (result.matchFound && result.matches.length > 0) {
        setSanctionsModal({
          show: true,
          searchedName: ent.name,
          matches: result.matches,
          entityId: ent.id
        })
      }
    } catch (error: any) {
      showError(error.message || 'Sanctions check failed. Please try again.')
    } finally {
      setCheckingId(null)
    }
  }

  const handleViewPotentialMatch = async (ent: Entity) => {
    setCheckingId(ent.id)
    try {
      const result = await OfacService.checkSanctions(ent.name)
      if (result.matches.length > 0) {
        setSanctionsModal({
          show: true,
          searchedName: ent.name,
          matches: result.matches,
          entityId: ent.id
        })
      }
    } catch (error: any) {
      showError(error.message || 'Failed to load sanctions data. Please try again.')
    } finally {
      setCheckingId(null)
    }
  }

  const handleMarkClean = async () => {
    if (sanctionsModal.entityId) {
      await window.api.updateEntity(sanctionsModal.entityId, {
        ofacStatus: 'CLEARED',
        ofacMatchFound: false
      })
    }
    setSanctionsModal({ show: false, searchedName: '', matches: [] })
    refresh()
  }

  const handleConfirmMatch = async () => {
    if (sanctionsModal.entityId) {
      await window.api.updateEntity(sanctionsModal.entityId, {
        ofacStatus: 'MATCH',
        ofacMatchFound: true
      })
    }
    setSanctionsModal({ show: false, searchedName: '', matches: [] })
    refresh()
  }

  // ── Document handlers ───────────────────────────────────────────────────────────
  const handleClickUploadDoc = async (eId: string, documentTypeId: string, label: string) => {
    try {
      const filePath = await window.api.dialogOpenFileAny()
      if (!filePath) return
      const validation = await window.api.fileTypesValidateFile(filePath)
      if (!validation.valid) {
        showError(`File rejected: ${validation.reason}`)
        return
      }
      await window.api.upsertEntityDocument({ entityId: eId, documentTypeId, filePath })
      showSuccess(`${label} uploaded successfully`)
      refresh()
    } catch (error: any) {
      showError(error.message || `Failed to upload ${label}`)
    }
  }

  const handleDropEntityDoc = async (e: React.DragEvent, eId: string, documentTypeId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer.files
    if (files.length === 0) return
    const filePath = window.api.getFilePath(files[0])
    if (!filePath) {
      showError('Could not retrieve file path')
      return
    }
    const validation = await window.api.fileTypesValidateFile(filePath)
    if (!validation.valid) {
      showError(`File rejected: ${validation.reason}`)
      return
    }
    await window.api.upsertEntityDocument({ entityId: eId, documentTypeId, filePath })
    showSuccess('Document uploaded successfully')
    refresh()
  }

  const handleDeleteDoc = async (eId: string, documentTypeId: string) => {
    try {
      await window.api.deleteEntityDocument(eId, documentTypeId)
      showSuccess('Document removed')
      refresh()
    } catch (error: any) {
      showError(error.message || 'Failed to remove document')
    }
  }

  // ── Address handlers ─────────────────────────────────────────────────────────────
  const resetAddrForm = () =>
    setAddrForm({
      label: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      country: '',
      postalCode: ''
    })

  const handleSaveAddress = async () => {
    if (!entity || !addrForm.label.trim() || !addrForm.addressLine1.trim()) return
    try {
      if (editingAddress) {
        await window.api.updateEntityAddress(editingAddress.id, {
          label: addrForm.label.trim(),
          addressLine1: addrForm.addressLine1.trim(),
          addressLine2: addrForm.addressLine2.trim() || undefined,
          city: addrForm.city.trim() || undefined,
          country: addrForm.country.trim() || undefined,
          postalCode: addrForm.postalCode.trim() || undefined
        })
        showSuccess('Address updated')
      } else {
        const res = await window.api.addEntityAddress({
          entityId: entity.id,
          label: addrForm.label.trim(),
          addressLine1: addrForm.addressLine1.trim(),
          addressLine2: addrForm.addressLine2.trim() || undefined,
          city: addrForm.city.trim() || undefined,
          country: addrForm.country.trim() || undefined,
          postalCode: addrForm.postalCode.trim() || undefined
        })
        if (res && (res as any).error) {
          showError((res as any).message || 'Failed to add')
          return
        }
        showSuccess('Address added')
      }
      setShowAddAddress(false)
      setEditingAddress(null)
      resetAddrForm()
      refresh()
    } catch (e: any) {
      showError(e.message || 'Failed to save address')
    }
  }

  const handleDeleteAddress = async (addrId: string) => {
    try {
      await window.api.deleteEntityAddress(addrId)
      showSuccess('Address deleted')
      refresh()
    } catch (e: any) {
      showError(e.message || 'Failed to delete address')
    }
  }

  const startEditAddress = (addr: EntityAddress) => {
    setEditingAddress(addr)
    setAddrForm({
      label: addr.label,
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2 || '',
      city: addr.city || '',
      country: addr.country || '',
      postalCode: addr.postalCode || ''
    })
    setShowAddAddress(true)
  }

  // ── UBO handlers ────────────────────────────────────────────────────────────────
  const handleAddUBO = async () => {
    if (!entity || !newUBOName.trim()) return
    setIsAddingUBO(true)
    try {
      let uboEntityId = selectedUBOId
      if (!uboEntityId) {
        const scan = await OfacService.checkSanctions(newUBOName)
        const created = await window.api.addEntity({
          name: newUBOName,
          type: newUBOType,
          identifier: newUBOIdentifier,
          email: newUBOEmail,
          phone: newUBOPhone,
          ofacCheckedAt: scan.timestamp,
          ofacMatchFound: scan.matchFound,
          ofacStatus: scan.status
        })
        uboEntityId = created.id
      }
      await window.api.addEntityUBO({ assuredEntityId: entity.id, uboEntityId })
      setNewUBOName('')
      setNewUBOType('person')
      setNewUBOIdentifier('')
      setNewUBOEmail('')
      setNewUBOPhone('')
      setSelectedUBOId(null)
      showSuccess('UBO added successfully')
      refresh()
    } catch (error: any) {
      showError(error.message || 'Failed to add UBO. Please try again.')
    } finally {
      setIsAddingUBO(false)
    }
  }

  const handleLinkExistingUBO = async (uboEntityId: string) => {
    if (!entity) return
    setIsAddingUBO(true)
    try {
      await window.api.addEntityUBO({ assuredEntityId: entity.id, uboEntityId })
      setNewUBOName('')
      setSelectedUBOId(null)
      showSuccess('UBO linked successfully')
      refresh()
    } catch (error: any) {
      showError(error.message || 'Failed to link UBO.')
    } finally {
      setIsAddingUBO(false)
    }
  }

  const handleDeleteUBO = async (uboEntityId: string) => {
    if (!entity) return
    const ok = await confirmDialog('Are you sure you want to remove this UBO?', {
      title: 'Remove UBO?'
    })
    if (!ok) return
    try {
      await window.api.deleteEntityUBO({ assuredEntityId: entity.id, uboEntityId })
      showSuccess('UBO removed successfully')
      refresh()
    } catch (error: any) {
      showError(error.message || 'Failed to remove UBO.')
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────────
  const selectedUbos = entity
    ? (ubos
        .filter((u) => u.assuredEntityId === entity.id)
        .map((u) => entities.find((e) => e.id === u.uboEntityId))
        .filter(Boolean) as Entity[])
    : []
  const uboLinkedIds = new Set(selectedUbos.map((u) => u.id))
  const matchingUBOs = entities
    .filter(
      (ent) =>
        newUBOName &&
        ent.id !== entityId &&
        !uboLinkedIds.has(ent.id) &&
        ent.name.toLowerCase().includes(newUBOName.toLowerCase())
    )
    .slice(0, 8)

  const getDocScore = (eId: string, entityType: string) => {
    const applicable = docTypes.filter(
      (t) => t.isRequired && (t.entityScope === 'both' || t.entityScope === entityType)
    )
    const have = applicable.filter((t) =>
      docs.some((d) => d.entityId === eId && d.documentTypeId === t.id && d.filePath)
    ).length
    return { have, total: applicable.length }
  }

  // ── Sub-components ──────────────────────────────────────────────────────────────
  const OfacBadge = ({ ent }: { ent: Entity }) => {
    const isChecking = checkingId === ent.id
    const isMatch = ent.ofacStatus === 'MATCH' || ent.ofacStatus === 'SANCTIONED'
    const isPotentialMatch = ent.ofacStatus === 'POTENTIAL_MATCH'
    const isError = ent.ofacStatus === 'ERROR'
    const isPending = !ent.ofacStatus || ent.ofacStatus === 'PENDING'

    if (isChecking) {
      return (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.68rem',
            background: isLight ? 'rgba(0,150,200,0.15)' : 'rgba(0,210,255,0.1)',
            border: isLight ? '1px solid rgba(0,150,200,0.4)' : '1px solid rgba(0,210,255,0.3)',
            color: isLight ? '#0077a3' : '#00d2ff'
          }}
        >
          <Loader2 size={11} className="spinner" /> CHECKING...
        </div>
      )
    }

    let config: { bg: string; border: string; color: string; text: string; icon: React.ReactNode }
    if (isPending) {
      config = {
        bg: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
        border: isLight ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.1)',
        color: 'var(--text-secondary)',
        text: 'NOT CHECKED',
        icon: <Shield size={11} opacity={0.5} />
      }
    } else if (isError) {
      config = {
        bg: isLight ? 'rgba(200,120,0,0.15)' : 'rgba(255,153,0,0.1)',
        border: isLight ? '1px solid rgba(200,120,0,0.4)' : '1px solid rgba(255,153,0,0.3)',
        color: isLight ? '#b36b00' : '#ff9900',
        text: 'CHECK FAILED',
        icon: <Shield size={11} />
      }
    } else if (isMatch) {
      config = {
        bg: isLight ? 'rgba(200,0,0,0.12)' : 'rgba(255,77,77,0.1)',
        border: isLight ? '1px solid rgba(200,0,0,0.35)' : '1px solid rgba(255,77,77,0.3)',
        color: 'var(--danger)',
        text: 'SANCTIONED',
        icon: <ShieldAlert size={11} />
      }
    } else if (isPotentialMatch) {
      config = {
        bg: isLight ? 'rgba(180,140,0,0.15)' : 'rgba(255,193,7,0.1)',
        border: isLight ? '1px solid rgba(180,140,0,0.4)' : '1px solid rgba(255,193,7,0.3)',
        color: isLight ? '#997a00' : '#ffc107',
        text: 'POSSIBLE MATCH',
        icon: <ShieldAlert size={11} />
      }
    } else {
      config = {
        bg: isLight ? 'rgba(0,140,70,0.12)' : 'rgba(0,255,136,0.1)',
        border: isLight ? '1px solid rgba(0,140,70,0.35)' : '1px solid rgba(0,255,136,0.3)',
        color: isLight ? '#008c46' : '#00ff88',
        text: 'CLEARED',
        icon: <ShieldCheck size={11} />
      }
    }

    const isClickable = isPotentialMatch || isMatch
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 7px',
          borderRadius: '4px',
          fontSize: '0.68rem',
          background: config.bg,
          border: config.border,
          color: config.color,
          cursor: isClickable ? 'pointer' : 'default',
          whiteSpace: 'nowrap'
        }}
        title={
          isError
            ? 'API request failed. Click refresh to retry.'
            : isClickable
              ? 'Click to review matches'
              : `Last checked: ${ent.ofacCheckedAt ? formatDateTime(ent.ofacCheckedAt) : 'Never'}`
        }
        onClick={(e) => {
          e.stopPropagation()
          if (isClickable) handleViewPotentialMatch(ent)
        }}
      >
        {config.icon}
        {config.text}
        <RefreshCw
          size={9}
          style={{ marginLeft: '3px', cursor: 'pointer', opacity: 0.55 }}
          className="hover-spin"
          onClick={(e) => {
            e.stopPropagation()
            handleOfacRecheck(ent)
          }}
        />
      </div>
    )
  }

  const DocRow = ({ ent }: { ent: Entity }) => {
    const applicable = docTypes.filter(
      (t) => t.entityScope === 'both' || t.entityScope === ent.type
    )
    const docsForEnt = docs.filter((d) => d.entityId === ent.id)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {applicable.map((dt) => {
          const doc = docsForEnt.find((d) => d.documentTypeId === dt.id)
          const hasFile = !!doc?.filePath
          return (
            <div
              key={dt.id}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={(ev) => handleDropEntityDoc(ev, ent.id, dt.id)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: hasFile
                  ? isLight
                    ? 'rgba(0,140,70,0.06)'
                    : 'rgba(0,255,136,0.04)'
                  : isLight
                    ? 'rgba(200,0,0,0.04)'
                    : 'rgba(255,77,77,0.04)',
                border: hasFile
                  ? isLight
                    ? '1px solid rgba(0,140,70,0.15)'
                    : '1px solid rgba(0,255,136,0.12)'
                  : isLight
                    ? '1px solid rgba(200,0,0,0.12)'
                    : '1px solid rgba(255,77,77,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {hasFile ? (
                <CheckCircle2 size={14} color={isLight ? '#008c46' : '#00ff88'} />
              ) : (
                <AlertTriangle size={14} color={isLight ? '#c00000' : '#ff4d4d'} />
              )}
              <span
                style={{
                  flex: 1,
                  fontSize: '0.82rem',
                  color: hasFile
                    ? isLight
                      ? '#008c46'
                      : 'rgba(0,255,136,0.85)'
                    : isLight
                      ? '#c00000'
                      : 'rgba(255,77,77,0.85)',
                  cursor: hasFile ? 'pointer' : 'default'
                }}
                onClick={hasFile ? () => window.api.fsOpen(doc!.filePath!) : undefined}
              >
                {dt.name}
              </span>
              {hasFile ? (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.api.shellShowItemInFolder(doc!.filePath!)
                    }}
                    className="btn-secondary"
                    style={{ padding: '3px 6px', fontSize: '0.68rem' }}
                    title="Open location"
                  >
                    <FolderOpen size={10} />
                  </button>
                  {canUploadDocs && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleClickUploadDoc(ent.id, dt.id, dt.name)
                      }}
                      className="btn-secondary"
                      style={{ padding: '3px 6px', fontSize: '0.68rem' }}
                      title="Replace"
                    >
                      <Upload size={10} />
                    </button>
                  )}
                  {canUploadDocs && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteDoc(ent.id, dt.id)
                      }}
                      className="btn-secondary"
                      style={{ padding: '3px 6px', fontSize: '0.68rem', color: 'var(--danger)' }}
                      title="Remove"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              ) : (
                canUploadDocs && (
                  <button
                    onClick={() => handleClickUploadDoc(ent.id, dt.id, dt.name)}
                    className="btn-secondary"
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.7rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <Upload size={10} /> Upload
                  </button>
                )
              )}
            </div>
          )
        })}
        {applicable.length === 0 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No document types for this entity.
          </div>
        )}
      </div>
    )
  }

  if (!entity) return null

  const sectionLabel: React.CSSProperties = {
    fontSize: '0.68rem',
    textTransform: 'uppercase',
    letterSpacing: '0.7px',
    color: 'var(--text-secondary)',
    fontWeight: 600
  }

  return (
    <div>
      {/* Core fields */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--table-border)' }}>
        {editingCore ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ ...sectionLabel, display: 'block', marginBottom: '4px' }}>
                Name *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', paddingRight: '44px' }}
                  placeholder="Entity name"
                />
                <CaseToggleBtn
                  value={form.name}
                  onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ ...sectionLabel, display: 'block', marginBottom: '4px' }}>
                  Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as any }))}
                  style={{ width: '100%', padding: '8px 10px' }}
                >
                  <option value="company">Company</option>
                  <option value="person">Person</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...sectionLabel, display: 'block', marginBottom: '4px' }}>
                  Identifier
                </label>
                <input
                  type="text"
                  value={form.identifier}
                  onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
                  style={{ width: '100%' }}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div>
              <label style={{ ...sectionLabel, display: 'block', marginBottom: '4px' }}>
                Email(s)
              </label>
              <input
                type="text"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                style={{ width: '100%' }}
                placeholder="Separate multiple with commas"
              />
            </div>
            <div>
              <label style={{ ...sectionLabel, display: 'block', marginBottom: '4px' }}>
                Phone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                style={{ width: '100%' }}
                placeholder="Phone number"
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleSaveCore}
                disabled={!form.name.trim() || savingCore}
                className="btn-primary"
                style={{
                  padding: '6px 16px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {savingCore ? <Loader2 size={13} className="spinner" /> : <Save size={13} />} Save
              </button>
              <button
                onClick={() => setEditingCore(false)}
                className="btn-secondary"
                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                {entity.type === 'company' ? (
                  <Building2 size={16} color="var(--accent-primary)" />
                ) : (
                  <User size={16} color="var(--accent-primary)" />
                )}
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {entity.name}
                </span>
              </div>
              {canManage && (
                <button
                  onClick={startEditCore}
                  className="btn-secondary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Pencil size={12} /> Edit
                </button>
              )}
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                textTransform: 'capitalize'
              }}
            >
              {entity.type}
              {entity.identifier ? ` · ${entity.identifier}` : ''}
            </div>
            {(entity.email || entity.phone) && (
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px'
                }}
              >
                {entity.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={12} color="var(--text-secondary)" />
                    <span style={{ color: 'var(--accent-primary)' }}>{entity.email}</span>
                  </div>
                )}
                {entity.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={12} color="var(--text-secondary)" />
                    <span>{entity.phone}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sanctions */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--table-border)' }}>
        <OfacBadge ent={entity} />
      </div>

      {/* Documents */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--table-border)' }}>
        <div style={{ ...sectionLabel, marginBottom: '10px' }}>Documents</div>
        <DocRow ent={entity} />
      </div>

      {/* Commission overrides */}
      {showCommissions && policyTypes.length > 0 && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--table-border)' }}>
          <div style={{ ...sectionLabel, marginBottom: '10px' }}>Commission Rates</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {policyTypes.map((pt) => {
              const override = commissions.find((c) => c.policyTypeId === pt.id)
              const defaultVal = commDefaults[pt.id]
              return (
                <div key={pt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      minWidth: '80px'
                    }}
                  >
                    {pt.code || pt.name}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    disabled={!canManage}
                    value={override?.commissionPercent ?? ''}
                    placeholder={defaultVal != null ? `${defaultVal}%` : '—'}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val)) {
                        setCommissions((prev) => {
                          const existing = prev.find((c) => c.policyTypeId === pt.id)
                          if (existing)
                            return prev.map((c) =>
                              c.policyTypeId === pt.id ? { ...c, commissionPercent: val } : c
                            )
                          return [...prev, { policyTypeId: pt.id, commissionPercent: val }]
                        })
                      }
                    }}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val)) {
                        window.api.commissionSetOverride(entity.id, pt.id, val).catch(() => {})
                      } else if (e.target.value === '' && override) {
                        window.api
                          .commissionDeleteOverride(entity.id, pt.id)
                          .then(() => {
                            setCommissions((prev) => prev.filter((c) => c.policyTypeId !== pt.id))
                          })
                          .catch(() => {})
                      }
                    }}
                    style={{
                      width: '70px',
                      padding: '4px 6px',
                      textAlign: 'right',
                      fontSize: '0.82rem',
                      borderRadius: '4px',
                      border: '1px solid var(--input-border)',
                      background: 'transparent',
                      color: 'var(--text-primary)'
                    }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>%</span>
                  {override && (
                    <span
                      style={{
                        fontSize: '0.6rem',
                        padding: '1px 4px',
                        borderRadius: '3px',
                        background: 'rgba(0,170,200,0.1)',
                        color: 'var(--accent-primary)'
                      }}
                    >
                      override
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <p
            style={{
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              marginTop: '6px',
              marginBottom: 0
            }}
          >
            Clear a field to use the default rate. Set a value to override for this customer.
          </p>
        </div>
      )}

      {/* Addresses */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--table-border)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px'
          }}
        >
          <div style={sectionLabel}>
            Addresses
            {addresses.length > 0 && (
              <span
                style={{
                  marginLeft: '6px',
                  padding: '1px 6px',
                  borderRadius: '8px',
                  background: accentBg,
                  color: 'var(--accent-primary)',
                  fontWeight: 700,
                  fontSize: '0.65rem'
                }}
              >
                {addresses.length}
              </span>
            )}
          </div>
          {canManage && (
            <button
              onClick={() => {
                resetAddrForm()
                setEditingAddress(null)
                setShowAddAddress(!showAddAddress)
              }}
              className="btn-secondary"
              style={{
                padding: '3px 8px',
                fontSize: '0.72rem',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <Plus size={12} /> Add
            </button>
          )}
        </div>

        {showAddAddress && (
          <div
            style={{
              background: isLight ? '#f0f4f8' : 'rgba(255,255,255,0.04)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '10px',
              border: '1px solid var(--table-border)'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                placeholder="Label (e.g. Registered Office) *"
                value={addrForm.label}
                onChange={(e) => setAddrForm((p) => ({ ...p, label: e.target.value }))}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--input-border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
              />
              <textarea
                placeholder="Paste or type full address *"
                value={addrForm.addressLine1}
                onChange={(e) => setAddrForm((p) => ({ ...p, addressLine1: e.target.value }))}
                rows={3}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--input-border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <button
                  onClick={handleSaveAddress}
                  disabled={!addrForm.label.trim() || !addrForm.addressLine1.trim()}
                  className="btn-primary"
                  style={{
                    padding: '5px 14px',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Save size={12} /> {editingAddress ? 'Update' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setShowAddAddress(false)
                    setEditingAddress(null)
                    resetAddrForm()
                  }}
                  className="btn-secondary"
                  style={{ padding: '5px 14px', fontSize: '0.78rem' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {addresses.length === 0 && !showAddAddress ? (
          <div
            style={{
              textAlign: 'center',
              padding: '12px 0',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              opacity: 0.6
            }}
          >
            <MapPin size={20} style={{ opacity: 0.3, display: 'block', margin: '0 auto 4px' }} />
            No addresses
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {addresses.map((addr) => (
              <div
                key={addr.id}
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: isLight ? '#f8f9fb' : 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--table-border)',
                  fontSize: '0.8rem'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '3px'
                  }}
                >
                  <span
                    style={{ fontWeight: 600, color: 'var(--accent-primary)', fontSize: '0.75rem' }}
                  >
                    {addr.label}
                  </span>
                  {canManage && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => startEditAddress(addr)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          padding: '2px'
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteAddress(addr.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--danger)',
                          padding: '2px'
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
                <div
                  style={{ color: 'var(--text-primary)', lineHeight: 1.4, whiteSpace: 'pre-line' }}
                >
                  {addr.addressLine1}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* UBOs */}
      <div style={{ padding: '16px 20px' }}>
        <div
          style={{
            ...sectionLabel,
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <UserCheck size={12} /> Ultimate Beneficial Owners ({selectedUbos.length})
        </div>

        {selectedUbos.map((ubo) => {
          const uboScore = getDocScore(ubo.id, ubo.type)
          return (
            <div
              key={ubo.id}
              style={{
                marginBottom: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                border: '1px solid var(--table-border)'
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}
              >
                {ubo.type === 'company' ? (
                  <Building2 size={14} opacity={0.5} />
                ) : (
                  <User size={14} opacity={0.5} />
                )}
                <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>{ubo.name}</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color:
                      uboScore.have === uboScore.total
                        ? isLight
                          ? '#008c46'
                          : '#00c264'
                        : isLight
                          ? '#c00000'
                          : '#ff4d4d'
                  }}
                >
                  <Hash size={9} style={{ opacity: 0.5 }} />
                  {uboScore.have}/{uboScore.total}
                </span>
                {canManage && (
                  <button
                    onClick={() => handleDeleteUBO(ubo.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      padding: '2px'
                    }}
                    className="hover-danger"
                    title="Remove UBO"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <OfacBadge ent={ubo} />
              <div style={{ marginTop: '8px' }}>
                <DocRow ent={ubo} />
              </div>
            </div>
          )
        })}

        {selectedUbos.length === 0 && (
          <div
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.82rem',
              fontStyle: 'italic',
              marginBottom: '12px'
            }}
          >
            No UBOs listed.
          </div>
        )}

        {/* Add UBO form */}
        {canManage && (
          <div
            style={{
              marginTop: '8px',
              padding: '10px',
              borderRadius: '8px',
              border: '1px dashed var(--table-border)'
            }}
          >
            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type="text"
                  value={newUBOName}
                  onChange={(e) => {
                    setNewUBOName(e.target.value)
                    setSelectedUBOId(null)
                  }}
                  placeholder="UBO Name..."
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.8rem' }}
                />
                {newUBOName && !selectedUBOId && matchingUBOs.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 100,
                      marginTop: '4px',
                      padding: '6px',
                      maxHeight: '150px',
                      overflowY: 'auto',
                      background: isLight ? '#ffffff' : '#1e222a',
                      border: '1px solid var(--accent-primary)',
                      borderRadius: '8px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                    }}
                  >
                    {matchingUBOs.map((ent) => (
                      <div
                        key={ent.id}
                        onClick={() => handleLinkExistingUBO(ent.id)}
                        style={{
                          padding: '5px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}
                        className="hover-effect"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {ent.type === 'company' ? (
                            <Building2 size={11} opacity={0.5} />
                          ) : (
                            <User size={11} opacity={0.5} />
                          )}
                          <span>{ent.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!selectedUBOId && (
                <select
                  value={newUBOType}
                  onChange={(e) => setNewUBOType(e.target.value as any)}
                  style={{
                    width: '90px',
                    padding: '6px',
                    fontSize: '0.78rem',
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="person">Person</option>
                  <option value="company">Company</option>
                </select>
              )}
            </div>
            {!selectedUBOId && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <input
                  type="text"
                  value={newUBOIdentifier}
                  onChange={(e) => setNewUBOIdentifier(e.target.value)}
                  placeholder="Identifier..."
                  style={{ flex: 1, padding: '6px 10px', fontSize: '0.78rem' }}
                />
              </div>
            )}
            {!selectedUBOId && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <input
                  type="email"
                  value={newUBOEmail}
                  onChange={(e) => setNewUBOEmail(e.target.value)}
                  placeholder="Email..."
                  style={{ flex: 1, padding: '6px 10px', fontSize: '0.78rem' }}
                />
                <input
                  type="text"
                  value={newUBOPhone}
                  onChange={(e) => setNewUBOPhone(e.target.value)}
                  placeholder="Phone..."
                  style={{ flex: 1, padding: '6px 10px', fontSize: '0.78rem' }}
                />
              </div>
            )}
            <button
              onClick={handleAddUBO}
              className="btn-primary"
              disabled={isAddingUBO || !newUBOName.trim()}
              style={{
                width: '100%',
                padding: '6px',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {isAddingUBO ? <Loader2 size={14} className="spinner" /> : <Plus size={14} />}
              {isAddingUBO ? 'Adding...' : selectedUBOId ? 'Link UBO' : 'Add UBO'}
            </button>
          </div>
        )}
      </div>

      {sanctionsModal.show && (
        <SanctionsModal
          searchedName={sanctionsModal.searchedName}
          matches={sanctionsModal.matches}
          onClose={() => setSanctionsModal({ show: false, searchedName: '', matches: [] })}
          onMarkClean={handleMarkClean}
          onConfirmMatch={handleConfirmMatch}
        />
      )}
    </div>
  )
}
