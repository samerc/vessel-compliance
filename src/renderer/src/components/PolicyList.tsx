import { useState, useEffect, useMemo } from 'react'
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, FileCheck, RotateCw, Trash2 } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDateShort } from '../utils/dateUtils'
import ConfirmationModal from './ConfirmationModal'

interface PolicyListItem {
    id: string
    vesselId: string
    vesselName: string
    imoNumber: string
    policyTypeId: string
    policyTypeName: string
    policyNumber?: string
    conditionId?: string
    conditionName?: string
    status: string
    currency: string
    brokerEntityId?: string
    brokerName?: string
    customerName?: string
    customerType?: string
    fleetName?: string
    notes?: string
    inceptionDate?: string
    expiryDate?: string
    premiumAmount?: number
    createdAt?: string
    updatedAt?: string
    exportedAt?: string
}

interface PolicyListProps {
    onSelectPolicy: (policyId: string) => void
}

type SortField = 'policyNumber' | 'policyTypeName' | 'vesselName' | 'customerName' | 'inceptionDate' | 'expiryDate' | 'status' | 'premiumAmount' | 'createdAt' | 'exportedAt'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 25

const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: 'rgba(0, 200, 100, 0.15)', text: '#00c864' },
    expired: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' },
    cancelled: { bg: 'rgba(255, 77, 77, 0.15)', text: '#ff4d4d' },
    inactive: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' },
    superseded: { bg: 'rgba(150, 150, 150, 0.15)', text: '#888' }
}

const typeColors: Record<string, { bg: string; text: string }> = {
    'p&i': { bg: 'rgba(100, 100, 255, 0.12)', text: '#6464ff' },
    'hull': { bg: 'rgba(255, 100, 200, 0.12)', text: '#ff64c8' },
    'war': { bg: 'rgba(255, 176, 32, 0.12)', text: '#ffb020' },
    'h&m': { bg: 'rgba(255, 100, 200, 0.12)', text: '#ff64c8' },
    'fdd': { bg: 'rgba(0, 170, 200, 0.12)', text: '#00aac8' },
    'loss': { bg: 'rgba(100, 100, 255, 0.12)', text: '#6464ff' }
}

function getTypeBadgeColors(typeName: string): { bg: string; text: string } {
    const lower = (typeName || '').toLowerCase()
    for (const [key, colors] of Object.entries(typeColors)) {
        if (lower.includes(key)) return colors
    }
    return { bg: 'rgba(0, 170, 200, 0.12)', text: '#00aac8' }
}

export default function PolicyList({ onSelectPolicy }: PolicyListProps) {
    const [policies, setPolicies] = useState<PolicyListItem[]>([])
    const [policyTypes, setPolicyTypes] = useState<{ id: string; name: string }[]>([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [typeFilter, setTypeFilter] = useState<string>('all')
    const [sortField, setSortField] = useState<SortField>('expiryDate')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; policy: any }>({ show: false, policy: null })
    const { showError, showSuccess } = useToast()
    const { hasPermission } = useAuth()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        setLoading(true)
        try {
            const [p, pt] = await Promise.all([
                window.api.getPoliciesList(),
                window.api.getPolicyTypes()
            ])
            setPolicies(Array.isArray(p) ? p : [])
            setPolicyTypes(Array.isArray(pt) ? pt : [])
        } catch (err: any) {
            showError(err.message || 'Failed to load policies')
        } finally {
            setLoading(false)
        }
    }

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDir(field === 'expiryDate' || field === 'inceptionDate' || field === 'premiumAmount' ? 'desc' : 'asc')
        }
        setPage(0)
    }

    // Stats
    const stats = useMemo(() => {
        const total = policies.length
        const byType: Record<string, number> = {}
        const byStatus: Record<string, number> = {}
        const now = new Date()
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        let thisMonth = 0

        for (const p of policies) {
            const tn = (p.policyTypeName || 'Other').toLowerCase()
            byType[tn] = (byType[tn] || 0) + 1
            byStatus[p.status] = (byStatus[p.status] || 0) + 1

            if (p.createdAt) {
                const created = new Date(p.createdAt)
                if (created >= thisMonthStart && created <= thisMonthEnd) thisMonth++
            }
        }

        return { total, byType, byStatus, thisMonth }
    }, [policies])

    // Filter
    const filtered = useMemo(() => {
        return policies.filter(p => {
            if (statusFilter !== 'all' && p.status !== statusFilter) return false
            if (typeFilter !== 'all' && p.policyTypeId !== typeFilter) return false
            if (search) {
                const s = search.toLowerCase()
                const fields = [p.policyNumber, p.vesselName, p.customerName, p.policyTypeName, p.brokerName, p.fleetName].filter(Boolean)
                if (!fields.some(f => f!.toLowerCase().includes(s))) return false
            }
            return true
        })
    }, [policies, statusFilter, typeFilter, search])

    // Sort
    const sorted = useMemo(() => {
        const arr = [...filtered]
        arr.sort((a, b) => {
            let av: any, bv: any
            if (sortField === 'premiumAmount') {
                av = a.premiumAmount || 0
                bv = b.premiumAmount || 0
            } else if (sortField === 'inceptionDate' || sortField === 'expiryDate') {
                av = (a as any)[sortField] || ''
                bv = (b as any)[sortField] || ''
            } else {
                av = ((a as any)[sortField] || '').toLowerCase()
                bv = ((b as any)[sortField] || '').toLowerCase()
            }
            if (av < bv) return sortDir === 'asc' ? -1 : 1
            if (av > bv) return sortDir === 'asc' ? 1 : -1
            return 0
        })
        return arr
    }, [filtered, sortField, sortDir])

    // Paginate
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
    const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    // Reset page when filters change
    useEffect(() => { setPage(0) }, [search, statusFilter, typeFilter])

    const formatCurrency = (amount?: number, currency?: string) => {
        if (!amount) return '-'
        return `${currency || 'USD'} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    }

    const formatPeriod = (inception?: string, expiry?: string) => {
        if (!inception && !expiry) return '-'
        const i = inception ? formatDateShort(inception) : '?'
        const e = expiry ? formatDateShort(expiry) : '?'
        return `${i} - ${e}`
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
        if (sortField !== field) return <ChevronDown size={12} style={{ opacity: 0.3, marginLeft: '2px' }} />
        return sortDir === 'asc'
            ? <ChevronUp size={12} style={{ marginLeft: '2px' }} />
            : <ChevronDown size={12} style={{ marginLeft: '2px' }} />
    }

    const selectStyle: React.CSSProperties = {
        padding: '8px 12px',
        borderRadius: '8px',
        background: 'var(--bg-input, var(--table-header-bg))',
        color: 'var(--text-primary)',
        border: '1px solid var(--input-border)',
        fontSize: '0.82rem'
    }

    return (
        <div>
            {/* Stats strip */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[
                    { label: 'Total Policies', value: stats.total, color: '#00aac8' },
                    { label: 'Active', value: stats.byStatus['active'] || 0, color: '#00c864' },
                    { label: 'Inactive', value: (stats.byStatus['inactive'] || 0) + (stats.byStatus['expired'] || 0) + (stats.byStatus['cancelled'] || 0), color: '#999' },
                    { label: 'This Month', value: stats.thisMonth, color: '#6464ff' },
                ].map(s => (
                    <div key={s.label} className="glass-card" style={{
                        padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '10px',
                        flex: '1 1 0', minWidth: '100px'
                    }}>
                        <span style={{ fontSize: '1.3rem', fontWeight: 700, color: s.color }}>{s.value}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{s.label}</span>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={15} />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search policy number, vessel, customer, broker..."
                        style={{ width: '100%', paddingLeft: '36px', fontSize: '0.85rem' }}
                    />
                </div>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
                    <option value="all">All Types</option>
                    {policyTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="expired">Expired</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <button onClick={loadData} className="btn-secondary" style={{ padding: '8px', flexShrink: 0 }} title="Refresh">
                    <RotateCw size={16} />
                </button>
            </div>

            {/* Table */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                            <th style={thStyle('policyNumber')} onClick={() => toggleSort('policyNumber')}>
                                Policy No. <SortIcon field="policyNumber" />
                            </th>
                            <th style={thStyle('policyTypeName')} onClick={() => toggleSort('policyTypeName')}>
                                Type <SortIcon field="policyTypeName" />
                            </th>
                            <th style={thStyle('vesselName')} onClick={() => toggleSort('vesselName')}>
                                Vessel <SortIcon field="vesselName" />
                            </th>
                            <th style={thStyle('customerName')} onClick={() => toggleSort('customerName')}>
                                Customer <SortIcon field="customerName" />
                            </th>
                            <th style={{ ...thStyle('inceptionDate'), whiteSpace: 'nowrap' }} onClick={() => toggleSort('inceptionDate')}>
                                Period <SortIcon field="inceptionDate" />
                            </th>
                            <th style={thStyle('status')} onClick={() => toggleSort('status')}>
                                Status <SortIcon field="status" />
                            </th>
                            <th style={thStyle('premiumAmount', 'right')} onClick={() => toggleSort('premiumAmount')}>
                                Premium <SortIcon field="premiumAmount" />
                            </th>
                            <th style={thStyle('createdAt')} onClick={() => toggleSort('createdAt')}>
                                Converted <SortIcon field="createdAt" />
                            </th>
                            <th style={thStyle('exportedAt')} onClick={() => toggleSort('exportedAt')}>
                                Exported <SortIcon field="exportedAt" />
                            </th>
                            <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.length === 0 ? (
                            <tr>
                                <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <FileCheck size={36} style={{ opacity: 0.3, marginBottom: '10px' }} />
                                    <div style={{ fontSize: '0.9rem' }}>
                                        {loading ? 'Loading policies...' : policies.length === 0 ? 'No policies found' : 'No policies match your filters'}
                                    </div>
                                </td>
                            </tr>
                        ) : paginated.map(p => {
                            const sc = statusColors[p.status] || statusColors.inactive
                            const tc = getTypeBadgeColors(p.policyTypeName)
                            return (
                                <tr
                                    key={p.id}
                                    style={{ borderBottom: '1px solid var(--table-border)', cursor: 'pointer' }}
                                    className="hover-effect"
                                    onClick={() => onSelectPolicy(p.id)}
                                >
                                    <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: '0.88rem', color: isLight ? '#007a91' : '#00aac8' }}>
                                        {p.policyNumber ? `${p.policyNumber}${(p as any).revisionNumber > 0 ? `-R${(p as any).revisionNumber}` : ''}` : <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>--</span>}
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span style={{
                                            display: 'inline-block',
                                            padding: '3px 10px', borderRadius: '6px',
                                            fontSize: '0.72rem', fontWeight: 700,
                                            background: tc.bg,
                                            color: isLight ? tc.text.replace('ff', 'cc') : tc.text
                                        }}>
                                            {p.policyTypeName || '-'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '0.85rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.vesselName || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>--</span>}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.customerName || <span style={{ fontStyle: 'italic' }}>--</span>}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                        {formatPeriod(p.inceptionDate, p.expiryDate)}
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span style={{
                                            padding: '3px 9px', borderRadius: '10px',
                                            fontSize: '0.7rem', fontWeight: 600,
                                            textTransform: 'uppercase',
                                            background: sc.bg, color: sc.text
                                        }}>
                                            {p.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: '0.82rem', fontWeight: p.premiumAmount ? 600 : 400, whiteSpace: 'nowrap' }}>
                                        {formatCurrency(p.premiumAmount, p.currency)}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                        {p.createdAt ? formatDateShort(p.createdAt) : '-'}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '0.8rem', whiteSpace: 'nowrap', color: p.exportedAt ? (isLight ? '#047857' : '#34d399') : 'var(--text-secondary)' }}>
                                        {p.exportedAt ? formatDateShort(p.exportedAt) : <span style={{ fontStyle: 'italic' }}>Not exported</span>}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                        {hasPermission('policies:manage') && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setDeleteConfirm({ show: true, policy: p })
                                                }}
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}
                                                title="Delete policy"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {sorted.length > PAGE_SIZE && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: '12px', padding: '0 4px', fontSize: '0.82rem', color: 'var(--text-secondary)'
                }}>
                    <span>
                        Showing {page * PAGE_SIZE + 1}--{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
                        {sorted.length !== policies.length && ` (filtered from ${policies.length})`}
                    </span>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button
                            onClick={() => setPage(0)}
                            disabled={page === 0}
                            className="btn-secondary"
                            style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                        >First</button>
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="btn-secondary"
                            style={{ padding: '5px' }}
                        ><ChevronLeft size={16} /></button>
                        <span style={{ padding: '0 8px', fontWeight: 600 }}>
                            {page + 1} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="btn-secondary"
                            style={{ padding: '5px' }}
                        ><ChevronRight size={16} /></button>
                        <button
                            onClick={() => setPage(totalPages - 1)}
                            disabled={page >= totalPages - 1}
                            className="btn-secondary"
                            style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                        >Last</button>
                    </div>
                </div>
            )}
        {deleteConfirm.show && deleteConfirm.policy && (
            <ConfirmationModal
                title="Delete Policy?"
                message={`Delete policy ${deleteConfirm.policy.policyNumber || ''}? This cannot be undone.`}
                confirmLabel="Delete"
                isDangerous
                onConfirm={async () => {
                    setDeleteConfirm({ show: false, policy: null })
                    try {
                        await window.api.policyDelete(deleteConfirm.policy.id)
                        showSuccess('Policy deleted')
                        loadData()
                    } catch (err: any) { showError(err.message || 'Failed to delete') }
                }}
                onCancel={() => setDeleteConfirm({ show: false, policy: null })}
            />
        )}
        </div>
    )
}
