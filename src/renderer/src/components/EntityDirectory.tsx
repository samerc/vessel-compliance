import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Search,
  User,
  Ship,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Shield,
  Building2,
  Loader2,
  X,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Hash,
  Plus,
  Merge,
  ArrowUpDown,
  Link2,
  ScanSearch,
  CheckSquare,
  Square,
  Download,
  FolderOpen,
  FileExclamationPoint,
  MapPinOff,
  UserX,
  Clock,
  Unlink,
  Briefcase,
  StickyNote,
  IdCard
} from 'lucide-react'
import RemapFilePathsModal from './RemapFilePathsModal'
import EntityEditPanel from './EntityEditPanel'
import EntityBusinessSection from './EntityBusinessSection'
import EntityNotesHistory from './EntityNotesHistory'
import {
  Entity,
  EntityGap,
  EntityDirectoryStats,
  EntityQueryParams,
  Vessel,
  VesselAssured,
  EntityUBO,
  SanctionsMatch,
  EntityDocumentType,
  EntityDocument,
  PaginatedResult
} from '../../../shared/types'
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
import ColumnSelector from './ColumnSelector'
import { useColumnPrefs, type ColumnDef } from '../utils/useColumnPrefs'
import { decideSanctionsSubject } from '../utils/sanctionsDecision'
import { SanctionsBadge, EmptyState, Modal, Field, SegmentedControl, Tabs } from './ui'
import { confirmDialog } from './DialogHost'

/** Sanctions screening older than this counts as out of date */
const SCREENING_MAX_AGE_MS = 182 * 86400000

/** The Directory "needs attention" cards, in display order */
const GAP_CARDS: { key: EntityGap; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    key: 'missingDocs',
    label: 'Missing documents',
    hint: 'A required document type has no file',
    icon: <FileExclamationPoint size={16} />
  },
  {
    key: 'noUbo',
    label: 'No UBOs',
    hint: 'Companies that are vessel assureds with no beneficial owner listed',
    icon: <UserX size={16} />
  },
  {
    key: 'noAddress',
    label: 'No address',
    hint: 'Companies without an address on file',
    icon: <MapPinOff size={16} />
  },
  {
    key: 'staleScreening',
    label: 'Screening out of date',
    hint: 'Not screened for sanctions in the last 6 months',
    icon: <Clock size={16} />
  },
  {
    key: 'unused',
    label: 'Not linked to anything',
    hint: 'No vessel, policy, quotation, receipt or UBO link',
    icon: <Unlink size={16} />
  }
]

/** A vessel linked to an entity, directly (roles) or through an assured it is UBO of */
type AssociatedVessel = Vessel & { roles: string[]; viaAssureds: string[] }

function jaroWinkler(s1: string, s2: string): number {
  s1 = s1.toLowerCase().trim()
  s2 = s2.toLowerCase().trim()
  if (s1 === s2) return 1
  const len1 = s1.length,
    len2 = s2.length
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
  let t = 0,
    k = 0
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

// Words every second company name has: comparing without them stops "A.B. Shipping Ltd." from
// looking like "Kayo Shipping Ltd." in the duplicate finder
const NAME_NOISE = new Set(
  'shipping ship ships management manager managers maritime marine navigation shipmanagement trading transport line lines company co corp corporation inc incorporated ltd limited llc sa sal sarl gmbh plc fzco fze fzc dmcc ou as holding holdings group international intl and the of'.split(
    ' '
  )
)
/** Name reduced for duplicate matching: lower case, no accents / punctuation / company words */
function dupKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NAME_NOISE.has(t))
    .join(' ')
}
/** Similarity of two entities for the duplicate finder (0 when the types differ) */
function dupScore(a: { type: string; key: string }, b: { type: string; key: string }): number {
  if (a.type !== b.type || !a.key || !b.key) return 0
  return a.key === b.key ? 1 : jaroWinkler(a.key, b.key)
}

export default function EntityDirectory({
  initialEntityId,
  onInitialEntityConsumed,
  openCreate,
  onCreateConsumed
}: {
  initialEntityId?: string | null
  onInitialEntityConsumed?: () => void
  openCreate?: boolean
  onCreateConsumed?: () => void
}): React.JSX.Element {
  const [entities, setEntities] = useState<Entity[]>([])
  const [allEntities, setAllEntities] = useState<Entity[]>([])
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [vesselAssureds, setVesselAssureds] = useState<VesselAssured[]>([])
  const [entityUBOs, setEntityUBOs] = useState<EntityUBO[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [viewingVessel, setViewingVessel] = useState<Vessel | null>(null)
  const [editingEntityCore, setEditingEntityCore] = useState(false)
  const { showError, showSuccess } = useToast()
  const { theme } = useTheme()
  const { hasPermission } = useAuth()
  const isLight = theme === 'light' || theme === 'aurora'

  const [entityDocTypes, setEntityDocTypes] = useState<EntityDocumentType[]>([])
  const [entityDocs, setEntityDocs] = useState<EntityDocument[]>([])
  // Customer entity id -> customer type, from ACTIVE policies (customer is policy-level)
  const [policyCustomers, setPolicyCustomers] = useState<Map<string, string | null>>(new Map())

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const [viewMode, setViewMode] = useState<'all' | 'customers'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'company' | 'person'>('all')
  const [ofacStatusFilter, setOfacStatusFilter] = useState<string>('all')
  // "Needs attention" filter (one at a time) and the counts behind the cards
  const [gapFilter, setGapFilter] = useState<EntityGap | null>(null)
  const [stats, setStats] = useState<EntityDirectoryStats | null>(null)
  const [dupCount, setDupCount] = useState<number | null>(null)
  const [deletingUnused, setDeletingUnused] = useState(false)
  const [panelTab, setPanelTab] = useState<'profile' | 'business' | 'notes'>('profile')
  const [noteCount, setNoteCount] = useState<number | null>(null)

  const debouncedSearch = useDebounceValue(searchTerm, 500)

  // Column preferences
  const ENTITY_COLUMNS: ColumnDef[] = [
    { id: 'name', label: 'Name', defaultVisible: true },
    { id: 'type', label: 'Type', defaultVisible: false },
    { id: 'profile', label: 'Profile', defaultVisible: true },
    { id: 'sanctions', label: 'Sanctions', defaultVisible: true },
    { id: 'screened', label: 'Screened', defaultVisible: true },
    { id: 'documents', label: 'Documents', defaultVisible: true },
    { id: 'vessels', label: 'Vessels', defaultVisible: true }
  ]
  // v2: the Profile and Last screened columns were added (the old saved choice hid them)
  const { visibleColumns: entVisibleCols, setVisibleColumns: setEntVisibleCols } = useColumnPrefs(
    'entities_v2',
    ENTITY_COLUMNS
  )
  const entVisSet = new Set(entVisibleCols)
  const COLUMN_WIDTHS: Record<string, string> = {
    type: '100px',
    profile: '110px',
    sanctions: '132px',
    screened: '104px',
    documents: '95px',
    vessels: '75px'
  }

  const [checkingId, setCheckingId] = useState<string | null>(null)

  const [sanctionsModal, setSanctionsModal] = useState<{
    show: boolean
    searchedName: string
    matches: SanctionsMatch[]
    entityId?: string
    vesselId?: string
  }>({ show: false, searchedName: '', matches: [] })

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    show: boolean
    entity: Entity | null
    message: string
  }>({ show: false, entity: null, message: '' })

  const [showCreateModal, setShowCreateModal] = useState(false)
  // A create request (Quick Actions / palette) opens the create form once, then is consumed
  const [prevOpenCreate, setPrevOpenCreate] = useState<boolean | undefined>(false)
  if (openCreate !== prevOpenCreate) {
    setPrevOpenCreate(openCreate)
    if (openCreate && hasPermission('entities:create')) setShowCreateModal(true)
  }
  useEffect(() => {
    if (openCreate) onCreateConsumed?.()
  }, [openCreate, onCreateConsumed])
  const [createForm, setCreateForm] = useState({
    name: '',
    type: 'company' as 'company' | 'person',
    identifier: '',
    email: '',
    phone: ''
  })
  const [isCreating, setIsCreating] = useState(false)
  const [similarEntities, setSimilarEntities] = useState<{ name: string; score: number }[]>([])
  const similarCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeSource, setMergeSource] = useState<Entity | null>(null)
  const [mergeTarget, setMergeTarget] = useState<Entity | null>(null)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeKeepName, setMergeKeepName] = useState<'source' | 'target'>('target')
  const [isMerging, setIsMerging] = useState(false)
  const [allEntitiesForMerge, setAllEntitiesForMerge] = useState<Entity[]>([])
  const [exportingCompliance, setExportingCompliance] = useState(false)

  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false)
  const [dupThreshold, setDupThreshold] = useState(95)
  // The merge was opened from the duplicate finder: go back to it afterwards
  const [mergeFromFinder, setMergeFromFinder] = useState(false)
  // Pairs marked "Not duplicates" (per computer), as "idA|idB" with the ids sorted
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('dup_dismissed_pairs') || '[]'))
    } catch {
      return new Set()
    }
  })
  const [showDismissed, setShowDismissed] = useState(false)
  const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const setDismissed = (key: string, dismissed: boolean): void => {
    setDismissedPairs((prev) => {
      const next = new Set(prev)
      if (dismissed) next.add(key)
      else next.delete(key)
      try {
        localStorage.setItem('dup_dismissed_pairs', JSON.stringify([...next]))
      } catch {
        /* per-computer convenience only */
      }
      return next
    })
  }

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [showEntityRemapModal, setShowEntityRemapModal] = useState(false)

  const openMergeModal = async (
    entity: Entity,
    target: Entity | null = null,
    fromFinder = false
  ): Promise<void> => {
    setMergeSource(entity)
    setMergeTarget(target)
    setMergeFromFinder(fromFinder)
    setMergeSearch('')
    setMergeKeepName('target')
    const all = await window.api.getEntities()
    setAllEntitiesForMerge(all.filter((e) => e.id !== entity.id))
    setShowMergeModal(true)
  }

  const mergeSearchResults = useMemo(() => {
    if (!mergeSearch.trim()) return []
    return allEntitiesForMerge
      .filter((e) => e.name.toLowerCase().includes(mergeSearch.toLowerCase()))
      .slice(0, 20)
  }, [mergeSearch, allEntitiesForMerge])

  // Duplicate-matching keys, worked out once per load
  const dupEntries = useMemo(
    () => allEntities.map((e) => ({ entity: e, type: e.type, key: dupKey(e.name) })),
    [allEntities]
  )

  const duplicatePairs = useMemo(() => {
    if (!showDuplicatesModal) return []
    const threshold = dupThreshold / 100
    const pairs: { a: Entity; b: Entity; score: number }[] = []
    for (let i = 0; i < dupEntries.length; i++) {
      for (let j = i + 1; j < dupEntries.length; j++) {
        const score = dupScore(dupEntries[i], dupEntries[j])
        if (score >= threshold)
          pairs.push({ a: dupEntries[i].entity, b: dupEntries[j].entity, score })
      }
    }
    return pairs.sort((x, y) => y.score - x.score)
  }, [dupEntries, showDuplicatesModal, dupThreshold])
  // Possible duplicates for the Find Duplicates button, worked out in small slices after load so
  // the page stays responsive (same rule as the finder at its current threshold)
  useEffect(() => {
    if (dupEntries.length === 0) return
    let cancelled = false
    const list = dupEntries
    const threshold = dupThreshold / 100
    let i = 0
    let count = 0
    let timer: ReturnType<typeof setTimeout>
    const step = (): void => {
      if (cancelled) return
      const end = Math.min(i + 40, list.length)
      for (; i < end; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (
            dupScore(list[i], list[j]) >= threshold &&
            !dismissedPairs.has(pairKey(list[i].entity.id, list[j].entity.id))
          )
            count++
        }
      }
      if (i < list.length) timer = setTimeout(step, 0)
      else setDupCount(count)
    }
    timer = setTimeout(step, 1200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [dupEntries, dismissedPairs, dupThreshold])

  const shownPairs = duplicatePairs.filter(
    (p) => showDismissed || !dismissedPairs.has(pairKey(p.a.id, p.b.id))
  )
  const dismissedInRange = duplicatePairs.length - shownPairs.length

  const handleMerge = async (): Promise<void> => {
    if (!mergeSource || !mergeTarget) return
    setIsMerging(true)
    try {
      const keepName = mergeKeepName === 'source' ? mergeSource.name : mergeTarget.name
      const result = await window.api.mergeEntities(mergeSource.id, mergeTarget.id, keepName)
      showSuccess(
        `Merged successfully. Reassigned ${result.mergedAssuredLinks} assured links, ${result.mergedUBOLinks} UBO links, ${result.mergedCustomerLinks} customer links.`
      )
      setShowMergeModal(false)
      setMergeSource(null)
      setMergeTarget(null)
      setSelectedEntity(null)
      loadData()
      if (mergeFromFinder) setShowDuplicatesModal(true)
    } catch (error) {
      showError((error instanceof Error && error.message) || 'Failed to merge entities')
    } finally {
      setIsMerging(false)
    }
  }

  const handleDeleteEntity = async (entity: Entity): Promise<void> => {
    const assocVessels = getAssociatedVessels(entity.id)
    const message =
      assocVessels.length > 0
        ? `This entity is linked to ${assocVessels.length} vessel(s). Deleting it will remove all assured links. Continue?`
        : `Delete entity "${entity.name}"? This cannot be undone.`
    setDeleteConfirmation({ show: true, entity, message })
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteConfirmation.entity) return
    try {
      await window.api.deleteEntity(deleteConfirmation.entity.id)
      if (selectedEntity?.id === deleteConfirmation.entity.id) setSelectedEntity(null)
      showSuccess(`Entity "${deleteConfirmation.entity.name}" deleted`)
      loadData()
    } catch (error) {
      showError((error instanceof Error && error.message) || 'Failed to delete entity')
    } finally {
      setDeleteConfirmation({ show: false, entity: null, message: '' })
    }
  }

  // Bulk operations
  const toggleSelectEntity = (entityId: string): void => {
    setSelectedEntityIds((prev) => {
      const next = new Set(prev)
      if (next.has(entityId)) next.delete(entityId)
      else next.add(entityId)
      return next
    })
  }

  const toggleSelectAllEntities = (): void => {
    if (selectedEntityIds.size === entities.length) {
      setSelectedEntityIds(new Set())
    } else {
      setSelectedEntityIds(new Set(entities.map((e) => e.id)))
    }
  }

  const handleBulkExportEntities = (): void => {
    const selected = allEntities.filter((e) => selectedEntityIds.has(e.id))
    if (selected.length === 0) return
    const headers = ['Name', 'Type', 'Identifier', 'Email', 'Phone', 'Sanctions Status']
    const rows = selected.map((e) => [
      e.name,
      e.type,
      e.identifier || '',
      e.email || '',
      e.phone || '',
      e.ofacStatus || 'NOT CHECKED'
    ])
    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `entities-export-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showSuccess(`Exported ${selected.length} entity(ies)`)
  }

  const handleBulkDeleteEntities = async (): Promise<void> => {
    try {
      const count = await window.api.bulkDeleteEntities([...selectedEntityIds])
      showSuccess(`Deleted ${count} entity(ies)`)
      setSelectedEntityIds(new Set())
      setShowBulkDeleteConfirm(false)
      setSelectedEntity(null)
      loadData()
    } catch (error) {
      showError((error instanceof Error && error.message) || 'Failed to delete entities')
      // Some may have been deleted before one was refused
      setSelectedEntityIds(new Set())
      setShowBulkDeleteConfirm(false)
      loadData()
    }
  }

  const handleCreateEntity = async (): Promise<void> => {
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
            setSanctionsModal({
              show: true,
              searchedName: entityName,
              matches: result.matches,
              entityId
            })
          }
          setCheckingId(null)
        }
      } catch (err) {
        setCheckingId(null)
        showError(
          `Entity created, but not checked for sanctions: ${(err instanceof Error && err.message) || 'the check failed'}`
        )
      }
    } catch (error) {
      showError((error instanceof Error && error.message) || 'Failed to create entity')
    } finally {
      setIsCreating(false)
    }
  }

  // Bumped after an edit: the next load is a full reload (vessels, assureds, UBOs, docs...)
  const [reloadKey, setReloadKey] = useState(0)
  const loadData = (): void => setReloadKey((k) => k + 1)

  // Search / filter / paging only changes the page: don't re-fetch every vessel, assured,
  // UBO, entity and document on each keystroke (the full reload is for mount and edits)
  const pageReqRef = useRef(0)
  const initialLoadDone = useRef(false)
  const loadedReloadKey = useRef(reloadKey)
  useEffect(() => {
    const full = !initialLoadDone.current || loadedReloadKey.current !== reloadKey
    initialLoadDone.current = true
    loadedReloadKey.current = reloadKey
    const fetchPage = (): Promise<PaginatedResult<Entity>> =>
      window.api.getEntitiesPaginated({
        page,
        limit,
        search: debouncedSearch,
        type: typeFilter,
        ofacStatus: ofacStatusFilter as EntityQueryParams['ofacStatus'],
        customersOnly: viewMode === 'customers' ? true : undefined,
        gap: gapFilter ?? undefined
      })
    const applyPage = (result: PaginatedResult<Entity> | null | undefined): void => {
      setEntities(Array.isArray(result?.data) ? result.data : [])
      setTotal(result?.total ?? 0)
      setTotalPages(result?.totalPages ?? 1)
    }

    const loadPage = async (): Promise<void> => {
      const req = ++pageReqRef.current
      setIsLoading(true)
      try {
        const result = await fetchPage()
        if (req === pageReqRef.current) applyPage(result)
      } finally {
        if (req === pageReqRef.current) setIsLoading(false)
      }
    }

    const loadAll = async (): Promise<void> => {
      const req = ++pageReqRef.current
      setIsLoading(true)
      try {
        const [result, v, va, eu, allEnts, edTypes, allDocs, pols] = await Promise.all([
          fetchPage(),
          window.api.getVessels(),
          window.api.getVesselAssureds(),
          window.api.getEntityUBOs(),
          window.api.getEntities(),
          window.api.getEntityDocumentTypes(),
          window.api.getEntityDocuments(),
          window.api.getAllVesselDynamicPolicies()
        ])
        if (req === pageReqRef.current) applyPage(result)
        setVessels(Array.isArray(v) ? v : [])
        setVesselAssureds(Array.isArray(va) ? va : [])
        setEntityUBOs(Array.isArray(eu) ? eu : [])
        setAllEntities(Array.isArray(allEnts) ? allEnts : [])
        setEntityDocTypes(
          Array.isArray(edTypes) ? edTypes.filter((t: EntityDocumentType) => t.isActive) : []
        )
        setEntityDocs(Array.isArray(allDocs) ? allDocs : [])
        const custMap = new Map<string, string | null>()
        for (const p of Array.isArray(pols) ? pols : []) {
          if (p.status === 'active' && p.customerEntityId)
            custMap.set(p.customerEntityId, p.customerType || null)
        }
        setPolicyCustomers(custMap)
      } finally {
        if (req === pageReqRef.current) setIsLoading(false)
      }
    }

    void (full ? loadAll() : loadPage())
  }, [page, limit, debouncedSearch, typeFilter, ofacStatusFilter, viewMode, gapFilter, reloadKey])

  // "Needs attention" counts: on open and after every change
  useEffect(() => {
    let cancelled = false
    window.api
      .getEntityDirectoryStats()
      .then((s) => !cancelled && setStats(s && typeof s.total === 'number' ? s : null))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // A new search / filter / page size starts again at page 1 (adjusting state during render)
  const filterKey = JSON.stringify([
    debouncedSearch,
    typeFilter,
    ofacStatusFilter,
    limit,
    viewMode,
    gapFilter
  ])
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  // Debounced duplicate detection when typing in create modal; a closed modal or a short
  // name clears the list (adjusting state during render)
  const similarCheckOff = !showCreateModal || createForm.name.trim().length < 3
  if (similarCheckOff && similarEntities.length > 0) setSimilarEntities([])
  useEffect(() => {
    if (similarCheckTimer.current) clearTimeout(similarCheckTimer.current)
    const name = createForm.name.trim()
    if (!showCreateModal || name.length < 3) return
    similarCheckTimer.current = setTimeout(() => {
      const matches: { name: string; score: number }[] = []
      for (const ent of allEntities) {
        const score = jaroWinkler(name, ent.name)
        if (score >= 0.8) matches.push({ name: ent.name, score })
      }
      matches.sort((a, b) => b.score - a.score)
      setSimilarEntities(matches.slice(0, 5))
    }, 500)
    return () => {
      if (similarCheckTimer.current) clearTimeout(similarCheckTimer.current)
    }
  }, [createForm.name, showCreateModal, allEntities])

  // Escape key — close topmost open modal first (priority order: sanctions > merge > create)
  const handleGlobalEscape = useCallback(() => {
    if (sanctionsModal.show) {
      setSanctionsModal((prev) => ({ ...prev, show: false }))
      return
    }
    if (showMergeModal) {
      setShowMergeModal(false)
      return
    }
    if (showCreateModal) {
      setShowCreateModal(false)
      return
    }
  }, [sanctionsModal.show, showMergeModal, showCreateModal])

  useEffect(() => {
    const anyOpen = sanctionsModal.show || showMergeModal || showCreateModal
    if (!anyOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleGlobalEscape()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [sanctionsModal.show, showMergeModal, showCreateModal, handleGlobalEscape])

  // Auto-select entity from global search or recent items (once the entities are loaded),
  // then tell the parent the request is consumed
  const hasEntities = allEntities.length > 0
  const [selectedInitialId, setSelectedInitialId] = useState<string | null>(null)
  if ((initialEntityId ?? null) !== selectedInitialId && (!initialEntityId || hasEntities)) {
    setSelectedInitialId(initialEntityId ?? null)
    const entity = initialEntityId ? allEntities.find((e) => e.id === initialEntityId) : undefined
    if (entity) setSelectedEntity(entity)
  }
  useEffect(() => {
    if (initialEntityId && hasEntities) onInitialEntityConsumed?.()
  }, [initialEntityId, hasEntities, onInitialEntityConsumed])

  // Changing page closes the detail panel (adjusting state during render)
  const [prevPage, setPrevPage] = useState(page)
  if (page !== prevPage) {
    setPrevPage(page)
    setSelectedEntity(null)
  }

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
      const directIds = new Set(directLinks.map((l) => l.vesselId))
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

  const getAssociatedVessels = (entityId: string): AssociatedVessel[] => {
    const directLinks = assuredsByEntity.get(entityId) || []
    const parentIds = uboParentIds.get(entityId) || []
    const indirectLinks = parentIds.flatMap((pid) => assuredsByEntity.get(pid) || [])
    const vesselIds = new Set([
      ...directLinks.map((l) => l.vesselId),
      ...indirectLinks.map((l) => l.vesselId)
    ])
    return vessels
      .filter((v) => vesselIds.has(v.id))
      .map((v) => {
        const roles = [
          ...new Set(directLinks.filter((l) => l.vesselId === v.id).map((l) => l.role))
        ]
        const viaAssureds = indirectLinks
          .filter((l) => l.vesselId === v.id)
          .map((l) => {
            const assured = allEntities.find((e) => e.id === l.entityId)
            return `${assured?.name ?? '?'} (${l.role})`
          })
        return { ...v, roles, viaAssureds }
      })
  }

  const getVesselCount = (entityId: string): number => vesselCountByEntity.get(entityId) ?? 0

  const getParentCompanies = (entityId: string): Entity[] => {
    return (uboParentIds.get(entityId) || [])
      .map((pid) => allEntities.find((e) => e.id === pid))
      .filter((e): e is Entity => !!e)
  }

  // What a merge moves: vessel links, UBO links, documents and the sanctions status
  const renderMergeFacts = (e: Entity): React.JSX.Element => {
    const uboLinks = entityUBOs.filter(
      (u) => u.assuredEntityId === e.id || u.uboEntityId === e.id
    ).length
    const docs = getDocScore(e)
    return (
      <div
        style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginTop: '6px',
          fontSize: '0.74rem',
          color: 'var(--text-secondary)'
        }}
      >
        <span>
          {getVesselCount(e.id)} vessel link{getVesselCount(e.id) === 1 ? '' : 's'}
        </span>
        <span>
          {uboLinks} UBO link{uboLinks === 1 ? '' : 's'}
        </span>
        <span>
          Documents {docs.have}/{docs.total}
        </span>
        <SanctionsBadge status={e.ofacStatus} />
      </div>
    )
  }

  const getDocScore = (entity: Entity): { have: number; total: number } => {
    const applicableTypes = entityDocTypes.filter(
      (t) => t.isRequired && (t.entityScope === 'both' || t.entityScope === entity.type)
    )
    const docsForEntity = entityDocs.filter((d) => d.entityId === entity.id)
    const have = applicableTypes.filter((t) =>
      docsForEntity.some((d) => d.documentTypeId === t.id && d.filePath)
    ).length
    return { have, total: applicableTypes.length }
  }

  // Profile completeness (emails and phones are left out: most entities come through brokers).
  // Address is known only on directory rows (addressCount); elsewhere it is not counted.
  const getProfile = (entity: Entity): { done: number; total: number; missing: string[] } => {
    const missing: string[] = []
    let total = 0
    const docs = getDocScore(entity)
    if (docs.total > 0) {
      total++
      const n = docs.total - docs.have
      if (n > 0) missing.push(`${n} required document${n === 1 ? '' : 's'} missing`)
    }
    const row = entities.find((e) => e.id === entity.id) ?? entity
    if (entity.type === 'company' && row.addressCount !== undefined) {
      total++
      if (!row.addressCount) missing.push('No address')
    }
    if (entity.type === 'company' && (assuredsByEntity.get(entity.id)?.length ?? 0) > 0) {
      total++
      if (!entityUBOs.some((u) => u.assuredEntityId === entity.id)) missing.push('No UBOs listed')
    }
    total++
    const screened = entity.ofacCheckedAt ? new Date(entity.ofacCheckedAt).getTime() : NaN
    if (isNaN(screened) || Date.now() - screened > SCREENING_MAX_AGE_MS)
      missing.push(isNaN(screened) ? 'Never screened' : 'Screening out of date')
    return { done: total - missing.length, total, missing }
  }

  const renderProfileMeter = (
    p: { done: number; total: number; missing: string[] },
    width = 48
  ): React.JSX.Element => {
    const pct = p.total ? (p.done / p.total) * 100 : 100
    const color =
      p.done === p.total ? 'var(--success)' : p.done === 0 ? 'var(--danger)' : 'var(--warning)'
    return (
      <span
        title={p.missing.length ? p.missing.join('\n') : 'Profile complete'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <span
          aria-hidden
          style={{
            width: `${width}px`,
            height: '6px',
            borderRadius: '3px',
            background: 'var(--glass-border-color)',
            overflow: 'hidden',
            display: 'inline-block'
          }}
        >
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color }} />
        </span>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color }}>
          {p.done}/{p.total}
        </span>
      </span>
    )
  }

  const screenedLabel = (entity: Entity): React.JSX.Element => {
    if (!entity.ofacCheckedAt) return <span style={{ color: 'var(--danger)' }}>Never</span>
    const d = new Date(entity.ofacCheckedAt)
    if (isNaN(d.getTime())) return <span className="muted">-</span>
    const stale = Date.now() - d.getTime() > SCREENING_MAX_AGE_MS
    return (
      <span style={{ color: stale ? 'var(--warning)' : 'var(--text-secondary)' }}>
        {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
      </span>
    )
  }

  const handleDeleteUnused = async (): Promise<void> => {
    if (!stats) return
    const keep = stats.unused - stats.unusedDeletable
    const ok = await confirmDialog(
      `Delete ${stats.unusedDeletable} entit${stats.unusedDeletable === 1 ? 'y' : 'ies'} that are not linked to anything and have no documents?` +
        (keep > 0
          ? `\n\n${keep} unused entit${keep === 1 ? 'y has' : 'ies have'} documents on file and will be kept: check and delete those one by one.`
          : '') +
        '\n\nThis cannot be undone.'
    )
    if (!ok) return
    setDeletingUnused(true)
    try {
      const r = await window.api.deleteUnusedEntities()
      showSuccess(`Deleted ${r.deleted} unused entit${r.deleted === 1 ? 'y' : 'ies'}`)
      setSelectedEntity(null)
      loadData()
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to delete unused entities')
    } finally {
      setDeletingUnused(false)
    }
  }

  // ── OFAC handlers ───────────────────────────────────────────────────────────
  const handleOfacRecheck = async (entity: Entity): Promise<void> => {
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
        setSanctionsModal({
          show: true,
          searchedName: entity.name,
          matches: result.matches,
          entityId: entity.id
        })
      }
    } catch (error) {
      showError(
        (error instanceof Error && error.message) || 'Sanctions check failed. Please try again.'
      )
    } finally {
      setCheckingId(null)
    }
  }

  const handleVesselOfacRecheck = async (vessel: Vessel): Promise<void> => {
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
        setSanctionsModal({
          show: true,
          searchedName: vessel.name,
          matches: result.matches,
          vesselId: vessel.id
        })
      }
    } catch (error) {
      showError(
        (error instanceof Error && error.message) || 'Sanctions check failed. Please try again.'
      )
    } finally {
      setCheckingId(null)
    }
  }

  // Clear / Confirm match from the sanctions modal: the same path as the Compliance Center
  // (reason kept, pending results decided, cleared entries remembered)
  const decideFromModal = async (
    decision: 'cleared' | 'sanctioned',
    note: string
  ): Promise<void> => {
    try {
      await decideSanctionsSubject(sanctionsModal, decision, note, sanctionsModal.matches)
      showSuccess(
        `${sanctionsModal.searchedName} marked ${decision === 'cleared' ? 'cleared' : 'sanctioned'}`
      )
      setSanctionsModal({ show: false, searchedName: '', matches: [] })
      loadData()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to save the decision')
    }
  }
  const handleMarkClean = (note: string): Promise<void> => decideFromModal('cleared', note)
  const handleConfirmMatch = (note: string): Promise<void> => decideFromModal('sanctioned', note)

  const handleViewPotentialMatch = async (entity?: Entity, vessel?: Vessel): Promise<void> => {
    const id = entity?.id || vessel?.id
    const name = entity?.name || vessel?.name || ''
    if (id) setCheckingId(id)
    try {
      const result = await OfacService.checkSanctions(name)
      if (result.matches.length > 0) {
        setSanctionsModal({
          show: true,
          searchedName: name,
          matches: result.matches,
          entityId: entity?.id,
          vesselId: vessel?.id
        })
      }
    } catch (error) {
      showError(
        (error instanceof Error && error.message) ||
          'Failed to load sanctions data. Please try again.'
      )
    } finally {
      setCheckingId(null)
    }
  }

  // ── Sub-components ──────────────────────────────────────────────────────────

  const renderOfacBadge = (
    target: { entity: Entity; vessel?: undefined } | { entity?: undefined; vessel: Vessel },
    onRecheck: () => void
  ): React.JSX.Element => {
    const { entity, vessel } = target
    return (
      <SanctionsBadge
        status={(entity || vessel)?.ofacStatus}
        checking={checkingId === (entity || vessel)?.id}
        checkedAt={(entity || vessel)?.ofacCheckedAt}
        onReview={() => handleViewPotentialMatch(entity, vessel)}
        onRecheck={onRecheck}
      />
    )
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const associatedVessels = selectedEntity ? getAssociatedVessels(selectedEntity.id) : []
  const parentCompanies =
    selectedEntity?.type === 'person' ? getParentCompanies(selectedEntity.id) : []

  // A newly selected entity opens with the core-field editor closed (adjusting state during render)
  const selectedEntityId = selectedEntity?.id
  const [prevSelectedEntityId, setPrevSelectedEntityId] = useState(selectedEntityId)
  if (selectedEntityId !== prevSelectedEntityId) {
    setPrevSelectedEntityId(selectedEntityId)
    setEditingEntityCore(false)
    setPanelTab('profile')
    setNoteCount(null)
  }

  // Track recent item view when an entity is selected (addresses/commissions/docs are
  // now handled by the shared EntityEditPanel). Only a change of entity counts, not an edit.
  const selectedEntityRef = useRef(selectedEntity)
  useEffect(() => {
    selectedEntityRef.current = selectedEntity
  })
  useEffect(() => {
    const entity = selectedEntityRef.current
    if (!selectedEntityId || !entity) return
    window.api
      .recentItemsAdd('entity', entity.id, entity.name, entity.type)
      .then(() => {
        window.dispatchEvent(new Event('recent-item-added'))
      })
      .catch(() => {})
  }, [selectedEntityId])

  // ── VesselDetail drill-down ──────────────────────────────────────────────────
  if (viewingVessel) {
    return (
      <VesselDetail
        vessel={viewingVessel}
        backLabel="Back to Entity"
        onBack={() => {
          setViewingVessel(null)
          loadData()
        }}
      />
    )
  }

  const accentBg = 'var(--accent-tint)'
  const companyColor = 'var(--accent-primary)'
  const personColor = isLight ? '#9c27b0' : '#ba68c8'

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in">
      {/* Header */}
      <header
        style={{
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px' }}>Entities</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            {stats
              ? `${stats.total.toLocaleString()} owners, managers, brokers and UBOs: ${stats.companies.toLocaleString()} companies, ${stats.persons.toLocaleString()} persons`
              : 'Owners, managers, brokers and UBOs across your fleet.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          {hasPermission('entities:create') && (
            <button
              className="btn-primary"
              onClick={() => setShowCreateModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 18px',
                fontSize: '0.9rem'
              }}
            >
              <Plus size={16} /> Create Entity
            </button>
          )}
        </div>
      </header>

      {/* Needs attention: each card filters the list (click again to clear) */}
      <div
        role="group"
        aria-label="Needs attention"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
          gap: '10px',
          marginBottom: '20px'
        }}
      >
        {GAP_CARDS.map((c) => {
          const n = stats ? stats[c.key] : null
          const active = gapFilter === c.key
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={active}
              title={c.hint}
              onClick={() => setGapFilter(active ? null : c.key)}
              className="glass-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'var(--text-primary)',
                border: active
                  ? '1.5px solid var(--accent-primary)'
                  : '1px solid var(--glass-border-color)',
                background: active ? 'var(--accent-tint)' : undefined
              }}
            >
              <span
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: n ? 'var(--warning)' : 'var(--success)',
                  background: n
                    ? 'color-mix(in srgb, var(--warning) 14%, transparent)'
                    : 'color-mix(in srgb, var(--success) 14%, transparent)'
                }}
              >
                {c.icon}
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{ display: 'block', fontSize: '1.2rem', fontWeight: 700, lineHeight: 1.1 }}
                >
                  {n === null ? '-' : n.toLocaleString()}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.74rem',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {c.label}
                </span>
              </span>
            </button>
          )
        })}
        <button
          type="button"
          title="Entities with very similar names: review and merge them"
          onClick={() => setShowDuplicatesModal(true)}
          className="glass-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: 'var(--text-primary)',
            border: '1px solid var(--glass-border-color)'
          }}
        >
          <span
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: dupCount ? 'var(--warning)' : 'var(--success)',
              background: dupCount
                ? 'color-mix(in srgb, var(--warning) 14%, transparent)'
                : 'color-mix(in srgb, var(--success) 14%, transparent)'
            }}
          >
            <ScanSearch size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span
              style={{ display: 'block', fontSize: '1.2rem', fontWeight: 700, lineHeight: 1.1 }}
            >
              {dupCount === null ? '…' : dupCount.toLocaleString()}
            </span>
            <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Possible duplicate pairs
            </span>
          </span>
        </button>
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '16px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        {/* View mode */}
        <SegmentedControl
          value={viewMode}
          onChange={setViewMode}
          items={[
            { key: 'all', label: 'All Entities' },
            { key: 'customers', label: 'Customers' }
          ]}
        />

        <div style={{ flex: 1 }} />

        {/* Type filter */}
        <SegmentedControl
          value={typeFilter}
          onChange={setTypeFilter}
          items={[
            { key: 'all', label: 'All types' },
            { key: 'company', label: 'Companies', icon: <Building2 size={13} /> },
            { key: 'person', label: 'Persons', icon: <User size={13} /> }
          ]}
        />

        {/* OFAC filter */}
        <select
          value={ofacStatusFilter}
          onChange={(e) => setOfacStatusFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: '0.82rem', minWidth: '140px' }}
          aria-label="Filter by sanctions status"
        >
          <option value="all">All Statuses</option>
          <option value="CLEARED">Cleared</option>
          <option value="POTENTIAL_MATCH">Potential Match</option>
          <option value="MATCH">Match</option>
          <option value="PENDING">Pending</option>
        </select>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)'
            }}
            size={15}
          />
          <input
            type="text"
            placeholder="Search entities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              paddingLeft: '34px',
              paddingRight: '10px',
              width: '220px',
              fontSize: '0.88rem'
            }}
          />
        </div>
        <button
          onClick={() => {
            setSelectMode((prev) => {
              if (prev) setSelectedEntityIds(new Set())
              return !prev
            })
          }}
          className={selectMode ? 'btn-primary' : 'btn-secondary'}
          style={{
            padding: '7px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.82rem'
          }}
          title={
            selectMode
              ? 'Hide the checkboxes'
              : 'Tick several entities to export or delete them together'
          }
        >
          <CheckSquare size={15} />
          {selectMode ? 'Done' : 'Bulk select'}
        </button>
      </div>

      {/* The "needs attention" filter in use */}
      {gapFilter && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            padding: '8px 14px',
            marginBottom: '12px',
            borderRadius: '10px',
            background: 'var(--accent-tint)',
            border: '1px solid var(--accent-border)',
            fontSize: '0.84rem'
          }}
        >
          <span>
            Showing <strong>{GAP_CARDS.find((c) => c.key === gapFilter)?.label}</strong>
            {' · '}
            {total.toLocaleString()} entit{total === 1 ? 'y' : 'ies'}
            <span className="muted"> ({GAP_CARDS.find((c) => c.key === gapFilter)?.hint})</span>
          </span>
          <div style={{ flex: 1 }} />
          {gapFilter === 'unused' &&
            hasPermission('entities:delete') &&
            stats &&
            stats.unusedDeletable > 0 && (
              <button
                className="btn-secondary btn-sm"
                style={{ color: 'var(--danger)' }}
                disabled={deletingUnused}
                onClick={() => void handleDeleteUnused()}
                title="Deletes the unused entities that have no documents on file"
              >
                <Trash2 size={13} />{' '}
                {deletingUnused
                  ? 'Deleting...'
                  : `Delete ${stats.unusedDeletable} without documents`}
              </button>
            )}
          <button className="btn-secondary btn-sm" onClick={() => setGapFilter(null)}>
            <X size={13} /> Clear filter
          </button>
        </div>
      )}

      {/* Bulk Action Toolbar */}
      {selectMode && selectedEntityIds.size > 0 && (
        <div
          className="glass-card fade-in"
          style={{
            padding: '10px 20px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--accent-tint)',
            border: '1px solid var(--accent-primary)',
            position: 'sticky',
            top: 0,
            zIndex: 10
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--accent-primary)' }}>
            {selectedEntityIds.size} selected
          </span>
          <div style={{ width: '1px', height: '20px', background: 'var(--glass-border-color)' }} />
          <button
            className="btn-secondary"
            onClick={handleBulkExportEntities}
            style={{
              padding: '6px 12px',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Download size={13} /> Export Selected
          </button>
          {hasPermission('entities:delete') && (
            <button
              className="btn-secondary"
              onClick={() => setShowBulkDeleteConfirm(true)}
              style={{
                padding: '6px 12px',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: 'var(--danger)'
              }}
            >
              <Trash2 size={13} /> Delete Selected
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setSelectedEntityIds(new Set())}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '0.82rem',
              padding: '6px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <X size={13} /> Clear
          </button>
        </div>
      )}

      {/* Main: table + slide-in panel */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Table */}
        <div className="table-wrap" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div
            style={{
              overflowX: 'auto',
              overflowY: 'auto',
              maxHeight: 'calc(100vh - 380px)',
              position: 'relative'
            }}
          >
            <table className="data-table" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                {selectMode && <col style={{ width: '40px' }} />}
                {ENTITY_COLUMNS.filter((c) => entVisSet.has(c.id)).map((c) => (
                  <col key={c.id} style={{ width: COLUMN_WIDTHS[c.id] ?? 'auto' }} />
                ))}
                <col style={{ width: '36px' }} />
              </colgroup>
              <thead>
                <tr>
                  {selectMode && (
                    <th style={{ width: '40px' }}>
                      <div
                        onClick={toggleSelectAllEntities}
                        style={{
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          color: 'var(--accent-primary)'
                        }}
                        title={
                          selectedEntityIds.size === entities.length ? 'Deselect all' : 'Select all'
                        }
                      >
                        {selectedEntityIds.size === entities.length && entities.length > 0 ? (
                          <CheckSquare size={15} />
                        ) : (
                          <Square size={15} style={{ opacity: 0.4 }} />
                        )}
                      </div>
                    </th>
                  )}
                  {ENTITY_COLUMNS.filter((col) => entVisSet.has(col.id)).map((col) => (
                    <th key={col.id}>{col.label}</th>
                  ))}
                  <th style={{ width: '36px', padding: '10px 8px' }}>
                    <ColumnSelector
                      pageKey="entities"
                      allColumns={ENTITY_COLUMNS}
                      visibleColumns={entVisibleCols}
                      onChange={setEntVisibleCols}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && entities.length === 0 ? (
                  <tr>
                    <td
                      colSpan={entVisibleCols.length + (selectMode ? 2 : 1)}
                      className="muted"
                      style={{ padding: '48px', textAlign: 'center' }}
                    >
                      <Loader2
                        size={22}
                        className="spinner"
                        style={{ marginBottom: '10px', display: 'block', margin: '0 auto 10px' }}
                      />
                      Loading entities...
                    </td>
                  </tr>
                ) : entities.length === 0 ? (
                  <tr>
                    <td
                      colSpan={entVisibleCols.length + (selectMode ? 2 : 1)}
                      style={{ padding: '48px', textAlign: 'center' }}
                    >
                      <EmptyState
                        compact
                        icon={<Shield size={34} />}
                        title={searchTerm ? 'No entities match your search' : 'No entities found'}
                        text={
                          searchTerm
                            ? 'Type and status filters also apply.'
                            : 'Entities are the owners, managers, brokers and UBOs linked to vessels.'
                        }
                        action={
                          searchTerm ? (
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => setSearchTerm('')}
                            >
                              Clear search
                            </button>
                          ) : (
                            hasPermission('entities:create') && (
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => setShowCreateModal(true)}
                              >
                                <Plus size={14} /> Create Entity
                              </button>
                            )
                          )
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  entities.map((entity: Entity) => {
                    const isSelected = selectedEntity?.id === entity.id
                    const isBulkChecked = selectedEntityIds.has(entity.id)
                    const score = getDocScore(entity)
                    const vcount = getVesselCount(entity.id)
                    const docColor =
                      score.have === score.total
                        ? 'var(--success)'
                        : score.have === 0
                          ? 'var(--danger)'
                          : 'var(--warning)'

                    return (
                      <tr
                        key={entity.id}
                        onClick={() => setSelectedEntity(isSelected ? null : entity)}
                        className={isSelected || isBulkChecked ? 'clickable selected' : 'clickable'}
                      >
                        {/* Checkbox */}
                        {selectMode && (
                          <td style={{ width: '40px' }} onClick={(e) => e.stopPropagation()}>
                            <div
                              onClick={() => toggleSelectEntity(entity.id)}
                              style={{
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: isBulkChecked
                                  ? 'var(--accent-primary)'
                                  : 'var(--text-secondary)'
                              }}
                            >
                              {isBulkChecked ? (
                                <CheckSquare size={15} />
                              ) : (
                                <Square size={15} style={{ opacity: 0.4 }} />
                              )}
                            </div>
                          </td>
                        )}
                        {/* Name */}
                        {entVisSet.has('name') && (
                          <td style={{ overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div
                                style={{
                                  width: '34px',
                                  height: '34px',
                                  borderRadius: '8px',
                                  background:
                                    entity.type === 'company'
                                      ? accentBg
                                      : isLight
                                        ? 'rgba(156,39,176,0.1)'
                                        : 'rgba(186,104,200,0.1)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}
                              >
                                {entity.type === 'company' ? (
                                  <Building2 size={16} color={companyColor} />
                                ) : (
                                  <User size={16} color={personColor} />
                                )}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: '0.88rem',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}
                                >
                                  {entity.name}
                                </div>
                                {entity.identifier && (
                                  <div
                                    style={{
                                      fontSize: '0.72rem',
                                      color: 'var(--text-secondary)',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                  >
                                    {entity.identifier}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        )}
                        {/* Type */}
                        {entVisSet.has('type') && (
                          <td>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.4px',
                                background:
                                  entity.type === 'company'
                                    ? accentBg
                                    : isLight
                                      ? 'rgba(156,39,176,0.1)'
                                      : 'rgba(186,104,200,0.1)',
                                color: entity.type === 'company' ? companyColor : personColor
                              }}
                            >
                              {entity.type}
                            </span>
                          </td>
                        )}
                        {/* Profile completeness */}
                        {entVisSet.has('profile') && (
                          <td>{renderProfileMeter(getProfile(entity))}</td>
                        )}
                        {/* Sanctions */}
                        {entVisSet.has('sanctions') && (
                          <td>{renderOfacBadge({ entity }, () => handleOfacRecheck(entity))}</td>
                        )}
                        {/* Last screened */}
                        {entVisSet.has('screened') && (
                          <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                            {screenedLabel(entity)}
                          </td>
                        )}
                        {/* Documents */}
                        {entVisSet.has('documents') && (
                          <td>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: docColor }}>
                              {score.have}/{score.total}
                            </span>
                          </td>
                        )}
                        {/* Vessels */}
                        {entVisSet.has('vessels') && (
                          <td>
                            {vcount > 0 ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  color: 'var(--accent-primary)',
                                  background: accentBg,
                                  padding: '2px 8px',
                                  borderRadius: '10px'
                                }}
                              >
                                <Ship size={11} />
                                {vcount}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                —
                              </span>
                            )}
                          </td>
                        )}
                        <td style={{ width: '36px' }} />
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 16px',
                borderTop: '1px solid var(--table-border)',
                fontSize: '0.82rem'
              }}
            >
              <div style={{ color: 'var(--text-secondary)' }}>
                {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  className="btn-secondary"
                  disabled={page === 1}
                  onClick={() => setPage(1)}
                  style={{ padding: '4px 6px' }}
                >
                  <ChevronsLeft size={13} />
                </button>
                <button
                  title="Previous"
                  aria-label="Previous"
                  className="btn-secondary"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ padding: '4px 6px' }}
                >
                  <ChevronLeft size={13} />
                </button>
                <span style={{ margin: '0 6px', color: 'var(--text-secondary)' }}>
                  {page}/{totalPages}
                </span>
                <button
                  title="Next"
                  aria-label="Next"
                  className="btn-secondary"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{ padding: '4px 6px' }}
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  className="btn-secondary"
                  disabled={page === totalPages}
                  onClick={() => setPage(totalPages)}
                  style={{ padding: '4px 6px' }}
                >
                  <ChevronsRight size={13} />
                </button>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  style={{ marginLeft: '8px', padding: '3px 6px', fontSize: '0.82rem' }}
                >
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
          <div
            className="glass-card fade-in"
            style={{
              width: '460px',
              flexShrink: 0,
              padding: 0,
              maxHeight: 'calc(100vh - 280px)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Panel header */}
            <div
              style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--table-border)' }}
            >
              {/* Top: avatar + close */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {selectedEntity.type === 'company' ? (
                    <Building2 size={24} color="white" />
                  ) : (
                    <User size={24} color="white" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '1.05rem',
                      lineHeight: 1.2,
                      marginBottom: '4px',
                      wordBreak: 'break-word'
                    }}
                  >
                    {selectedEntity.name}
                  </div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '1px 7px',
                      borderRadius: '4px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      background:
                        selectedEntity.type === 'company'
                          ? accentBg
                          : isLight
                            ? 'rgba(156,39,176,0.1)'
                            : 'rgba(186,104,200,0.1)',
                      color: selectedEntity.type === 'company' ? companyColor : personColor
                    }}
                  >
                    {selectedEntity.type}
                  </span>
                </div>
                <button
                  title="Close"
                  aria-label="Close"
                  onClick={() => setSelectedEntity(null)}
                  style={{
                    padding: '4px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    flexShrink: 0
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* UBO of (persons only) */}
              {parentCompanies.length > 0 && (
                <div
                  style={{
                    marginTop: '10px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '5px',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <Link2
                    size={13}
                    color="var(--accent-primary)"
                    style={{ marginTop: '1px', flexShrink: 0 }}
                  />
                  <div>
                    <span style={{ marginRight: '4px' }}>UBO of:</span>
                    {parentCompanies.map((c, i) => (
                      <span key={c.id} style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {c.name}
                        {i < parentCompanies.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Profile completeness + quick facts */}
              {(() => {
                const p = getProfile(selectedEntity)
                const custType = policyCustomers.get(selectedEntity.id)
                return (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
                      border: '1px solid var(--table-border)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="muted" style={{ fontSize: '0.76rem', fontWeight: 600 }}>
                        Profile
                      </span>
                      {renderProfileMeter(p, 90)}
                      <span style={{ flex: 1 }} />
                      <SanctionsBadge status={selectedEntity.ofacStatus} />
                    </div>
                    {p.missing.length > 0 && (
                      <div
                        style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}
                      >
                        {p.missing.map((m) => (
                          <span
                            key={m}
                            style={{
                              fontSize: '0.72rem',
                              padding: '1px 8px',
                              borderRadius: '10px',
                              color: 'var(--warning)',
                              background: 'color-mix(in srgb, var(--warning) 12%, transparent)'
                            }}
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                    <div
                      className="muted"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '4px 14px',
                        marginTop: '8px',
                        fontSize: '0.76rem'
                      }}
                    >
                      <span>
                        <Ship size={11} style={{ verticalAlign: '-1px' }} /> Assured on{' '}
                        {getVesselCount(selectedEntity.id)} vessel
                        {getVesselCount(selectedEntity.id) === 1 ? '' : 's'}
                      </span>
                      {custType !== undefined && (
                        <span>
                          <Briefcase size={11} style={{ verticalAlign: '-1px' }} /> Customer
                          {custType ? ` (${custType})` : ''}
                        </span>
                      )}
                      <span>Screened {screenedLabel(selectedEntity)}</span>
                      {selectedEntity.identifier && (
                        <span>
                          <IdCard size={11} style={{ verticalAlign: '-1px' }} />{' '}
                          {selectedEntity.identifier}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Directory-level actions (edit / merge / delete / remap) */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '14px', flexWrap: 'wrap' }}>
                {hasPermission('entities:edit') && (
                  <button
                    onClick={() => setEditingEntityCore(true)}
                    className="btn-secondary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <Pencil size={13} /> Edit
                  </button>
                )}
                <button
                  onClick={() => openMergeModal(selectedEntity)}
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <Merge size={13} /> Merge
                </button>
                {hasPermission('entities:delete') && (
                  <button
                    title="Delete"
                    aria-label="Delete"
                    onClick={() => handleDeleteEntity(selectedEntity)}
                    className="btn-secondary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      color: 'var(--danger)'
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                <button
                  onClick={() => setShowEntityRemapModal(true)}
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  title="Remap entity file paths"
                >
                  <FolderOpen size={13} /> Remap
                </button>
              </div>
            </div>

            <Tabs
              value={panelTab}
              onChange={setPanelTab}
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                background: 'var(--bg-card)',
                padding: '0 16px',
                marginBottom: 0
              }}
              items={[
                { key: 'profile', label: 'Profile' },
                {
                  key: 'business',
                  label: 'Business',
                  icon: <Briefcase size={14} />,
                  count: getVesselCount(selectedEntity.id) || undefined
                },
                {
                  key: 'notes',
                  label: 'Notes & history',
                  icon: <StickyNote size={14} />,
                  count: noteCount || undefined
                }
              ]}
            />

            {/* Entity-level editing - shared with the vessel Assured tab */}
            {panelTab === 'profile' && (
              <EntityEditPanel
                entityId={selectedEntity.id}
                canManage={hasPermission('entities:edit')}
                onChanged={loadData}
                editing={editingEntityCore}
                onEditingChange={setEditingEntityCore}
                hideBusiness
              />
            )}

            {panelTab === 'notes' && (
              <EntityNotesHistory
                key={selectedEntity.id}
                entityId={selectedEntity.id}
                canAdd={hasPermission('entities:edit')}
                onCountChange={setNoteCount}
              />
            )}

            {/* Vessels, then the quotations / policies / receipts where it is the customer */}
            {panelTab === 'business' && (
              <>
                <div style={{ padding: '16px 20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px'
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.7px',
                        color: 'var(--text-secondary)',
                        fontWeight: 600
                      }}
                    >
                      Vessels as assured / UBO
                      {associatedVessels.length > 0 && (
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
                          {associatedVessels.length}
                        </span>
                      )}
                    </div>
                    {policyCustomers.has(selectedEntity.id) && (
                      <button
                        onClick={async () => {
                          setExportingCompliance(true)
                          try {
                            const { exportCustomerCompliancePDF } =
                              await import('../services/CustomerComplianceExport')
                            await exportCustomerCompliancePDF(
                              selectedEntity.id,
                              selectedEntity.name,
                              policyCustomers.get(selectedEntity.id) ?? null
                            )
                          } finally {
                            setExportingCompliance(false)
                          }
                        }}
                        disabled={exportingCompliance}
                        className="btn-secondary"
                        style={{
                          padding: '3px 10px',
                          fontSize: '0.74rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="12" y1="18" x2="12" y2="12" />
                          <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                        {exportingCompliance ? 'Exporting...' : 'PDF'}
                      </button>
                    )}
                  </div>

                  {associatedVessels.length === 0 ? (
                    <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
                      Not an assured or UBO on any vessel.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {associatedVessels.map((vessel: AssociatedVessel, i: number) => (
                        <div
                          key={vessel.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            padding: '10px 0',
                            borderBottom:
                              i < associatedVessels.length - 1
                                ? '1px solid var(--table-border)'
                                : 'none'
                          }}
                        >
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '7px',
                              background: accentBg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              marginTop: '1px'
                            }}
                          >
                            <Ship size={13} color={companyColor} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                color: 'var(--accent-primary)',
                                textTransform: 'uppercase',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              onClick={() => setViewingVessel(vessel)}
                            >
                              {vessel.name}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                marginTop: '3px',
                                flexWrap: 'wrap'
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  color: 'var(--text-secondary)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '2px'
                                }}
                              >
                                <Hash size={10} />
                                {vessel.imoNumber}
                              </span>
                              {vessel.roles.map((r, ri) => (
                                <span
                                  key={ri}
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: accentBg,
                                    color: companyColor,
                                    fontWeight: 500
                                  }}
                                >
                                  {r}
                                </span>
                              ))}
                              {vessel.viaAssureds.map((r, ri) => (
                                <span
                                  key={ri}
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background:
                                      'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--table-border)'
                                  }}
                                >
                                  via {r}
                                </span>
                              ))}
                            </div>
                          </div>
                          {renderOfacBadge({ vessel }, () => handleVesselOfacRecheck(vessel))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <EntityBusinessSection
                  key={selectedEntity.id}
                  entityId={selectedEntity.id}
                  sectionLabel={{
                    fontSize: '0.68rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.7px',
                    color: 'var(--text-secondary)',
                    fontWeight: 600
                  }}
                  alwaysOpen
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}

      {/* Create Entity Modal */}
      {showCreateModal && (
        <Modal
          title="Create Entity"
          icon={<Plus size={18} />}
          onClose={() => setShowCreateModal(false)}
          width={480}
          closeOnOverlay={false}
          footer={
            <>
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleCreateEntity}
                className="btn-primary"
                disabled={!createForm.name.trim() || isCreating}
              >
                {isCreating ? <Loader2 size={14} className="spinner" /> : <Plus size={14} />} Create
                Entity
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Name" required span="all">
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', paddingRight: '44px' }}
                  placeholder="Entity name"
                  autoFocus
                />
                <CaseToggleBtn
                  value={createForm.name}
                  onChange={(v) => setCreateForm((f) => ({ ...f, name: v }))}
                />
              </div>
              {similarEntities.length > 0 && (
                <div
                  style={{
                    marginTop: '2px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
                    border: isLight
                      ? '1px solid rgba(200,120,0,0.2)'
                      : '1px solid rgba(255,193,7,0.15)',
                    fontSize: '0.8rem',
                    color: 'var(--warning)'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '6px',
                      fontWeight: 600
                    }}
                  >
                    <AlertTriangle size={14} /> Similar entities found:
                  </div>
                  {similarEntities.map((s, i) => (
                    <div key={i} style={{ paddingLeft: '20px', lineHeight: 1.6 }}>
                      &bull; &ldquo;{s.name}&rdquo; ({Math.round(s.score * 100)}% match)
                    </div>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Type" span="all">
              <select
                value={createForm.type}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, type: e.target.value as 'company' | 'person' }))
                }
              >
                <option value="company">Company</option>
                <option value="person">Person</option>
              </select>
            </Field>
            <Field label="Identifier" span="all">
              <input
                type="text"
                value={createForm.identifier}
                onChange={(e) => setCreateForm((f) => ({ ...f, identifier: e.target.value }))}
                placeholder="Optional note to distinguish same-named entities"
              />
            </Field>
            <Field label="Email(s)" span="all">
              <input
                type="text"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Separate multiple emails with commas"
              />
            </Field>
            <Field label="Phone" span="all">
              <input
                type="text"
                value={createForm.phone}
                onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Phone number"
              />
            </Field>
          </div>
        </Modal>
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
        <Modal
          title="Merge Entities"
          icon={<Merge size={18} />}
          onClose={() => {
            setShowMergeModal(false)
            if (mergeFromFinder) setShowDuplicatesModal(true)
          }}
          width={560}
          closeOnOverlay={false}
          footer={
            <>
              <button
                onClick={() => {
                  setShowMergeModal(false)
                  if (mergeFromFinder) setShowDuplicatesModal(true)
                }}
                className="btn-secondary"
              >
                {mergeFromFinder ? 'Back to duplicates' : 'Cancel'}
              </button>
              <button
                onClick={handleMerge}
                className="btn-danger"
                disabled={!mergeTarget || isMerging}
              >
                {isMerging ? <Loader2 size={14} className="spinner" /> : <Merge size={14} />}
                {isMerging ? 'Merging...' : 'Merge Entities'}
              </button>
            </>
          }
        >
          <div
            style={{
              marginBottom: '20px',
              padding: '14px',
              borderRadius: '10px',
              background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
              fontSize: '0.82rem',
              color: 'var(--warning)'
            }}
          >
            <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            This will merge the source entity INTO the target. All vessel links, UBOs, and customer
            assignments will be transferred. The source entity will be deleted.
          </div>
          <div className="form-grid">
            <Field label="Source (will be deleted)" span="all">
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'color-mix(in srgb, var(--danger) 6%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                {mergeSource.type === 'company' ? (
                  <Building2 size={18} color={companyColor} />
                ) : (
                  <User size={18} color={personColor} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600' }}>{mergeSource.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {mergeSource.type}
                    {mergeSource.identifier ? ` - ${mergeSource.identifier}` : ''}
                  </div>
                  {renderMergeFacts(mergeSource)}
                </div>
                {mergeTarget && (
                  <button
                    onClick={() => {
                      setMergeSource(mergeTarget)
                      setMergeTarget(mergeSource)
                      setMergeKeepName((k) => (k === 'target' ? 'source' : 'target'))
                    }}
                    className="btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                    title="Keep this one instead and delete the other"
                  >
                    <ArrowUpDown size={13} /> Swap
                  </button>
                )}
              </div>
            </Field>
            <Field label="Target (will be kept)" span="all">
              {mergeTarget ? (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, var(--success) 6%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  {mergeTarget.type === 'company' ? (
                    <Building2 size={18} color={companyColor} />
                  ) : (
                    <User size={18} color={personColor} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600' }}>{mergeTarget.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {mergeTarget.type}
                      {mergeTarget.identifier ? ` - ${mergeTarget.identifier}` : ''}
                    </div>
                    {renderMergeFacts(mergeTarget)}
                  </div>
                  <button
                    onClick={() => {
                      setMergeTarget(null)
                      setMergeSearch('')
                    }}
                    className="btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <Search
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-secondary)'
                    }}
                    size={14}
                  />
                  <input
                    type="text"
                    value={mergeSearch}
                    onChange={(e) => setMergeSearch(e.target.value)}
                    placeholder="Search for target entity..."
                    style={{ width: '100%', paddingLeft: '34px' }}
                    autoFocus
                  />
                  {mergeSearchResults.length > 0 && (
                    <div
                      style={{
                        marginTop: '4px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        border: '1px solid var(--glass-border-color)',
                        borderRadius: '8px',
                        background: 'var(--bg-primary)'
                      }}
                    >
                      {mergeSearchResults.map((e) => (
                        <div
                          key={e.id}
                          onClick={() => {
                            setMergeTarget(e)
                            setMergeSearch('')
                          }}
                          style={{
                            padding: '10px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            borderBottom: '1px solid var(--table-border)'
                          }}
                          className="hover-effect"
                        >
                          {e.type === 'company' ? (
                            <Building2 size={14} opacity={0.5} />
                          ) : (
                            <User size={14} opacity={0.5} />
                          )}
                          <span style={{ flex: 1 }}>{e.name}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {e.type}
                            {e.identifier ? ` - ${e.identifier}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Field>
            {mergeTarget && (
              <Field label="Keep which name?" span="all">
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setMergeKeepName('target')}
                    className={mergeKeepName === 'target' ? 'btn-primary' : 'btn-secondary'}
                    style={{ flex: 1, padding: '10px', fontSize: '0.82rem' }}
                  >
                    {mergeTarget.name}
                  </button>
                  <button
                    onClick={() => setMergeKeepName('source')}
                    className={mergeKeepName === 'source' ? 'btn-primary' : 'btn-secondary'}
                    style={{ flex: 1, padding: '10px', fontSize: '0.82rem' }}
                  >
                    {mergeSource.name}
                  </button>
                </div>
              </Field>
            )}
          </div>
        </Modal>
      )}

      {/* Bulk Delete Confirmation */}
      {showBulkDeleteConfirm && (
        <ConfirmationModal
          title="Delete Selected Entities?"
          message={`Delete ${selectedEntityIds.size} entity(ies)? This will remove all assured links and customer assignments. This cannot be undone.`}
          confirmLabel="Delete All"
          isDangerous={true}
          onConfirm={handleBulkDeleteEntities}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}

      {/* Entity Remap Modal */}
      {showEntityRemapModal && selectedEntity && (
        <RemapFilePathsModal
          entityId={selectedEntity.id}
          entityName={selectedEntity.name}
          onClose={() => setShowEntityRemapModal(false)}
        />
      )}

      {/* Duplicate Finder Modal */}
      {showDuplicatesModal && (
        <Modal
          title="Duplicate Finder"
          icon={<ScanSearch size={18} />}
          onClose={() => setShowDuplicatesModal(false)}
          width={780}
          closeOnOverlay={false}
          footer={
            <button onClick={() => setShowDuplicatesModal(false)} className="btn-secondary">
              Close
            </button>
          }
        >
          <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Companies or persons whose names match closely, ignoring punctuation and common words
            such as Shipping, Maritime, Co. or Ltd.
          </p>

          {/* Threshold control */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'var(--table-header-bg)',
              marginBottom: '18px'
            }}
          >
            <label
              style={{
                fontSize: '0.83rem',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap'
              }}
            >
              Similarity threshold:
            </label>
            <input
              type="range"
              min={70}
              max={99}
              value={dupThreshold}
              onChange={(e) => setDupThreshold(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
            />
            <span
              style={{
                fontSize: '0.9rem',
                fontWeight: '700',
                color: 'var(--accent-primary)',
                minWidth: '38px',
                textAlign: 'right'
              }}
            >
              {dupThreshold}%
            </span>
            <span
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap'
              }}
            >
              — {shownPairs.length} pair{shownPairs.length !== 1 ? 's' : ''} found
            </span>
          </div>
          {(dismissedInRange > 0 || showDismissed) && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                margin: '-8px 0 12px'
              }}
            >
              <input
                type="checkbox"
                checked={showDismissed}
                onChange={(e) => setShowDismissed(e.target.checked)}
              />
              Show pairs marked not duplicates ({dismissedInRange})
            </label>
          )}

          {/* Results */}
          {shownPairs.length === 0 ? (
            <EmptyState
              compact
              icon={<CheckCircle2 size={34} />}
              title="No duplicates found"
              text={`No entities share ${dupThreshold}%+ name similarity.`}
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Entity A</th>
                    <th>Entity B</th>
                    <th style={{ textAlign: 'center', width: '80px' }}>Score</th>
                    <th style={{ width: '170px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {shownPairs.map((pair) => (
                    <tr key={pairKey(pair.a.id, pair.b.id)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {pair.a.type === 'company' ? (
                            <Building2 size={14} color={companyColor} />
                          ) : (
                            <User size={14} color={personColor} />
                          )}
                          <div>
                            <div style={{ fontWeight: '600' }}>{pair.a.name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {pair.a.type}
                              {pair.a.identifier ? ` · ${pair.a.identifier}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {pair.b.type === 'company' ? (
                            <Building2 size={14} color={companyColor} />
                          ) : (
                            <User size={14} color={personColor} />
                          )}
                          <div>
                            <div style={{ fontWeight: '600' }}>{pair.b.name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {pair.b.type}
                              {pair.b.identifier ? ` · ${pair.b.identifier}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '20px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            background:
                              pair.score >= 0.97
                                ? 'rgba(255,77,77,0.12)'
                                : pair.score >= 0.92
                                  ? 'rgba(255,193,7,0.12)'
                                  : 'rgba(0,200,100,0.1)',
                            color:
                              pair.score >= 0.97
                                ? 'var(--danger)'
                                : pair.score >= 0.92
                                  ? 'var(--warning)'
                                  : 'var(--success)'
                          }}
                        >
                          {Math.round(pair.score * 100)}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn-secondary"
                          style={{
                            padding: '5px 10px',
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          onClick={() => {
                            setShowDuplicatesModal(false)
                            // The one with more links is kept by default
                            const aLinks = getVesselCount(pair.a.id)
                            const bLinks = getVesselCount(pair.b.id)
                            if (aLinks >= bLinks) void openMergeModal(pair.b, pair.a, true)
                            else void openMergeModal(pair.a, pair.b, true)
                          }}
                          title="Merge this pair (both sides filled in, swap if needed)"
                        >
                          <Merge size={13} /> Merge
                        </button>
                        {dismissedPairs.has(pairKey(pair.a.id, pair.b.id)) ? (
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => setDismissed(pairKey(pair.a.id, pair.b.id), false)}
                            title="Show this pair again"
                          >
                            Undo
                          </button>
                        ) : (
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => setDismissed(pairKey(pair.a.id, pair.b.id), true)}
                            title="These are different parties: hide the pair"
                          >
                            Not duplicates
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
