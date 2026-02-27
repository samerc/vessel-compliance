import { useState, useEffect, useMemo } from 'react'
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, Ship, X, Loader2 } from 'lucide-react'
import { Vessel, PolicyType, FlagState, ClassificationSociety, Entity, VesselDynamicPolicy, VesselType } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'

interface VesselFilterProps {
    onNavigateToVessel?: (vesselId: string) => void
}

export default function VesselFilter({ onNavigateToVessel }: VesselFilterProps) {
    const { showError } = useToast()

    // Reference data
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
    const [flagStates, setFlagStates] = useState<FlagState[]>([])
    const [classSocieties, setClassSocieties] = useState<ClassificationSociety[]>([])
    const [vesselTypes, setVesselTypes] = useState<VesselType[]>([])
    const [entities, setEntities] = useState<Entity[]>([])

    // Async-loaded filter data
    const [vesselPolicies, setVesselPolicies] = useState<Map<string, VesselDynamicPolicy[]>>(new Map())
    const [vesselClassifications, setVesselClassifications] = useState<Map<string, string[]>>(new Map())

    // UI state
    const [loading, setLoading] = useState(false)
    const [hasSearched, setHasSearched] = useState(false)
    const [panelCollapsed, setPanelCollapsed] = useState(false)
    const [nameSearch, setNameSearch] = useState('')

    // Filter criteria
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
            setVessels(v)
            setPolicyTypes(pt)
            setFlagStates(fs)
            setClassSocieties(cs)
            setVesselTypes(vt)
            setEntities(ent)
        } catch {
            showError('Failed to load filter data')
        }
    }

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
        !!gtFrom || !!gtTo,
    ].filter(Boolean).length

    const hasAnyCriteria = activeFilterCount > 0

    const handleSearch = async () => {
        if (!hasAnyCriteria) { showError('Please select at least one filter criterion'); return }
        setLoading(true)
        setHasSearched(true)
        try {
            const pMap = new Map<string, VesselDynamicPolicy[]>()
            const cMap = new Map<string, string[]>()
            if (selectedPolicyTypes.length > 0 || policyStatus !== 'all') {
                for (const v of vessels) {
                    const policies = await window.api.getVesselDynamicPolicies(v.id)
                    if (policies.length > 0) pMap.set(v.id, policies)
                }
            }
            if (selectedClassifications.length > 0) {
                for (const v of vessels) {
                    const cls = await window.api.getVesselClassifications(v.id)
                    if (cls.length > 0) cMap.set(v.id, cls.map((c: any) => c.classificationSocietyId))
                }
            }
            setVesselPolicies(pMap)
            setVesselClassifications(cMap)
        } catch (err: any) {
            showError(err.message || 'Failed to search')
        } finally {
            setLoading(false)
        }
    }

    const clearAll = () => {
        setSelectedPolicyTypes([])
        setPolicyStatus('all')
        setSelectedFlagStates([])
        setFlagUnassigned(false)
        setSelectedClassifications([])
        setSelectedVesselTypes([])
        setSelectedCustomerId('')
        setCustomerType('both')
        setVesselStatus('active')
        setYearFrom(''); setYearTo('')
        setGtFrom(''); setGtTo('')
        setHasSearched(false)
        setNameSearch('')
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
                const vPolicies = vesselPolicies.get(v.id) || []
                checks.push(selectedPolicyTypes.some(ptId =>
                    vPolicies.some(p => p.policyTypeId === ptId && (policyStatus === 'all' || p.status === policyStatus))
                ))
            }
            if (policyStatus !== 'all' && selectedPolicyTypes.length === 0) {
                const vPolicies = vesselPolicies.get(v.id) || []
                checks.push(vPolicies.some(p => p.status === policyStatus))
            }
            if (selectedClassifications.length > 0) {
                const vCls = vesselClassifications.get(v.id) || []
                checks.push(selectedClassifications.some(id => vCls.includes(id)))
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
        return filteredVessels.filter(v =>
            v.name.toLowerCase().includes(q) || v.imoNumber.toLowerCase().includes(q)
        )
    }, [filteredVessels, nameSearch])

    const flagMap = useMemo(() => {
        const m = new Map<string, string>()
        for (const fs of flagStates) m.set(fs.id, fs.name)
        return m
    }, [flagStates])

    const customerMap = useMemo(() => {
        const m = new Map<string, string>()
        for (const e of entities) m.set(e.id, e.name)
        return m
    }, [entities])

    const customerEntities = useMemo(() => {
        const ids = new Set(vessels.filter(v => v.customerId).map(v => v.customerId!))
        return entities.filter(e => ids.has(e.id))
    }, [entities, vessels])

    const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
        set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])

    const chip = (selected: boolean) => ({
        padding: '4px 10px',
        borderRadius: '6px',
        border: selected ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)',
        background: selected ? 'rgba(var(--accent-primary-rgb, 0,210,255), 0.12)' : 'transparent',
        color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: '0.78rem',
        fontWeight: selected ? '600' : '400',
        transition: 'var(--transition)',
        whiteSpace: 'nowrap' as const,
    })

    const numInput = {
        width: '80px', padding: '5px 8px', borderRadius: '6px',
        border: '1px solid var(--input-border)', background: 'var(--input-bg)',
        color: 'var(--text-primary)', fontSize: '0.82rem',
    }

    const th = { padding: '11px 16px', fontSize: '0.73rem', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: 'var(--text-secondary)' }

    const SectionLabel = ({ children }: { children: string }) => (
        <div style={{ fontSize: '0.68rem', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            {children}
        </div>
    )

    const Divider = () => <div style={{ height: '1px', background: 'var(--glass-border)', opacity: 0.6 }} />

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', margin: '-24px', overflow: 'hidden' }}>

            {/* ── Page header ── */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, background: 'var(--bg-primary)' }}>
                <SlidersHorizontal size={20} color="var(--accent-primary)" />
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '1.2rem', margin: 0, fontWeight: '700' }}>Vessel Filter</h1>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>Build a query to find vessels matching specific criteria</p>
                </div>
            </div>

            {/* ── Body ── */}
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
                        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

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
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                        {policyTypes.map(pt => (
                                            <button key={pt.id} onClick={() => toggle(selectedPolicyTypes, setSelectedPolicyTypes, pt.id)} style={chip(selectedPolicyTypes.includes(pt.id))}>{pt.name}</button>
                                        ))}
                                    </div>
                                    {selectedPolicyTypes.length > 0 && (
                                        <div style={{ marginTop: '8px' }}>
                                            <SectionLabel>Policy Status</SectionLabel>
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                {(['all', 'active', 'expired'] as const).map(s => (
                                                    <button key={s} onClick={() => setPolicyStatus(s)} style={chip(policyStatus === s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
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
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                        {vesselTypes.map(vt => (
                                            <button key={vt.id} onClick={() => toggle(selectedVesselTypes, setSelectedVesselTypes, vt.name)} style={chip(selectedVesselTypes.includes(vt.name))}>
                                                {vt.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Flag States */}
                            {flagStates.length > 0 && (
                                <div>
                                    <SectionLabel>Flag State</SectionLabel>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                        <button onClick={() => setFlagUnassigned(!flagUnassigned)} style={chip(flagUnassigned)}>Unassigned</button>
                                        {flagStates.map(fs => (
                                            <button key={fs.id} onClick={() => toggle(selectedFlagStates, setSelectedFlagStates, fs.id)} style={chip(selectedFlagStates.includes(fs.id))}>{fs.name}</button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Classification */}
                            {classSocieties.length > 0 && (
                                <div>
                                    <SectionLabel>Classification</SectionLabel>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                        {classSocieties.map(cs => (
                                            <button key={cs.id} onClick={() => toggle(selectedClassifications, setSelectedClassifications, cs.id)} style={chip(selectedClassifications.includes(cs.id))}>
                                                {cs.abbreviation || cs.name}
                                            </button>
                                        ))}
                                    </div>
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
                                <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: '8px' }}>
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

                        {/* Sidebar footer: Apply + Clear */}
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

                    {/* Results toolbar */}
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

                    {/* Table / empty state */}
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
                                        <tr
                                            key={v.id}
                                            onClick={() => onNavigateToVessel?.(v.id)}
                                            className="hover-effect"
                                            style={{ borderBottom: '1px solid var(--table-border)', cursor: onNavigateToVessel ? 'pointer' : 'default' }}
                                        >
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
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '600',
                                                    background: v.isActive ? 'rgba(0,255,136,0.1)' : 'rgba(255,77,77,0.1)',
                                                    color: v.isActive ? 'var(--success)' : 'var(--danger)',
                                                }}>
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
