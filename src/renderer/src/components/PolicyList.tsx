import { useState, useEffect, useMemo } from 'react'
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  RotateCw,
  Trash2
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { formatDateShort } from '../utils/dateUtils'
import ConfirmationModal from './ConfirmationModal'
import ColumnSelector from './ColumnSelector'
import { useColumnPrefs, type ColumnDef } from '../utils/useColumnPrefs'
import { Badge, EmptyState, Spinner } from './ui'
import type { BadgeTone } from './ui'
import type { PolicyListRow } from '../../../shared/types'

// policy:list row; currency/fleetName are not returned by the IPC today (read as undefined)
type PolicyListItem = PolicyListRow & { currency?: string; fleetName?: string }

interface PolicyListProps {
  onSelectPolicy: (policyId: string) => void
}

type SortField =
  | 'policyNumber'
  | 'policyTypeName'
  | 'vesselName'
  | 'customerName'
  | 'inceptionDate'
  | 'expiryDate'
  | 'status'
  | 'premiumAmount'
  | 'createdAt'
  | 'exportedAt'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 25

const STATUS_TONES: Record<string, BadgeTone> = {
  active: 'success',
  expired: 'neutral',
  cancelled: 'danger',
  inactive: 'neutral',
  superseded: 'neutral'
}

// Policy type identity colors (theme tokens so they stay readable in light themes)
const TYPE_COLORS: [string, string][] = [
  ['p&i', 'var(--violet)'],
  ['hull', '#d6409f'],
  ['h&m', '#d6409f'],
  ['war', 'var(--warning)'],
  ['fdd', 'var(--accent-primary)'],
  ['loss', 'var(--info)']
]

function getTypeColor(typeName: string | null): string {
  const lower = (typeName || '').toLowerCase()
  return TYPE_COLORS.find(([key]) => lower.includes(key))?.[1] || 'var(--accent-primary)'
}

const POLICY_COLUMNS: ColumnDef[] = [
  { id: 'policyNo', label: 'Policy No.', defaultVisible: true },
  { id: 'type', label: 'Type', defaultVisible: true },
  { id: 'vessel', label: 'Vessel', defaultVisible: true },
  { id: 'customer', label: 'Customer', defaultVisible: true },
  { id: 'period', label: 'Period', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'premium', label: 'Premium', defaultVisible: true },
  { id: 'converted', label: 'Converted', defaultVisible: false },
  { id: 'exported', label: 'Exported', defaultVisible: false },
  { id: 'actions', label: 'Actions', defaultVisible: true }
]

function SortIcon({
  field,
  sortField,
  sortDir
}: {
  field: SortField
  sortField: SortField
  sortDir: SortDir
}): React.JSX.Element {
  if (sortField !== field)
    return <ChevronDown size={12} style={{ opacity: 0.3, marginLeft: '2px' }} />
  return sortDir === 'asc' ? (
    <ChevronUp size={12} style={{ marginLeft: '2px' }} />
  ) : (
    <ChevronDown size={12} style={{ marginLeft: '2px' }} />
  )
}

export default function PolicyList({ onSelectPolicy }: PolicyListProps): React.JSX.Element {
  const [policies, setPolicies] = useState<PolicyListItem[]>([])
  const [policyTypes, setPolicyTypes] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [registryOnly, setRegistryOnly] = useState(false)
  const [sortField, setSortField] = useState<SortField>('expiryDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean
    policy: PolicyListItem | null
  }>({
    show: false,
    policy: null
  })
  const { showError, showSuccess } = useToast()
  const { hasPermission } = useAuth()
  const { visibleColumns, setVisibleColumns } = useColumnPrefs('policies', POLICY_COLUMNS)
  const visibleSet = new Set(visibleColumns)

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      setLoading(true)
      try {
        const [p, pt] = await Promise.all([
          window.api.getPoliciesList(),
          window.api.getPolicyTypes()
        ])
        setPolicies(Array.isArray(p) ? p : [])
        setPolicyTypes(Array.isArray(pt) ? pt : [])
      } catch (err) {
        showError((err instanceof Error ? err.message : '') || 'Failed to load policies')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [reloadKey, showError])
  const loadData = (): void => setReloadKey((k) => k + 1)

  const toggleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(
        field === 'expiryDate' || field === 'inceptionDate' || field === 'premiumAmount'
          ? 'desc'
          : 'asc'
      )
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
    return policies.filter((p) => {
      if (registryOnly && (p.policyNumber || '').startsWith('POL-DRAFT-')) return false
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (typeFilter !== 'all' && p.policyTypeId !== typeFilter) return false
      if (search) {
        const s = search.toLowerCase()
        const fields = [
          p.policyNumber,
          p.vesselName,
          p.customerName,
          p.policyTypeName,
          p.brokerName,
          p.fleetName
        ].filter(Boolean)
        if (!fields.some((f) => f!.toLowerCase().includes(s))) return false
      }
      return true
    })
  }, [policies, statusFilter, typeFilter, search, registryOnly])

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let av: string | number, bv: string | number
      if (sortField === 'premiumAmount') {
        av = a.premiumAmount || 0
        bv = b.premiumAmount || 0
      } else if (sortField === 'inceptionDate' || sortField === 'expiryDate') {
        av = a[sortField] || ''
        bv = b[sortField] || ''
      } else {
        av = (a[sortField] || '').toLowerCase()
        bv = (b[sortField] || '').toLowerCase()
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

  const formatCurrency = (amount?: number, currency?: string): string => {
    if (!amount) return '-'
    return `${currency || 'USD'} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  const formatPeriod = (inception?: string | null, expiry?: string | null): string => {
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
          { label: 'Total Policies', value: stats.total, color: 'var(--accent-primary)' },
          { label: 'Active', value: stats.byStatus['active'] || 0, color: 'var(--success)' },
          {
            label: 'Inactive',
            value:
              (stats.byStatus['inactive'] || 0) +
              (stats.byStatus['expired'] || 0) +
              (stats.byStatus['cancelled'] || 0),
            color: 'var(--text-secondary)'
          },
          { label: 'This Month', value: stats.thisMonth, color: 'var(--violet)' }
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
              minWidth: '100px'
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
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '16px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
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
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Search policy number, vessel, customer, broker..."
            style={{ width: '100%', paddingLeft: '36px', fontSize: '0.85rem' }}
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            setPage(0)
          }}
          style={selectStyle}
        >
          <option value="all">All Types</option>
          {policyTypes.map((pt) => (
            <option key={pt.id} value={pt.id}>
              {pt.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(0)
          }}
          style={selectStyle}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="segmented">
          <button
            className={!registryOnly ? 'active' : ''}
            onClick={() => {
              if (registryOnly) setPage(0)
              setRegistryOnly(false)
            }}
          >
            All
          </button>
          <button
            className={registryOnly ? 'active' : ''}
            onClick={() => {
              if (!registryOnly) setPage(0)
              setRegistryOnly(true)
            }}
          >
            Registry Only
          </button>
        </div>
        <button
          onClick={loadData}
          className="btn-secondary btn-icon"
          style={{ padding: '8px', flexShrink: 0 }}
          title="Refresh"
          aria-label="Refresh"
        >
          <RotateCw size={16} />
        </button>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
              {visibleSet.has('policyNo') && (
                <th style={thStyle('policyNumber')} onClick={() => toggleSort('policyNumber')}>
                  Policy No.{' '}
                  <SortIcon field="policyNumber" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {visibleSet.has('type') && (
                <th style={thStyle('policyTypeName')} onClick={() => toggleSort('policyTypeName')}>
                  Type <SortIcon field="policyTypeName" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {visibleSet.has('vessel') && (
                <th style={thStyle('vesselName')} onClick={() => toggleSort('vesselName')}>
                  Vessel <SortIcon field="vesselName" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {visibleSet.has('customer') && (
                <th style={thStyle('customerName')} onClick={() => toggleSort('customerName')}>
                  Customer <SortIcon field="customerName" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {visibleSet.has('period') && (
                <th
                  style={{ ...thStyle('inceptionDate'), whiteSpace: 'nowrap' }}
                  onClick={() => toggleSort('inceptionDate')}
                >
                  Period <SortIcon field="inceptionDate" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {visibleSet.has('status') && (
                <th style={thStyle('status')} onClick={() => toggleSort('status')}>
                  Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {visibleSet.has('premium') && (
                <th
                  style={thStyle('premiumAmount', 'right')}
                  onClick={() => toggleSort('premiumAmount')}
                >
                  Premium <SortIcon field="premiumAmount" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {visibleSet.has('converted') && (
                <th style={thStyle('createdAt')} onClick={() => toggleSort('createdAt')}>
                  Converted <SortIcon field="createdAt" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {visibleSet.has('exported') && (
                <th style={thStyle('exportedAt')} onClick={() => toggleSort('exportedAt')}>
                  Exported <SortIcon field="exportedAt" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              <th
                style={{
                  padding: '10px 14px',
                  textAlign: 'right',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  color: 'var(--text-secondary)'
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
                  {visibleSet.has('actions') && 'Actions'}
                  <ColumnSelector
                    pageKey="policies"
                    allColumns={POLICY_COLUMNS}
                    visibleColumns={visibleColumns}
                    onChange={setVisibleColumns}
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center' }}>
                      <Spinner size={20} label="Loading policies..." />
                    </div>
                  ) : (
                    <EmptyState
                      icon={<FileCheck size={40} />}
                      title={
                        policies.length === 0 ? 'No policies yet' : 'No policies match your filters'
                      }
                      text={
                        policies.length === 0
                          ? 'Policies are created by converting an approved quotation.'
                          : undefined
                      }
                      action={
                        policies.length > 0 ? (
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => {
                              setSearch('')
                              setTypeFilter('all')
                              setStatusFilter('all')
                              setRegistryOnly(false)
                              setPage(0)
                            }}
                          >
                            Clear filters
                          </button>
                        ) : undefined
                      }
                    />
                  )}
                </td>
              </tr>
            ) : (
              paginated.map((p) => {
                return (
                  <tr
                    key={p.id}
                    style={{ borderBottom: '1px solid var(--table-border)', cursor: 'pointer' }}
                    className="hover-effect"
                    onClick={() => onSelectPolicy(p.id)}
                  >
                    {visibleSet.has('policyNo') && (
                      <td
                        style={{
                          padding: '12px 14px',
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          color: (p.policyNumber || '').startsWith('POL-DRAFT-')
                            ? 'var(--text-secondary)'
                            : 'var(--accent-primary)'
                        }}
                      >
                        {p.policyNumber ? (
                          `${p.policyNumber}${p.revisionNumber > 0 ? `-R${p.revisionNumber}` : ''}`
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            --
                          </span>
                        )}
                      </td>
                    )}
                    {visibleSet.has('type') && (
                      <td style={{ padding: '12px 14px' }}>
                        <Badge
                          color={getTypeColor(p.policyTypeName)}
                          style={{ borderRadius: '6px' }}
                        >
                          {p.policyTypeName || '-'}
                        </Badge>
                      </td>
                    )}
                    {visibleSet.has('vessel') && (
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
                        {p.vesselName || (
                          <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            --
                          </span>
                        )}
                      </td>
                    )}
                    {visibleSet.has('customer') && (
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
                        {p.customerName || <span style={{ fontStyle: 'italic' }}>--</span>}
                      </td>
                    )}
                    {visibleSet.has('period') && (
                      <td
                        style={{
                          padding: '12px 14px',
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {formatPeriod(p.inceptionDate, p.expiryDate)}
                      </td>
                    )}
                    {visibleSet.has('status') && (
                      <td style={{ padding: '12px 14px' }}>
                        <Badge
                          tone={STATUS_TONES[p.status] || 'neutral'}
                          dot
                          style={{ textTransform: 'capitalize' }}
                        >
                          {p.status}
                        </Badge>
                      </td>
                    )}
                    {visibleSet.has('premium') && (
                      <td
                        style={{
                          padding: '12px 14px',
                          textAlign: 'right',
                          fontSize: '0.82rem',
                          fontWeight: p.premiumAmount ? 600 : 400,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {formatCurrency(p.premiumAmount, p.currency)}
                      </td>
                    )}
                    {visibleSet.has('converted') && (
                      <td
                        style={{
                          padding: '12px 14px',
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {p.createdAt ? formatDateShort(p.createdAt) : '-'}
                      </td>
                    )}
                    {visibleSet.has('exported') && (
                      <td
                        style={{
                          padding: '12px 14px',
                          fontSize: '0.8rem',
                          whiteSpace: 'nowrap',
                          color: p.exportedAt ? 'var(--success)' : 'var(--text-secondary)'
                        }}
                      >
                        {p.exportedAt ? (
                          formatDateShort(p.exportedAt)
                        ) : (
                          <span style={{ fontStyle: 'italic' }}>Not exported</span>
                        )}
                      </td>
                    )}
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      {visibleSet.has('actions') && hasPermission('policies:manage') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirm({ show: true, policy: p })
                          }}
                          className="btn-ghost btn-icon btn-sm"
                          style={{ color: 'var(--danger)' }}
                          title="Delete policy"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sorted.length > PAGE_SIZE && (
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
            Showing {page * PAGE_SIZE + 1}--{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of{' '}
            {sorted.length}
            {sorted.length !== policies.length && ` (filtered from ${policies.length})`}
          </span>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="btn-secondary btn-sm"
            >
              First
            </button>
            <button
              title="Previous"
              aria-label="Previous"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary btn-icon btn-sm"
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ padding: '0 8px', fontWeight: 600 }}>
              {page + 1} / {totalPages}
            </span>
            <button
              title="Next"
              aria-label="Next"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary btn-icon btn-sm"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="btn-secondary btn-sm"
            >
              Last
            </button>
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
              await window.api.policyDelete(deleteConfirm.policy!.id)
              showSuccess('Policy deleted')
              loadData()
            } catch (err) {
              showError((err instanceof Error ? err.message : '') || 'Failed to delete')
            }
          }}
          onCancel={() => setDeleteConfirm({ show: false, policy: null })}
        />
      )}
    </div>
  )
}
