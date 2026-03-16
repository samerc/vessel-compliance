import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search, User, Ship, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Shield, Building2, ShieldCheck, ShieldAlert, RefreshCw, Loader2, Pencil, X,
  Save, Trash2, Mail, Phone, AlertTriangle, CheckCircle2, Hash, Plus, Upload, Merge, Link2,
  ScanSearch, MapPin
} from 'lucide-react'
import { Entity, EntityQueryParams, Vessel, VesselAssured, EntityUBO, SanctionsMatch, EntityAddress } from '../../../shared/types'
import { CaseToggleBtn } from './CaseToggle'

function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}
import { OfacService } from '../services/OfacService'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import SanctionsModal from './SanctionsModal'
import VesselDetail from './VesselDetail'
import ConfirmationModal from './ConfirmationModal'
import { exportCustomerCompliancePDF } from './CustomerComplianceReport'
import { formatDateTime } from '../utils/dateUtils'

function jaroWinkler(s1: string, s2: string): number {
  s1 = s1.toLowerCase().trim()
  s2 = s2.toLowerCase().trim()
  if (s1 === s2) return 1
  const len1 = s1.length, len2 = s2.length
  if (len1 === 0 || len2 === 0) return 0
  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0)
  const s1m = new Array(len1).fill(false)
  const s2m = new Array(len2).fill(false)
  let matches = 0
  for (let i = 0; i < len1; i++) {
    const lo = Math.max(0, i - matchDist)
    const hi = Math.min(i + matchDist + 1, len2)
    for (let j = lo; j < hi; j++) {
      if (s2m[j] || s1[i] !== s2[j]) continue
      s1m[i] = s2m[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0
  let t = 0, k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1m[i]) continue
    while (!s2m[k]) k++
    if (s1[i] !== s2[k]) t++
    k++
  }
  const jaro = (matches / len1 + matches / len2 + (matches - t / 2) / matches) / 3
  let prefix = 0
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }
  return jaro + prefix * 0.1 * (1 - jaro)
}

export default function EntityDirectory() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [allEntities, setAllEntities] = useState<Entity[]>([])
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [vesselAssureds, setVesselAssureds] = useState<VesselAssured[]>([])
  const [entityUBOs, setEntityUBOs] = useState<EntityUBO[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [viewingVessel, setViewingVessel] = useState<Vessel | null>(null)
  const [entityAddresses, setEntityAddresses] = useState<EntityAddress[]>([])
  const [showAddAddress, setShowAddAddress] = useState(false)
  const [editingAddress, setEditingAddress] = useState<EntityAddress | null>(null)
  const [addrForm, setAddrForm] = useState({ label: '', addressLine1: '', addressLine2: '', city: '', country: '', postalCode: '' })
  const { showError, showSuccess } = useToast()
  const { theme } = useTheme()
  const { hasPermission } = useAuth()
  const isLight = theme !== 'dark'

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const [viewMode, setViewMode] = useState<'all' | 'customers'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'company' | 'person'>('all')
  const [ofacStatusFilter, setOfacStatusFilter] = useState<string>('all')

  const debouncedSearch = useDebounceValue(searchTerm, 500)

  const [checkingId, setCheckingId] = useState<string | null>(null)

  const [sanctionsModal, setSanctionsModal] = useState<{
    show: boolean
    searchedName: string
    matches: SanctionsMatch[]
    entityId?: string
    vesselId?: string
  }>({ show: false, searchedName: '', matches: [] })

  const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; type: 'company' | 'person'; identifier: string; email: string; phone: string }>({ name: '', type: 'company', identifier: '', email: '', phone: '' })
  const [isSaving, setIsSaving] = useState(false)

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    show: boolean
    entity: Entity | null
    message: string
  }>({ show: false, entity: null, message: '' })

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', type: 'company' as 'company' | 'person', identifier: '', email: '', phone: '' })
  const [isCreating, setIsCreating] = useState(false)

  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeSource, setMergeSource] = useState<Entity | null>(null)
  const [mergeTarget, setMergeTarget] = useState<Entity | null>(null)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeKeepName, setMergeKeepName] = useState<'source' | 'target'>('target')
  const [isMerging, setIsMerging] = useState(false)
  const [allEntitiesForMerge, setAllEntitiesForMerge] = useState<Entity[]>([])
  const [exportingCompliance, setExportingCompliance] = useState(false)

  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false)
  const [dupThreshold, setDupThreshold] = useState(85)

  const openMergeModal = async (entity: Entity) => {
    setMergeSource(entity)
    setMergeTarget(null)
    setMergeSearch('')
    setMergeKeepName('target')
    const all = await window.api.getEntities()
    setAllEntitiesForMerge(all.filter(e => e.id !== entity.id))
    setShowMergeModal(true)
  }

  const mergeSearchResults = useMemo(() => {
    if (!mergeSearch.trim()) return []
    return allEntitiesForMerge
      .filter(e => e.name.toLowerCase().includes(mergeSearch.toLowerCase()))
      .slice(0, 20)
  }, [mergeSearch, allEntitiesForMerge])

  const duplicatePairs = useMemo(() => {
    if (!showDuplicatesModal) return []
    const threshold = dupThreshold / 100
    const pairs: { a: Entity; b: Entity; score: number }[] = []
    for (let i = 0; i < allEntities.length; i++) {
      for (let j = i + 1; j < allEntities.length; j++) {
        const score = jaroWinkler(allEntities[i].name, allEntities[j].name)
        if (score >= threshold) pairs.push({ a: allEntities[i], b: allEntities[j], score })
      }
    }
    return pairs.sort((x, y) => y.score - x.score)
  }, [allEntities, showDuplicatesModal, dupThreshold])

  const handleMerge = async () => {
    if (!mergeSource || !mergeTarget) return
    setIsMerging(true)
    try {
      const keepName = mergeKeepName === 'source' ? mergeSource.name : mergeTarget.name
      const result = await window.api.mergeEntities(mergeSource.id, mergeTarget.id, keepName)
      showSuccess(`Merged successfully. Reassigned ${result.mergedAssuredLinks} assured links, ${result.mergedUBOLinks} UBO links, ${result.mergedCustomerLinks} customer links.`)
      setShowMergeModal(false)
      setMergeSource(null)
      setMergeTarget(null)
      setSelectedEntity(null)
      loadData()
    } catch (error: any) {
      showError(error.message || 'Failed to merge entities')
    } finally {
      setIsMerging(false)
    }
  }

  const startEditing = (entity: Entity) => {
    setEditingEntity(entity)
    setEditForm({
      name: entity.name,
      type: entity.type,
      identifier: entity.identifier || '',
      email: entity.email || '',
      phone: entity.phone || ''
    })
  }

  const handleSaveEdit = async () => {
    if (!editingEntity || !editForm.name.trim()) return
    setIsSaving(true)
    try {
      await window.api.updateEntity(editingEntity.id, {
        name: editForm.name.trim(),
        type: editForm.type,
        identifier: editForm.identifier.trim() || undefined,
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined
      })
      setEditingEntity(null)
      setSelectedEntity(prev => prev?.id === editingEntity.id ? { ...prev, ...editForm, name: editForm.name.trim(), identifier: editForm.identifier.trim() || undefined, email: editForm.email.trim() || undefined, phone: editForm.phone.trim() || undefined } : prev)
      loadData()
    } catch (error: any) {
      showError(error.message || 'Failed to update entity')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteEntity = async (entity: Entity) => {
    const assocVessels = getAssociatedVessels(entity.id)
    const message = assocVessels.length > 0
      ? `This entity is linked to ${assocVessels.length} vessel(s). Deleting it will remove all assured links. Continue?`
      : `Delete entity "${entity.name}"? This cannot be undone.`
    setDeleteConfirmation({ show: true, entity, message })
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation.entity) return
    try {
      await window.api.deleteEntity(deleteConfirmation.entity.id)
      if (selectedEntity?.id === deleteConfirmation.entity.id) setSelectedEntity(null)
      showSuccess(`Entity "${deleteConfirmation.entity.name}" deleted`)
      loadData()
    } catch (error: any) {
      showError(error.message || 'Failed to delete entity')
    } finally {
      setDeleteConfirmation({ show: false, entity: null, message: '' })
    }
  }

  const handleCreateEntity = async () => {
    if (!createForm.name.trim()) return
    setIsCreating(true)
    try {
      const newEntity = await window.api.addEntity({
        name: createForm.name.trim(),
        type: createForm.type,
        identifier: createForm.identifier.trim() || undefined,
        email: createForm.email.trim() || undefined,
        phone: createForm.phone.trim() || undefined
      })
      setShowCreateModal(false)
      setCreateForm({ name: '', type: 'company', identifier: '', email: '', phone: '' })
      showSuccess('Entity created. Checking sanctions...')
      loadData()
      try {
        const entityId = newEntity?.id
        if (entityId) {
          setCheckingId(entityId)
          const entityName = createForm.name.trim()
          const result = await OfacService.checkSanctions(entityName)
          await window.api.updateEntity(entityId, {
            ofacCheckedAt: result.timestamp,
            ofacMatchFound: result.matchFound,
            ofacStatus: result.status
          })
          loadData()
          if (result.matchFound && result.matches.length > 0) {
            setSanctionsModal({ show: true, searchedName: entityName, matches: result.matches, entityId })
          }
          setCheckingId(null)
        }
      } catch {
        setCheckingId(null)
      }
    } catch (error: any) {
      showError(error.message || 'Failed to create entity')
    } finally {
      setIsCreating(false)
    }
  }

  const handleUploadEntityDoc = async (entityId: string, field: string) => {
    try {
      const filePath = await window.api.dialogOpenFileAny()
      if (!filePath) return
      await window.api.updateEntity(entityId, { [field]: filePath })
      showSuccess('Document uploaded')
      setSelectedEntity(prev => prev?.id === entityId ? { ...prev, [field]: filePath } : prev)
      loadData()
    } catch (error: any) {
      showError(error.message || 'Failed to upload document')
    }
  }

  const handleDeleteEntityDoc = async (entityId: string, field: string) => {
    try {
      await window.api.updateEntity(entityId, { [field]: null })
      showSuccess('Document removed')
      setSelectedEntity(prev => prev?.id === entityId ? { ...prev, [field]: undefined } : prev)
      loadData()
    } catch (error: any) {
      showError(error.message || 'Failed to remove document')
    }
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [result, v, va, eu, allEnts] = await Promise.all([
        window.api.getEntitiesPaginated({
          page,
          limit,
          search: debouncedSearch,
          type: typeFilter,
          ofacStatus: ofacStatusFilter as EntityQueryParams['ofacStatus'],
          customersOnly: viewMode === 'customers' ? true : undefined
        }),
        window.api.getVessels(),
        window.api.getVesselAssureds(),
        window.api.getEntityUBOs(),
        window.api.getEntities()
      ])
      setEntities(Array.isArray(result?.data) ? result.data : [])
      setTotal(result?.total ?? 0)
      setTotalPages(result?.totalPages ?? 1)
      setVessels(Array.isArray(v) ? v : [])
      setVesselAssureds(Array.isArray(va) ? va : [])
      setEntityUBOs(Array.isArray(eu) ? eu : [])
      setAllEntities(Array.isArray(allEnts) ? allEnts : [])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [page, limit, debouncedSearch, typeFilter, ofacStatusFilter, viewMode])
  useEffect(() => { setPage(1) }, [debouncedSearch, typeFilter, ofacStatusFilter, limit, viewMode])

  // Escape key — close topmost open modal first (priority order: sanctions > merge > create > edit)
  const handleGlobalEscape = useCallback(() => {
    if (sanctionsModal.show) { setSanctionsModal(prev => ({ ...prev, show: false })); return }
    if (showMergeModal) { setShowMergeModal(false); return }
    if (showCreateModal) { setShowCreateModal(false); return }
    if (editingEntity) { setEditingEntity(null); return }
  }, [sanctionsModal.show, showMergeModal, showCreateModal, editingEntity])

  useEffect(() => {
    const anyOpen = sanctionsModal.show || showMergeModal || showCreateModal || !!editingEntity
    if (!anyOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleGlobalEscape() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [sanctionsModal.show, showMergeModal, showCreateModal, editingEntity, handleGlobalEscape])

  const [hasInitialized, setHasInitialized] = useState(false)
  useEffect(() => {
    if (hasInitialized) {
      setSelectedEntity(null)
    } else {
      setHasInitialized(true)
    }
  }, [page])

  // ── Pre-built index Maps (rebuilt only when source data changes) ─────────────

  // assuredsByEntity[entityId] = all VesselAssured rows for that entity
  const assuredsByEntity = useMemo(() => {
    const m = new Map<string, VesselAssured[]>()
    for (const va of vesselAssureds) {
      if (!m.has(va.entityId)) m.set(va.entityId, [])
      m.get(va.entityId)!.push(va)
    }
    return m
  }, [vesselAssureds])

  // uboParentIds[uboEntityId] = list of assured entity IDs that claim this UBO
  const uboParentIds = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const eu of entityUBOs) {
      if (!m.has(eu.uboEntityId)) m.set(eu.uboEntityId, [])
      m.get(eu.uboEntityId)!.push(eu.assuredEntityId)
    }
    return m
  }, [entityUBOs])

  // vesselCountByEntity[entityId] = count of unique vessel IDs (direct + via UBO)
  const vesselCountByEntity = useMemo(() => {
    const m = new Map<string, number>()
    for (const [entityId, directLinks] of assuredsByEntity) {
      const directIds = new Set(directLinks.map(l => l.vesselId))
      const parentIds = uboParentIds.get(entityId) || []
      for (const parentId of parentIds) {
        for (const va of assuredsByEntity.get(parentId) || []) {
          directIds.add(va.vesselId)
        }
      }
      m.set(entityId, directIds.size)
    }
    return m
  }, [assuredsByEntity, uboParentIds])

  // ── Data helpers ────────────────────────────────────────────────────────────

  const getAssociatedVessels = (entityId: string) => {
    const directLinks = assuredsByEntity.get(entityId) || []
    const parentIds = uboParentIds.get(entityId) || []
    const indirectLinks = parentIds.flatMap(pid => assuredsByEntity.get(pid) || [])
    const vesselIds = new Set([...directLinks.map(l => l.vesselId), ...indirectLinks.map(l => l.vesselId)])
    return vessels.filter(v => vesselIds.has(v.id)).map(v => {
      const roles = [...new Set(directLinks.filter(l => l.vesselId === v.id).map(l => l.role))]
      const viaAssureds = indirectLinks.filter(l => l.vesselId === v.id).map(l => {
        const assured = allEntities.find(e => e.id === l.entityId)
        return `${assured?.name ?? '?'} (${l.role})`
      })
      return { ...v, roles, viaAssureds }
    })
  }

  const getVesselCount = (entityId: string) => vesselCountByEntity.get(entityId) ?? 0

  const getParentCompanies = (entityId: string): Entity[] => {
    return (uboParentIds.get(entityId) || [])
      .map(pid => allEntities.find(e => e.id === pid))
      .filter((e): e is Entity => !!e)
  }

  const getDocScore = (entity: Entity) => {
    if (entity.type === 'person') {
      return { have: entity.passportFilePath ? 1 : 0, total: 1 }
    }
    const have = [entity.certificateOfIncorporationPath, entity.articlesOfAssociationPath, entity.kycFilePath]
      .filter(Boolean).length
    return { have, total: 3 }
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const companyCount = useMemo(() => allEntities.filter(e => e.type === 'company').length, [allEntities])
  const personCount = useMemo(() => allEntities.filter(e => e.type === 'person').length, [allEntities])

  // ── OFAC handlers ───────────────────────────────────────────────────────────
  const handleOfacRecheck = async (entity: Entity) => {
    setCheckingId(entity.id)
    try {
      const result = await OfacService.checkSanctions(entity.name)
      const autoMark = result.autoMarkCleanOnCheck ?? true
      if (result.status !== 'CLEARED' || autoMark) {
        await window.api.updateEntity(entity.id, {
          ofacCheckedAt: result.timestamp,
          ofacMatchFound: result.matchFound,
          ofacStatus: result.status
        })
        loadData()
      } else {
        showSuccess('Sanctions check complete: no matches found above threshold')
      }
      if (result.matchFound && result.matches.length > 0) {
        setSanctionsModal({ show: true, searchedName: entity.name, matches: result.matches, entityId: entity.id })
      }
    } catch (error: any) {
      showError(error.message || 'Sanctions check failed. Please try again.')
    } finally {
      setCheckingId(null)
    }
  }

  const handleVesselOfacRecheck = async (vessel: Vessel) => {
    setCheckingId(vessel.id)
    try {
      const result = await OfacService.checkSanctions(vessel.name)
      const autoMark = result.autoMarkCleanOnCheck ?? true
      if (result.status !== 'CLEARED' || autoMark) {
        await window.api.updateVessel(vessel.id, {
          ofacCheckedAt: result.timestamp,
          ofacMatchFound: result.matchFound,
          ofacStatus: result.status
        })
        loadData()
      } else {
        showSuccess('Sanctions check complete: no matches found above threshold')
      }
      if (result.matchFound && result.matches.length > 0) {
        setSanctionsModal({ show: true, searchedName: vessel.name, matches: result.matches, vesselId: vessel.id })
      }
    } catch (error: any) {
      showError(error.message || 'Sanctions check failed. Please try again.')
    } finally {
      setCheckingId(null)
    }
  }

  const handleMarkClean = async () => {
    if (sanctionsModal.entityId) {
      await window.api.updateEntity(sanctionsModal.entityId, { ofacStatus: 'CLEARED', ofacMatchFound: false })
    } else if (sanctionsModal.vesselId) {
      await window.api.updateVessel(sanctionsModal.vesselId, { ofacStatus: 'CLEARED', ofacMatchFound: false })
    }
    setSanctionsModal({ show: false, searchedName: '', matches: [] })
    loadData()
  }

  const handleConfirmMatch = async () => {
    if (sanctionsModal.entityId) {
      await window.api.updateEntity(sanctionsModal.entityId, { ofacStatus: 'MATCH', ofacMatchFound: true })
    } else if (sanctionsModal.vesselId) {
      await window.api.updateVessel(sanctionsModal.vesselId, { ofacStatus: 'MATCH', ofacMatchFound: true })
    }
    setSanctionsModal({ show: false, searchedName: '', matches: [] })
    loadData()
  }

  const handleViewPotentialMatch = async (entity?: Entity, vessel?: Vessel) => {
    const id = entity?.id || vessel?.id
    const name = entity?.name || vessel?.name || ''
    if (id) setCheckingId(id)
    try {
      const result = await OfacService.checkSanctions(name)
      if (result.matches.length > 0) {
        setSanctionsModal({ show: true, searchedName: name, matches: result.matches, entityId: entity?.id, vesselId: vessel?.id })
      }
    } catch (error: any) {
      showError(error.message || 'Failed to load sanctions data. Please try again.')
    } finally {
      setCheckingId(null)
    }
  }

  // ── Sub-components ──────────────────────────────────────────────────────────

  const OfacBadge = ({ entity, vessel, onRecheck }: { entity?: Entity; vessel?: Vessel; onRecheck: () => void }) => {
    const target = entity || vessel
    const isChecking = checkingId === target?.id
    const isMatch = target?.ofacStatus === 'MATCH' || target?.ofacStatus === 'SANCTIONED'
    const isPotentialMatch = target?.ofacStatus === 'POTENTIAL_MATCH'
    const isError = target?.ofacStatus === 'ERROR'
    const isPending = !target?.ofacStatus || target.ofacStatus === 'PENDING'

    if (isChecking) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px', borderRadius: '4px', fontSize: '0.68rem', background: isLight ? 'rgba(0,150,200,0.15)' : 'rgba(0,210,255,0.1)', border: isLight ? '1px solid rgba(0,150,200,0.4)' : '1px solid rgba(0,210,255,0.3)', color: isLight ? '#0077a3' : '#00d2ff' }}>
          <Loader2 size={11} className="spinner" /> CHECKING...
        </div>
      )
    }

    let config: { bg: string; border: string; color: string; text: string; icon: React.ReactNode }
    if (isPending) {
      config = { bg: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', border: isLight ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', text: 'NOT CHECKED', icon: <Shield size={11} opacity={0.5} /> }
    } else if (isError) {
      config = { bg: isLight ? 'rgba(200,120,0,0.15)' : 'rgba(255,153,0,0.1)', border: isLight ? '1px solid rgba(200,120,0,0.4)' : '1px solid rgba(255,153,0,0.3)', color: isLight ? '#b36b00' : '#ff9900', text: 'CHECK FAILED', icon: <Shield size={11} /> }
    } else if (isMatch) {
      config = { bg: isLight ? 'rgba(200,0,0,0.12)' : 'rgba(255,77,77,0.1)', border: isLight ? '1px solid rgba(200,0,0,0.35)' : '1px solid rgba(255,77,77,0.3)', color: isLight ? '#c00000' : '#ff4d4d', text: 'SANCTIONED', icon: <ShieldAlert size={11} /> }
    } else if (isPotentialMatch) {
      config = { bg: isLight ? 'rgba(180,140,0,0.15)' : 'rgba(255,193,7,0.1)', border: isLight ? '1px solid rgba(180,140,0,0.4)' : '1px solid rgba(255,193,7,0.3)', color: isLight ? '#997a00' : '#ffc107', text: 'POSSIBLE MATCH', icon: <ShieldAlert size={11} /> }
    } else {
      config = { bg: isLight ? 'rgba(0,140,70,0.12)' : 'rgba(0,255,136,0.1)', border: isLight ? '1px solid rgba(0,140,70,0.35)' : '1px solid rgba(0,255,136,0.3)', color: isLight ? '#008c46' : '#00ff88', text: 'CLEARED', icon: <ShieldCheck size={11} /> }
    }

    return (
      <div
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 7px', borderRadius: '4px', fontSize: '0.68rem', background: config.bg, border: config.border, color: config.color, cursor: isPotentialMatch ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
        title={isError ? 'API request failed. Click refresh to retry.' : isPotentialMatch ? 'Click to review potential matches' : `Last checked: ${target?.ofacCheckedAt ? formatDateTime(target.ofacCheckedAt) : 'Never'}`}
        onClick={e => { e.stopPropagation(); if (isPotentialMatch) handleViewPotentialMatch(entity, vessel) }}
      >
        {config.icon}
        {config.text}
        <RefreshCw size={9} style={{ marginLeft: '3px', cursor: 'pointer', opacity: 0.55 }} className="hover-spin" onClick={e => { e.stopPropagation(); onRecheck() }} />
      </div>
    )
  }

  const DocBadge = ({ label, hasFile, onClick, onUpload, onDelete, onReplace }: { label: string; hasFile: boolean; onClick?: () => void; onUpload?: () => void; onDelete?: () => void; onReplace?: () => void }) => (
    <div
      style={{ padding: '8px 14px', borderRadius: '10px', background: hasFile ? (isLight ? 'rgba(0,140,70,0.08)' : 'rgba(0,255,136,0.06)') : (isLight ? 'rgba(200,0,0,0.06)' : 'rgba(255,77,77,0.06)'), border: hasFile ? (isLight ? '1px solid rgba(0,140,70,0.2)' : '1px solid rgba(0,255,136,0.15)') : (isLight ? '1px solid rgba(200,0,0,0.2)' : '1px solid rgba(255,77,77,0.15)'), display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: hasFile ? 'pointer' : 'default', transition: 'var(--transition)' }}
      onClick={onClick}
    >
      {hasFile
        ? <CheckCircle2 size={15} color={isLight ? '#008c46' : '#00ff88'} />
        : <AlertTriangle size={15} color={isLight ? '#c00000' : '#ff4d4d'} />
      }
      <span style={{ color: hasFile ? (isLight ? '#008c46' : 'rgba(0,255,136,0.85)') : (isLight ? '#c00000' : 'rgba(255,77,77,0.85)') }}>{label}</span>
      {hasFile && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button onClick={e => { e.stopPropagation(); onReplace?.() }} className="btn-secondary" style={{ padding: '3px 6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px' }} title={`Replace ${label}`}><Upload size={11} /></button>
          <button onClick={e => { e.stopPropagation(); onDelete?.() }} className="btn-secondary" style={{ padding: '3px 6px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--danger)' }} title={`Remove ${label}`}><Trash2 size={11} /></button>
        </div>
      )}
      {!hasFile && onUpload && (
        <button onClick={e => { e.stopPropagation(); onUpload() }} className="btn-secondary" style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }} title={`Upload ${label}`}><Upload size={11} /> Upload</button>
      )}
    </div>
  )

  // ── Derived ─────────────────────────────────────────────────────────────────
  const associatedVessels = selectedEntity ? getAssociatedVessels(selectedEntity.id) : []
  const parentCompanies = selectedEntity?.type === 'person' ? getParentCompanies(selectedEntity.id) : []

  // Load addresses when entity is selected
  useEffect(() => {
    if (selectedEntity) {
      window.api.getEntityAddresses(selectedEntity.id).then(addrs => {
        setEntityAddresses(Array.isArray(addrs) ? addrs : [])
      })
      setShowAddAddress(false)
      setEditingAddress(null)
    } else {
      setEntityAddresses([])
    }
  }, [selectedEntity?.id])

  // ── VesselDetail drill-down ──────────────────────────────────────────────────
  if (viewingVessel) {
    return <VesselDetail vessel={viewingVessel} backLabel="Back to Entity" onBack={() => { setViewingVessel(null); loadData() }} />
  }

  // ── Color helpers ────────────────────────────────────────────────────────────

  const resetAddrForm = () => setAddrForm({ label: '', addressLine1: '', addressLine2: '', city: '', country: '', postalCode: '' })

  const handleSaveAddress = async () => {
    if (!selectedEntity || !addrForm.label.trim() || !addrForm.addressLine1.trim()) return
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
          entityId: selectedEntity.id,
          label: addrForm.label.trim(),
          addressLine1: addrForm.addressLine1.trim(),
          addressLine2: addrForm.addressLine2.trim() || undefined,
          city: addrForm.city.trim() || undefined,
          country: addrForm.country.trim() || undefined,
          postalCode: addrForm.postalCode.trim() || undefined
        })
        if (res && (res as any).error) { showError((res as any).message || 'Failed to add'); return }
        showSuccess('Address added')
      }
      const addrs = await window.api.getEntityAddresses(selectedEntity.id)
      setEntityAddresses(Array.isArray(addrs) ? addrs : [])
      setShowAddAddress(false)
      setEditingAddress(null)
      resetAddrForm()
    } catch (e: any) { showError(e.message || 'Failed to save address') }
  }

  const handleDeleteAddress = async (addrId: string) => {
    try {
      await window.api.deleteEntityAddress(addrId)
      setEntityAddresses(prev => prev.filter(a => a.id !== addrId))
      showSuccess('Address deleted')
    } catch (e: any) { showError(e.message || 'Failed to delete address') }
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

  const accentBg = isLight ? 'rgba(26,115,232,0.1)' : 'rgba(0,210,255,0.1)'
  const companyColor = 'var(--accent-primary)'
  const personColor = isLight ? '#9c27b0' : '#ba68c8'

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in">

      {/* Header */}
      <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '4px' }}>Entity Directory</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Assureds, UBOs, and beneficial owners across your fleet.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button className="btn-secondary" onClick={() => setShowDuplicatesModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', fontSize: '0.9rem' }}>
            <ScanSearch size={16} /> Find Duplicates
          </button>
          {hasPermission('entities:create') && (
            <button className="btn-primary" onClick={() => setShowCreateModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', fontSize: '0.9rem' }}>
              <Plus size={16} /> Create Entity
            </button>
          )}
        </div>
      </header>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={20} color="white" />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.1 }}>{allEntities.length}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Total Entities</div>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={20} color={companyColor} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.1 }}>{companyCount}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Companies</div>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: isLight ? 'rgba(156,39,176,0.1)' : 'rgba(186,104,200,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={20} color={personColor} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.1 }}>{personCount}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Persons</div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* View mode */}
        <div style={{ display: 'flex', gap: '3px', background: 'var(--table-header-bg)', padding: '3px', borderRadius: '8px' }}>
          {(['all', 'customers'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: viewMode === mode ? 'var(--bg-card)' : 'transparent', color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: viewMode === mode ? '600' : '400', fontSize: '0.83rem', transition: 'var(--transition)' }}>
              {mode === 'all' ? 'All Entities' : 'Customers'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} style={{ padding: '7px 10px', fontSize: '0.82rem', minWidth: '120px' }} aria-label="Filter by type">
          <option value="all">All Types</option>
          <option value="company">Companies</option>
          <option value="person">Persons</option>
        </select>

        {/* OFAC filter */}
        <select value={ofacStatusFilter} onChange={e => setOfacStatusFilter(e.target.value)} style={{ padding: '7px 10px', fontSize: '0.82rem', minWidth: '140px' }} aria-label="Filter by sanctions status">
          <option value="all">All Statuses</option>
          <option value="CLEARED">Cleared</option>
          <option value="POTENTIAL_MATCH">Potential Match</option>
          <option value="MATCH">Match</option>
          <option value="PENDING">Pending</option>
        </select>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={15} />
          <input
            type="text"
            placeholder="Search entities..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '34px', paddingRight: '10px', width: '220px', fontSize: '0.88rem' }}
          />
        </div>
      </div>

      {/* Main: table + slide-in panel */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* Table */}
        <div className="glass-card" style={{ flex: 1, minWidth: 0, overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 'auto' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '80px' }} />
              </colgroup>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)', position: 'sticky', top: 0, zIndex: 1 }}>
                  {['Name', 'Type', 'Sanctions', 'Documents', 'Vessels'].map(col => (
                    <th key={col} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.69rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && entities.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Loader2 size={22} className="spinner" style={{ marginBottom: '10px', display: 'block', margin: '0 auto 10px' }} />
                    Loading entities...
                  </td></tr>
                ) : entities.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Shield size={30} style={{ marginBottom: '10px', opacity: 0.25, display: 'block', margin: '0 auto 10px' }} />
                    No entities found
                  </td></tr>
                ) : entities.map(entity => {
                  const isSelected = selectedEntity?.id === entity.id
                  const score = getDocScore(entity)
                  const vcount = getVesselCount(entity.id)
                  const docColor = score.have === score.total
                    ? (isLight ? '#008c46' : '#00c264')
                    : score.have === 0
                      ? (isLight ? '#c00000' : '#ff4d4d')
                      : (isLight ? '#b45309' : '#f59e0b')

                  return (
                    <tr
                      key={entity.id}
                      onClick={() => setSelectedEntity(isSelected ? null : entity)}
                      className="hover-effect"
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--table-border)',
                        background: isSelected ? (isLight ? 'rgba(26,115,232,0.07)' : 'rgba(0,210,255,0.07)') : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--accent-primary)' : '3px solid transparent',
                        transition: 'background 0.12s, border-color 0.12s'
                      }}
                    >
                      {/* Name */}
                      <td style={{ padding: '11px 16px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: entity.type === 'company' ? accentBg : (isLight ? 'rgba(156,39,176,0.1)' : 'rgba(186,104,200,0.1)'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {entity.type === 'company' ? <Building2 size={16} color={companyColor} /> : <User size={16} color={personColor} />}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entity.name}</div>
                            {entity.identifier && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entity.identifier}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* Type */}
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', background: entity.type === 'company' ? accentBg : (isLight ? 'rgba(156,39,176,0.1)' : 'rgba(186,104,200,0.1)'), color: entity.type === 'company' ? companyColor : personColor }}>
                          {entity.type}
                        </span>
                      </td>
                      {/* Sanctions */}
                      <td style={{ padding: '11px 16px' }}>
                        <OfacBadge entity={entity} onRecheck={() => handleOfacRecheck(entity)} />
                      </td>
                      {/* Documents */}
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: docColor }}>{score.have}/{score.total}</span>
                      </td>
                      {/* Vessels */}
                      <td style={{ padding: '11px 16px' }}>
                        {vcount > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-primary)', background: accentBg, padding: '2px 8px', borderRadius: '10px' }}>
                            <Ship size={11} />{vcount}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid var(--table-border)', fontSize: '0.82rem' }}>
              <div style={{ color: 'var(--text-secondary)' }}>
                {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(1)} style={{ padding: '4px 6px' }}><ChevronsLeft size={13} /></button>
                <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '4px 6px' }}><ChevronLeft size={13} /></button>
                <span style={{ margin: '0 6px', color: 'var(--text-secondary)' }}>{page}/{totalPages}</span>
                <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ padding: '4px 6px' }}><ChevronRight size={13} /></button>
                <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage(totalPages)} style={{ padding: '4px 6px' }}><ChevronsRight size={13} /></button>
                <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={{ marginLeft: '8px', padding: '3px 6px', fontSize: '0.82rem' }}>
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Slide-in detail panel */}
        {selectedEntity && (
          <div className="glass-card fade-in" style={{ width: '400px', flexShrink: 0, padding: 0, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* Panel header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--table-border)' }}>
              {/* Top: avatar + close */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selectedEntity.type === 'company' ? <Building2 size={24} color="white" /> : <User size={24} color="white" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.2, marginBottom: '4px', wordBreak: 'break-word' }}>{selectedEntity.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', padding: '1px 7px', borderRadius: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', background: selectedEntity.type === 'company' ? accentBg : (isLight ? 'rgba(156,39,176,0.1)' : 'rgba(186,104,200,0.1)'), color: selectedEntity.type === 'company' ? companyColor : personColor }}>
                      {selectedEntity.type}
                    </span>
                    <OfacBadge entity={selectedEntity} onRecheck={() => handleOfacRecheck(selectedEntity)} />
                  </div>
                </div>
                <button onClick={() => setSelectedEntity(null)} style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}>
                  <X size={16} />
                </button>
              </div>

              {/* Identifier */}
              {selectedEntity.identifier && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <Hash size={13} color="var(--accent-primary)" />{selectedEntity.identifier}
                </div>
              )}

              {/* UBO of (persons only) */}
              {parentCompanies.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <Link2 size={13} color="var(--accent-primary)" style={{ marginTop: '1px', flexShrink: 0 }} />
                  <div>
                    <span style={{ marginRight: '4px' }}>UBO of:</span>
                    {parentCompanies.map((c, i) => (
                      <span key={c.id} style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {c.name}{i < parentCompanies.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contacts */}
              {(selectedEntity.email || selectedEntity.phone) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '10px' }}>
                  {selectedEntity.email && selectedEntity.email.split(',').map((em, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <Mail size={12} color="var(--accent-primary)" />{em.trim()}
                    </div>
                  ))}
                  {selectedEntity.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <Phone size={12} color="var(--accent-primary)" />{selectedEntity.phone}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '14px', flexWrap: 'wrap' }}>
                {hasPermission('entities:edit') && (
                  <button onClick={() => startEditing(selectedEntity)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Pencil size={13} /> Edit
                  </button>
                )}
                <button onClick={() => openMergeModal(selectedEntity)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Merge size={13} /> Merge
                </button>
                {hasPermission('entities:delete') && (
                  <button onClick={() => handleDeleteEntity(selectedEntity)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--danger)' }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Documents section */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--table-border)' }}>
              <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '10px' }}>Documents</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedEntity.type === 'person' ? (
                  <DocBadge label="ID / Passport" hasFile={!!selectedEntity.passportFilePath}
                    onClick={selectedEntity.passportFilePath ? () => window.api.fsOpen(selectedEntity.passportFilePath!) : undefined}
                    onUpload={!selectedEntity.passportFilePath ? () => handleUploadEntityDoc(selectedEntity.id, 'passportFilePath') : undefined}
                    onDelete={() => handleDeleteEntityDoc(selectedEntity.id, 'passportFilePath')}
                    onReplace={() => handleUploadEntityDoc(selectedEntity.id, 'passportFilePath')}
                  />
                ) : (
                  <>
                    <DocBadge label="Certificate of Incorporation" hasFile={!!selectedEntity.certificateOfIncorporationPath}
                      onClick={selectedEntity.certificateOfIncorporationPath ? () => window.api.fsOpen(selectedEntity.certificateOfIncorporationPath!) : undefined}
                      onUpload={!selectedEntity.certificateOfIncorporationPath ? () => handleUploadEntityDoc(selectedEntity.id, 'certificateOfIncorporationPath') : undefined}
                      onDelete={() => handleDeleteEntityDoc(selectedEntity.id, 'certificateOfIncorporationPath')}
                      onReplace={() => handleUploadEntityDoc(selectedEntity.id, 'certificateOfIncorporationPath')}
                    />
                    <DocBadge label="Articles of Association" hasFile={!!selectedEntity.articlesOfAssociationPath}
                      onClick={selectedEntity.articlesOfAssociationPath ? () => window.api.fsOpen(selectedEntity.articlesOfAssociationPath!) : undefined}
                      onUpload={!selectedEntity.articlesOfAssociationPath ? () => handleUploadEntityDoc(selectedEntity.id, 'articlesOfAssociationPath') : undefined}
                      onDelete={() => handleDeleteEntityDoc(selectedEntity.id, 'articlesOfAssociationPath')}
                      onReplace={() => handleUploadEntityDoc(selectedEntity.id, 'articlesOfAssociationPath')}
                    />
                    <DocBadge label="KYC" hasFile={!!selectedEntity.kycFilePath}
                      onClick={selectedEntity.kycFilePath ? () => window.api.fsOpen(selectedEntity.kycFilePath!) : undefined}
                      onUpload={!selectedEntity.kycFilePath ? () => handleUploadEntityDoc(selectedEntity.id, 'kycFilePath') : undefined}
                      onDelete={() => handleDeleteEntityDoc(selectedEntity.id, 'kycFilePath')}
                      onReplace={() => handleUploadEntityDoc(selectedEntity.id, 'kycFilePath')}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Addresses section */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--table-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Addresses
                  {entityAddresses.length > 0 && (
                    <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '8px', background: accentBg, color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.65rem' }}>{entityAddresses.length}</span>
                  )}
                </div>
                <button onClick={() => { resetAddrForm(); setEditingAddress(null); setShowAddAddress(!showAddAddress) }} className="btn-secondary" style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Plus size={12} /> Add
                </button>
              </div>

              {(showAddAddress) && (
                <div style={{ background: isLight ? '#f0f4f8' : 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px', marginBottom: '10px', border: '1px solid var(--table-border)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input placeholder="Label (e.g. Registered Office) *" value={addrForm.label} onChange={e => setAddrForm(p => ({ ...p, label: e.target.value }))} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                    <textarea placeholder="Paste or type full address *" value={addrForm.addressLine1} onChange={e => setAddrForm(p => ({ ...p, addressLine1: e.target.value }))} rows={3} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.8rem', resize: 'vertical', fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                      <button onClick={handleSaveAddress} disabled={!addrForm.label.trim() || !addrForm.addressLine1.trim()} className="btn-primary" style={{ padding: '5px 14px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Save size={12} /> {editingAddress ? 'Update' : 'Save'}
                      </button>
                      <button onClick={() => { setShowAddAddress(false); setEditingAddress(null); resetAddrForm() }} className="btn-secondary" style={{ padding: '5px 14px', fontSize: '0.78rem' }}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {entityAddresses.length === 0 && !showAddAddress ? (
                <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.6 }}>
                  <MapPin size={20} style={{ opacity: 0.3, display: 'block', margin: '0 auto 4px' }} />
                  No addresses
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {entityAddresses.map(addr => (
                    <div key={addr.id} style={{ padding: '8px 10px', borderRadius: '8px', background: isLight ? '#f8f9fb' : 'rgba(255,255,255,0.03)', border: '1px solid var(--table-border)', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--accent-primary)', fontSize: '0.75rem' }}>{addr.label}</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => startEditAddress(addr)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><Pencil size={12} /></button>
                          <button onClick={() => handleDeleteAddress(addr.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={12} /></button>
                        </div>
                      </div>
                      <div style={{ color: 'var(--text-primary)', lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                        {addr.addressLine1}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vessels section */}
            <div style={{ padding: '16px 20px', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Vessels
                  {associatedVessels.length > 0 && (
                    <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '8px', background: accentBg, color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.65rem' }}>{associatedVessels.length}</span>
                  )}
                </div>
                {vessels.some(v => v.customerId === selectedEntity.id) && (
                  <button
                    onClick={async () => {
                      setExportingCompliance(true)
                      try {
                        const cv = vessels.find(v => v.customerId === selectedEntity.id)
                        await exportCustomerCompliancePDF(selectedEntity.id, selectedEntity.name, cv?.customerType || null)
                      } finally { setExportingCompliance(false) }
                    }}
                    disabled={exportingCompliance}
                    className="btn-secondary"
                    style={{ padding: '3px 10px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
                    {exportingCompliance ? 'Exporting...' : 'PDF'}
                  </button>
                )}
              </div>

              {associatedVessels.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <Ship size={28} style={{ opacity: 0.2, display: 'block', margin: '0 auto 8px' }} />
                  No vessels linked
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {associatedVessels.map((vessel, i) => (
                    <div key={vessel.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: i < associatedVessels.length - 1 ? '1px solid var(--table-border)' : 'none' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                        <Ship size={13} color={companyColor} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{ fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', color: 'var(--accent-primary)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          onClick={() => setViewingVessel(vessel)}
                        >
                          {vessel.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <Hash size={10} />{vessel.imoNumber}
                          </span>
                          {vessel.roles.map((r, ri) => (
                            <span key={ri} style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: accentBg, color: companyColor, fontWeight: 500 }}>{r}</span>
                          ))}
                          {vessel.viaAssureds.map((r, ri) => (
                            <span key={ri} style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', border: '1px solid var(--table-border)' }}>via {r}</span>
                          ))}
                        </div>
                      </div>
                      <OfacBadge vessel={vessel} onRecheck={() => handleVesselOfacRecheck(vessel)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}

      {/* Edit Modal */}
      {editingEntity && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditingEntity(null)}>
          <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '16px', padding: '32px', width: '480px', maxWidth: '90vw', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.3rem' }}>Edit Entity</h3>
              <button onClick={() => setEditingEntity(null)} className="btn-secondary" style={{ padding: '6px' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Name *</label>
                <div style={{ position: 'relative' }}>
                  <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ width: '100%', paddingRight: '44px' }} placeholder="Entity name" />
                  <CaseToggleBtn value={editForm.name} onChange={v => setEditForm(f => ({ ...f, name: v }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Type</label>
                <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value as any }))} style={{ width: '100%', padding: '10px 12px' }}>
                  <option value="company">Company</option>
                  <option value="person">Person</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Identifier</label>
                <input type="text" value={editForm.identifier} onChange={e => setEditForm(f => ({ ...f, identifier: e.target.value }))} style={{ width: '100%' }} placeholder="Optional note to distinguish same-named entities" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Email(s)</label>
                <input type="text" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} style={{ width: '100%' }} placeholder="Separate multiple emails with commas" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Phone</label>
                <input type="text" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} style={{ width: '100%' }} placeholder="Phone number" />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button onClick={() => setEditingEntity(null)} className="btn-secondary">Cancel</button>
                <button onClick={handleSaveEdit} className="btn-primary" disabled={!editForm.name.trim() || isSaving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isSaving ? <Loader2 size={14} className="spinner" /> : <Save size={14} />} Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Entity Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowCreateModal(false)}>
          <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '16px', padding: '32px', width: '480px', maxWidth: '90vw', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.3rem' }}>Create Entity</h3>
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary" style={{ padding: '6px' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Name *</label>
                <div style={{ position: 'relative' }}>
                  <input type="text" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} style={{ width: '100%', paddingRight: '44px' }} placeholder="Entity name" autoFocus />
                  <CaseToggleBtn value={createForm.name} onChange={v => setCreateForm(f => ({ ...f, name: v }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Type</label>
                <select value={createForm.type} onChange={e => setCreateForm(f => ({ ...f, type: e.target.value as any }))} style={{ width: '100%', padding: '10px 12px' }}>
                  <option value="company">Company</option>
                  <option value="person">Person</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Identifier</label>
                <input type="text" value={createForm.identifier} onChange={e => setCreateForm(f => ({ ...f, identifier: e.target.value }))} style={{ width: '100%' }} placeholder="Optional note to distinguish same-named entities" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Email(s)</label>
                <input type="text" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} style={{ width: '100%' }} placeholder="Separate multiple emails with commas" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Phone</label>
                <input type="text" value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} style={{ width: '100%' }} placeholder="Phone number" />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleCreateEntity} className="btn-primary" disabled={!createForm.name.trim() || isCreating} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isCreating ? <Loader2 size={14} className="spinner" /> : <Plus size={14} />} Create Entity
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sanctions Modal */}
      {sanctionsModal.show && (
        <SanctionsModal
          searchedName={sanctionsModal.searchedName}
          matches={sanctionsModal.matches}
          onClose={() => setSanctionsModal({ show: false, searchedName: '', matches: [] })}
          onMarkClean={handleMarkClean}
          onConfirmMatch={handleConfirmMatch}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirmation.show && (
        <ConfirmationModal
          title="Delete Entity?"
          message={deleteConfirmation.message}
          confirmLabel="Delete"
          isDangerous={true}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirmation({ show: false, entity: null, message: '' })}
        />
      )}

      {/* Merge Modal */}
      {showMergeModal && mergeSource && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowMergeModal(false)}>
          <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '16px', padding: '32px', width: '560px', maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '8px' }}><Merge size={20} /> Merge Entities</h3>
              <button onClick={() => setShowMergeModal(false)} className="btn-secondary" style={{ padding: '6px' }}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: '20px', padding: '14px', borderRadius: '10px', background: isLight ? 'rgba(200,120,0,0.08)' : 'rgba(255,193,7,0.08)', border: isLight ? '1px solid rgba(200,120,0,0.2)' : '1px solid rgba(255,193,7,0.15)', fontSize: '0.82rem', color: isLight ? '#8a6d00' : '#ffc107' }}>
              <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              This will merge the source entity INTO the target. All vessel links, UBOs, and customer assignments will be transferred. The source entity will be deleted.
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>Source (will be deleted)</label>
              <div style={{ padding: '12px', borderRadius: '8px', background: isLight ? 'rgba(200,0,0,0.05)' : 'rgba(255,77,77,0.05)', border: isLight ? '1px solid rgba(200,0,0,0.15)' : '1px solid rgba(255,77,77,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {mergeSource.type === 'company' ? <Building2 size={18} color={companyColor} /> : <User size={18} color={personColor} />}
                <div>
                  <div style={{ fontWeight: '600' }}>{mergeSource.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{mergeSource.type}{mergeSource.identifier ? ` - ${mergeSource.identifier}` : ''}</div>
                </div>
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>Target (will be kept)</label>
              {mergeTarget ? (
                <div style={{ padding: '12px', borderRadius: '8px', background: isLight ? 'rgba(0,140,70,0.05)' : 'rgba(0,255,136,0.05)', border: isLight ? '1px solid rgba(0,140,70,0.15)' : '1px solid rgba(0,255,136,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {mergeTarget.type === 'company' ? <Building2 size={18} color={companyColor} /> : <User size={18} color={personColor} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600' }}>{mergeTarget.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{mergeTarget.type}{mergeTarget.identifier ? ` - ${mergeTarget.identifier}` : ''}</div>
                  </div>
                  <button onClick={() => { setMergeTarget(null); setMergeSearch('') }} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>Change</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={14} />
                  <input type="text" value={mergeSearch} onChange={e => setMergeSearch(e.target.value)} placeholder="Search for target entity..." style={{ width: '100%', paddingLeft: '34px' }} autoFocus />
                  {mergeSearchResults.length > 0 && (
                    <div style={{ marginTop: '4px', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: '8px', background: isLight ? '#fff' : '#1e222a' }}>
                      {mergeSearchResults.map(e => (
                        <div key={e.id} onClick={() => { setMergeTarget(e); setMergeSearch('') }} style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
                          {e.type === 'company' ? <Building2 size={14} opacity={0.5} /> : <User size={14} opacity={0.5} />}
                          <span style={{ flex: 1 }}>{e.name}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{e.type}{e.identifier ? ` - ${e.identifier}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {mergeTarget && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>Keep which name?</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setMergeKeepName('target')} className={mergeKeepName === 'target' ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1, padding: '10px', fontSize: '0.82rem' }}>{mergeTarget.name}</button>
                  <button onClick={() => setMergeKeepName('source')} className={mergeKeepName === 'source' ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1, padding: '10px', fontSize: '0.82rem' }}>{mergeSource.name}</button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowMergeModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleMerge} className="btn-primary" disabled={!mergeTarget || isMerging} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--danger)', borderColor: 'var(--danger)' }}>
                {isMerging ? <Loader2 size={14} className="spinner" /> : <Merge size={14} />}
                {isMerging ? 'Merging...' : 'Merge Entities'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Finder Modal */}
      {showDuplicatesModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '780px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ScanSearch size={20} color="white" />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700' }}>Duplicate Finder</h2>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Entities with similar names based on Jaro-Winkler similarity</p>
              </div>
              <button onClick={() => setShowDuplicatesModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>

            {/* Threshold control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', borderRadius: '10px', background: 'var(--table-header-bg)', marginBottom: '18px' }}>
              <label style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Similarity threshold:</label>
              <input
                type="range"
                min={70}
                max={99}
                value={dupThreshold}
                onChange={e => setDupThreshold(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
              />
              <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--accent-primary)', minWidth: '38px', textAlign: 'right' }}>{dupThreshold}%</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>— {duplicatePairs.length} pair{duplicatePairs.length !== 1 ? 's' : ''} found</span>
            </div>

            {/* Results */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {duplicatePairs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
                  <CheckCircle2 size={40} style={{ marginBottom: '12px', color: 'var(--success, #00c853)', opacity: 0.7 }} />
                  <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '4px' }}>No duplicates found</div>
                  <div style={{ fontSize: '0.82rem' }}>No entities share {dupThreshold}%+ name similarity.</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg)' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--table-border)' }}>Entity A</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--table-border)' }}>Entity B</th>
                      <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--table-border)', width: '80px' }}>Score</th>
                      <th style={{ padding: '9px 14px', borderBottom: '1px solid var(--table-border)', width: '80px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicatePairs.map((pair, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--table-border)', background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {pair.a.type === 'company' ? <Building2 size={14} color={companyColor} /> : <User size={14} color={personColor} />}
                            <div>
                              <div style={{ fontWeight: '600' }}>{pair.a.name}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{pair.a.type}{pair.a.identifier ? ` · ${pair.a.identifier}` : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {pair.b.type === 'company' ? <Building2 size={14} color={companyColor} /> : <User size={14} color={personColor} />}
                            <div>
                              <div style={{ fontWeight: '600' }}>{pair.b.name}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{pair.b.type}{pair.b.identifier ? ` · ${pair.b.identifier}` : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 10px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: '700',
                            background: pair.score >= 0.97 ? 'rgba(255,77,77,0.12)' : pair.score >= 0.92 ? 'rgba(255,193,7,0.12)' : 'rgba(0,200,100,0.1)',
                            color: pair.score >= 0.97 ? 'var(--danger)' : pair.score >= 0.92 ? (isLight ? '#a06000' : '#ffc107') : (isLight ? '#007a3d' : '#00c853')
                          }}>
                            {Math.round(pair.score * 100)}%
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button
                            className="btn-secondary"
                            style={{ padding: '5px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => { setShowDuplicatesModal(false); openMergeModal(pair.a) }}
                            title="Open merge dialog for this pair"
                          >
                            <Merge size={13} /> Merge
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button onClick={() => setShowDuplicatesModal(false)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
