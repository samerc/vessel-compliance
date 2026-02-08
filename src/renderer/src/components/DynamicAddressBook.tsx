import { useState, useEffect, useMemo } from 'react'
import { Search, Copy, Mail, Phone, ToggleLeft, ToggleRight, Filter, ChevronRight, ChevronDown } from 'lucide-react'
import { PolicyType, FlagState, DABQueryCriteria } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'

type PolicyFilter = 'all' | 'undefined' | string[]

export default function DynamicAddressBook() {
    const { showSuccess, showError } = useToast()

    const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
    const [flagStates, setFlagStates] = useState<FlagState[]>([])
    const [results, setResults] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [hasSearched, setHasSearched] = useState(false)

    // Query criteria
    const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
    const [policyFilter, setPolicyFilter] = useState<PolicyFilter>([])
    const [selectedFlagStates, setSelectedFlagStates] = useState<string[]>([])
    const [flagUnassigned, setFlagUnassigned] = useState(false)
    const [customerType, setCustomerType] = useState<'broker' | 'direct' | 'both'>('both')
    const [exportType, setExportType] = useState<'email' | 'phone' | 'both'>('email')
    const [vesselStatus, setVesselStatus] = useState<'active' | 'inactive' | 'all'>('active')
    const [queryCollapsed, setQueryCollapsed] = useState(false)

    useEffect(() => {
        loadFilterData()
    }, [])

    const loadFilterData = async () => {
        const [pt, fs] = await Promise.all([
            window.api.getPolicyTypes(),
            window.api.getFlagStates()
        ])
        setPolicyTypes(pt)
        setFlagStates(fs)
    }

    const selectedPolicyTypeIds = useMemo(() => {
        if (policyFilter === 'all') return policyTypes.map(p => p.id)
        if (policyFilter === 'undefined') return []
        return policyFilter
    }, [policyFilter, policyTypes])

    const hasAnyCriteria = policyFilter === 'all' || policyFilter === 'undefined' ||
        (Array.isArray(policyFilter) && policyFilter.length > 0) ||
        selectedFlagStates.length > 0 || flagUnassigned || customerType !== 'both'

    const handleSearch = async () => {
        if (!hasAnyCriteria) {
            showError('Please select at least one filter criteria')
            return
        }
        setLoading(true)
        setHasSearched(true)
        try {
            const criteria: DABQueryCriteria = {
                logic,
                exportType,
                policyTypeIds: selectedPolicyTypeIds.length > 0 ? selectedPolicyTypeIds : undefined,
                flagStateIds: selectedFlagStates.length > 0 ? selectedFlagStates : undefined,
                flagStateUnassigned: flagUnassigned || undefined,
                customerIds: undefined,
                customerType: customerType !== 'both' ? customerType : undefined,
                vesselStatus
            }
            const data = await window.api.queryDAB(criteria)
            setResults(data)
        } catch (err: any) {
            showError(err.message || 'Failed to query address book')
        } finally {
            setLoading(false)
        }
    }

    const filteredResults = useMemo(() => {
        return results.filter(r => {
            if (exportType === 'email' && !r.email) return false
            if (exportType === 'phone' && !r.phone) return false
            return true
        })
    }, [results, exportType])

    const handleCopyToClipboard = () => {
        const lines = filteredResults.map(r => {
            if (exportType === 'email') return r.email
            if (exportType === 'phone') return r.phone
            return [r.email, r.phone].filter(Boolean).join(', ')
        }).filter(Boolean)

        if (lines.length === 0) {
            showError('No contacts to copy')
            return
        }

        navigator.clipboard.writeText(lines.join('\n'))
        showSuccess(`Copied ${lines.length} contacts to clipboard`)
    }

    const handleCopyForOutlook = () => {
        const emails = filteredResults.map(r => r.email).filter(Boolean)
        if (emails.length === 0) {
            showError('No emails to copy')
            return
        }
        navigator.clipboard.writeText(emails.join('; '))
        showSuccess(`Copied ${emails.length} emails for Outlook`)
    }

    const toggleSelection = (id: string, list: string[], setter: (v: string[]) => void) => {
        setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
    }

    const togglePolicyType = (id: string) => {
        if (policyFilter === 'all' || policyFilter === 'undefined') {
            setPolicyFilter([id])
        } else {
            const current = policyFilter as string[]
            if (current.includes(id)) {
                setPolicyFilter(current.filter(x => x !== id))
            } else {
                setPolicyFilter([...current, id])
            }
        }
    }

    const isPolicySelected = (id: string) => {
        if (policyFilter === 'all') return true
        if (policyFilter === 'undefined') return false
        return (policyFilter as string[]).includes(id)
    }

    const chipStyle = (selected: boolean) => ({
        padding: '6px 14px',
        borderRadius: '16px',
        fontSize: '0.8rem',
        fontWeight: selected ? '600' : '400' as any,
        cursor: 'pointer',
        border: selected ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)',
        background: selected ? 'rgba(0, 210, 255, 0.15)' : 'transparent',
        color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
        transition: 'var(--transition)',
        whiteSpace: 'nowrap' as any,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px'
    })

    return (
        <div>
            {/* Query Builder */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
                <h3
                    onClick={() => setQueryCollapsed(!queryCollapsed)}
                    style={{ marginBottom: queryCollapsed ? '0' : '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
                >
                    {queryCollapsed ? <ChevronRight size={20} color="var(--accent-primary)" /> : <ChevronDown size={20} color="var(--accent-primary)" />}
                    <Filter size={20} color="var(--accent-primary)" /> Query Builder
                </h3>

                {!queryCollapsed && <>
                {/* Logic Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Match logic:</span>
                    <button
                        onClick={() => setLogic(logic === 'AND' ? 'OR' : 'AND')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 16px',
                            borderRadius: '8px',
                            border: '1px solid var(--table-border)',
                            background: 'var(--bg-card)',
                            color: 'var(--accent-primary)',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.85rem'
                        }}
                    >
                        {logic === 'AND' ? <ToggleLeft size={18} /> : <ToggleRight size={18} />}
                        {logic === 'AND' ? 'AND (match all criteria)' : 'OR (match any criteria)'}
                    </button>
                </div>

                {/* Policy Types */}
                {policyTypes.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>Policy Types</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <button
                                onClick={() => setPolicyFilter(policyFilter === 'all' ? [] : 'all')}
                                style={chipStyle(policyFilter === 'all')}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setPolicyFilter(policyFilter === 'undefined' ? [] : 'undefined')}
                                style={chipStyle(policyFilter === 'undefined')}
                            >
                                Undefined
                            </button>
                            {policyTypes.map(pt => (
                                <button
                                    key={pt.id}
                                    onClick={() => togglePolicyType(pt.id)}
                                    style={chipStyle(isPolicySelected(pt.id))}
                                >
                                    {pt.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Flag States */}
                {flagStates.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>Flag States</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <button
                                onClick={() => {
                                    if (selectedFlagStates.length === flagStates.length) {
                                        setSelectedFlagStates([])
                                    } else {
                                        setSelectedFlagStates(flagStates.map(f => f.id))
                                    }
                                }}
                                style={chipStyle(selectedFlagStates.length === flagStates.length)}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setFlagUnassigned(!flagUnassigned)}
                                style={chipStyle(flagUnassigned)}
                            >
                                Unassigned
                            </button>
                            {flagStates.map(fs => (
                                <button
                                    key={fs.id}
                                    onClick={() => toggleSelection(fs.id, selectedFlagStates, setSelectedFlagStates)}
                                    style={chipStyle(selectedFlagStates.includes(fs.id))}
                                >
                                    {fs.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Vessel Status */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>Vessel Status</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {(['active', 'inactive', 'all'] as const).map(vs => (
                            <button
                                key={vs}
                                onClick={() => setVesselStatus(vs)}
                                style={chipStyle(vesselStatus === vs)}
                            >
                                {vs.charAt(0).toUpperCase() + vs.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Customer Type */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>Customer Type</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {(['both', 'broker', 'direct'] as const).map(ct => (
                            <button
                                key={ct}
                                onClick={() => setCustomerType(ct)}
                                style={chipStyle(customerType === ct)}
                            >
                                {ct === 'both' ? 'All' : ct.charAt(0).toUpperCase() + ct.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Export Type */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>Export</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {(['email', 'phone', 'both'] as const).map(et => (
                            <button
                                key={et}
                                onClick={() => setExportType(et)}
                                style={chipStyle(exportType === et)}
                            >
                                {et === 'email' ? <><Mail size={14} /> Email</> : et === 'phone' ? <><Phone size={14} /> Phone</> : 'Email & Phone'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Search Button */}
                <button
                    onClick={handleSearch}
                    disabled={!hasAnyCriteria || loading}
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <Search size={18} /> {loading ? 'Searching...' : 'Search'}
                </button>
                </>}
            </section>

            {/* Results */}
            {hasSearched && (
                <section className="glass-card" style={{ padding: '0' }}>
                    <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--table-border)', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontWeight: '600' }}>
                            {filteredResults.length} contact{filteredResults.length !== 1 ? 's' : ''} found
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={handleCopyForOutlook}
                                disabled={filteredResults.length === 0}
                                className="btn-secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', fontSize: '0.85rem' }}
                            >
                                <Mail size={16} /> Copy for Outlook
                            </button>
                            <button
                                onClick={handleCopyToClipboard}
                                disabled={filteredResults.length === 0}
                                className="btn-primary"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', fontSize: '0.85rem' }}
                            >
                                <Copy size={16} /> Copy to Clipboard
                            </button>
                        </div>
                    </div>

                    {filteredResults.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                                <caption className="sr-only">Address book results</caption>
                                <thead>
                                    <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                        <th scope="col" style={{ padding: '12px 16px' }}>Name</th>
                                        <th scope="col" style={{ padding: '12px 16px' }}>Type</th>
                                        {(exportType === 'email' || exportType === 'both') && <th scope="col" style={{ padding: '12px 16px' }}>Email</th>}
                                        {(exportType === 'phone' || exportType === 'both') && <th scope="col" style={{ padding: '12px 16px' }}>Phone</th>}
                                        <th scope="col" style={{ padding: '12px 16px' }}>Associated Vessels</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredResults.map(r => (
                                        <tr key={r.entityId} style={{ borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
                                            <td style={{ padding: '12px 16px', fontWeight: '500' }}>{r.entityName}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{
                                                    padding: '2px 10px',
                                                    borderRadius: '10px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                    background: r.entityType === 'company' ? 'rgba(0, 210, 255, 0.1)' : 'rgba(147, 51, 234, 0.1)',
                                                    color: r.entityType === 'company' ? 'var(--accent-primary)' : '#d8b4fe',
                                                    border: `1px solid ${r.entityType === 'company' ? 'rgba(0, 210, 255, 0.2)' : 'rgba(147, 51, 234, 0.2)'}`
                                                }}>
                                                    {r.entityType}
                                                </span>
                                            </td>
                                            {(exportType === 'email' || exportType === 'both') && (
                                                <td style={{ padding: '12px 16px', color: r.email ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                    {r.email || '-'}
                                                </td>
                                            )}
                                            {(exportType === 'phone' || exportType === 'both') && (
                                                <td style={{ padding: '12px 16px', color: r.phone ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                    {r.phone || '-'}
                                                </td>
                                            )}
                                            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '300px' }}>
                                                {r.vesselNames || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No contacts found matching your criteria
                        </div>
                    )}
                </section>
            )}
        </div>
    )
}
