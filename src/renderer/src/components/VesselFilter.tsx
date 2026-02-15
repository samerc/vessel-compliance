import { useState, useEffect, useMemo } from 'react'
import { Search, Filter, ChevronRight, ChevronDown, Ship } from 'lucide-react'
import { Vessel, PolicyType, FlagState, ClassificationSociety, Entity, VesselDynamicPolicy } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'

interface VesselFilterProps {
    onNavigateToVessel?: (vesselId: string) => void
}

export default function VesselFilter({ onNavigateToVessel }: VesselFilterProps) {
    const { showError } = useToast()

    const [vessels, setVessels] = useState<Vessel[]>([])
    const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
    const [flagStates, setFlagStates] = useState<FlagState[]>([])
    const [classSocieties, setClassSocieties] = useState<ClassificationSociety[]>([])
    const [entities, setEntities] = useState<Entity[]>([])
    const [vesselPolicies, setVesselPolicies] = useState<Map<string, VesselDynamicPolicy[]>>(new Map())
    const [vesselClassifications, setVesselClassifications] = useState<Map<string, string[]>>(new Map())
    const [loading, setLoading] = useState(false)
    const [hasSearched, setHasSearched] = useState(false)
    const [queryCollapsed, setQueryCollapsed] = useState(false)

    // Filter criteria
    const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
    const [selectedPolicyTypes, setSelectedPolicyTypes] = useState<string[]>([])
    const [selectedFlagStates, setSelectedFlagStates] = useState<string[]>([])
    const [flagUnassigned, setFlagUnassigned] = useState(false)
    const [selectedClassifications, setSelectedClassifications] = useState<string[]>([])
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
    const [customerType, setCustomerType] = useState<'broker' | 'direct' | 'both'>('both')
    const [vesselStatus, setVesselStatus] = useState<'active' | 'inactive' | 'all'>('active')
    const [yearFrom, setYearFrom] = useState<string>('')
    const [yearTo, setYearTo] = useState<string>('')
    const [gtFrom, setGtFrom] = useState<string>('')
    const [gtTo, setGtTo] = useState<string>('')
    const [policyStatus, setPolicyStatus] = useState<'active' | 'expired' | 'all'>('all')

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        try {
            const [v, pt, fs, cs, ent] = await Promise.all([
                window.api.getVessels(),
                window.api.getPolicyTypes(),
                window.api.getFlagStates(),
                window.api.getClassificationSocieties(),
                window.api.getEntities()
            ])
            setVessels(v)
            setPolicyTypes(pt)
            setFlagStates(fs)
            setClassSocieties(cs)
            setEntities(ent)
        } catch (err: any) {
            showError('Failed to load filter data')
        }
    }

    const hasAnyCriteria = selectedPolicyTypes.length > 0 || selectedFlagStates.length > 0 ||
        flagUnassigned || selectedClassifications.length > 0 || selectedCustomerId ||
        customerType !== 'both' || yearFrom || yearTo || gtFrom || gtTo ||
        vesselStatus !== 'active' || policyStatus !== 'all'

    const handleSearch = async () => {
        if (!hasAnyCriteria) {
            showError('Please select at least one filter criteria')
            return
        }
        setLoading(true)
        setHasSearched(true)
        try {
            // Load policies and classifications for all vessels
            const pMap = new Map<string, VesselDynamicPolicy[]>()
            const cMap = new Map<string, string[]>()

            // Only load if we need policy or classification filters
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

    const filteredVessels = useMemo(() => {
        if (!hasSearched) return []

        return vessels.filter(v => {
            const checks: boolean[] = []

            // Vessel status
            if (vesselStatus === 'active' && !v.isActive) return false
            if (vesselStatus === 'inactive' && v.isActive) return false

            // Flag state
            if (selectedFlagStates.length > 0 || flagUnassigned) {
                const flagMatch = (selectedFlagStates.length > 0 && v.flagStateId && selectedFlagStates.includes(v.flagStateId)) ||
                    (flagUnassigned && !v.flagStateId)
                checks.push(!!flagMatch)
            }

            // Customer
            if (selectedCustomerId) {
                checks.push(v.customerId === selectedCustomerId)
            }
            if (customerType !== 'both') {
                checks.push(v.customerType === customerType)
            }

            // Year built range
            if (yearFrom) {
                checks.push(!!v.builtYear && v.builtYear >= parseInt(yearFrom))
            }
            if (yearTo) {
                checks.push(!!v.builtYear && v.builtYear <= parseInt(yearTo))
            }

            // Gross tonnage range
            if (gtFrom) {
                checks.push(!!v.grossTonnage && v.grossTonnage >= parseInt(gtFrom))
            }
            if (gtTo) {
                checks.push(!!v.grossTonnage && v.grossTonnage <= parseInt(gtTo))
            }

            // Policy type filter
            if (selectedPolicyTypes.length > 0) {
                const vPolicies = vesselPolicies.get(v.id) || []
                let match = false
                for (const ptId of selectedPolicyTypes) {
                    const hasPt = vPolicies.some(p => p.policyTypeId === ptId &&
                        (policyStatus === 'all' || p.status === policyStatus))
                    if (hasPt) { match = true; break }
                }
                checks.push(match)
            }

            // Policy status only (no type selected)
            if (policyStatus !== 'all' && selectedPolicyTypes.length === 0) {
                const vPolicies = vesselPolicies.get(v.id) || []
                checks.push(vPolicies.some(p => p.status === policyStatus))
            }

            // Classification
            if (selectedClassifications.length > 0) {
                const vCls = vesselClassifications.get(v.id) || []
                checks.push(selectedClassifications.some(id => vCls.includes(id)))
            }

            if (checks.length === 0) return true
            return logic === 'AND' ? checks.every(Boolean) : checks.some(Boolean)
        })
    }, [hasSearched, vessels, vesselPolicies, vesselClassifications, selectedPolicyTypes,
        selectedFlagStates, flagUnassigned, selectedClassifications, selectedCustomerId,
        customerType, vesselStatus, yearFrom, yearTo, gtFrom, gtTo, policyStatus, logic])

    const flagMap = useMemo(() => {
        const m = new Map<string, string>()
        for (const fs of flagStates) m.set(fs.id, fs.name)
        return m
    }, [flagStates])

    const customerEntities = useMemo(() => {
        const customerIds = new Set(vessels.filter(v => v.customerId).map(v => v.customerId!))
        return entities.filter(e => customerIds.has(e.id))
    }, [entities, vessels])

    const toggleSelection = (arr: string[], setArr: (v: string[]) => void, id: string) => {
        setArr(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])
    }

    const chipStyle = (selected: boolean) => ({
        padding: '4px 12px',
        borderRadius: '16px',
        border: selected ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
        background: selected ? 'rgba(0, 210, 255, 0.15)' : 'transparent',
        color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: '0.8rem',
        transition: 'var(--transition)'
    })

    const selectStyle = {
        padding: '6px 10px',
        borderRadius: '6px',
        border: '1px solid var(--glass-border)',
        background: 'var(--bg-input, var(--table-header-bg))',
        color: 'var(--text-primary)',
        fontSize: '0.85rem'
    }

    const inputStyle = {
        padding: '6px 10px',
        borderRadius: '6px',
        border: '1px solid var(--glass-border)',
        background: 'var(--bg-input, var(--table-header-bg))',
        color: 'var(--text-primary)',
        fontSize: '0.85rem',
        width: '80px'
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Vessel Filter</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Build dynamic queries to find vessels matching specific criteria.</p>
            </header>

            {/* Query Builder */}
            <div className="glass-card" style={{ padding: '0', overflow: 'hidden', marginBottom: '24px' }}>
                <div
                    onClick={() => setQueryCollapsed(!queryCollapsed)}
                    style={{
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        borderBottom: queryCollapsed ? 'none' : '1px solid var(--table-border)'
                    }}
                >
                    {queryCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    <Filter size={18} color="var(--accent-primary)" />
                    <h3 style={{ margin: 0 }}>Filter Criteria</h3>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Logic:</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); setLogic(logic === 'AND' ? 'OR' : 'AND') }}
                            style={{
                                padding: '2px 10px',
                                borderRadius: '4px',
                                border: '1px solid var(--accent-primary)',
                                background: 'rgba(0, 210, 255, 0.1)',
                                color: 'var(--accent-primary)',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: '600'
                            }}
                        >
                            {logic}
                        </button>
                    </div>
                </div>

                {!queryCollapsed && (
                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Policy Types */}
                        <div>
                            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Policy Types</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                <button onClick={() => setSelectedPolicyTypes(selectedPolicyTypes.length === policyTypes.length ? [] : policyTypes.map(p => p.id))} style={chipStyle(selectedPolicyTypes.length === policyTypes.length && policyTypes.length > 0)}>All</button>
                                {policyTypes.map(pt => (
                                    <button key={pt.id} onClick={() => toggleSelection(selectedPolicyTypes, setSelectedPolicyTypes, pt.id)} style={chipStyle(selectedPolicyTypes.includes(pt.id))}>{pt.name}</button>
                                ))}
                            </div>
                        </div>

                        {/* Policy Status */}
                        {(selectedPolicyTypes.length > 0 || policyStatus !== 'all') && (
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Policy Status</label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {(['all', 'active', 'expired'] as const).map(s => (
                                        <button key={s} onClick={() => setPolicyStatus(s)} style={chipStyle(policyStatus === s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Flag States */}
                        <div>
                            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Flag States</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                <button onClick={() => setSelectedFlagStates(selectedFlagStates.length === flagStates.length ? [] : flagStates.map(f => f.id))} style={chipStyle(selectedFlagStates.length === flagStates.length && flagStates.length > 0)}>All</button>
                                <button onClick={() => setFlagUnassigned(!flagUnassigned)} style={chipStyle(flagUnassigned)}>Unassigned</button>
                                {flagStates.map(fs => (
                                    <button key={fs.id} onClick={() => toggleSelection(selectedFlagStates, setSelectedFlagStates, fs.id)} style={chipStyle(selectedFlagStates.includes(fs.id))}>{fs.name}</button>
                                ))}
                            </div>
                        </div>

                        {/* Classification Societies */}
                        {classSocieties.length > 0 && (
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Classification</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    <button onClick={() => setSelectedClassifications(selectedClassifications.length === classSocieties.length ? [] : classSocieties.map(c => c.id))} style={chipStyle(selectedClassifications.length === classSocieties.length)}>All</button>
                                    {classSocieties.map(cs => (
                                        <button key={cs.id} onClick={() => toggleSelection(selectedClassifications, setSelectedClassifications, cs.id)} style={chipStyle(selectedClassifications.includes(cs.id))}>{cs.abbreviation || cs.name}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Year Built & GT Range */}
                        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Year Built</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input type="number" placeholder="From" value={yearFrom} onChange={e => setYearFrom(e.target.value)} style={inputStyle} />
                                    <span style={{ color: 'var(--text-secondary)' }}>-</span>
                                    <input type="number" placeholder="To" value={yearTo} onChange={e => setYearTo(e.target.value)} style={inputStyle} />
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Gross Tonnage</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input type="number" placeholder="From" value={gtFrom} onChange={e => setGtFrom(e.target.value)} style={inputStyle} />
                                    <span style={{ color: 'var(--text-secondary)' }}>-</span>
                                    <input type="number" placeholder="To" value={gtTo} onChange={e => setGtTo(e.target.value)} style={inputStyle} />
                                </div>
                            </div>
                        </div>

                        {/* Customer & Status */}
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Customer</label>
                                <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} style={selectStyle}>
                                    <option value="">Any</option>
                                    {customerEntities.map(e => (
                                        <option key={e.id} value={e.id}>{e.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Customer Type</label>
                                <select value={customerType} onChange={e => setCustomerType(e.target.value as any)} style={selectStyle}>
                                    <option value="both">All</option>
                                    <option value="broker">Broker</option>
                                    <option value="direct">Direct</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Vessel Status</label>
                                <select value={vesselStatus} onChange={e => setVesselStatus(e.target.value as any)} style={selectStyle}>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="all">All</option>
                                </select>
                            </div>
                        </div>

                        {/* Search Button */}
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <button
                                className="btn-primary"
                                onClick={handleSearch}
                                disabled={loading || !hasAnyCriteria}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <Search size={16} />
                                {loading ? 'Searching...' : 'Search Vessels'}
                            </button>
                            {hasSearched && (
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {filteredVessels.length} vessel{filteredVessels.length !== 1 ? 's' : ''} found
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Results */}
            {hasSearched && (
                <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <caption className="sr-only">Filtered vessel results</caption>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                <th scope="col" style={{ padding: '14px 16px' }}>Vessel</th>
                                <th scope="col" style={{ padding: '14px 16px' }}>IMO</th>
                                <th scope="col" style={{ padding: '14px 16px' }}>Flag</th>
                                <th scope="col" style={{ padding: '14px 16px' }}>Year</th>
                                <th scope="col" style={{ padding: '14px 16px' }}>GT</th>
                                <th scope="col" style={{ padding: '14px 16px' }}>Type</th>
                                <th scope="col" style={{ padding: '14px 16px' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVessels.map(v => (
                                <tr
                                    key={v.id}
                                    style={{ borderBottom: '1px solid var(--table-border)', cursor: onNavigateToVessel ? 'pointer' : 'default' }}
                                    onClick={() => onNavigateToVessel?.(v.id)}
                                    className="hover-effect"
                                >
                                    <td style={{ padding: '14px 16px', fontWeight: '600' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Ship size={16} color="var(--accent-primary)" />
                                            {v.name}
                                        </div>
                                    </td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{v.imoNumber}</td>
                                    <td style={{ padding: '14px 16px' }}>{v.flagStateId ? flagMap.get(v.flagStateId) || '-' : '-'}</td>
                                    <td style={{ padding: '14px 16px' }}>{v.builtYear || '-'}</td>
                                    <td style={{ padding: '14px 16px' }}>{v.grossTonnage?.toLocaleString() || '-'}</td>
                                    <td style={{ padding: '14px 16px' }}>{v.vesselType || '-'}</td>
                                    <td style={{ padding: '14px 16px' }}>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            background: v.isActive ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                                            color: v.isActive ? '#00ff88' : '#ff4d4d'
                                        }}>
                                            {v.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {filteredVessels.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ padding: '48px', textAlign: 'center' }}>
                                        <Search size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                        <div style={{ fontWeight: '600' }}>No vessels match the criteria</div>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Try adjusting your filters.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
