import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Plus,
  Search,
  FileText,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Star,
  // Save unused after toolbar redesign
  X,
  Loader2,
  Layers,
  CheckSquare,
  Square,
  FolderPlus,
  Tag,
  Edit3,
  Users,
  User,
  Lock
} from 'lucide-react'
import { Quotation, QuotationType } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { formatDateOrDash } from '../utils/dateUtils'
import ConfirmationModal from './ConfirmationModal'
import ColumnSelector, { useColumnPrefs, ColumnDef } from './ColumnSelector'

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' },
  sent: { bg: 'rgba(0, 150, 255, 0.15)', text: '#0096ff' },
  approved: { bg: 'rgba(0, 200, 100, 0.15)', text: '#00c864' },
  exported: { bg: 'rgba(0, 170, 200, 0.15)', text: '#00aac8' },
  rejected: { bg: 'rgba(255, 77, 77, 0.15)', text: '#ff4d4d' },
  converted: { bg: 'rgba(180, 100, 255, 0.15)', text: '#b464ff' }
}

type SortField =
  | 'referenceNumber'
  | 'quotationTypeName'
  | 'quotationDate'
  | 'vesselName'
  | 'coName'
  | 'conditions'
  | 'premiumAmount'
  | 'status'
  | 'updatedAt'
type SortDir = 'asc' | 'desc'
type GroupBy = 'none' | 'type' | 'vessel' | 'customer'

const PAGE_SIZE = 25

interface QuotationListProps {
  onOpenQuotation: (quotation: Quotation) => void
}

interface PaginatedData {
  rows: any[]
  total: number
  stats: {
    total: number
    byStatus: Record<string, number>
    byType: { code: string; name: string; count: number }[]
  }
}

interface SavedFilter {
  id: string
  name: string
  filters: any
  order: number
}

export default function QuotationList({ onOpenQuotation }: QuotationListProps) {
  const [quotationTypes, setQuotationTypes] = useState<QuotationType[]>([])
  const [data, setData] = useState<PaginatedData>({
    rows: [],
    total: 0,
    stats: { total: 0, byStatus: {}, byType: [] }
  })
  const [loading, setLoading] = useState(false)

  // Filter state
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [renewalFilter, setRenewalFilter] = useState<string>('all')
  const [viewFilter, setViewFilter] = useState<'all' | 'registry' | 'drafts' | 'active' | 'converted'>('active')
  const [createdByFilter, setCreatedByFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Month navigation — always reset to current month on mount
  const [navYear, setNavYear] = useState(() => new Date().getFullYear())
  const [navMonth, setNavMonth] = useState(() => new Date().getMonth())
  const [isSearchActive, setIsSearchActive] = useState(false)
  useEffect(() => { setNavYear(new Date().getFullYear()); setNavMonth(new Date().getMonth()) }, [])
  const [sortField, setSortField] = useState<SortField>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)
  const [groupBy, setGroupBy] = useState<GroupBy>('none')

  // Select mode state (bulk operations)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false)

  // Quotation groups state
  const [qGroups, setQGroups] = useState<{ id: string; name: string; userId: string | null; color: string | null; order: number; memberCount: number }[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [showGroupManager, setShowGroupManager] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState('#00aac8')
  const [newGroupPersonal, setNewGroupPersonal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [editGroupName, setEditGroupName] = useState('')
  const [editGroupColor, setEditGroupColor] = useState('')
  const [showAddToGroup, setShowAddToGroup] = useState(false)

  // Auxiliary state
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [creators, setCreators] = useState<string[]>([])
  const [showSaveFilterInput, setShowSaveFilterInput] = useState(false)
  const [newFilterName, setNewFilterName] = useState('')
  const [favoritesCollapsed, setFavoritesCollapsed] = useState(false)

  // UI state
  const [deleteModal, setDeleteModal] = useState<{
    show: boolean
    quotation: Quotation | null
    revisionCount: number
    deleteMode: 'single' | 'all'
  } | null>(null)
  const [showNewMenu, setShowNewMenu] = useState(false)
  const { showSuccess, showError } = useToast()
  const { theme } = useTheme()
  const { hasPermission, user } = useAuth()
  const isLight = theme === 'light'
  const loadIdRef = useRef(0)

  // Column preferences
  const QUOTATION_COLUMNS: ColumnDef[] = [
    { id: 'referenceNumber', label: 'Reference', defaultVisible: true },
    { id: 'quotationTypeName', label: 'Type', defaultVisible: true },
    { id: 'quotationDate', label: 'Date', defaultVisible: true },
    { id: 'vesselName', label: 'Vessel', defaultVisible: true },
    { id: 'coName', label: 'Customer', defaultVisible: true },
    { id: 'conditions', label: 'Conditions', defaultVisible: true },
    { id: 'premiumAmount', label: 'Premium', defaultVisible: true },
    { id: 'status', label: 'Status', defaultVisible: true },
    { id: 'updatedAt', label: 'Updated', defaultVisible: true },
    { id: 'actions', label: 'Actions', defaultVisible: true }
  ]
  const { visibleColumns: qVisibleColumns, setVisibleColumns: setQVisibleColumns } = useColumnPrefs(
    'quotations',
    QUOTATION_COLUMNS
  )
  const qVisibleSet = new Set(qVisibleColumns)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Month navigation → auto-set dateFrom/dateTo (current month + next month)
  useEffect(() => {
    if (isSearchActive) return
    const from = new Date(navYear, navMonth, 1)
    const toEnd = new Date(navYear, navMonth + 1, 0) // last day of current month
    setDateFrom(from.toISOString().split('T')[0])
    setDateTo(toEnd.toISOString().split('T')[0])
  }, [navYear, navMonth, isSearchActive])

  // Search bypasses date/view filters
  useEffect(() => {
    if (debouncedSearch) {
      setIsSearchActive(true)
    } else {
      setIsSearchActive(false)
    }
  }, [debouncedSearch])

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [
    debouncedSearch,
    statusFilter,
    typeFilter,
    createdByFilter,
    dateFrom,
    dateTo,
    renewalFilter,
    viewFilter,
    activeGroupId,
    showFavoritesOnly
  ])

  // Load auxiliary data on mount
  useEffect(() => {
    const loadAux = async () => {
      const [qt, cr, favs, sf, grps] = await Promise.all([
        window.api.getQuotationTypes(),
        window.api.quotationGetCreators(),
        window.api.quotationGetFavorites(),
        window.api.quotationGetSavedFilters(),
        window.api.quotationGroupGetAll()
      ])
      setQuotationTypes(Array.isArray(qt) ? qt : [])
      setCreators(Array.isArray(cr) ? cr : [])
      setFavorites(new Set(Array.isArray(favs) ? favs : []))
      setSavedFilters(Array.isArray(sf) ? sf : [])
      setQGroups(Array.isArray(grps) ? grps : [])
    }
    loadAux()
  }, [])

  // Load paginated data when filters/sort/page change
  const loadData = useCallback(async () => {
    setLoading(true)
    const thisLoad = ++loadIdRef.current
    try {
      const typeCode =
        typeFilter !== 'all'
          ? quotationTypes.find((qt) => qt.id === typeFilter)?.code || undefined
          : undefined
      const result = await window.api.quotationGetPaginated({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        typeCode,
        createdBy: createdByFilter !== 'all' ? createdByFilter : undefined,
        dateFrom: isSearchActive ? undefined : (dateFrom || undefined),
        dateTo: isSearchActive ? undefined : (dateTo || undefined),
        renewalFilter: renewalFilter !== 'all' ? renewalFilter : undefined,
        viewFilter: isSearchActive ? undefined : (viewFilter !== 'all' ? viewFilter : undefined),
        groupId: activeGroupId || undefined,
        favoriteIds: showFavoritesOnly ? [...favorites] : undefined,
        sortField,
        sortDir
      })
      if (thisLoad !== loadIdRef.current) return
      if (result && !(result as any).error) {
        setData({
          rows: Array.isArray(result.rows) ? result.rows : [],
          total: result.total || 0,
          stats: result.stats || { total: 0, byStatus: {}, byType: [] }
        })
      }
    } catch {
      /* silent */
    } finally {
      if (thisLoad === loadIdRef.current) setLoading(false)
    }
  }, [
    page,
    debouncedSearch,
    statusFilter,
    typeFilter,
    createdByFilter,
    dateFrom,
    dateTo,
    renewalFilter,
    viewFilter,
    isSearchActive,
    activeGroupId,
    showFavoritesOnly,
    favorites,
    sortField,
    sortDir,
    quotationTypes
  ])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Grouping
  const groupedRows = useMemo(() => {
    if (groupBy === 'none') return null
    const groups: Record<string, any[]> = {}
    for (const row of data.rows) {
      const key =
        groupBy === 'type'
          ? row.quotationTypeName || 'Unknown'
          : groupBy === 'vessel'
            ? row.vesselName || 'No Vessel'
            : row.coName || 'No Customer'
      if (!groups[key]) groups[key] = []
      groups[key].push(row)
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }, [data.rows, groupBy])

  // Favorite rows for the top section
  const favoriteRowsOnPage = useMemo(() => {
    if (showFavoritesOnly || favorites.size === 0) return []
    return data.rows.filter((r) => favorites.has(r.id))
  }, [data.rows, favorites, showFavoritesOnly])

  // Handlers
  const handleCreate = async (quotationTypeId: string) => {
    try {
      setShowNewMenu(false)
      const today = new Date().toISOString().split('T')[0]
      const created = await window.api.addQuotation({
        quotationDate: today,
        quotationTypeId,
        status: 'draft'
      })
      showSuccess('Quotation created')
      onOpenQuotation(created)
    } catch (err: any) {
      showError(err.message || 'Failed to create quotation')
    }
  }

  const openDeleteModal = async (q: Quotation) => {
    const groupId = q.revisionGroupId || q.id
    let count = 1
    try {
      count = await window.api.getQuotationRevisionCount(groupId)
    } catch {
      /* fallback */
    }
    setDeleteModal({
      show: true,
      quotation: q,
      revisionCount: count,
      deleteMode: 'single'
    })
  }

  const handleDelete = async () => {
    if (!deleteModal?.quotation) return
    try {
      if (deleteModal.deleteMode === 'all' && deleteModal.revisionCount > 1) {
        const groupId = deleteModal.quotation.revisionGroupId || deleteModal.quotation.id
        await window.api.deleteQuotationGroup(groupId)
        showSuccess('All revisions deleted')
      } else {
        await window.api.deleteQuotation(deleteModal.quotation.id)
        showSuccess('Quotation deleted')
      }
      setDeleteModal(null)
      loadData()
    } catch (err: any) {
      showError(err.message || 'Failed to delete quotation')
    }
  }

  const handleDuplicate = async (q: Quotation, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const dup = await window.api.duplicateQuotation(q.id)
      if ((dup as any)?.error) {
        showError((dup as any).message || 'Failed to duplicate')
        return
      }
      showSuccess('Quotation duplicated')
      onOpenQuotation(dup)
    } catch (err: any) {
      showError(err.message || 'Failed to duplicate')
    }
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(
        field === 'updatedAt' || field === 'quotationDate' || field === 'premiumAmount'
          ? 'desc'
          : 'asc'
      )
    }
    setPage(0)
  }

  const toggleFavorite = async (quotationId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const isFav = await window.api.quotationToggleFavorite(quotationId)
      setFavorites((prev) => {
        const next = new Set(prev)
        if (isFav) next.add(quotationId)
        else next.delete(quotationId)
        return next
      })
    } catch {
      /* silent */
    }
  }

  const saveCurrentFilter = async () => {
    if (!newFilterName.trim()) return
    try {
      const filters = {
        statusFilter,
        typeFilter,
        renewalFilter,
        viewFilter,
        createdByFilter,
        dateFrom,
        dateTo
      }
      const result = await window.api.quotationSaveFilter(newFilterName.trim(), filters)
      if (result && !(result as any).error) {
        setSavedFilters((prev) => [...prev, { ...result, order: prev.length }])
        showSuccess('Filter saved')
      }
    } catch {
      showError('Failed to save filter')
    }
    setNewFilterName('')
    setShowSaveFilterInput(false)
  }

  const applyFilter = (filters: any) => {
    if (filters.statusFilter) setStatusFilter(filters.statusFilter)
    if (filters.typeFilter) setTypeFilter(filters.typeFilter)
    if (filters.renewalFilter) setRenewalFilter(filters.renewalFilter)
    if (filters.viewFilter !== undefined) setViewFilter(filters.viewFilter)
    if (filters.registryOnly !== undefined) setViewFilter(filters.registryOnly ? 'registry' : 'all')
    if (filters.createdByFilter) setCreatedByFilter(filters.createdByFilter)
    if (filters.dateFrom !== undefined) setDateFrom(filters.dateFrom)
    if (filters.dateTo !== undefined) setDateTo(filters.dateTo)
  }

  const deleteSavedFilter = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await window.api.quotationDeleteFilter(id)
      setSavedFilters((prev) => prev.filter((f) => f.id !== id))
    } catch {
      /* silent */
    }
  }

  const clearAllFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setTypeFilter('all')
    setRenewalFilter('all')
    setViewFilter('active')
    setCreatedByFilter('all')
    setIsSearchActive(false)
    const now = new Date()
    setNavYear(now.getFullYear())
    setNavMonth(now.getMonth())
    setShowFavoritesOnly(false)
    setActiveGroupId(null)
  }

  const navigateMonth = (direction: -1 | 1) => {
    setNavMonth(prev => {
      const n = prev + direction
      if (n < 0) { setNavYear(y => y - 1); return 11 }
      if (n > 11) { setNavYear(y => y + 1); return 0 }
      return n
    })
  }

  const goToToday = () => {
    const now = new Date()
    setNavYear(now.getFullYear())
    setNavMonth(now.getMonth())
    setIsSearchActive(false)
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const navLabel = `${monthNames[navMonth]} ${navYear}`

  const hasActiveFilters =
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    renewalFilter !== 'all' ||
    viewFilter !== 'all' ||
    activeGroupId !== null ||
    createdByFilter !== 'all' ||
    dateFrom ||
    dateTo ||
    showFavoritesOnly ||
    debouncedSearch

  const getConditions = (q: any): string => {
    if (q.quotationTypeCode === 'H') return q.hullClauseCodes || ''
    return q.piClauseNames || ''
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  const formatCurrency = (amount?: number, currency?: string) => {
    if (!amount) return '-'
    return `${currency || 'USD'} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }


  const thStyle = (field: SortField, align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    padding: '12px 14px',
    textAlign: align,
    fontSize: '0.75rem',
    color: sortField === field ? 'var(--accent-primary)' : 'var(--text-secondary)',
    fontWeight: 600,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  })

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ChevronDown size={12} style={{ opacity: 0.3, marginLeft: '2px' }} />
    return sortDir === 'asc' ? (
      <ChevronUp size={12} style={{ marginLeft: '2px' }} />
    ) : (
      <ChevronDown size={12} style={{ marginLeft: '2px' }} />
    )
  }

  const selectStyle: React.CSSProperties = {
    padding: '7px 10px',
    borderRadius: '8px',
    background: 'var(--bg-input, var(--table-header-bg))',
    color: 'var(--text-primary)',
    border: '1px solid var(--input-border)',
    fontSize: '0.8rem'
  }

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === data.rows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(data.rows.map(r => r.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    try {
      const result = await window.api.quotationBulkDelete([...selectedIds])
      if ((result as any)?.error) {
        showError((result as any).message || 'Failed to bulk delete')
        return
      }
      showSuccess(`${result} quotation(s) deleted`)
      setSelectedIds(new Set())
      setBulkDeleteModal(false)
      loadData()
      // Reload groups to refresh counts
      const grps = await window.api.quotationGroupGetAll()
      setQGroups(Array.isArray(grps) ? grps : [])
    } catch (err: any) {
      showError(err.message || 'Failed to bulk delete')
    }
  }

  const handleAddToGroup = async (groupId: string) => {
    if (selectedIds.size === 0) return
    try {
      await window.api.quotationGroupBulkAdd(groupId, [...selectedIds])
      showSuccess(`${selectedIds.size} quotation(s) added to group`)
      setShowAddToGroup(false)
      // Refresh groups
      const grps = await window.api.quotationGroupGetAll()
      setQGroups(Array.isArray(grps) ? grps : [])
    } catch (err: any) {
      showError(err.message || 'Failed to add to group')
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return
    try {
      const result = await window.api.quotationGroupAdd(
        newGroupName.trim(),
        newGroupPersonal ? user?.id || null : null,
        newGroupColor
      )
      if (result && !(result as any).error) {
        setQGroups(prev => [...prev, result])
        setNewGroupName('')
        setNewGroupColor('#00aac8')
        setNewGroupPersonal(false)
        showSuccess('Group created')
      }
    } catch (err: any) {
      showError(err.message || 'Failed to create group')
    }
  }

  const handleUpdateGroup = async (id: string) => {
    if (!editGroupName.trim()) return
    try {
      await window.api.quotationGroupUpdate(id, { name: editGroupName.trim(), color: editGroupColor })
      setQGroups(prev => prev.map(g => g.id === id ? { ...g, name: editGroupName.trim(), color: editGroupColor } : g))
      setEditingGroup(null)
      showSuccess('Group updated')
    } catch (err: any) {
      showError(err.message || 'Failed to update group')
    }
  }

  const handleDeleteGroup = async (id: string) => {
    try {
      await window.api.quotationGroupDelete(id)
      setQGroups(prev => prev.filter(g => g.id !== id))
      if (activeGroupId === id) setActiveGroupId(null)
      showSuccess('Group deleted')
    } catch (err: any) {
      showError(err.message || 'Failed to delete group')
    }
  }

  const renderRow = (q: any, showFavStar = true) => {
    const sc = statusColors[q.status] || statusColors.draft
    const isFav = favorites.has(q.id)
    return (
      <tr
        key={q.id}
        style={{
          borderBottom: '1px solid var(--table-border)',
          cursor: 'pointer',
          background: selectedIds.has(q.id) ? (isLight ? 'rgba(0,170,200,0.06)' : 'rgba(0,210,255,0.06)') : undefined
        }}
        className="hover-effect"
        onClick={() => {
          if (selectMode) { toggleSelectId(q.id); return }
          if (q.lockedBy && q.lockedBy !== user?.id) { showError(`This quotation is locked by ${q.lockedByName || 'another user'}`); return }
          onOpenQuotation(q)
        }}
      >
        {selectMode && (
          <td style={{ padding: '12px 6px 12px 14px', width: '30px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); toggleSelectId(q.id) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: selectedIds.has(q.id) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
            >
              {selectedIds.has(q.id) ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
          </td>
        )}
        {showFavStar && !selectMode && (
          <td style={{ padding: '12px 6px 12px 14px', width: '30px' }}>
            <button
              onClick={(e) => toggleFavorite(q.id, e)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                color: isFav ? '#ffb020' : 'var(--text-secondary)',
                opacity: isFav ? 1 : 0.4
              }}
              title={isFav ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star size={14} fill={isFav ? '#ffb020' : 'none'} />
            </button>
          </td>
        )}
        {qVisibleSet.has('referenceNumber') && (
          <td
            style={{
              padding: '12px 14px',
              fontWeight: 600,
              fontSize: '0.88rem',
              color: (q.referenceNumber || '').startsWith('DRAFT-')
                ? isLight
                  ? '#888'
                  : '#777'
                : isLight
                  ? '#007a91'
                  : '#00aac8'
            }}
          >
            {q.lockedBy && <>
              <span title={`Locked by ${q.lockedByName || 'user'}`}><Lock size={12} style={{ marginRight: '4px', color: '#ffb020' }} /></span>
              {hasPermission('admin:settings') && <button onClick={async (e) => { e.stopPropagation(); await window.api.quotationForceUnlock(q.id); showSuccess('Quotation unlocked'); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ffb020', padding: '0 2px', fontSize: '0.6rem', verticalAlign: 'middle' }} title="Force unlock">✕</button>}
            </>}
            {q.referenceNumber || (
              <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>—</span>
            )}
            {(q.revisionNumber || 0) > 0 && (
              <span
                style={{
                  marginLeft: '6px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  background: 'rgba(180, 100, 255, 0.15)',
                  color: isLight ? '#7a3db8' : '#b464ff'
                }}
              >
                R{q.revisionNumber}
              </span>
            )}
            {q.isRenewal && (
              <span
                style={{
                  marginLeft: '4px',
                  padding: '2px 5px',
                  borderRadius: '4px',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  background: 'rgba(0, 170, 200, 0.12)',
                  color: isLight ? '#007a91' : '#00aac8'
                }}
              >
                REN
              </span>
            )}
          </td>
        )}
        {qVisibleSet.has('quotationTypeName') && (
          <td style={{ padding: '12px 14px' }}>
            {q.quotationTypeCode ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '22px',
                  borderRadius: '5px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  background: 'rgba(0, 170, 200, 0.12)',
                  color: isLight ? '#007a91' : '#00aac8'
                }}
              >
                {q.quotationTypeCode}
              </span>
            ) : (
              '-'
            )}
          </td>
        )}
        {qVisibleSet.has('quotationDate') && (
          <td
            style={{
              padding: '12px 14px',
              color: 'var(--text-secondary)',
              fontSize: '0.82rem',
              whiteSpace: 'nowrap'
            }}
          >
            {formatDateOrDash(q.quotationDate)}
          </td>
        )}
        {qVisibleSet.has('vesselName') && (
          <td
            style={{
              padding: '12px 14px',
              fontSize: '0.85rem',
              maxWidth: '180px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {q.vesselName ? (
              <>
                {q.vesselName}
                {(q.vesselCount || 0) > 1 && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      marginLeft: '4px'
                    }}
                  >
                    +{q.vesselCount - 1}
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>—</span>
            )}
          </td>
        )}
        {qVisibleSet.has('coName') && (
          <td
            style={{
              padding: '12px 14px',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
              maxWidth: '150px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {q.coName || <span style={{ fontStyle: 'italic' }}>—</span>}
          </td>
        )}
        {qVisibleSet.has('conditions') && (
          <td
            style={{
              padding: '12px 14px',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              maxWidth: '160px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
            title={getConditions(q) || undefined}
          >
            {getConditions(q) || <span style={{ fontStyle: 'italic' }}>—</span>}
          </td>
        )}
        {qVisibleSet.has('premiumAmount') && (
          <td
            style={{
              padding: '12px 14px',
              textAlign: 'right',
              fontSize: '0.82rem',
              fontWeight: q.premiumAmount ? 600 : 400,
              whiteSpace: 'nowrap'
            }}
          >
            {formatCurrency(q.premiumAmount, q.premiumCurrency)}
          </td>
        )}
        {qVisibleSet.has('status') && (
          <td style={{ padding: '12px 14px' }}>
            {q.workflowStepName ? (
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: '10px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  background: (q.workflowStepColor || '#6b7280') + '22',
                  color: q.workflowStepColor || '#6b7280',
                  border: `1px solid ${q.workflowStepColor || '#6b7280'}40`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: q.workflowStepColor || '#6b7280'
                  }}
                />
                {q.workflowStepName}
              </span>
            ) : (
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: '10px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  background: sc.bg,
                  color: sc.text
                }}
              >
                {q.status}
              </span>
            )}
          </td>
        )}
        {qVisibleSet.has('updatedAt') && (
          <td
            style={{
              padding: '12px 14px',
              color: 'var(--text-secondary)',
              fontSize: '0.78rem',
              whiteSpace: 'nowrap'
            }}
          >
            {formatDateOrDash(q.updatedAt)}
          </td>
        )}
        <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
          {hasPermission('quotations:create') && (
            <button
              onClick={(e) => handleDuplicate(q, e)}
              className="btn-secondary"
              style={{ padding: '5px', marginRight: '4px' }}
              title="Duplicate"
            >
              <Copy size={14} />
            </button>
          )}
          {hasPermission('quotations:delete') && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                openDeleteModal(q)
              }}
              className="btn-secondary"
              style={{ padding: '5px', color: 'var(--danger)' }}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </td>
      </tr>
    )
  }

  const renderTableHeader = (showFavCol = true) => (
    <thead>
      <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
        {selectMode && (
          <th style={{ padding: '12px 6px 12px 14px', width: '30px' }}>
            <button
              onClick={toggleSelectAll}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: selectedIds.size === data.rows.length && data.rows.length > 0 ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
            >
              {selectedIds.size === data.rows.length && data.rows.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
          </th>
        )}
        {showFavCol && !selectMode && <th style={{ padding: '12px 6px 12px 14px', width: '30px' }} />}
        {qVisibleSet.has('referenceNumber') && (
          <th style={thStyle('referenceNumber')} onClick={() => toggleSort('referenceNumber')}>
            Ref <SortIcon field="referenceNumber" />
          </th>
        )}
        {qVisibleSet.has('quotationTypeName') && (
          <th style={thStyle('quotationTypeName')} onClick={() => toggleSort('quotationTypeName')}>
            Type <SortIcon field="quotationTypeName" />
          </th>
        )}
        {qVisibleSet.has('quotationDate') && (
          <th style={thStyle('quotationDate')} onClick={() => toggleSort('quotationDate')}>
            Date <SortIcon field="quotationDate" />
          </th>
        )}
        {qVisibleSet.has('vesselName') && (
          <th style={thStyle('vesselName')} onClick={() => toggleSort('vesselName')}>
            Vessel <SortIcon field="vesselName" />
          </th>
        )}
        {qVisibleSet.has('coName') && (
          <th style={thStyle('coName')} onClick={() => toggleSort('coName')}>
            Customer <SortIcon field="coName" />
          </th>
        )}
        {qVisibleSet.has('conditions') && (
          <th style={thStyle('conditions')} onClick={() => toggleSort('conditions')}>
            Conditions <SortIcon field="conditions" />
          </th>
        )}
        {qVisibleSet.has('premiumAmount') && (
          <th style={thStyle('premiumAmount', 'right')} onClick={() => toggleSort('premiumAmount')}>
            Premium <SortIcon field="premiumAmount" />
          </th>
        )}
        {qVisibleSet.has('status') && (
          <th style={thStyle('status')} onClick={() => toggleSort('status')}>
            Status <SortIcon field="status" />
          </th>
        )}
        {qVisibleSet.has('updatedAt') && (
          <th style={thStyle('updatedAt')} onClick={() => toggleSort('updatedAt')}>
            Updated <SortIcon field="updatedAt" />
          </th>
        )}
        <th
          style={{
            padding: '12px 14px',
            textAlign: 'right',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px'
            }}
          >
            {qVisibleSet.has('actions') && 'Actions'}
            <ColumnSelector
              pageKey="quotations"
              allColumns={QUOTATION_COLUMNS}
              visibleColumns={qVisibleColumns}
              onChange={setQVisibleColumns}
            />
          </div>
        </th>
      </tr>
    </thead>
  )

  const colCount =
    [true, ...QUOTATION_COLUMNS.map((c) => qVisibleSet.has(c.id))].filter(Boolean).length + 1

  return (
    <div>
      {/* ═══ View Tabs ═══ */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {(['active', 'converted', 'all'] as const).map(vf => {
          const labels: Record<string, string> = { active: 'Active', converted: 'Converted', all: 'All' }
          const active = viewFilter === vf && !savedFilters.some(sf => sf.id === viewFilter)
          return (
            <button key={vf} onClick={() => { setViewFilter(vf); setActiveGroupId(null) }}
              style={{ padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: active ? 700 : 400, background: active ? 'var(--bg-card)' : 'transparent', color: active ? 'var(--accent-primary)' : 'var(--text-secondary)', borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent' }}>
              {labels[vf]}
            </button>
          )
        })}
        {savedFilters.map(sf => (
          <button key={sf.id} onClick={() => applyFilter(sf.filters)}
            style={{ padding: '8px 12px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 400, background: 'transparent', color: 'var(--text-secondary)', borderBottom: '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {sf.name}
            <X size={12} style={{ opacity: 0.4 }} onClick={e => deleteSavedFilter(sf.id, e)} />
          </button>
        ))}
        {hasActiveFilters && !showSaveFilterInput && (
          <button onClick={() => setShowSaveFilterInput(true)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px dashed var(--input-border)', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Plus size={12} /> Save View
          </button>
        )}
        {showSaveFilterInput && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input type="text" value={newFilterName} onChange={e => setNewFilterName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveCurrentFilter(); if (e.key === 'Escape') { setShowSaveFilterInput(false); setNewFilterName('') } }} placeholder="View name..." style={{ padding: '5px 8px', borderRadius: '6px', fontSize: '0.78rem', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', width: '140px' }} autoFocus />
            <button onClick={saveCurrentFilter} className="btn-primary" style={{ padding: '5px 8px', fontSize: '0.75rem' }} disabled={!newFilterName.trim()}>Save</button>
            <button onClick={() => { setShowSaveFilterInput(false); setNewFilterName('') }} className="btn-secondary" style={{ padding: '5px' }}><X size={12} /></button>
          </div>
        )}
      </div>

      {/* ═══ Search + Month Nav ═══ */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={15} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search all quotations..." style={{ width: '100%', paddingLeft: '36px', fontSize: '0.83rem' }} />
          {loading && <Loader2 size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />}
          {isSearchActive && <span style={{ position: 'absolute', right: loading ? '30px' : '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', color: 'var(--accent-primary)', fontWeight: 600 }}>ALL</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: isSearchActive ? 0.3 : 1, pointerEvents: isSearchActive ? 'none' : 'auto' }}>
          <button onClick={() => navigateMonth(-1)} className="btn-secondary" style={{ padding: '6px 8px' }}><ChevronLeft size={16} /></button>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '140px', textAlign: 'center', whiteSpace: 'nowrap' }}>{navLabel}</span>
          <button onClick={() => navigateMonth(1)} className="btn-secondary" style={{ padding: '6px 8px' }}><ChevronRight size={16} /></button>
          <button onClick={goToToday} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }}>Today</button>
        </div>
        <button onClick={loadData} className="btn-secondary" style={{ padding: '7px', flexShrink: 0 }} title="Refresh"><RotateCw size={16} /></button>
        {hasPermission('quotations:create') && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowNewMenu(!showNewMenu)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
              <Plus size={16} /> New Quotation
            </button>
            {showNewMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowNewMenu(false)} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', zIndex: 100, background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '6px', minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                  {quotationTypes.map(qt => (
                    <button key={qt.id} onClick={() => handleCreate(qt.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', borderRadius: '6px', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }} className="hover-effect">
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '20px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(0,170,200,0.12)', color: isLight ? '#007a91' : '#00aac8' }}>{qt.code}</span>
                      {qt.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ Compact Stats + Filter Chips ═══ */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Status chips */}
        {[
          { label: 'Draft', key: 'draft', color: '#999' },
          { label: 'Sent', key: 'sent', color: '#0096ff' },
          { label: 'Approved', key: 'approved', color: '#00c864' },
          { label: 'Exported', key: 'exported', color: '#00aac8' },
          { label: 'Rejected', key: 'rejected', color: '#ff4d4d' },
        ].map(s => {
          const count = data.stats.byStatus?.[s.key] || 0
          const active = statusFilter === s.key
          return (
            <button key={s.key} onClick={() => setStatusFilter(prev => prev === s.key ? 'all' : s.key)}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', border: active ? `1.5px solid ${s.color}` : '1px solid var(--table-border)', background: active ? `${s.color}15` : 'transparent', color: active ? s.color : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: active ? 600 : 400 }}>
              {s.label}
              {count > 0 && <span style={{ fontSize: '0.68rem', fontWeight: 700 }}>{count}</span>}
            </button>
          )
        })}
        <span style={{ color: 'var(--table-border)', margin: '0 2px' }}>|</span>
        {/* Type chips */}
        {quotationTypes.map(qt => {
          const active = typeFilter === qt.id
          const count = (data.stats.byType as any[])?.find((t: any) => t.code === qt.code)?.count || 0
          return (
            <button key={qt.id} onClick={() => setTypeFilter(prev => prev === qt.id ? 'all' : qt.id)}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', border: active ? '1.5px solid var(--accent-primary)' : '1px solid var(--table-border)', background: active ? 'rgba(0,170,200,0.1)' : 'transparent', color: active ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: active ? 600 : 400 }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0 3px', borderRadius: '3px', background: 'rgba(0,170,200,0.12)', color: isLight ? '#007a91' : '#00aac8' }}>{qt.code}</span>
              {qt.name}
              {count > 0 && <span style={{ fontSize: '0.68rem', fontWeight: 700 }}>{count}</span>}
            </button>
          )
        })}
        <span style={{ color: 'var(--table-border)', margin: '0 2px' }}>|</span>
        {/* Renewal filter */}
        <select value={renewalFilter} onChange={e => setRenewalFilter(e.target.value)} style={{ ...selectStyle, fontSize: '0.78rem', padding: '4px 8px' }}>
          <option value="all">All</option>
          <option value="new">New</option>
          <option value="renewal">Renewal</option>
        </select>
        {/* Created by */}
        {creators.length > 1 && (
          <select value={createdByFilter} onChange={e => setCreatedByFilter(e.target.value)} style={{ ...selectStyle, fontSize: '0.78rem', padding: '4px 8px' }}>
            <option value="all">All Users</option>
            {creators.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {/* Compact total */}
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {data.total} quotation{data.total !== 1 ? 's' : ''}
        </span>
        {hasActiveFilters && (
          <button onClick={clearAllFilters} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--danger)' }}>Clear</button>
        )}
      </div>

      {/* ═══ Toolbar (group, favorites, select, bulk) ═══ */}
      {/* Keep existing saved filters chips area for backward compat — now empty since moved to tabs */}
      {false && savedFilters.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '6px',
            marginBottom: '10px',
            flexWrap: 'wrap',
            alignItems: 'center'
          }}
        >
          <span
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              fontWeight: 600,
              letterSpacing: '0.04em',
              marginRight: '4px'
            }}
          >
            Saved:
          </span>
          {savedFilters.map((sf) => (
            <button
              key={sf.id}
              onClick={() => applyFilter(sf.filters)}
              style={{
                padding: '3px 10px',
                borderRadius: '14px',
                fontSize: '0.73rem',
                border: '1px solid var(--accent-primary)',
                background: 'rgba(0, 170, 200, 0.08)',
                color: isLight ? '#007a91' : '#00aac8',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 500
              }}
            >
              {sf.name}
              <span
                onClick={(e) => deleteSavedFilter(sf.id, e)}
                style={{
                  cursor: 'pointer',
                  opacity: 0.6,
                  fontSize: '0.85rem',
                  lineHeight: 1,
                  marginLeft: '2px'
                }}
                title="Delete filter"
              >
                x
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Stats strip (replaced by compact chips above) */}
      {false && <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: data.stats.total || 0, color: '#00aac8', status: 'all' },
          {
            label: 'Draft',
            value: data.stats.byStatus?.['draft'] || 0,
            color: '#999',
            status: 'draft'
          },
          {
            label: 'Sent',
            value: data.stats.byStatus?.['sent'] || 0,
            color: '#0096ff',
            status: 'sent'
          },
          {
            label: 'Approved',
            value: data.stats.byStatus?.['approved'] || 0,
            color: '#00c864',
            status: 'approved'
          },
          {
            label: 'Rejected',
            value: data.stats.byStatus?.['rejected'] || 0,
            color: '#ff4d4d',
            status: 'rejected'
          },
          {
            label: 'Converted',
            value: data.stats.byStatus?.['converted'] || 0,
            color: '#b464ff',
            status: 'converted'
          }
        ].map((s) => (
          <div
            key={s.label}
            className="glass-card"
            style={{
              padding: '10px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flex: '1 1 0',
              minWidth: '100px',
              cursor: 'pointer',
              border:
                statusFilter === s.status && s.status !== 'all' ? `1px solid ${s.color}` : undefined
            }}
            onClick={() => {
              if (s.status === 'all') setStatusFilter('all')
              else setStatusFilter((prev) => (prev === s.status ? 'all' : s.status))
            }}
          >
            <span style={{ fontSize: '1.3rem', fontWeight: 700, color: s.color }}>{s.value}</span>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontWeight: 600
              }}
            >
              {s.label}
            </span>
          </div>
        ))}
        {/* Type badges */}
        {Array.isArray(data.stats.byType) &&
          data.stats.byType.length > 0 &&
          data.stats.byType.map((t) => (
            <div
              key={t.code}
              className="glass-card"
              style={{
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                border: typeFilter === t.code ? '1px solid var(--accent-primary)' : undefined
              }}
              onClick={() =>
                setTypeFilter((prev) => {
                  // Find the quotation type ID by code
                  const qt = quotationTypes.find((q) => q.code === t.code)
                  if (!qt) return prev
                  return prev === qt.id ? 'all' : qt.id
                })
              }
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '22px',
                  height: '18px',
                  borderRadius: '4px',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  background: 'rgba(0, 170, 200, 0.12)',
                  color: isLight ? '#007a91' : '#00aac8'
                }}
              >
                {t.code}
              </span>
              <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{t.count}</span>
            </div>
          ))}
      </div>}

      {/* Filter bar (replaced by compact chips + search above) */}
      {false && <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '14px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
          <Search
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)'
            }}
            size={15}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, vessel, customer, title, user..."
            style={{ width: '100%', paddingLeft: '36px', fontSize: '0.83rem' }}
          />
          {loading && (
            <Loader2
              size={14}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--accent-primary)',
                animation: 'spin 1s linear infinite'
              }}
            />
          )}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Types</option>
          {quotationTypes.map((qt) => (
            <option key={qt.id} value={qt.id}>
              {qt.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="converted">Converted</option>
        </select>
        <select
          value={renewalFilter}
          onChange={(e) => setRenewalFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All</option>
          <option value="new">New Business</option>
          <option value="renewal">Renewal</option>
        </select>
        <select
          value={createdByFilter}
          onChange={(e) => setCreatedByFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Users</option>
          {creators.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{ ...selectStyle, width: '130px' }}
          title="Date from"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={{ ...selectStyle, width: '130px' }}
          title="Date to"
        />
        <div
          style={{
            display: 'flex',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid var(--input-border)'
          }}
        >
          {(['all', 'registry', 'drafts'] as const).map(vf => (
            <button
              key={vf}
              onClick={() => setViewFilter(vf)}
              style={{
                padding: '7px 12px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.76rem',
                fontWeight: 600,
                background: viewFilter === vf ? 'var(--accent-primary)' : 'transparent',
                color: viewFilter === vf ? '#fff' : 'var(--text-secondary)'
              }}
            >
              {vf === 'all' ? 'All' : vf === 'registry' ? 'Registry' : 'Drafts'}
            </button>
          ))}
        </div>
      </div>}

      {/* Second toolbar row: grouping, favorites toggle, select, actions */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        {/* Group by */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={14} style={{ color: 'var(--text-secondary)' }} />
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            style={{ ...selectStyle, fontSize: '0.78rem' }}
          >
            <option value="none">No Grouping</option>
            <option value="type">By Type</option>
            <option value="vessel">By Vessel</option>
            <option value="customer">By Customer</option>
          </select>
        </div>

        {/* Favorites toggle */}
        <button
          onClick={() => setShowFavoritesOnly((v) => !v)}
          className={showFavoritesOnly ? 'btn-primary' : 'btn-secondary'}
          style={{
            padding: '7px 12px',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <Star size={13} fill={showFavoritesOnly ? '#fff' : 'none'} />
          Favorites
          {favorites.size > 0 && (
            <span
              style={{
                background: showFavoritesOnly ? 'rgba(255,255,255,0.25)' : 'rgba(255,176,32,0.2)',
                padding: '0 5px',
                borderRadius: '8px',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: showFavoritesOnly ? '#fff' : '#ffb020'
              }}
            >
              {favorites.size}
            </span>
          )}
        </button>

        {/* Select mode toggle */}
        <button
          onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()) }}
          className={selectMode ? 'btn-primary' : 'btn-secondary'}
          style={{
            padding: '7px 12px',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <CheckSquare size={13} />
          Select
        </button>

        {/* Bulk actions (visible when items are selected) */}
        {selectMode && selectedIds.size > 0 && (
          <>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
              {selectedIds.size} selected
            </span>
            {hasPermission('quotations:bulkDelete') && (
              <button
                onClick={() => setBulkDeleteModal(true)}
                className="btn-secondary"
                style={{
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Trash2 size={13} />
                Delete Selected
              </button>
            )}
            {hasPermission('quotations:edit') && qGroups.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowAddToGroup(v => !v)}
                  className="btn-secondary"
                  style={{
                    padding: '7px 12px',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <FolderPlus size={13} />
                  Add to Group
                </button>
                {showAddToGroup && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowAddToGroup(false)} />
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                      background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)',
                      borderRadius: '10px', padding: '6px', zIndex: 100, minWidth: '200px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                    }}>
                      {qGroups.map(g => (
                        <button
                          key={g.id}
                          onClick={() => handleAddToGroup(g.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                            padding: '8px 12px', border: 'none', borderRadius: '6px',
                            background: 'transparent', color: 'var(--text-primary)',
                            cursor: 'pointer', fontSize: '0.82rem', textAlign: 'left'
                          }}
                          className="hover-effect"
                        >
                          <span style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: g.color || '#00aac8', flexShrink: 0
                          }} />
                          {g.name}
                          {g.userId && <User size={10} style={{ opacity: 0.5 }} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />
      </div>

      {/* Quotation groups chips */}
      {qGroups.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Tag size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <button
            onClick={() => setActiveGroupId(null)}
            style={{
              padding: '4px 12px',
              borderRadius: '14px',
              fontSize: '0.73rem',
              fontWeight: 600,
              border: activeGroupId === null ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)',
              background: activeGroupId === null ? 'rgba(0, 170, 200, 0.12)' : 'transparent',
              color: activeGroupId === null ? (isLight ? '#007a91' : '#00aac8') : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            All
          </button>
          {qGroups.map(g => (
            <button
              key={g.id}
              onClick={() => setActiveGroupId(prev => prev === g.id ? null : g.id)}
              style={{
                padding: '4px 12px',
                borderRadius: '14px',
                fontSize: '0.73rem',
                fontWeight: 600,
                border: activeGroupId === g.id ? `1px solid ${g.color || 'var(--accent-primary)'}` : '1px solid var(--input-border)',
                background: activeGroupId === g.id ? (g.color || '#00aac8') + '20' : 'transparent',
                color: activeGroupId === g.id ? (g.color || (isLight ? '#007a91' : '#00aac8')) : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color || '#00aac8' }} />
              {g.name}
              {g.userId && <User size={9} style={{ opacity: 0.5 }} />}
              <span style={{
                fontSize: '0.65rem',
                background: activeGroupId === g.id ? 'rgba(255,255,255,0.2)' : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'),
                padding: '0 5px',
                borderRadius: '8px',
                fontWeight: 700
              }}>
                {g.memberCount}
              </span>
            </button>
          ))}
          <button
            onClick={() => setShowGroupManager(v => !v)}
            style={{
              padding: '4px 8px',
              borderRadius: '14px',
              fontSize: '0.73rem',
              border: '1px dashed var(--input-border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title="Manage groups"
          >
            <Edit3 size={11} /> Manage
          </button>
        </div>
      )}

      {/* Group manager popover */}
      {showGroupManager && (
        <div
          className="glass-card"
          style={{ padding: '16px', marginBottom: '14px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Manage Groups</span>
            <button onClick={() => setShowGroupManager(false)} className="btn-secondary" style={{ padding: '4px' }}>
              <X size={14} />
            </button>
          </div>

          {/* Add new group */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
            <input
              type="text"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="Group name..."
              style={{ flex: 1, fontSize: '0.82rem' }}
              onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
            />
            <input
              type="color"
              value={newGroupColor}
              onChange={e => setNewGroupColor(e.target.value)}
              style={{ width: '32px', height: '32px', padding: '2px', borderRadius: '6px', border: '1px solid var(--input-border)', cursor: 'pointer' }}
              title="Group color"
            />
            <button
              onClick={() => setNewGroupPersonal(v => !v)}
              className="btn-secondary"
              style={{ padding: '6px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              title={newGroupPersonal ? 'Personal group (only you)' : 'Global group (everyone)'}
            >
              {newGroupPersonal ? <User size={12} /> : <Users size={12} />}
              {newGroupPersonal ? 'Personal' : 'Global'}
            </button>
            <button
              onClick={handleCreateGroup}
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              disabled={!newGroupName.trim()}
            >
              Add
            </button>
          </div>

          {/* Existing groups list */}
          {qGroups.length === 0 ? (
            <div style={{ padding: '10px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              No groups yet. Create one above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {qGroups.map(g => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' }}>
                  {editingGroup === g.id ? (
                    <>
                      <input
                        type="text"
                        value={editGroupName}
                        onChange={e => setEditGroupName(e.target.value)}
                        style={{ flex: 1, fontSize: '0.82rem' }}
                        onKeyDown={e => e.key === 'Enter' && handleUpdateGroup(g.id)}
                        autoFocus
                      />
                      <input
                        type="color"
                        value={editGroupColor}
                        onChange={e => setEditGroupColor(e.target.value)}
                        style={{ width: '28px', height: '28px', padding: '2px', borderRadius: '4px', border: '1px solid var(--input-border)', cursor: 'pointer' }}
                      />
                      <button onClick={() => handleUpdateGroup(g.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Save</button>
                      <button onClick={() => setEditingGroup(null)} className="btn-secondary" style={{ padding: '4px 6px' }}><X size={12} /></button>
                    </>
                  ) : (
                    <>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: g.color || '#00aac8', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 500 }}>{g.name}</span>
                      {g.userId ? <span title="Personal"><User size={11} style={{ opacity: 0.4 }} /></span> : <span title="Global"><Users size={11} style={{ opacity: 0.4 }} /></span>}
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{g.memberCount}</span>
                      {hasPermission('quotations:edit') && (
                        <>
                          <button
                            onClick={() => { setEditingGroup(g.id); setEditGroupName(g.name); setEditGroupColor(g.color || '#00aac8') }}
                            className="btn-secondary"
                            style={{ padding: '3px 6px' }}
                            title="Edit"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteGroup(g.id)}
                            className="btn-secondary"
                            style={{ padding: '3px 6px', color: 'var(--danger)' }}
                            title="Delete group"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No groups yet — show create button */}
      {qGroups.length === 0 && hasPermission('quotations:edit') && !showGroupManager && (
        <div style={{ marginBottom: '12px' }}>
          <button
            onClick={() => setShowGroupManager(true)}
            className="btn-secondary"
            style={{
              padding: '5px 12px',
              fontSize: '0.76rem',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Tag size={13} /> Create Group
          </button>
        </div>
      )}

      {/* Favorites section (collapsible, shown when not filtering by favorites) */}
      {!showFavoritesOnly && favoriteRowsOnPage.length > 0 && (
        <div
          className="glass-card"
          style={{ padding: 0, overflow: 'hidden', marginBottom: '14px' }}
        >
          <div
            style={{
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              borderBottom: favoritesCollapsed ? 'none' : '1px solid var(--table-border)'
            }}
            onClick={() => setFavoritesCollapsed((v) => !v)}
          >
            <Star size={14} fill="#ffb020" color="#ffb020" />
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#ffb020'
              }}
            >
              Favorites
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                background: 'rgba(255,176,32,0.15)',
                color: '#ffb020',
                padding: '1px 7px',
                borderRadius: '8px',
                fontWeight: 700
              }}
            >
              {favoriteRowsOnPage.length}
            </span>
            <div style={{ flex: 1 }} />
            {favoritesCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </div>
          {!favoritesCollapsed && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>{favoriteRowsOnPage.map((q) => renderRow(q, true))}</tbody>
            </table>
          )}
        </div>
      )}

      {/* Main table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
        {/* Loading overlay */}
        {loading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)',
              animation: 'shimmer 1.5s infinite',
              zIndex: 2
            }}
          />
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {renderTableHeader()}
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  style={{
                    padding: '48px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <FileText size={36} style={{ opacity: 0.3, marginBottom: '10px' }} />
                  <div style={{ fontSize: '0.9rem' }}>
                    {loading
                      ? 'Loading quotations...'
                      : hasActiveFilters
                        ? 'No quotations match your filters'
                        : 'No quotations yet'}
                  </div>
                </td>
              </tr>
            ) : groupedRows ? (
              // Grouped rendering
              groupedRows.map(([groupName, rows]) => (
                <React.Fragment key={groupName}>
                  <tr>
                    <td
                      colSpan={colCount}
                      style={{
                        padding: '10px 16px',
                        background: isLight ? 'rgba(0, 170, 200, 0.04)' : 'rgba(0, 170, 200, 0.06)',
                        borderBottom: '1px solid var(--table-border)',
                        borderTop: '1px solid var(--table-border)'
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          color: isLight ? '#007a91' : '#00aac8'
                        }}
                      >
                        {groupName}
                      </span>
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '0.72rem',
                          background: 'rgba(0, 170, 200, 0.12)',
                          color: isLight ? '#007a91' : '#00aac8',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          fontWeight: 600
                        }}
                      >
                        {rows.length}
                      </span>
                    </td>
                  </tr>
                  {rows.map((q: any) => renderRow(q))}
                </React.Fragment>
              ))
            ) : (
              // Flat rendering
              data.rows.map((q) => renderRow(q))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data.total > PAGE_SIZE && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '12px',
            padding: '0 4px',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)'
          }}
        >
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of{' '}
            {data.total}
          </span>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="btn-secondary"
              style={{ padding: '5px 8px', fontSize: '0.78rem' }}
            >
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary"
              style={{ padding: '5px' }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ padding: '0 8px', fontWeight: 600 }}>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary"
              style={{ padding: '5px' }}
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="btn-secondary"
              style={{ padding: '5px 8px', fontSize: '0.78rem' }}
            >
              Last
            </button>
          </div>
        </div>
      )}

      {deleteModal?.show &&
        deleteModal.quotation &&
        (deleteModal.revisionCount <= 1 ? (
          <ConfirmationModal
            title="Delete Quotation?"
            message={`Delete quotation ${deleteModal.quotation.referenceNumber || '(no ref)'}? This cannot be undone.`}
            confirmLabel="Delete"
            isDangerous
            onConfirm={handleDelete}
            onCancel={() => setDeleteModal(null)}
          />
        ) : (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setDeleteModal(null)}
          >
            <div
              style={{
                width: '90%',
                maxWidth: '480px',
                background: isLight ? '#ffffff' : '#1a1d28',
                borderRadius: '14px',
                border: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255,255,255,0.1)',
                boxShadow: isLight ? '0 10px 40px rgba(0,0,0,0.2)' : '0 10px 40px rgba(0,0,0,0.5)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: '24px 24px 10px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <div
                  style={{
                    background: 'rgba(255, 77, 77, 0.1)',
                    padding: '10px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Trash2 size={24} color="var(--danger)" />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                  Delete Quotation {deleteModal.quotation.referenceNumber || '(no ref)'}
                  {(deleteModal.quotation.revisionNumber || 0) > 0 && (
                    <span
                      style={{
                        marginLeft: '6px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        background: 'rgba(180, 100, 255, 0.15)',
                        color: isLight ? '#7a3db8' : '#b464ff'
                      }}
                    >
                      R{deleteModal.quotation.revisionNumber}
                    </span>
                  )}
                </h3>
              </div>

              <div style={{ padding: '16px 24px 20px 24px' }}>
                <p
                  style={{
                    margin: '0 0 16px',
                    fontSize: '0.88rem',
                    color: 'var(--text-secondary)'
                  }}
                >
                  This quotation has {deleteModal.revisionCount} revision
                  {deleteModal.revisionCount > 1 ? 's' : ''}. Choose how to delete:
                </p>

                {/* Radio: Delete this revision only */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginBottom: '8px',
                    border:
                      deleteModal.deleteMode === 'single'
                        ? '2px solid var(--accent-primary)'
                        : `1px solid ${isLight ? '#e0e0e0' : 'rgba(255,255,255,0.1)'}`,
                    background:
                      deleteModal.deleteMode === 'single'
                        ? isLight
                          ? 'rgba(0,170,200,0.05)'
                          : 'rgba(0,170,200,0.08)'
                        : 'transparent'
                  }}
                  onClick={() =>
                    setDeleteModal((prev) => (prev ? { ...prev, deleteMode: 'single' } : prev))
                  }
                >
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteModal.deleteMode === 'single'}
                    onChange={() =>
                      setDeleteModal((prev) => (prev ? { ...prev, deleteMode: 'single' } : prev))
                    }
                    style={{ marginTop: '2px', accentColor: 'var(--accent-primary)' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '2px' }}>
                      Delete this revision only
                      {(deleteModal.quotation.revisionNumber || 0) > 0 &&
                        ` (R${deleteModal.quotation.revisionNumber})`}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {(deleteModal.quotation.revisionNumber || 0) === 0
                        ? 'This is the original. The next revision will become the base.'
                        : 'The previous revision will become the latest version.'}
                    </div>
                  </div>
                </label>

                {/* Radio: Delete all revisions */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border:
                      deleteModal.deleteMode === 'all'
                        ? '2px solid var(--danger)'
                        : `1px solid ${isLight ? '#e0e0e0' : 'rgba(255,255,255,0.1)'}`,
                    background:
                      deleteModal.deleteMode === 'all'
                        ? isLight
                          ? 'rgba(255,77,77,0.05)'
                          : 'rgba(255,77,77,0.08)'
                        : 'transparent'
                  }}
                  onClick={() =>
                    setDeleteModal((prev) => (prev ? { ...prev, deleteMode: 'all' } : prev))
                  }
                >
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteModal.deleteMode === 'all'}
                    onChange={() =>
                      setDeleteModal((prev) => (prev ? { ...prev, deleteMode: 'all' } : prev))
                    }
                    style={{ marginTop: '2px', accentColor: 'var(--danger)' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '2px' }}>
                      Delete all revisions ({deleteModal.revisionCount})
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      This will permanently remove the entire quotation history.
                    </div>
                  </div>
                </label>
              </div>

              <div
                style={{
                  padding: '16px 24px',
                  background: isLight ? '#fafafa' : 'rgba(0,0,0,0.02)',
                  borderTop: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '0 0 14px 14px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px'
                }}
              >
                <button
                  onClick={() => setDeleteModal(null)}
                  className="btn-secondary"
                  style={{ padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="btn-primary"
                  style={{
                    padding: '8px 16px',
                    background: 'var(--danger)',
                    borderColor: 'var(--danger)'
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}

      {/* Bulk delete confirmation modal */}
      {bulkDeleteModal && (
        <ConfirmationModal
          title="Bulk Delete Quotations?"
          message={`Delete ${selectedIds.size} selected quotation(s)? This cannot be undone.`}
          confirmLabel="Delete All"
          isDangerous
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkDeleteModal(false)}
        />
      )}

      {/* Keyframe for loading shimmer */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes spin {
          from { transform: translateY(-50%) rotate(0deg); }
          to { transform: translateY(-50%) rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
