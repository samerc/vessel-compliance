import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, ChevronDown, Ship, X, Loader2 } from 'lucide-react'
import { Vessel, PolicyType, FlagState, ClassificationSociety, Entity, VesselDynamicPolicy, VesselType } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'

interface VesselFilterProps {
    onNavigateToVessel?: (vesselId: string) => void
}

// ── Reusable multi-select dropdown with inline search ──────────────────────────
function MultiSelectDropdown({ options, selected, onChange, placeholder = 'Any' }: {
    options: { id: string; label: string; sublabel?: string }[]
    selected: string[]
    onChange: (ids: string[]) => void
    placeholder?: string
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
    const btnRef = useRef<HTMLButtonElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)
    const isLight = document.body.classList.contains('light')
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
                    padding: '6px 10px', borderRadius: '6px', fontSize: '0.82rem',
                    background: 'var(--input-bg)',
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
                            zIndex: 9999, background: isLight ? '#ffffff' : '#1a1d28',
                            border: '1px solid var(--input-border)', borderRadius: '8px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
                            display: 'flex', flexDirection: 'column', maxHeight: '280px',
                        }}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        {/* Search input — shown when list is long */}
                        {showSearch && (
                            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--table-border)', flexShrink: 0 }}>
                                <input
                                    ref={searchRef}
                                    type="text"
                                    placeholder="Search…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onMouseDown={e => e.stopPropagation()}
                                    style={{
                                        width: '100%', padding: '4px 8px', borderRadius: '5px',
                                        border: '1px solid var(--input-border)',
                                        background: isLight ? '#f0f2f5' : '#0f1118',
                                        color: 'var(--text-primary)', fontSize: '0.8rem',
                                        boxSizing: 'border-box', outline: 'none',
                                    }}
                                />
                            </div>
                        )}
                        {/* Options list */}
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {filtered.length === 0 && (
                                <div style={{ padding: '10px 12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                    {search ? 'No matches' : 'No options available'}
                                </div>
                            )}
                            {filtered.map(opt => {
                                const checked = selected.includes(opt.id)
                                return (
                                    <div
                                        key={opt.id}
                                        onMouseDown={e => { e.preventDefault(); toggle(opt.id) }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            padding: '7px 12px', cursor: 'pointer',
                                            background: checked ? (isLight ? 'rgba(0,119,163,0.08)' : 'rgba(0,210,255,0.08)') : 'transparent',
                                            borderBottom: '1px solid var(--table-border)',
                                        }}
                                    >
                                        <input type="checkbox" readOnly checked={checked} style={{ accentColor: 'var(--accent-primary)', pointerEvents: 'none', flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.83rem', color: 'var(--text-primary)' }}>
                                            {opt.label}
                                            {opt.sublabel && <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>— {opt.sublabel}</span>}
                                        </span>
                                    </div>
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

// ── Main component ─────────────────────────────────────────────────────────────
export default function VesselFilter({ onNavigateToVessel }: VesselFilterProps) {
    const { showError } = useToast()

    const [vessels, setVessels] = useState<Vessel[]>([])
    const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
    const [flagStates, setFlagStates] = useState<FlagState[]>([])
    const [classSocieties, setClassSocieties] = useState<ClassificationSociety[]>([])
    const [vesselTypes, setVesselTypes] = useState<VesselType[]>([])
    const [entities, setEntities] = useState<Entity[]>([])
    const [vesselPolicies, setVesselPolicies] = useState<Map<string, VesselDynamicPolicy[]>>(new Map())
    const [vesselClassifications, setVesselClassifications] = useState<Map<string, string[]>>(new Map())

    const [loading, setLoading] = useState(false)
    const [hasSearched, setHasSearched] = useState(false)
    const [panelCollapsed, setPanelCollapsed] = useState(false)
    const [nameSearch, setNameSearch] = useState('')

    const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
    const [selectedPolicyTypes, setSelectedPolicyTypes] = useState<string[]>([])
    const [policyStatus, setPolicyStatus] = useState<'active' | 'expired' | 'all'>('all')
    const [selectedFlagStates, setSelectedFlagStates] = useState<string[]>([])
    const [flagUnassigned, setFlagUnassigned] = useState(false)
    const [selectedClassifications, setSelectedClassifications] = useState<string[]>([])
    const [selectedVesselTypes, setSelectedVesselTypes] = useState<string[]>([])
    const [selectedCustomerId, setSelectedCustomerId] = useState('')
    const [customerType, setCustomerType] = useState<'broker' | 'direct' | 'both'>('both')
    const [vesselStatus, setVesselStatus] = useState<'active' | 'inactive' | 'all'>('active')
    const [yearFrom, setYearFrom] = useState('')
    const [yearTo, setYearTo] = useState('')
    const [gtFrom, setGtFrom] = useState('')
    const [gtTo, setGtTo] = useState('')

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
            setVessels(v); setPolicyTypes(pt); setFlagStates(fs)
            setClassSocieties(cs); setVesselTypes(vt); setEntities(ent)
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
            if (selectedVesselTypes.length > 0) checks.push(selectedVesselTypes.includes(v.vesselType || ''))
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
        padding: '4px 10px', borderRadius: '6px',
        border: selected ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)',
        background: selected ? 'rgba(var(--accent-primary-rgb, 0,210,255), 0.12)' : 'transparent',
        color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
        cursor: 'pointer', fontSize: '0.78rem',
        fontWeight: selected ? '600' : '400',
        transition: 'var(--transition)', whiteSpace: 'nowrap' as const,
    })

    const numInput = {
        width: '80px', padding: '5px 8px', borderRadius: '6px',
        border: '1px solid var(--input-border)', background: 'var(--input-bg)',
        color: 'var(--text-primary)', fontSize: '0.82rem',
    }

    const th = { padding: '11px 16px', fontSize: '0.73rem', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: 'var(--text-secondary)' }

    const SectionLabel = ({ children }: { children: string }) => (
        <div style={{ fontSize: '0.68rem', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>
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
                <div style={{ width: panelCollapsed ? '0' : '264px', flexShrink: 0, overflow: 'hidden', transition: 'width 0.25s ease', borderRight: '1px solid var(--glass-border)' }}>
                    <div style={{ width: '264px', height: '100%', display: 'flex', flexDirection: 'column' }}>

                        {/* Sidebar header */}
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <SlidersHorizontal size={14} color="var(--accent-primary)" />
                            <span style={{ fontWeight: '700', fontSize: '0.85rem', flex: 1 }}>Filters</span>
                            {activeFilterCount > 0 && (
                                <span style={{ background: 'var(--accent-primary)', color: '#000', borderRadius: '10px', padding: '1px 7px', fontSize: '0.7rem', fontWeight: '700' }}>
                                    {activeFilterCount}
                                </span>
                            )}
                        </div>

                        {/* Scrollable filter content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

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
                                        options={vesselTypes.map(vt => ({ id: vt.name, label: vt.name, sublabel: vt.description }))}
                                        selected={selectedVesselTypes}
                                        onChange={setSelectedVesselTypes}
                                        placeholder="Any vessel type"
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
                                    />
                                </div>
                            )}

                            <Divider />

                            {/* Year Built */}
                            <div>
                                <SectionLabel>Year Built</SectionLabel>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input type="number" placeholder="From" value={yearFrom} onChange={e => setYearFrom(e.target.value)} style={numInput} />
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>–</span>
                                    <input type="number" placeholder="To" value={yearTo} onChange={e => setYearTo(e.target.value)} style={numInput} />
                                </div>
                            </div>

                            {/* Gross Tonnage */}
                            <div>
                                <SectionLabel>Gross Tonnage</SectionLabel>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input type="number" placeholder="From" value={gtFrom} onChange={e => setGtFrom(e.target.value)} style={numInput} />
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>–</span>
                                    <input type="number" placeholder="To" value={gtTo} onChange={e => setGtTo(e.target.value)} style={numInput} />
                                </div>
                            </div>

                            <Divider />

                            {/* Customer */}
                            <div>
                                <SectionLabel>Customer</SectionLabel>
                                <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: selectedCustomerId ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)', background: 'var(--input-bg)', color: selectedCustomerId ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '8px' }}>
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
                        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '8px', flexShrink: 0 }}>
                            <button
                                className="btn-primary"
                                onClick={handleSearch}
                                disabled={loading || !hasAnyCriteria}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.85rem' }}
                            >
                                {loading ? <Loader2 size={14} className="spinner" /> : <Search size={14} />}
                                {loading ? 'Searching…' : 'Apply Filters'}
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
                                    {displayedVessels.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} style={{ padding: '56px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                <Search size={40} style={{ opacity: 0.15, marginBottom: '14px', display: 'block', margin: '0 auto 14px' }} />
                                                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>No vessels match your criteria</div>
                                                <p style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>Try adjusting the filters or switching to <strong>OR</strong> logic.</p>
                                            </td>
                                        </tr>
                                    ) : displayedVessels.map(v => (
                                        <tr key={v.id} onClick={() => onNavigateToVessel?.(v.id)} className="hover-effect" style={{ borderBottom: '1px solid var(--table-border)', cursor: onNavigateToVessel ? 'pointer' : 'default' }}>
                                            <td style={{ padding: '12px 16px' }}>
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
        </div>
    )
}
