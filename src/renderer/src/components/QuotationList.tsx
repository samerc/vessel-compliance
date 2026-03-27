import { useState, useEffect, useMemo } from 'react'
import { Plus, Search, FileText, Trash2, Copy, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import { Quotation, QuotationType } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { formatDateShort } from '../utils/dateUtils'
import ConfirmationModal from './ConfirmationModal'
import ColumnSelector, { useColumnPrefs, ColumnDef } from './ColumnSelector'

const statusColors: Record<string, { bg: string; text: string }> = {
    draft: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' },
    sent: { bg: 'rgba(0, 150, 255, 0.15)', text: '#0096ff' },
    approved: { bg: 'rgba(0, 200, 100, 0.15)', text: '#00c864' },
    rejected: { bg: 'rgba(255, 77, 77, 0.15)', text: '#ff4d4d' },
    converted: { bg: 'rgba(180, 100, 255, 0.15)', text: '#b464ff' }
}

type SortField = 'referenceNumber' | 'quotationTypeName' | 'quotationDate' | 'vesselName' | 'coName' | 'conditions' | 'premiumAmount' | 'status' | 'updatedAt'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 25

interface QuotationListProps {
    onOpenQuotation: (quotation: Quotation) => void
}

export default function QuotationList({ onOpenQuotation }: QuotationListProps) {
    const [quotations, setQuotations] = useState<Quotation[]>([])
    const [quotationTypes, setQuotationTypes] = useState<QuotationType[]>([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [typeFilter, setTypeFilter] = useState<string>('all')
    const [renewalFilter, setRenewalFilter] = useState<string>('all')
    const [registryOnly, setRegistryOnly] = useState(false)
    const [sortField, setSortField] = useState<SortField>('updatedAt')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [page, setPage] = useState(0)
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; quotation: Quotation | null }>({ show: false, quotation: null })
    const [showNewMenu, setShowNewMenu] = useState(false)
    const { showSuccess, showError } = useToast()
    const { theme } = useTheme()
    const { hasPermission } = useAuth()
    const isLight = theme === 'light'

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
    const { visibleColumns: qVisibleColumns, setVisibleColumns: setQVisibleColumns } = useColumnPrefs('quotations', QUOTATION_COLUMNS)
    const qVisibleSet = new Set(qVisibleColumns)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [q, qt] = await Promise.all([
            window.api.getQuotations(),
            window.api.getQuotationTypes()
        ])
        setQuotations(Array.isArray(q) ? q : [])
        setQuotationTypes(Array.isArray(qt) ? qt : [])
    }

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

    const handleDelete = async () => {
        if (!deleteConfirm.quotation) return
        try {
            await window.api.deleteQuotation(deleteConfirm.quotation.id)
            showSuccess('Quotation deleted')
            setDeleteConfirm({ show: false, quotation: null })
            loadData()
        } catch (err: any) {
            showError(err.message || 'Failed to delete quotation')
        }
    }

    const handleDuplicate = async (q: Quotation, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            const dup = await window.api.duplicateQuotation(q.id)
            if ((dup as any)?.error) { showError((dup as any).message || 'Failed to duplicate'); return }
            showSuccess('Quotation duplicated')
            onOpenQuotation(dup)
        } catch (err: any) {
            showError(err.message || 'Failed to duplicate')
        }
    }

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDir(field === 'updatedAt' || field === 'quotationDate' || field === 'premiumAmount' ? 'desc' : 'asc')
        }
        setPage(0)
    }

    // Filter
    const filtered = useMemo(() => {
        return quotations.filter(q => {
            if (registryOnly && (q.referenceNumber || '').startsWith('DRAFT-')) return false
            if (statusFilter !== 'all' && q.status !== statusFilter) return false
            if (typeFilter !== 'all' && q.quotationTypeId !== typeFilter) return false
            if (renewalFilter === 'renewal' && !q.isRenewal) return false
            if (renewalFilter === 'new' && q.isRenewal) return false
            if (search) {
                const s = search.toLowerCase()
                const fields = [q.referenceNumber, q.vesselName, q.quotationTypeName, q.coName, q.title, q.createdBy].filter(Boolean)
                if (!fields.some(f => f!.toLowerCase().includes(s))) return false
            }
            return true
        })
    }, [quotations, statusFilter, typeFilter, renewalFilter, search, registryOnly])

    const getConditions = (q: Quotation): string => {
        const a = q as any
        if (q.quotationTypeCode === 'H') return a.hullClauseCodes || ''
        return a.piClauseNames || ''
    }

    // Sort
    const sorted = useMemo(() => {
        const arr = [...filtered]
        arr.sort((a, b) => {
            let av: any, bv: any
            if (sortField === 'premiumAmount') {
                av = a.premiumAmount || 0
                bv = b.premiumAmount || 0
            } else if (sortField === 'conditions') {
                av = getConditions(a).toLowerCase()
                bv = getConditions(b).toLowerCase()
            } else if (sortField === 'quotationDate' || sortField === 'updatedAt') {
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
    useEffect(() => { setPage(0) }, [search, statusFilter, typeFilter, renewalFilter, registryOnly])

    // Stats
    const stats = useMemo(() => {
        const total = quotations.length
        const byStatus: Record<string, number> = {}
        for (const q of quotations) byStatus[q.status] = (byStatus[q.status] || 0) + 1
        return { total, byStatus }
    }, [quotations])

    const formatCurrency = (amount?: number, currency?: string) => {
        if (!amount) return '-'
        return `${currency || 'USD'} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    }

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '-'
        return formatDateShort(dateStr) || '-'
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
                    { label: 'Total', value: stats.total, color: '#00aac8' },
                    { label: 'Draft', value: stats.byStatus['draft'] || 0, color: '#999' },
                    { label: 'Sent', value: stats.byStatus['sent'] || 0, color: '#0096ff' },
                    { label: 'Approved', value: stats.byStatus['approved'] || 0, color: '#00c864' },
                    { label: 'Rejected', value: stats.byStatus['rejected'] || 0, color: '#ff4d4d' },
                    { label: 'Converted', value: stats.byStatus['converted'] || 0, color: '#b464ff' },
                ].map(s => (
                    <div key={s.label} className="glass-card" style={{
                        padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '10px',
                        flex: '1 1 0', minWidth: '100px', cursor: s.label !== 'Total' ? 'pointer' : undefined,
                        border: statusFilter === s.label.toLowerCase() ? `1px solid ${s.color}` : undefined
                    }} onClick={() => {
                        if (s.label === 'Total') { setStatusFilter('all') }
                        else { setStatusFilter(prev => prev === s.label.toLowerCase() ? 'all' : s.label.toLowerCase()) }
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
                        placeholder="Search reference, vessel, customer, title, user..."
                        style={{ width: '100%', paddingLeft: '36px', fontSize: '0.85rem' }}
                    />
                </div>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
                    <option value="all">All Types</option>
                    {quotationTypes.map(qt => <option key={qt.id} value={qt.id}>{qt.name}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="converted">Converted</option>
                </select>
                <select value={renewalFilter} onChange={e => setRenewalFilter(e.target.value)} style={selectStyle}>
                    <option value="all">All</option>
                    <option value="new">New Business</option>
                    <option value="renewal">Renewal</option>
                </select>
                <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--input-border)' }}>
                    <button
                        onClick={() => setRegistryOnly(false)}
                        style={{
                            padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                            background: !registryOnly ? 'var(--accent-primary)' : 'transparent',
                            color: !registryOnly ? '#fff' : 'var(--text-secondary)'
                        }}
                    >All</button>
                    <button
                        onClick={() => setRegistryOnly(true)}
                        style={{
                            padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                            background: registryOnly ? 'var(--accent-primary)' : 'transparent',
                            color: registryOnly ? '#fff' : 'var(--text-secondary)'
                        }}
                    >Registry Only</button>
                </div>
                <button onClick={loadData} className="btn-secondary" style={{ padding: '8px', flexShrink: 0 }} title="Refresh">
                    <RotateCw size={16} />
                </button>
                {hasPermission('quotations:create') && <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowNewMenu(!showNewMenu)}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontSize: '0.85rem' }}
                    >
                        <Plus size={16} /> New Quotation
                    </button>
                    {showNewMenu && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowNewMenu(false)} />
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                                background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)',
                                borderRadius: '10px', padding: '6px', zIndex: 100, minWidth: '180px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                            }}>
                                {quotationTypes.map(qt => (
                                    <button
                                        key={qt.id}
                                        onClick={() => handleCreate(qt.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                                            padding: '10px 14px', border: 'none', borderRadius: '6px',
                                            background: 'transparent', color: 'var(--text-primary)',
                                            cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left'
                                        }}
                                        className="hover-effect"
                                    >
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: '24px', height: '24px', borderRadius: '6px',
                                            background: 'var(--accent-primary)', color: '#fff',
                                            fontSize: '0.7rem', fontWeight: 700
                                        }}>{qt.code}</span>
                                        {qt.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>}
            </div>

            {/* Table */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                            {qVisibleSet.has('referenceNumber') && <th style={thStyle('referenceNumber')} onClick={() => toggleSort('referenceNumber')}>
                                Ref <SortIcon field="referenceNumber" />
                            </th>}
                            {qVisibleSet.has('quotationTypeName') && <th style={thStyle('quotationTypeName')} onClick={() => toggleSort('quotationTypeName')}>
                                Type <SortIcon field="quotationTypeName" />
                            </th>}
                            {qVisibleSet.has('quotationDate') && <th style={thStyle('quotationDate')} onClick={() => toggleSort('quotationDate')}>
                                Date <SortIcon field="quotationDate" />
                            </th>}
                            {qVisibleSet.has('vesselName') && <th style={thStyle('vesselName')} onClick={() => toggleSort('vesselName')}>
                                Vessel <SortIcon field="vesselName" />
                            </th>}
                            {qVisibleSet.has('coName') && <th style={thStyle('coName')} onClick={() => toggleSort('coName')}>
                                Customer <SortIcon field="coName" />
                            </th>}
                            {qVisibleSet.has('conditions') && <th style={thStyle('conditions')} onClick={() => toggleSort('conditions')}>
                                Conditions <SortIcon field="conditions" />
                            </th>}
                            {qVisibleSet.has('premiumAmount') && <th style={thStyle('premiumAmount', 'right')} onClick={() => toggleSort('premiumAmount')}>
                                Premium <SortIcon field="premiumAmount" />
                            </th>}
                            {qVisibleSet.has('status') && <th style={thStyle('status')} onClick={() => toggleSort('status')}>
                                Status <SortIcon field="status" />
                            </th>}
                            {qVisibleSet.has('updatedAt') && <th style={thStyle('updatedAt')} onClick={() => toggleSort('updatedAt')}>
                                Updated <SortIcon field="updatedAt" />
                            </th>}
                            <th style={{ padding: '12px 14px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
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
                    <tbody>
                        {paginated.length === 0 ? (
                            <tr>
                                <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <FileText size={36} style={{ opacity: 0.3, marginBottom: '10px' }} />
                                    <div style={{ fontSize: '0.9rem' }}>
                                        {quotations.length === 0 ? 'No quotations yet' : 'No quotations match your filters'}
                                    </div>
                                </td>
                            </tr>
                        ) : paginated.map(q => {
                            const sc = statusColors[q.status] || statusColors.draft
                            return (
                                <tr
                                    key={q.id}
                                    style={{ borderBottom: '1px solid var(--table-border)', cursor: 'pointer' }}
                                    className="hover-effect"
                                    onClick={() => onOpenQuotation(q)}
                                >
                                    {qVisibleSet.has('referenceNumber') && <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: '0.88rem', color: (q.referenceNumber || '').startsWith('DRAFT-') ? (isLight ? '#888' : '#777') : (isLight ? '#007a91' : '#00aac8') }}>
                                        {q.referenceNumber || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>—</span>}
                                        {(q.revisionNumber || 0) > 0 && (
                                            <span style={{
                                                marginLeft: '6px', padding: '2px 6px', borderRadius: '4px',
                                                fontSize: '0.65rem', fontWeight: 700,
                                                background: 'rgba(180, 100, 255, 0.15)',
                                                color: isLight ? '#7a3db8' : '#b464ff'
                                            }}>R{q.revisionNumber}</span>
                                        )}
                                        {q.isRenewal && (
                                            <span style={{
                                                marginLeft: '4px', padding: '2px 5px', borderRadius: '4px',
                                                fontSize: '0.6rem', fontWeight: 700,
                                                background: 'rgba(0, 170, 200, 0.12)',
                                                color: isLight ? '#007a91' : '#00aac8'
                                            }}>REN</span>
                                        )}
                                    </td>}
                                    {qVisibleSet.has('quotationTypeName') && <td style={{ padding: '12px 14px' }}>
                                        {q.quotationTypeCode ? (
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                width: '28px', height: '22px', borderRadius: '5px',
                                                fontSize: '0.72rem', fontWeight: 700,
                                                background: 'rgba(0, 170, 200, 0.12)',
                                                color: isLight ? '#007a91' : '#00aac8'
                                            }}>{q.quotationTypeCode}</span>
                                        ) : '-'}
                                    </td>}
                                    {qVisibleSet.has('quotationDate') && <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                        {formatDate(q.quotationDate)}
                                    </td>}
                                    {qVisibleSet.has('vesselName') && <td style={{ padding: '12px 14px', fontSize: '0.85rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {q.vesselName ? (
                                            <>
                                                {q.vesselName}
                                                {(q as any).vesselCount > 1 && (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>+{(q as any).vesselCount - 1}</span>
                                                )}
                                            </>
                                        ) : <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>—</span>}
                                    </td>}
                                    {qVisibleSet.has('coName') && <td style={{ padding: '12px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {q.coName || <span style={{ fontStyle: 'italic' }}>—</span>}
                                    </td>}
                                    {qVisibleSet.has('conditions') && <td style={{ padding: '12px 14px', fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        title={getConditions(q) || undefined}
                                    >
                                        {getConditions(q) || <span style={{ fontStyle: 'italic' }}>—</span>}
                                    </td>}
                                    {qVisibleSet.has('premiumAmount') && <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: '0.82rem', fontWeight: q.premiumAmount ? 600 : 400, whiteSpace: 'nowrap' }}>
                                        {formatCurrency(q.premiumAmount, q.premiumCurrency)}
                                    </td>}
                                    {qVisibleSet.has('status') && <td style={{ padding: '12px 14px' }}>
                                        {q.workflowStepName ? (
                                            <span style={{
                                                padding: '3px 9px', borderRadius: '10px',
                                                fontSize: '0.7rem', fontWeight: 600,
                                                background: (q.workflowStepColor || '#6b7280') + '22',
                                                color: q.workflowStepColor || '#6b7280',
                                                border: `1px solid ${q.workflowStepColor || '#6b7280'}40`,
                                                display: 'inline-flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: q.workflowStepColor || '#6b7280' }} />
                                                {q.workflowStepName}
                                            </span>
                                        ) : (
                                            <span style={{
                                                padding: '3px 9px', borderRadius: '10px',
                                                fontSize: '0.7rem', fontWeight: 600,
                                                textTransform: 'uppercase',
                                                background: sc.bg, color: sc.text
                                            }}>
                                                {q.status}
                                            </span>
                                        )}
                                    </td>}
                                    {qVisibleSet.has('updatedAt') && <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                        {formatDate(q.updatedAt)}
                                    </td>}
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
                                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ show: true, quotation: q }) }}
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
                        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
                        {sorted.length !== quotations.length && ` (filtered from ${quotations.length})`}
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

            {deleteConfirm.show && deleteConfirm.quotation && (
                <ConfirmationModal
                    title="Delete Quotation?"
                    message={`Delete quotation ${deleteConfirm.quotation.referenceNumber || '(no ref)'}? This cannot be undone.`}
                    confirmLabel="Delete"
                    isDangerous
                    onConfirm={handleDelete}
                    onCancel={() => setDeleteConfirm({ show: false, quotation: null })}
                />
            )}
        </div>
    )
}
