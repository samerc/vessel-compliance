import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, ChevronDown, Ship, X, Loader2, GitCompareArrows } from 'lucide-react'
import { Vessel, PolicyType, FlagState, ClassificationSociety, Entity, VesselDynamicPolicy, VesselType } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'

interface VesselFilterProps {
    onNavigateToVessel?: (vesselId: string) => void
}

// ── Reusable multi-select dropdown with inline search ──────────────────────────
function MultiSelectDropdown({ options, selected, onChange, placeholder = 'Any', isLight }: {
    options: { id: string; label: string; sublabel?: string }[]
    selected: string[]
    onChange: (ids: string[]) => void
    placeholder?: string
    isLight: boolean
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
    const btnRef = useRef<HTMLButtonElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)
    const dropdownBg = isLight ? '#ffffff' : '#1a1d28'
    const showSearch = options.length > 6

    const close = () => { setOpen(false); setSearch('') }

    const handleToggle = () => {
        if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect()
            const searchH = showSearch ? 44 : 0
            const dropH = Math.min(options.length * 37 + searchH + 8, 280)
            const top = window.innerHeight - rect.bottom < dropH + 8
                ? rect.top - dropH - 4
                : rect.bottom + 4
            setPos({ top, left: rect.left, width: rect.width })
        }
        if (open) { close() } else setOpen(true)
    }

    useEffect(() => {
        if (open && showSearch) setTimeout(() => searchRef.current?.focus(), 40)
    }, [open, showSearch])

    const filtered = search.trim()
        ? options.filter(o =>
            o.label.toLowerCase().includes(search.toLowerCase()) ||
            o.sublabel?.toLowerCase().includes(search.toLowerCase()))
        : options

    const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])

    const selectedLabels = options.filter(o => selected.includes(o.id)).map(o => o.label)
    const displayText = selected.length === 0 ? placeholder : selectedLabels.join(', ')

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                onClick={handleToggle}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem',
                    background: dropdownBg,
                    color: selected.length > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: selected.length > 0 ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)',
                    cursor: 'pointer', width: '100%', textAlign: 'left',
                    justifyContent: 'space-between',
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {displayText}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                    {selected.length > 0 && (
                        <span style={{ background: 'var(--accent-primary)', color: '#000', borderRadius: '10px', padding: '0 6px', fontSize: '0.68rem', fontWeight: '700' }}>
                            {selected.length}
                        </span>
                    )}
                    <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </div>
            </button>

            {open && createPortal(
                <>
                    {/* Backdrop */}
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={close} />
                    {/* Dropdown */}
                    <div
                        style={{
                            position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
                            zIndex: 9999, background: dropdownBg,
                            border: '1px solid var(--input-border)', borderRadius: '6px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            display: 'flex', flexDirection: 'column', maxHeight: '280px',
                        }}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        {/* All / None buttons */}
                        <div style={{
                            display: 'flex', gap: '4px', padding: '6px 8px',
                            borderBottom: '1px solid var(--table-border)',
                            flexShrink: 0,
                        }}>
                            <button
                                onMouseDown={e => { e.preventDefault(); onChange(options.map(o => o.id)) }}
                                style={{
                                    padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600,
                                    borderRadius: '4px', border: '1px solid var(--input-border)',
                                    background: 'transparent', color: 'var(--accent-primary)',
                                    cursor: 'pointer',
                                }}
                            >
                                All
                            </button>
                            <button
                                onMouseDown={e => { e.preventDefault(); onChange([]) }}
                                style={{
                                    padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600,
                                    borderRadius: '4px', border: '1px solid var(--input-border)',
                                    background: 'transparent', color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                }}
                            >
                                None
                            </button>
                        </div>
                        {/* Search input — shown when list is long */}
                        {showSearch && (
                            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--table-border)', flexShrink: 0 }}>
                                <input
                                    ref={searchRef}
                                    type="text"
                                    placeholder="Search..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onMouseDown={e => e.stopPropagation()}
                                    style={{
                                        width: '100%', padding: '4px 8px', borderRadius: '4px',
                                        border: '1px solid var(--input-border)',
                                        background: dropdownBg,
                                        color: 'var(--text-primary)', fontSize: '0.78rem',
                                        boxSizing: 'border-box', outline: 'none',
                                    }}
                                />
                            </div>
                        )}
                        {/* Options list */}
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {filtered.length === 0 && (
                                <div style={{ padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                    {search ? 'No matches' : 'No options available'}
                                </div>
                            )}
                            {filtered.map(opt => {
                                const checked = selected.includes(opt.id)
                                return (
                                    <label
                                        key={opt.id}
                                        onMouseDown={e => { e.preventDefault(); toggle(opt.id) }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '5px 10px', cursor: 'pointer', fontSize: '0.78rem',
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        <input type="checkbox" readOnly checked={checked} style={{ accentColor: 'var(--accent-primary)', pointerEvents: 'none', flexShrink: 0 }} />
                                        <span>
                                            {opt.label}
                                            {opt.sublabel && <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>-- {opt.sublabel}</span>}
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
const _resetCache = () => {
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
    _cache.vesselPolicies = new Map()
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
    vesselPolicies: new Map<string, VesselDynamicPolicy[]>(),
    vesselClassifications: new Map<string, string[]>(),
    preserveOnReturn: false,
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function VesselFilter({ onNavigateToVessel }: VesselFilterProps) {
    const { showError } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    const [vessels, setVessels] = useState<Vessel[]>([])
    const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
    const [flagStates, setFlagStates] = useState<FlagState[]>([])
    const [classSocieties, setClassSocieties] = useState<ClassificationSociety[]>([])
    const [vesselTypes, setVesselTypes] = useState<VesselType[]>([])
    const [entities, setEntities] = useState<Entity[]>([])
    const [vesselPolicies, setVesselPolicies] = useState<Map<string, VesselDynamicPolicy[]>>(_cache.vesselPolicies)
    const [vesselClassifications, setVesselClassifications] = useState<Map<string, string[]>>(_cache.vesselClassifications)

    const [loading, setLoading] = useState(false)
    const [hasSearched, setHasSearched] = useState(_cache.hasSearched)
    const [panelCollapsed, setPanelCollapsed] = useState(_cache.panelCollapsed)
    const [nameSearch, setNameSearch] = useState(_cache.nameSearch)

    const [logic, setLogic] = useState<'AND' | 'OR'>(_cache.logic)
    const [selectedPolicyTypes, setSelectedPolicyTypes] = useState<string[]>(_cache.selectedPolicyTypes)
    const [policyStatus, setPolicyStatus] = useState<'active' | 'expired' | 'all'>(_cache.policyStatus)
    const [selectedFlagStates, setSelectedFlagStates] = useState<string[]>(_cache.selectedFlagStates)
    const [flagUnassigned, setFlagUnassigned] = useState(_cache.flagUnassigned)
    const [selectedClassifications, setSelectedClassifications] = useState<string[]>(_cache.selectedClassifications)
    const [selectedVesselTypes, setSelectedVesselTypes] = useState<string[]>(_cache.selectedVesselTypes)
    const [selectedCustomerId, setSelectedCustomerId] = useState(_cache.selectedCustomerId)
    const [customerType, setCustomerType] = useState<'broker' | 'direct' | 'both'>(_cache.customerType)
    const [vesselStatus, setVesselStatus] = useState<'active' | 'inactive' | 'all'>(_cache.vesselStatus)
    const [yearFrom, setYearFrom] = useState(_cache.yearFrom)
    const [yearTo, setYearTo] = useState(_cache.yearTo)
    const [gtFrom, setGtFrom] = useState(_cache.gtFrom)
    const [gtTo, setGtTo] = useState(_cache.gtTo)

    // Vessel comparison state
    const [comparedVesselIds, setComparedVesselIds] = useState<string[]>([])
    const [showCompare, setShowCompare] = useState(false)
    const [compareData, setCompareData] = useState<any>(null)
    const [compareLoading, setCompareLoading] = useState(false)

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
        _cache.vesselPolicies = vesselPolicies
        _cache.vesselClassifications = vesselClassifications
    }, [hasSearched, panelCollapsed, nameSearch, logic, selectedPolicyTypes, policyStatus,
        selectedFlagStates, flagUnassigned, selectedClassifications, selectedVesselTypes,
        selectedCustomerId, customerType, vesselStatus, yearFrom, yearTo, gtFrom, gtTo,
        vesselPolicies, vesselClassifications])

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

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        try {
            const [v, pt, fs, cs, vt, ent] = await Promise.all([
                window.api.getVessels(),
                window.api.getPolicyTypes(),
                window.api.getFlagStates(),
                window.api.getClassificationSocieties(),
                window.api.getVesselTypes(),
                window.api.getEntities(),
            ])
            setVessels(Array.isArray(v) ? v : [])
            setPolicyTypes(Array.isArray(pt) ? pt : [])
            setFlagStates(Array.isArray(fs) ? fs : [])
            setClassSocieties(Array.isArray(cs) ? cs : [])
            setVesselTypes(Array.isArray(vt) ? vt : [])
            setEntities(Array.isArray(ent) ? ent : [])
        } catch { showError('Failed to load filter data') }
    }

    const activeFilterCount = [
        selectedPolicyTypes.length > 0, policyStatus !== 'all',
        selectedFlagStates.length > 0 || flagUnassigned,
        selectedClassifications.length > 0, selectedVesselTypes.length > 0,
        !!selectedCustomerId, customerType !== 'both',
        vesselStatus !== 'active', !!yearFrom || !!yearTo, !!gtFrom || !!gtTo,
    ].filter(Boolean).length

    const hasAnyCriteria = activeFilterCount > 0

    const handleSearch = async () => {
        if (!hasAnyCriteria) { showError('Please select at least one filter criterion'); return }
        setLoading(true); setHasSearched(true)
        try {
            const pMap = new Map<string, VesselDynamicPolicy[]>()
            const cMap = new Map<string, string[]>()
            if (selectedPolicyTypes.length > 0 || policyStatus !== 'all') {
                for (const v of vessels) {
                    const p = await window.api.getVesselDynamicPolicies(v.id)
                    if (p.length > 0) pMap.set(v.id, p)
                }
            }
            if (selectedClassifications.length > 0) {
                for (const v of vessels) {
                    const cls = await window.api.getVesselClassifications(v.id)
                    if (cls.length > 0) cMap.set(v.id, cls.map((c: any) => c.classificationSocietyId))
                }
            }
            setVesselPolicies(pMap); setVesselClassifications(cMap)
        } catch (err: any) {
            showError(err.message || 'Failed to search')
        } finally { setLoading(false) }
    }

    const clearAll = () => {
        setSelectedPolicyTypes([]); setPolicyStatus('all')
        setSelectedFlagStates([]); setFlagUnassigned(false)
        setSelectedClassifications([]); setSelectedVesselTypes([])
        setSelectedCustomerId(''); setCustomerType('both')
        setVesselStatus('active')
        setYearFrom(''); setYearTo(''); setGtFrom(''); setGtTo('')
        setHasSearched(false); setNameSearch('')
        setVesselPolicies(new Map()); setVesselClassifications(new Map())
    }

    const toggleCompareVessel = (id: string) => {
        setComparedVesselIds(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id)
            if (prev.length >= 2) return prev
            return [...prev, id]
        })
    }

    const openCompare = async () => {
        if (comparedVesselIds.length !== 2) return
        setCompareLoading(true)
        setShowCompare(true)
        try {
            const [v1, v2] = comparedVesselIds
            const vessel1 = vessels.find(v => v.id === v1)
            const vessel2 = vessels.find(v => v.id === v2)
            if (!vessel1 || !vessel2) return

            const [p1, p2, d1, d2, dt, cls1, cls2] = await Promise.all([
                window.api.getVesselDynamicPolicies(v1),
                window.api.getVesselDynamicPolicies(v2),
                window.api.getVesselDocuments(v1),
                window.api.getVesselDocuments(v2),
                window.api.getDocumentTypes(),
                window.api.getVesselClassifications(v1),
                window.api.getVesselClassifications(v2),
            ])

            const policyTypes_ = await window.api.getPolicyTypes()
            const ptMap = new Map((Array.isArray(policyTypes_) ? policyTypes_ : []).map((pt: any) => [pt.id, pt.name]))

            const buildPolicySummary = (policies: any[]) => {
                const active = (Array.isArray(policies) ? policies : []).filter((p: any) => p.status === 'active')
                return active.map((p: any) => ({
                    typeName: ptMap.get(p.policyTypeId) || 'Unknown',
                    policyNumber: p.policyNumber || '-',
                    status: p.status
                }))
            }

            const buildDocStats = (docs: any[], types: any[]) => {
                const safeTypes = Array.isArray(types) ? types : []
                const safeDocs = Array.isArray(docs) ? docs : []
                const total = safeTypes.length
                let compliant = 0, missing = 0, expired = 0
                const today = new Date()
                for (const t of safeTypes) {
                    const doc = safeDocs.find((d: any) => d.documentTypeId === t.id)
                    if (!doc?.filePath) { missing++; continue }
                    if (doc.expiryDate && new Date(doc.expiryDate) < today) { expired++; continue }
                    compliant++
                }
                return { compliant, total, missing, expired, pct: total > 0 ? Math.round((compliant / total) * 100) : 100 }
            }

            const classMap = new Map(classSocieties.map(cs => [cs.id, cs.abbreviation || cs.name]))
            const getClassNames = (clsList: any[]) =>
                (Array.isArray(clsList) ? clsList : []).map((c: any) => classMap.get(c.classificationSocietyId) || 'Unknown').join(', ') || '-'

            const fleetMap = new Map<string, string>()
            try {
                const fleets = await window.api.getFleets()
                if (Array.isArray(fleets)) fleets.forEach((f: any) => fleetMap.set(f.id, f.name))
            } catch { /* ignore */ }

            setCompareData({
                vessel1, vessel2,
                policies1: buildPolicySummary(p1),
                policies2: buildPolicySummary(p2),
                docs1: buildDocStats(d1, dt),
                docs2: buildDocStats(d2, dt),
                class1: getClassNames(cls1),
                class2: getClassNames(cls2),
                fleet1: vessel1.fleetId ? (fleetMap.get(vessel1.fleetId) || '-') : '-',
                fleet2: vessel2.fleetId ? (fleetMap.get(vessel2.fleetId) || '-') : '-',
                customer1: vessel1.customerId ? (customerMap.get(vessel1.customerId) || '-') : '-',
                customer2: vessel2.customerId ? (customerMap.get(vessel2.customerId) || '-') : '-',
                flag1: vessel1.flagStateId ? (flagMap.get(vessel1.flagStateId) || '-') : '-',
                flag2: vessel2.flagStateId ? (flagMap.get(vessel2.flagStateId) || '-') : '-',
            })
        } catch (err: any) {
            showError(err.message || 'Failed to load comparison data')
        } finally {
            setCompareLoading(false)
        }
    }

    const filteredVessels = useMemo(() => {
        if (!hasSearched) return []
        return vessels.filter(v => {
            const checks: boolean[] = []
            if (vesselStatus === 'active' && !v.isActive) return false
            if (vesselStatus === 'inactive' && v.isActive) return false
            if (selectedFlagStates.length > 0 || flagUnassigned) {
                checks.push(
                    (selectedFlagStates.length > 0 && !!v.flagStateId && selectedFlagStates.includes(v.flagStateId)) ||
                    (flagUnassigned && !v.flagStateId)
                )
            }
            if (selectedVesselTypes.length > 0) checks.push(selectedVesselTypes.includes(v.vesselTypeId || v.vesselType || ''))
            if (selectedCustomerId) checks.push(v.customerId === selectedCustomerId)
            if (customerType !== 'both') checks.push(v.customerType === customerType)
            if (yearFrom) checks.push(!!v.builtYear && v.builtYear >= parseInt(yearFrom))
            if (yearTo) checks.push(!!v.builtYear && v.builtYear <= parseInt(yearTo))
            if (gtFrom) checks.push(!!v.grossTonnage && v.grossTonnage >= parseInt(gtFrom))
            if (gtTo) checks.push(!!v.grossTonnage && v.grossTonnage <= parseInt(gtTo))
            if (selectedPolicyTypes.length > 0) {
                const vp = vesselPolicies.get(v.id) || []
                checks.push(selectedPolicyTypes.some(ptId => vp.some(p => p.policyTypeId === ptId && (policyStatus === 'all' || p.status === policyStatus))))
            }
            if (policyStatus !== 'all' && selectedPolicyTypes.length === 0) {
                const vp = vesselPolicies.get(v.id) || []
                checks.push(vp.some(p => p.status === policyStatus))
            }
            if (selectedClassifications.length > 0) {
                const vc = vesselClassifications.get(v.id) || []
                checks.push(selectedClassifications.some(id => vc.includes(id)))
            }
            if (checks.length === 0) return true
            return logic === 'AND' ? checks.every(Boolean) : checks.some(Boolean)
        })
    }, [hasSearched, vessels, vesselPolicies, vesselClassifications, selectedPolicyTypes,
        selectedFlagStates, flagUnassigned, selectedClassifications, selectedVesselTypes,
        selectedCustomerId, customerType, vesselStatus, yearFrom, yearTo, gtFrom, gtTo, policyStatus, logic])

    const displayedVessels = useMemo(() => {
        if (!nameSearch.trim()) return filteredVessels
        const q = nameSearch.toLowerCase()
        return filteredVessels.filter(v => v.name.toLowerCase().includes(q) || v.imoNumber.toLowerCase().includes(q))
    }, [filteredVessels, nameSearch])

    const flagMap = useMemo(() => { const m = new Map<string, string>(); for (const fs of flagStates) m.set(fs.id, fs.name); return m }, [flagStates])
    const customerMap = useMemo(() => { const m = new Map<string, string>(); for (const e of entities) m.set(e.id, e.name); return m }, [entities])
    const customerEntities = useMemo(() => { const ids = new Set(vessels.filter(v => v.customerId).map(v => v.customerId!)); return entities.filter(e => ids.has(e.id)) }, [entities, vessels])

    // Options for dropdowns
    const flagOptions = useMemo(() => [
        { id: '__unassigned__', label: 'Unassigned' },
        ...flagStates.map(fs => ({ id: fs.id, label: fs.name })),
    ], [flagStates])

    const allSelectedFlags = useMemo(() => [
        ...(flagUnassigned ? ['__unassigned__'] : []),
        ...selectedFlagStates,
    ], [flagUnassigned, selectedFlagStates])

    const handleFlagChange = (ids: string[]) => {
        setFlagUnassigned(ids.includes('__unassigned__'))
        setSelectedFlagStates(ids.filter(id => id !== '__unassigned__'))
    }

    const classOptions = useMemo(() => classSocieties.map(cs => ({
        id: cs.id,
        label: cs.abbreviation || cs.name,
        sublabel: cs.abbreviation ? cs.name : undefined,
    })), [classSocieties])

    const chip = (selected: boolean) => ({
        padding: '4px 12px', borderRadius: '14px',
        border: selected ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)',
        background: selected ? 'rgba(0, 210, 255, 0.12)' : 'transparent',
        color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
        cursor: 'pointer', fontSize: '0.78rem',
        fontWeight: selected ? 600 : 400,
        transition: 'all 0.15s', whiteSpace: 'nowrap' as const,
        lineHeight: '1.4',
    })

    const numInput = {
        flex: 1, padding: '6px 8px', borderRadius: '6px', fontSize: '0.78rem',
        border: '1px solid var(--input-border)', background: isLight ? '#ffffff' : '#1a1d28',
        color: 'var(--text-primary)', width: '100%',
    }

    const th = { padding: '11px 16px', fontSize: '0.73rem', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: 'var(--text-secondary)' }

    const SectionLabel = ({ children }: { children: string }) => (
        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            {children}
        </div>
    )
    const Divider = () => <div style={{ height: '1px', background: 'var(--glass-border)', opacity: 0.6 }} />

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', margin: '-24px', overflow: 'hidden' }}>

            {/* Page header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                <SlidersHorizontal size={20} color="var(--accent-primary)" />
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '1.2rem', margin: 0, fontWeight: '700' }}>Vessel Filter</h1>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>Build a query to find vessels matching specific criteria</p>
                </div>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* ── Filter sidebar ── */}
                <div style={{ width: panelCollapsed ? '0' : '280px', flexShrink: 0, overflow: 'hidden', transition: 'width 0.25s ease' }}>
                    <div style={{
                        width: '280px', height: '100%', display: 'flex', flexDirection: 'column',
                        background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--table-border)',
                        overflow: 'hidden'
                    }}>

                        {/* Sidebar header */}
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid var(--table-border)',
                            display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0
                        }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 9,
                                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                                <SlidersHorizontal size={16} color="#fff" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Filters</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Refine your search</div>
                            </div>
                            {activeFilterCount > 0 && (
                                <span style={{ background: 'var(--accent-primary)', color: '#000', borderRadius: '10px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: '700' }}>
                                    {activeFilterCount}
                                </span>
                            )}
                        </div>

                        {/* Scrollable filter content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                            {/* Logic */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1 }}>Match</span>
                                <button onClick={() => setLogic('AND')} style={chip(logic === 'AND')}>AND</button>
                                <button onClick={() => setLogic('OR')} style={chip(logic === 'OR')}>OR</button>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>criteria</span>
                            </div>

                            <Divider />

                            {/* Policy Types */}
                            {policyTypes.length > 0 && (
                                <div>
                                    <SectionLabel>Policy Types</SectionLabel>
                                    <MultiSelectDropdown
                                        options={policyTypes.map(pt => ({ id: pt.id, label: pt.name }))}
                                        selected={selectedPolicyTypes}
                                        onChange={setSelectedPolicyTypes}
                                        placeholder="Any policy type"
                                        isLight={isLight}
                                    />
                                    {selectedPolicyTypes.length > 0 && (
                                        <div style={{ marginTop: '8px' }}>
                                            <SectionLabel>Policy Status</SectionLabel>
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                {(['all', 'active', 'expired'] as const).map(s => (
                                                    <button key={s} onClick={() => setPolicyStatus(s)} style={chip(policyStatus === s)}>
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
                                    <SectionLabel>Vessel Type</SectionLabel>
                                    <MultiSelectDropdown
                                        options={vesselTypes.map(vt => ({ id: vt.id, label: vt.name, sublabel: vt.description }))}
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
                                    <SectionLabel>Flag State</SectionLabel>
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
                                <SectionLabel>Year Built</SectionLabel>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="number" placeholder="Min" value={yearFrom} onChange={e => setYearFrom(e.target.value)} min={0} style={numInput} />
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>to</span>
                                    <input type="number" placeholder="Max" value={yearTo} onChange={e => setYearTo(e.target.value)} min={0} style={numInput} />
                                </div>
                            </div>

                            {/* Gross Tonnage */}
                            <div>
                                <SectionLabel>Gross Tonnage</SectionLabel>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="number" placeholder="Min" value={gtFrom} onChange={e => setGtFrom(e.target.value)} min={0} style={numInput} />
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>to</span>
                                    <input type="number" placeholder="Max" value={gtTo} onChange={e => setGtTo(e.target.value)} min={0} style={numInput} />
                                </div>
                            </div>

                            <Divider />

                            {/* Customer */}
                            <div>
                                <SectionLabel>Customer</SectionLabel>
                                <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: selectedCustomerId ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)', background: isLight ? '#ffffff' : '#1a1d28', color: selectedCustomerId ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '8px' }}>
                                    <option value="">Any</option>
                                    {customerEntities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    {(['both', 'broker', 'direct'] as const).map(ct => (
                                        <button key={ct} onClick={() => setCustomerType(ct)} style={chip(customerType === ct)}>
                                            {ct === 'both' ? 'All' : ct.charAt(0).toUpperCase() + ct.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Vessel Status */}
                            <div>
                                <SectionLabel>Vessel Status</SectionLabel>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    {(['active', 'inactive', 'all'] as const).map(s => (
                                        <button key={s} onClick={() => setVesselStatus(s)} style={chip(vesselStatus === s)}>
                                            {s.charAt(0).toUpperCase() + s.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Apply / Clear */}
                        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--table-border)', display: 'flex', gap: '8px', flexShrink: 0 }}>
                            <button
                                className="btn-primary"
                                onClick={handleSearch}
                                disabled={loading || !hasAnyCriteria}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                {loading ? <Loader2 size={16} className="spinner" /> : <Search size={16} />}
                                {loading ? 'Loading...' : 'Apply Filters'}
                            </button>
                            {hasAnyCriteria && (
                                <button onClick={clearAll} className="btn-secondary" style={{ padding: '6px 10px' }} title="Clear all filters">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Results area ── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

                    {/* Toolbar */}
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <button
                            onClick={() => setPanelCollapsed(!panelCollapsed)}
                            title={panelCollapsed ? 'Show filters' : 'Hide filters'}
                            style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', padding: '5px 9px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem' }}
                        >
                            {panelCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
                            {panelCollapsed && activeFilterCount > 0 && (
                                <span style={{ background: 'var(--accent-primary)', color: '#000', borderRadius: '10px', padding: '0 5px', fontSize: '0.68rem', fontWeight: '700' }}>
                                    {activeFilterCount}
                                </span>
                            )}
                            Filters
                        </button>

                        {hasSearched && (
                            <div style={{ position: 'relative', flex: '0 1 260px' }}>
                                <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                                <input
                                    type="text"
                                    placeholder="Search in results…"
                                    value={nameSearch}
                                    onChange={e => setNameSearch(e.target.value)}
                                    style={{ width: '100%', paddingLeft: '28px', paddingRight: '8px', paddingTop: '5px', paddingBottom: '5px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.82rem', boxSizing: 'border-box' }}
                                />
                            </div>
                        )}

                        {hasSearched && comparedVesselIds.length === 2 && (
                            <button
                                onClick={openCompare}
                                className="btn-primary"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 14px', fontSize: '0.78rem' }}
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

                        <div style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            {hasSearched && (
                                <span>
                                    <strong style={{ color: 'var(--text-primary)' }}>{displayedVessels.length}</strong> vessel{displayedVessels.length !== 1 ? 's' : ''}
                                    {filteredVessels.length !== displayedVessels.length && ` (filtered from ${filteredVessels.length})`}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Table */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {!hasSearched ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '14px', color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>
                                <SlidersHorizontal size={52} style={{ opacity: 0.12 }} />
                                <div>
                                    <p style={{ fontWeight: '600', margin: '0 0 4px', color: 'var(--text-primary)', fontSize: '1rem' }}>Configure your filters</p>
                                    <p style={{ margin: 0, fontSize: '0.85rem' }}>Select criteria on the left and click <strong>Apply Filters</strong> to see results.</p>
                                </div>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <caption className="sr-only">Filtered vessel results</caption>
                                <thead>
                                    <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                        <th scope="col" style={{ ...th, width: '36px', padding: '11px 8px' }}></th>
                                        <th scope="col" style={th}>Vessel</th>
                                        <th scope="col" style={th}>IMO</th>
                                        <th scope="col" style={th}>Type</th>
                                        <th scope="col" style={th}>Flag</th>
                                        <th scope="col" style={th}>Year</th>
                                        <th scope="col" style={th}>GT</th>
                                        <th scope="col" style={th}>Customer</th>
                                        <th scope="col" style={th}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={9} style={{ padding: '56px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                <Loader2 size={32} className="spinner" style={{ opacity: 0.4, display: 'block', margin: '0 auto 14px' }} />
                                                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Searching...</div>
                                            </td>
                                        </tr>
                                    ) : displayedVessels.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} style={{ padding: '56px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                <Search size={40} style={{ opacity: 0.15, marginBottom: '14px', display: 'block', margin: '0 auto 14px' }} />
                                                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>No vessels match your criteria</div>
                                                <p style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>Try adjusting the filters or switching to <strong>OR</strong> logic.</p>
                                            </td>
                                        </tr>
                                    ) : displayedVessels.map(v => (
                                        <tr key={v.id} className="hover-effect" style={{ borderBottom: '1px solid var(--table-border)', cursor: onNavigateToVessel ? 'pointer' : 'default', background: comparedVesselIds.includes(v.id) ? 'rgba(0,210,255,0.06)' : undefined }}>
                                            <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={comparedVesselIds.includes(v.id)}
                                                    onChange={() => toggleCompareVessel(v.id)}
                                                    onClick={e => e.stopPropagation()}
                                                    disabled={!comparedVesselIds.includes(v.id) && comparedVesselIds.length >= 2}
                                                    style={{ accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                                                />
                                            </td>
                                            <td style={{ padding: '12px 16px' }} onClick={() => { if (onNavigateToVessel) { _cache.preserveOnReturn = true; onNavigateToVessel(v.id) } }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
                                                    <Ship size={14} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                                                    {v.name}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{v.imoNumber}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.88rem' }}>{v.vesselType || <span style={{ opacity: 0.3 }}>—</span>}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.88rem' }}>{v.flagStateId ? (flagMap.get(v.flagStateId) || '—') : <span style={{ opacity: 0.3 }}>—</span>}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.88rem' }}>{v.builtYear || <span style={{ opacity: 0.3 }}>—</span>}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.88rem' }}>{v.grossTonnage?.toLocaleString() || <span style={{ opacity: 0.3 }}>—</span>}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                                                {v.customerId ? (customerMap.get(v.customerId) || '—') : <span style={{ opacity: 0.3 }}>—</span>}
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '600', background: v.isActive ? 'rgba(0,255,136,0.1)' : 'rgba(255,77,77,0.1)', color: v.isActive ? 'var(--success)' : 'var(--danger)' }}>
                                                    {v.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Vessel Comparison Modal */}
            {showCompare && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                        background: isLight ? '#ffffff' : '#1a1d28',
                        borderRadius: '16px', padding: '28px', width: '90%', maxWidth: '800px', maxHeight: '85vh', overflowY: 'auto',
                        border: `1px solid ${isLight ? '#e4e7ef' : 'rgba(255,255,255,0.1)'}`
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <GitCompareArrows size={22} color="var(--accent-primary)" />
                                Vessel Comparison
                            </h2>
                            <button onClick={() => { setShowCompare(false); setCompareData(null) }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {compareLoading ? (
                            <div style={{ padding: '60px', textAlign: 'center' }}>
                                <Loader2 size={32} className="spinner" style={{ opacity: 0.4, display: 'block', margin: '0 auto 14px' }} />
                                <div style={{ color: 'var(--text-secondary)' }}>Loading comparison data...</div>
                            </div>
                        ) : compareData ? (() => {
                            const { vessel1, vessel2, policies1, policies2, docs1, docs2, class1, class2, fleet1, fleet2, customer1, customer2, flag1, flag2 } = compareData

                            const CompareRow = ({ label, val1, val2, highlight }: { label: string; val1: React.ReactNode; val2: React.ReactNode; highlight?: boolean }) => (
                                <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                                    <td style={{ padding: '10px 14px', fontWeight: '600', fontSize: '0.82rem', color: 'var(--text-secondary)', width: '160px' }}>{label}</td>
                                    <td style={{ padding: '10px 14px', fontSize: '0.88rem', fontWeight: highlight ? '700' : '400' }}>{val1}</td>
                                    <td style={{ padding: '10px 14px', fontSize: '0.88rem', fontWeight: highlight ? '700' : '400' }}>{val2}</td>
                                </tr>
                            )

                            const SectionHeader = ({ label }: { label: string }) => (
                                <tr>
                                    <td colSpan={3} style={{ padding: '14px 14px 6px', fontWeight: '800', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-primary)' }}>
                                        {label}
                                    </td>
                                </tr>
                            )

                            const allPolicyTypes = new Set([
                                ...policies1.map((p: any) => p.typeName),
                                ...policies2.map((p: any) => p.typeName)
                            ])

                            const pctColor = (pct: number) => pct === 100 ? '#10b981' : pct >= 80 ? '#f59e0b' : 'var(--danger)'

                            return (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--table-border)', background: 'var(--table-header-bg)' }}>
                                            <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>Field</th>
                                            <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', fontSize: '0.88rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Ship size={14} color="var(--accent-primary)" />
                                                    {vessel1.name}
                                                </div>
                                            </th>
                                            <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', fontSize: '0.88rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Ship size={14} color="var(--accent-primary)" />
                                                    {vessel2.name}
                                                </div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <SectionHeader label="General" />
                                        <CompareRow label="Name" val1={vessel1.name} val2={vessel2.name} highlight />
                                        <CompareRow label="IMO" val1={vessel1.imoNumber} val2={vessel2.imoNumber} />
                                        <CompareRow label="Type" val1={vessel1.vesselType || '-'} val2={vessel2.vesselType || '-'} />
                                        <CompareRow label="Flag" val1={flag1} val2={flag2} />
                                        <CompareRow label="Built" val1={vessel1.builtYear || '-'} val2={vessel2.builtYear || '-'} />
                                        <CompareRow label="Gross Tonnage" val1={vessel1.grossTonnage?.toLocaleString() || '-'} val2={vessel2.grossTonnage?.toLocaleString() || '-'} />
                                        <CompareRow label="Classification" val1={class1} val2={class2} />
                                        <CompareRow label="Customer" val1={customer1} val2={customer2} />
                                        <CompareRow label="Fleet" val1={fleet1} val2={fleet2} />

                                        <SectionHeader label="Policies" />
                                        {allPolicyTypes.size > 0 ? Array.from(allPolicyTypes).map(typeName => {
                                            const p1 = policies1.find((p: any) => p.typeName === typeName)
                                            const p2 = policies2.find((p: any) => p.typeName === typeName)
                                            const fmtPolicy = (p: any) => p
                                                ? <span style={{ color: p.status === 'active' ? '#10b981' : 'var(--text-secondary)' }}>{p.policyNumber} ({p.status})</span>
                                                : <span style={{ opacity: 0.3 }}>-</span>
                                            return <CompareRow key={typeName} label={typeName} val1={fmtPolicy(p1)} val2={fmtPolicy(p2)} />
                                        }) : (
                                            <tr><td colSpan={3} style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>No active policies</td></tr>
                                        )}

                                        <SectionHeader label="Documents" />
                                        <CompareRow label="Compliant" val1={
                                            <span style={{ color: pctColor(docs1.pct) }}>{docs1.compliant}/{docs1.total} ({docs1.pct}%)</span>
                                        } val2={
                                            <span style={{ color: pctColor(docs2.pct) }}>{docs2.compliant}/{docs2.total} ({docs2.pct}%)</span>
                                        } />
                                        <CompareRow label="Missing" val1={
                                            <span style={{ color: docs1.missing > 0 ? 'var(--danger)' : '#10b981' }}>{docs1.missing}</span>
                                        } val2={
                                            <span style={{ color: docs2.missing > 0 ? 'var(--danger)' : '#10b981' }}>{docs2.missing}</span>
                                        } />
                                        <CompareRow label="Expired" val1={
                                            <span style={{ color: docs1.expired > 0 ? 'var(--danger)' : '#10b981' }}>{docs1.expired}</span>
                                        } val2={
                                            <span style={{ color: docs2.expired > 0 ? 'var(--danger)' : '#10b981' }}>{docs2.expired}</span>
                                        } />

                                        <SectionHeader label="Sanctions" />
                                        <CompareRow label="Status" val1={
                                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '600', background: 'rgba(0,255,136,0.1)', color: '#10b981' }}>
                                                {(vessel1 as any).sanctionsStatus?.toUpperCase() || 'PENDING'}
                                            </span>
                                        } val2={
                                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '600', background: 'rgba(0,255,136,0.1)', color: '#10b981' }}>
                                                {(vessel2 as any).sanctionsStatus?.toUpperCase() || 'PENDING'}
                                            </span>
                                        } />
                                    </tbody>
                                </table>
                            )
                        })() : null}
                    </div>
                </div>
            )}
        </div>
    )
}
