import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Ship,
  X,
  Loader2,
  GitCompareArrows,
  Download,
  Bookmark,
  Trash2
} from 'lucide-react'
import {
  Vessel,
  PolicyType,
  FlagState,
  ClassificationSociety,
  VesselDynamicPolicy,
  VesselType
} from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { Badge } from './ui'
import VesselCompareModal from './VesselCompareModal'
import { promptDialog, confirmDialog } from './DialogHost'
import { saveFile, SaveCancelledError } from '../utils/saveFile'

// Saved filter views (per computer): the criteria only, applied with one click
interface SavedFilterView {
  name: string
  logic: 'AND' | 'OR'
  selectedPolicyTypes: string[]
  policyStatus: 'active' | 'expired' | 'all'
  selectedFlagStates: string[]
  flagUnassigned: boolean
  selectedClassifications: string[]
  selectedVesselTypes: string[]
  selectedCustomerId: string
  customerType: 'broker' | 'direct' | 'both'
  vesselStatus: 'active' | 'inactive' | 'all'
  yearFrom: string
  yearTo: string
  gtFrom: string
  gtTo: string
}
const VIEWS_KEY = 'vessel_filter_views'
const readViews = (): SavedFilterView[] => {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
const writeViews = (views: SavedFilterView[]): void => {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views))
  } catch {
    /* per-computer convenience only */
  }
}

type ResultSortKey = 'name' | 'imo' | 'type' | 'flag' | 'year' | 'gt' | 'customer' | 'status'

interface VesselFilterProps {
  onNavigateToVessel?: (vesselId: string) => void
  /** Back to the plain vessel list */
  onClose?: () => void
}

// ── Reusable multi-select dropdown with inline search ──────────────────────────
function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder = 'Any'
}: {
  options: { id: string; label: string; sublabel?: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  isLight: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownBg = 'var(--bg-primary)'
  const showSearch = options.length > 6

  const close = (): void => {
    setOpen(false)
    setSearch('')
  }

  const handleToggle = (): void => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const searchH = showSearch ? 44 : 0
      const dropH = Math.min(options.length * 37 + searchH + 8, 280)
      const top =
        window.innerHeight - rect.bottom < dropH + 8 ? rect.top - dropH - 4 : rect.bottom + 4
      setPos({ top, left: rect.left, width: rect.width })
    }
    if (open) {
      close()
    } else setOpen(true)
  }

  useEffect(() => {
    if (open && showSearch) setTimeout(() => searchRef.current?.focus(), 40)
  }, [open, showSearch])

  const filtered = search.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.sublabel?.toLowerCase().includes(search.toLowerCase())
      )
    : options

  const toggle = (id: string): void =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  const selectedLabels = options.filter((o) => selected.includes(o.id)).map((o) => o.label)
  const displayText = selected.length === 0 ? placeholder : selectedLabels.join(', ')

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '0.78rem',
          background: dropdownBg,
          color: selected.length > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
          border:
            selected.length > 0
              ? '1px solid var(--accent-primary)'
              : '1px solid var(--input-border)',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          justifyContent: 'space-between'
        }}
      >
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
        >
          {displayText}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          {selected.length > 0 && (
            <span
              style={{
                background: 'var(--accent-primary)',
                color: '#000',
                borderRadius: '10px',
                padding: '0 6px',
                fontSize: '0.68rem',
                fontWeight: '700'
              }}
            >
              {selected.length}
            </span>
          )}
          <ChevronDown
            size={12}
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
          />
        </div>
      </button>

      {open &&
        createPortal(
          <>
            {/* Backdrop */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={close} />
            {/* Dropdown */}
            <div
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                width: pos.width,
                zIndex: 9999,
                background: dropdownBg,
                border: '1px solid var(--input-border)',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '280px'
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* All / None buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  padding: '6px 8px',
                  borderBottom: '1px solid var(--table-border)',
                  flexShrink: 0
                }}
              >
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange(options.map((o) => o.id))
                  }}
                  style={{
                    padding: '2px 8px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: '1px solid var(--input-border)',
                    background: 'transparent',
                    color: 'var(--accent-primary)',
                    cursor: 'pointer'
                  }}
                >
                  All
                </button>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange([])
                  }}
                  style={{
                    padding: '2px 8px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: '1px solid var(--input-border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  None
                </button>
              </div>
              {/* Search input — shown when list is long */}
              {showSearch && (
                <div
                  style={{
                    padding: '6px 8px',
                    borderBottom: '1px solid var(--table-border)',
                    flexShrink: 0
                  }}
                >
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--input-border)',
                      background: dropdownBg,
                      color: 'var(--text-primary)',
                      fontSize: '0.78rem',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>
              )}
              {/* Options list */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {filtered.length === 0 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {search ? 'No matches' : 'No options available'}
                  </div>
                )}
                {filtered.map((opt) => {
                  const checked = selected.includes(opt.id)
                  return (
                    <label
                      key={opt.id}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        toggle(opt.id)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '5px 10px',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={checked}
                        style={{
                          accentColor: 'var(--accent-primary)',
                          pointerEvents: 'none',
                          flexShrink: 0
                        }}
                      />
                      <span>
                        {opt.label}
                        {opt.sublabel && (
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>
                            -- {opt.sublabel}
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  )
}

// ── Module-level cache — persists filter state only when returning from vessel detail ──
// "More filters" panel of the Vessels page (was the Vessel Filter page): criteria the plain list
// does not have, AND / OR, saved views, Excel export and Compare
const SectionLabel = ({ children }: { children: string }): React.JSX.Element => (
  <div className="field-label" style={{ marginBottom: '8px' }}>
    {children}
  </div>
)
const Divider = (): React.JSX.Element => (
  <div style={{ height: '1px', background: 'var(--glass-border-color)', opacity: 0.6 }} />
)

const _resetCache = (): void => {
  _cache.hasSearched = false
  _cache.panelCollapsed = false
  _cache.nameSearch = ''
  _cache.logic = 'AND'
  _cache.selectedPolicyTypes = []
  _cache.policyStatus = 'all'
  _cache.selectedFlagStates = []
  _cache.flagUnassigned = false
  _cache.selectedClassifications = []
  _cache.selectedVesselTypes = []
  _cache.selectedCustomerId = ''
  _cache.customerType = 'both'
  _cache.vesselStatus = 'active'
  _cache.yearFrom = ''
  _cache.yearTo = ''
  _cache.gtFrom = ''
  _cache.gtTo = ''
  _cache.vesselClassifications = new Map()
}
const _cache = {
  hasSearched: false,
  panelCollapsed: false,
  nameSearch: '',
  logic: 'AND' as 'AND' | 'OR',
  selectedPolicyTypes: [] as string[],
  policyStatus: 'all' as 'active' | 'expired' | 'all',
  selectedFlagStates: [] as string[],
  flagUnassigned: false,
  selectedClassifications: [] as string[],
  selectedVesselTypes: [] as string[],
  selectedCustomerId: '',
  customerType: 'both' as 'broker' | 'direct' | 'both',
  vesselStatus: 'active' as 'active' | 'inactive' | 'all',
  yearFrom: '',
  yearTo: '',
  gtFrom: '',
  gtTo: '',
  vesselClassifications: new Map<string, string[]>(),
  preserveOnReturn: false
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function VesselFilter({
  onNavigateToVessel,
  onClose
}: VesselFilterProps): React.JSX.Element {
  const { showError, showSuccess } = useToast()
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'

  const [vessels, setVessels] = useState<Vessel[]>([])
  const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
  const [flagStates, setFlagStates] = useState<FlagState[]>([])
  const [classSocieties, setClassSocieties] = useState<ClassificationSociety[]>([])
  const [vesselTypes, setVesselTypes] = useState<VesselType[]>([])
  // Every vessel's policies (one bulk query): policy filters and the customer, which is kept on
  // the policy (a vessel has a customer per active policy)
  const [vesselPolicies, setVesselPolicies] = useState<Map<string, VesselDynamicPolicy[]>>(
    new Map()
  )
  const [vesselClassifications, setVesselClassifications] = useState<Map<string, string[]>>(
    _cache.vesselClassifications
  )

  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(_cache.hasSearched)
  const [panelCollapsed, setPanelCollapsed] = useState(_cache.panelCollapsed)
  const [nameSearch, setNameSearch] = useState(_cache.nameSearch)

  const [logic, setLogic] = useState<'AND' | 'OR'>(_cache.logic)
  const [selectedPolicyTypes, setSelectedPolicyTypes] = useState<string[]>(
    _cache.selectedPolicyTypes
  )
  const [policyStatus, setPolicyStatus] = useState<'active' | 'expired' | 'all'>(
    _cache.policyStatus
  )
  const [selectedFlagStates, setSelectedFlagStates] = useState<string[]>(_cache.selectedFlagStates)
  const [flagUnassigned, setFlagUnassigned] = useState(_cache.flagUnassigned)
  const [selectedClassifications, setSelectedClassifications] = useState<string[]>(
    _cache.selectedClassifications
  )
  const [selectedVesselTypes, setSelectedVesselTypes] = useState<string[]>(
    _cache.selectedVesselTypes
  )
  const [selectedCustomerId, setSelectedCustomerId] = useState(_cache.selectedCustomerId)
  const [customerType, setCustomerType] = useState<'broker' | 'direct' | 'both'>(
    _cache.customerType
  )
  const [vesselStatus, setVesselStatus] = useState<'active' | 'inactive' | 'all'>(
    _cache.vesselStatus
  )
  const [yearFrom, setYearFrom] = useState(_cache.yearFrom)
  const [yearTo, setYearTo] = useState(_cache.yearTo)
  const [gtFrom, setGtFrom] = useState(_cache.gtFrom)
  const [gtTo, setGtTo] = useState(_cache.gtTo)

  // Vessel comparison state
  const [comparedVesselIds, setComparedVesselIds] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)

  // Save filter state to module cache on every change
  useEffect(() => {
    _cache.hasSearched = hasSearched
    _cache.panelCollapsed = panelCollapsed
    _cache.nameSearch = nameSearch
    _cache.logic = logic
    _cache.selectedPolicyTypes = selectedPolicyTypes
    _cache.policyStatus = policyStatus
    _cache.selectedFlagStates = selectedFlagStates
    _cache.flagUnassigned = flagUnassigned
    _cache.selectedClassifications = selectedClassifications
    _cache.selectedVesselTypes = selectedVesselTypes
    _cache.selectedCustomerId = selectedCustomerId
    _cache.customerType = customerType
    _cache.vesselStatus = vesselStatus
    _cache.yearFrom = yearFrom
    _cache.yearTo = yearTo
    _cache.gtFrom = gtFrom
    _cache.gtTo = gtTo
    _cache.vesselClassifications = vesselClassifications
  }, [
    hasSearched,
    panelCollapsed,
    nameSearch,
    logic,
    selectedPolicyTypes,
    policyStatus,
    selectedFlagStates,
    flagUnassigned,
    selectedClassifications,
    selectedVesselTypes,
    selectedCustomerId,
    customerType,
    vesselStatus,
    yearFrom,
    yearTo,
    gtFrom,
    gtTo,
    vesselClassifications
  ])

  // On unmount: reset cache unless we're navigating into a vessel detail
  useEffect(() => {
    return () => {
      if (_cache.preserveOnReturn) {
        _cache.preserveOnReturn = false
      } else {
        _resetCache()
      }
    }
  }, [])

  // Load the filter option lists once on mount
  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      try {
        const [v, pt, fs, cs, vt, pol] = await Promise.all([
          window.api.getVessels(),
          window.api.getPolicyTypes(),
          window.api.getFlagStates(),
          window.api.getClassificationSocieties(),
          window.api.getVesselTypes(),
          window.api.getAllVesselDynamicPolicies()
        ])
        if (!alive) return
        setVessels(Array.isArray(v) ? v : [])
        setPolicyTypes(Array.isArray(pt) ? pt : [])
        setFlagStates(Array.isArray(fs) ? fs : [])
        setClassSocieties(Array.isArray(cs) ? cs : [])
        setVesselTypes(Array.isArray(vt) ? vt : [])
        const pMap = new Map<string, VesselDynamicPolicy[]>()
        for (const p of (Array.isArray(pol) ? pol : []) as VesselDynamicPolicy[]) {
          const list = pMap.get(p.vesselId)
          if (list) list.push(p)
          else pMap.set(p.vesselId, [p])
        }
        setVesselPolicies(pMap)
      } catch {
        if (alive) showError('Failed to load filter data')
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [showError])

  const flagMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const fs of flagStates) m.set(fs.id, fs.name)
    return m
  }, [flagStates])
  // Customers of each vessel's active policies
  const activePolicies = useMemo(() => {
    const m = new Map<string, VesselDynamicPolicy[]>()
    for (const [id, list] of vesselPolicies)
      m.set(
        id,
        list.filter((p) => p.status === 'active')
      )
    return m
  }, [vesselPolicies])
  const customerMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const [id, list] of activePolicies) {
      const names = [...new Set(list.map((p) => p.customerName).filter(Boolean))]
      if (names.length > 0) m.set(id, names.join(', '))
    }
    return m
  }, [activePolicies])

  const activeFilterCount = [
    selectedPolicyTypes.length > 0,
    policyStatus !== 'all',
    selectedFlagStates.length > 0 || flagUnassigned,
    selectedClassifications.length > 0,
    selectedVesselTypes.length > 0,
    !!selectedCustomerId,
    customerType !== 'both',
    vesselStatus !== 'active',
    !!yearFrom || !!yearTo,
    !!gtFrom || !!gtTo
  ].filter(Boolean).length

  const hasAnyCriteria = activeFilterCount > 0

  // view: a saved view was just applied (state not updated yet): load the lookups it needs
  const handleSearch = async (opts?: { view?: SavedFilterView }): Promise<void> => {
    const view = opts?.view
    if (!view && !hasAnyCriteria) {
      showError('Please select at least one filter criterion')
      return
    }
    setLoading(true)
    setHasSearched(true)
    try {
      const cMap = new Map<string, string[]>()
      if ((view ? view.selectedClassifications : selectedClassifications).length > 0) {
        // Parallel in small batches (was strictly one vessel after another)
        const BATCH = 16
        for (let i = 0; i < vessels.length; i += BATCH) {
          const chunk = vessels.slice(i, i + BATCH)
          const res = await Promise.all(chunk.map((v) => window.api.getVesselClassifications(v.id)))
          res.forEach((cls, j) => {
            if (Array.isArray(cls) && cls.length > 0)
              cMap.set(
                chunk[j].id,
                cls.map((c) => c.classificationSocietyId)
              )
          })
        }
      }
      setVesselClassifications(cMap)
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to search')
    } finally {
      setLoading(false)
    }
  }

  const clearAll = (): void => {
    setSelectedPolicyTypes([])
    setPolicyStatus('all')
    setSelectedFlagStates([])
    setFlagUnassigned(false)
    setSelectedClassifications([])
    setSelectedVesselTypes([])
    setSelectedCustomerId('')
    setCustomerType('both')
    setVesselStatus('active')
    setYearFrom('')
    setYearTo('')
    setGtFrom('')
    setGtTo('')
    setHasSearched(false)
    setNameSearch('')
    setVesselClassifications(new Map())
  }

  const toggleCompareVessel = (id: string): void => {
    setComparedVesselIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return prev
      return [...prev, id]
    })
  }

  const filteredVessels = useMemo(() => {
    if (!hasSearched) return []
    return vessels.filter((v) => {
      const checks: boolean[] = []
      if (vesselStatus === 'active' && !v.isActive) return false
      if (vesselStatus === 'inactive' && v.isActive) return false
      if (selectedFlagStates.length > 0 || flagUnassigned) {
        checks.push(
          (selectedFlagStates.length > 0 &&
            !!v.flagStateId &&
            selectedFlagStates.includes(v.flagStateId)) ||
            (flagUnassigned && !v.flagStateId)
        )
      }
      if (selectedVesselTypes.length > 0)
        checks.push(selectedVesselTypes.includes(v.vesselTypeId || v.vesselType || ''))
      if (selectedCustomerId)
        checks.push(
          (activePolicies.get(v.id) || []).some((p) => p.customerEntityId === selectedCustomerId)
        )
      if (customerType !== 'both')
        checks.push(
          (activePolicies.get(v.id) || []).some(
            (p) => !!p.customerEntityId && p.customerType === customerType
          )
        )
      if (yearFrom) checks.push(!!v.builtYear && v.builtYear >= parseInt(yearFrom))
      if (yearTo) checks.push(!!v.builtYear && v.builtYear <= parseInt(yearTo))
      if (gtFrom) checks.push(!!v.grossTonnage && v.grossTonnage >= parseInt(gtFrom))
      if (gtTo) checks.push(!!v.grossTonnage && v.grossTonnage <= parseInt(gtTo))
      if (selectedPolicyTypes.length > 0) {
        const vp = vesselPolicies.get(v.id) || []
        checks.push(
          selectedPolicyTypes.some((ptId) =>
            vp.some(
              (p) =>
                p.policyTypeId === ptId && (policyStatus === 'all' || p.status === policyStatus)
            )
          )
        )
      }
      if (policyStatus !== 'all' && selectedPolicyTypes.length === 0) {
        const vp = vesselPolicies.get(v.id) || []
        checks.push(vp.some((p) => p.status === policyStatus))
      }
      if (selectedClassifications.length > 0) {
        const vc = vesselClassifications.get(v.id) || []
        checks.push(selectedClassifications.some((id) => vc.includes(id)))
      }
      if (checks.length === 0) return true
      return logic === 'AND' ? checks.every(Boolean) : checks.some(Boolean)
    })
  }, [
    hasSearched,
    vessels,
    vesselPolicies,
    activePolicies,
    vesselClassifications,
    selectedPolicyTypes,
    selectedFlagStates,
    flagUnassigned,
    selectedClassifications,
    selectedVesselTypes,
    selectedCustomerId,
    customerType,
    vesselStatus,
    yearFrom,
    yearTo,
    gtFrom,
    gtTo,
    policyStatus,
    logic
  ])

  const [resultSort, setResultSort] = useState<{ key: ResultSortKey; dir: 'asc' | 'desc' }>({
    key: 'name',
    dir: 'asc'
  })
  const displayedVessels = useMemo(() => {
    const q = nameSearch.trim().toLowerCase()
    const list = q
      ? filteredVessels.filter(
          (v) => v.name.toLowerCase().includes(q) || v.imoNumber.toLowerCase().includes(q)
        )
      : [...filteredVessels]
    const val = (v: Vessel): string | number => {
      switch (resultSort.key) {
        case 'imo':
          return v.imoNumber || ''
        case 'type':
          return (v.vesselType || '').toLowerCase()
        case 'flag':
          return (flagMap.get(v.flagStateId || '') || '').toLowerCase()
        case 'year':
          return Number(v.builtYear) || 0
        case 'gt':
          return Number(v.grossTonnage) || 0
        case 'customer':
          return (customerMap.get(v.id) || '').toLowerCase()
        case 'status':
          return v.isActive ? 0 : 1
        default:
          return v.name.toLowerCase()
      }
    }
    return list.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const c = x < y ? -1 : x > y ? 1 : 0
      return resultSort.dir === 'asc' ? c : -c
    })
  }, [filteredVessels, nameSearch, resultSort, flagMap, customerMap])
  const sortTh = (key: ResultSortKey, label: string, cls?: string): React.JSX.Element => (
    <th
      scope="col"
      className={cls}
      style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
      aria-sort={
        resultSort.key === key ? (resultSort.dir === 'asc' ? 'ascending' : 'descending') : undefined
      }
      onClick={() =>
        setResultSort((s) =>
          s.key === key
            ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
            : { key, dir: key === 'year' || key === 'gt' ? 'desc' : 'asc' }
        )
      }
    >
      {label}
      {resultSort.key === key && (resultSort.dir === 'asc' ? ' ▲' : ' ▼')}
    </th>
  )

  // Saved views
  const [savedViews, setSavedViews] = useState<SavedFilterView[]>(readViews)
  const saveCurrentView = async (): Promise<void> => {
    const name = (await promptDialog('Name this filter view'))?.trim()
    if (!name) return
    const view: SavedFilterView = {
      name,
      logic,
      selectedPolicyTypes,
      policyStatus,
      selectedFlagStates,
      flagUnassigned,
      selectedClassifications,
      selectedVesselTypes,
      selectedCustomerId,
      customerType,
      vesselStatus,
      yearFrom,
      yearTo,
      gtFrom,
      gtTo
    }
    const next = [...savedViews.filter((v) => v.name !== name), view].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
    setSavedViews(next)
    writeViews(next)
    showSuccess(`View "${name}" saved`)
  }
  const applyView = (v: SavedFilterView): void => {
    setLogic(v.logic)
    setSelectedPolicyTypes(v.selectedPolicyTypes)
    setPolicyStatus(v.policyStatus)
    setSelectedFlagStates(v.selectedFlagStates)
    setFlagUnassigned(v.flagUnassigned)
    setSelectedClassifications(v.selectedClassifications)
    setSelectedVesselTypes(v.selectedVesselTypes)
    setSelectedCustomerId(v.selectedCustomerId)
    setCustomerType(v.customerType)
    setVesselStatus(v.vesselStatus)
    setYearFrom(v.yearFrom)
    setYearTo(v.yearTo)
    setGtFrom(v.gtFrom)
    setGtTo(v.gtTo)
    void handleSearch({ view: v })
  }
  const deleteView = async (name: string): Promise<void> => {
    if (!(await confirmDialog(`Delete the saved view "${name}"?`))) return
    const next = savedViews.filter((v) => v.name !== name)
    setSavedViews(next)
    writeViews(next)
  }

  const exportResults = async (): Promise<void> => {
    try {
      const XLSX = (await import('xlsx-js-style')).default
      const rows = displayedVessels.map((v) => ({
        Vessel: v.name,
        IMO: v.imoNumber,
        Type: v.vesselType || '',
        Flag: flagMap.get(v.flagStateId || '') || '',
        Built: v.builtYear || '',
        GT: v.grossTonnage != null ? Number(v.grossTonnage) : '',
        Customer: customerMap.get(v.id) || '',
        Status: v.isActive ? 'Active' : 'Inactive'
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [24, 10, 14, 18, 7, 10, 28, 9].map((wch) => ({ wch }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Vessels')
      const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      await saveFile(
        new Blob([out], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }),
        `Vessel filter ${new Date().toISOString().slice(0, 10)}.xlsx`
      )
      showSuccess(`${rows.length} vessel${rows.length === 1 ? '' : 's'} exported`)
    } catch (err) {
      if (err instanceof SaveCancelledError) return
      showError((err instanceof Error && err.message) || 'Export failed')
    }
  }

  const customerEntities = useMemo(() => {
    const m = new Map<string, string>()
    for (const list of activePolicies.values())
      for (const p of list)
        if (p.customerEntityId) m.set(p.customerEntityId, p.customerName || p.customerEntityId)
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [activePolicies])

  // Options for dropdowns
  const flagOptions = useMemo(
    () => [
      { id: '__unassigned__', label: 'Unassigned' },
      ...flagStates.map((fs) => ({ id: fs.id, label: fs.name }))
    ],
    [flagStates]
  )

  const allSelectedFlags = useMemo(
    () => [...(flagUnassigned ? ['__unassigned__'] : []), ...selectedFlagStates],
    [flagUnassigned, selectedFlagStates]
  )

  const handleFlagChange = (ids: string[]): void => {
    setFlagUnassigned(ids.includes('__unassigned__'))
    setSelectedFlagStates(ids.filter((id) => id !== '__unassigned__'))
  }

  const classOptions = useMemo(
    () =>
      classSocieties.map((cs) => ({
        id: cs.id,
        label: cs.abbreviation || cs.name,
        sublabel: cs.abbreviation ? cs.name : undefined
      })),
    [classSocieties]
  )

  const chip = (selected: boolean): React.CSSProperties => ({
    padding: '4px 12px',
    borderRadius: '14px',
    border: selected ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)',
    background: selected ? 'rgba(var(--accent-primary-rgb), 0.12)' : 'transparent',
    color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: selected ? 600 : 400,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
    lineHeight: '1.4'
  })

  const numInput = {
    flex: 1,
    width: '100%',
    minWidth: 0
  }

  return (
    <div
      className="fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 210px)',
        minHeight: '480px',
        overflow: 'hidden'
      }}
    >
      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── Filter sidebar ── */}
        <div
          style={{
            width: panelCollapsed ? '0' : '280px',
            flexShrink: 0,
            overflow: 'hidden',
            transition: 'width 0.25s ease'
          }}
        >
          <div
            style={{
              width: '280px',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-card)',
              borderRadius: '14px',
              border: '1px solid var(--table-border)',
              overflow: 'hidden'
            }}
          >
            {/* Sidebar header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--table-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexShrink: 0
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background:
                    'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <SlidersHorizontal size={16} color="var(--accent-contrast)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  Filters
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Refine your search
                </div>
              </div>
              {activeFilterCount > 0 && (
                <span
                  style={{
                    background: 'var(--accent-primary)',
                    color: 'var(--accent-contrast)',
                    borderRadius: '10px',
                    padding: '2px 8px',
                    fontSize: '0.7rem',
                    fontWeight: '700'
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </div>

            {/* Scrollable filter content */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}
            >
              {/* Logic */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1 }}>
                  Match
                </span>
                <button onClick={() => setLogic('AND')} style={chip(logic === 'AND')}>
                  AND
                </button>
                <button onClick={() => setLogic('OR')} style={chip(logic === 'OR')}>
                  OR
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  criteria
                </span>
              </div>

              <Divider />

              {/* Policy Types */}
              {policyTypes.length > 0 && (
                <div>
                  <SectionLabel>Policy types</SectionLabel>
                  <MultiSelectDropdown
                    options={policyTypes.map((pt) => ({ id: pt.id, label: pt.name }))}
                    selected={selectedPolicyTypes}
                    onChange={setSelectedPolicyTypes}
                    placeholder="Any policy type"
                    isLight={isLight}
                  />
                  {selectedPolicyTypes.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <SectionLabel>Policy status</SectionLabel>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        {(['all', 'active', 'expired'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setPolicyStatus(s)}
                            style={chip(policyStatus === s)}
                          >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Vessel Types */}
              {vesselTypes.length > 0 && (
                <div>
                  <SectionLabel>Vessel type</SectionLabel>
                  <MultiSelectDropdown
                    options={vesselTypes.map((vt) => ({
                      id: vt.id,
                      label: vt.name,
                      sublabel: vt.description
                    }))}
                    selected={selectedVesselTypes}
                    onChange={setSelectedVesselTypes}
                    placeholder="Any vessel type"
                    isLight={isLight}
                  />
                </div>
              )}

              {/* Flag States */}
              {flagStates.length > 0 && (
                <div>
                  <SectionLabel>Flag state</SectionLabel>
                  <MultiSelectDropdown
                    options={flagOptions}
                    selected={allSelectedFlags}
                    onChange={handleFlagChange}
                    placeholder="Any flag state"
                    isLight={isLight}
                  />
                </div>
              )}

              {/* Classification */}
              {classSocieties.length > 0 && (
                <div>
                  <SectionLabel>Classification</SectionLabel>
                  <MultiSelectDropdown
                    options={classOptions}
                    selected={selectedClassifications}
                    onChange={setSelectedClassifications}
                    placeholder="Any classification"
                    isLight={isLight}
                  />
                </div>
              )}

              <Divider />

              {/* Year Built */}
              <div>
                <SectionLabel>Year built</SectionLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    placeholder="Min"
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                    min={0}
                    style={numInput}
                  />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>to</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                    min={0}
                    style={numInput}
                  />
                </div>
              </div>

              {/* Gross Tonnage */}
              <div>
                <SectionLabel>Gross tonnage</SectionLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    placeholder="Min"
                    value={gtFrom}
                    onChange={(e) => setGtFrom(e.target.value)}
                    min={0}
                    style={numInput}
                  />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>to</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={gtTo}
                    onChange={(e) => setGtTo(e.target.value)}
                    min={0}
                    style={numInput}
                  />
                </div>
              </div>

              <Divider />

              {/* Customer */}
              <div>
                <SectionLabel>Customer</SectionLabel>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  aria-label="Customer"
                  style={{
                    width: '100%',
                    borderColor: selectedCustomerId ? 'var(--accent-primary)' : undefined,
                    color: selectedCustomerId ? 'var(--text-primary)' : 'var(--text-secondary)',
                    marginBottom: '8px'
                  }}
                >
                  <option value="">Any</option>
                  {customerEntities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {(['both', 'broker', 'direct'] as const).map((ct) => (
                    <button
                      key={ct}
                      onClick={() => setCustomerType(ct)}
                      style={chip(customerType === ct)}
                    >
                      {ct === 'both' ? 'All' : ct.charAt(0).toUpperCase() + ct.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vessel Status */}
              <div>
                <SectionLabel>Vessel status</SectionLabel>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {(['active', 'inactive', 'all'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setVesselStatus(s)}
                      style={chip(vesselStatus === s)}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Apply / Clear */}
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid var(--table-border)',
                display: 'flex',
                gap: '8px',
                flexShrink: 0
              }}
            >
              <button
                className="btn-primary"
                onClick={() => void handleSearch()}
                disabled={loading || !hasAnyCriteria}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {loading ? <Loader2 size={16} className="spinner" /> : <Search size={16} />}
                {loading ? 'Loading...' : 'Apply Filters'}
              </button>
              {hasAnyCriteria && (
                <button
                  onClick={() => void saveCurrentView()}
                  className="btn-secondary"
                  style={{ padding: '6px 10px' }}
                  title="Save these criteria as a view"
                  aria-label="Save view"
                >
                  <Bookmark size={14} />
                </button>
              )}
              {hasAnyCriteria && (
                <button
                  onClick={clearAll}
                  className="btn-secondary"
                  style={{ padding: '6px 10px' }}
                  title="Clear all filters"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {savedViews.length > 0 && (
              <div
                style={{
                  padding: '0 20px 14px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Saved views:
                </span>
                {savedViews.map((v) => (
                  <span key={v.name} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <button className="chip" onClick={() => applyView(v)} title="Apply this view">
                      {v.name}
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      style={{ padding: '2px 4px' }}
                      onClick={() => void deleteView(v.name)}
                      aria-label={`Delete view ${v.name}`}
                      title="Delete this view"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Results area ── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0
          }}
        >
          {/* Toolbar */}
          <div
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid var(--glass-border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0
            }}
          >
            <button
              onClick={() => setPanelCollapsed(!panelCollapsed)}
              title={panelCollapsed ? 'Show filters' : 'Hide filters'}
              style={{
                background: 'transparent',
                border: '1px solid var(--glass-border-color)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '5px 9px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.78rem'
              }}
            >
              {panelCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
              {panelCollapsed && activeFilterCount > 0 && (
                <span
                  style={{
                    background: 'var(--accent-primary)',
                    color: 'var(--accent-contrast)',
                    borderRadius: '10px',
                    padding: '0 5px',
                    fontSize: '0.68rem',
                    fontWeight: '700'
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
              Filters
            </button>
            {onClose && (
              <button
                className="btn-ghost btn-sm"
                onClick={onClose}
                title="Back to the plain vessel list"
              >
                <ChevronLeft size={14} /> Vessel list
              </button>
            )}

            {hasSearched && (
              <div style={{ position: 'relative', flex: '0 1 260px' }}>
                <Search
                  size={13}
                  style={{
                    position: 'absolute',
                    left: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-secondary)',
                    pointerEvents: 'none'
                  }}
                />
                <input
                  type="text"
                  placeholder="Search in results…"
                  value={nameSearch}
                  onChange={(e) => setNameSearch(e.target.value)}
                  aria-label="Search in results"
                  style={{ width: '100%', paddingLeft: '28px', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {hasSearched && comparedVesselIds.length === 2 && (
              <button
                onClick={() => setShowCompare(true)}
                className="btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 14px',
                  fontSize: '0.78rem'
                }}
              >
                <GitCompareArrows size={14} />
                Compare ({comparedVesselIds.length})
              </button>
            )}
            {hasSearched && comparedVesselIds.length > 0 && comparedVesselIds.length < 2 && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Select {2 - comparedVesselIds.length} more to compare
              </span>
            )}

            <div
              style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--text-secondary)' }}
            >
              {hasSearched && (
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {displayedVessels.length}
                  </strong>{' '}
                  vessel{displayedVessels.length !== 1 ? 's' : ''}
                  {filteredVessels.length !== displayedVessels.length &&
                    ` (filtered from ${filteredVessels.length})`}
                </span>
              )}
              {hasSearched && displayedVessels.length > 0 && (
                <button
                  className="btn-ghost btn-sm"
                  style={{ marginLeft: '10px' }}
                  onClick={() => void exportResults()}
                  title="Export these vessels to Excel"
                >
                  <Download size={14} /> Export
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div
            className={hasSearched ? 'table-wrap' : undefined}
            style={{ flex: 1, overflowY: 'auto', margin: hasSearched ? '12px 16px 16px' : 0 }}
          >
            {!hasSearched ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: '14px',
                  color: 'var(--text-secondary)',
                  textAlign: 'center',
                  padding: '40px'
                }}
              >
                <SlidersHorizontal size={52} style={{ opacity: 0.12 }} />
                <div>
                  <p
                    style={{
                      fontWeight: '600',
                      margin: '0 0 4px',
                      color: 'var(--text-primary)',
                      fontSize: '1rem'
                    }}
                  >
                    Configure your filters
                  </p>
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>
                    Select criteria on the left and click <strong>Apply Filters</strong> to see
                    results.
                  </p>
                </div>
              </div>
            ) : (
              <table className="data-table">
                <caption className="sr-only">Filtered vessel results</caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      style={{ width: '36px', padding: '11px 8px' }}
                      title="Tick two vessels to compare them side by side"
                    >
                      Compare
                    </th>
                    {sortTh('name', 'Vessel')}
                    {sortTh('imo', 'IMO')}
                    {sortTh('type', 'Type')}
                    {sortTh('flag', 'Flag')}
                    {sortTh('year', 'Year')}
                    {sortTh('gt', 'GT', 'num')}
                    {sortTh('customer', 'Customer')}
                    {sortTh('status', 'Status')}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="muted"
                        style={{ padding: '56px', textAlign: 'center' }}
                      >
                        <Loader2
                          size={32}
                          className="spinner"
                          style={{ opacity: 0.4, display: 'block', margin: '0 auto 14px' }}
                        />
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                          Searching...
                        </div>
                      </td>
                    </tr>
                  ) : displayedVessels.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="muted"
                        style={{ padding: '56px', textAlign: 'center' }}
                      >
                        <Search
                          size={40}
                          style={{
                            opacity: 0.15,
                            marginBottom: '14px',
                            display: 'block',
                            margin: '0 auto 14px'
                          }}
                        />
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                          No vessels match your criteria
                        </div>
                        <p style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>
                          Try adjusting the filters or switching to <strong>OR</strong> logic.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    displayedVessels.map((v) => (
                      <tr
                        key={v.id}
                        className={
                          [
                            onNavigateToVessel ? 'clickable' : '',
                            comparedVesselIds.includes(v.id) ? 'selected' : ''
                          ]
                            .filter(Boolean)
                            .join(' ') || undefined
                        }
                      >
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={comparedVesselIds.includes(v.id)}
                            onChange={() => toggleCompareVessel(v.id)}
                            onClick={(e) => e.stopPropagation()}
                            disabled={
                              !comparedVesselIds.includes(v.id) && comparedVesselIds.length >= 2
                            }
                            style={{ accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                          />
                        </td>
                        <td
                          onClick={() => {
                            if (onNavigateToVessel) {
                              _cache.preserveOnReturn = true
                              onNavigateToVessel(v.id)
                            }
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontWeight: '600'
                            }}
                          >
                            <Ship
                              size={14}
                              color="var(--accent-primary)"
                              style={{ flexShrink: 0 }}
                            />
                            {v.name}
                          </div>
                        </td>
                        <td className="muted">
                          <span className="mono">{v.imoNumber}</span>
                        </td>
                        <td>{v.vesselType || <span style={{ opacity: 0.3 }}>—</span>}</td>
                        <td>
                          {v.flagStateId ? (
                            flagMap.get(v.flagStateId) || '—'
                          ) : (
                            <span style={{ opacity: 0.3 }}>—</span>
                          )}
                        </td>
                        <td>{v.builtYear || <span style={{ opacity: 0.3 }}>—</span>}</td>
                        <td className="num">
                          {v.grossTonnage?.toLocaleString() || (
                            <span style={{ opacity: 0.3 }}>—</span>
                          )}
                        </td>
                        <td className="muted">
                          {customerMap.get(v.id) || <span style={{ opacity: 0.3 }}>—</span>}
                        </td>
                        <td>
                          <Badge tone={v.isActive ? 'success' : 'danger'}>
                            {v.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showCompare && comparedVesselIds.length === 2 && (
        <VesselCompareModal
          vesselIds={[comparedVesselIds[0], comparedVesselIds[1]]}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  )
}
