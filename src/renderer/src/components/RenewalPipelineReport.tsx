import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  RefreshCw, Download, Calendar, DollarSign, TrendingUp, Percent,
  ChevronUp, ChevronDown as ChevronDownIcon, Loader2, Search, Filter
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import XLSX from 'xlsx-js-style'
import { formatDateOrDash } from '../utils/dateUtils'

interface RenewalItem {
  id: string
  vesselId: string
  vesselName: string
  imoNumber: string
  policyTypeName: string
  policyTypeId: string
  policyNumber: string
  status: string
  renewalStatusId: string | null
  renewalStatusName: string | null
  renewalStatusColor: string | null
  endDate: string
  customerName: string | null
  customerType: string | null
  fleetName: string | null
  currency: string | null
  premium: number | null
}

interface PolicyTypeOption {
  id: string
  name: string
}

type SortField =
  | 'vesselName'
  | 'customerName'
  | 'policyTypeName'
  | 'premium'
  | 'endDate'
  | 'renewalStatusName'
  | 'daysUntil'
type SortDir = 'asc' | 'desc'
type ViewMode = 'quarter' | 'month'

const QUARTER_LABELS = ['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)']

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

function formatPremium(value: number | null, currency: string | null): string {
  if (value == null) return '-'
  const sym = currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : '$'
  return `${sym}${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}


// ── KPI card ──────────────────────────────────────────────────────────────────

function KPI({ icon, gradient, label, value, sub }: {
  icon: React.ReactNode
  gradient: string
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '14px',
        background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '600',
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: String(value).length > 12 ? '1rem' : String(value).length > 8 ? '1.25rem' : '1.75rem',
          fontWeight: '800',
          lineHeight: 1,
          letterSpacing: '-0.03em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
        }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RenewalPipelineReport() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { showError, showSuccess } = useToast()

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [viewMode, setViewMode] = useState<ViewMode>('quarter')
  const [selectedQuarter, setSelectedQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3))
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [policyTypeFilter, setPolicyTypeFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [renewals, setRenewals] = useState<RenewalItem[]>([])
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState<SortField>('endDate')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [policyTypes, setPolicyTypes] = useState<PolicyTypeOption[]>([])

  const G = {
    blue: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
    green: 'linear-gradient(135deg, #10b981, #059669)',
    amber: 'linear-gradient(135deg, #f59e0b, #d97706)',
    teal: 'linear-gradient(135deg, #14b8a6, #0d9488)',
  }

  // Load policy types on mount
  useEffect(() => {
    window.api.getPolicyTypes().then((types: any[]) => {
      if (Array.isArray(types)) {
        setPolicyTypes(types.map((t: any) => ({ id: t.id, name: t.name })))
      }
    }).catch(() => {})
  }, [])

  // Compute date range from year + view mode + selection
  const dateRange = useMemo(() => {
    if (viewMode === 'quarter') {
      const startMonth = (selectedQuarter - 1) * 3 + 1
      const endMonth = startMonth + 2
      const from = `${selectedYear}-${String(startMonth).padStart(2, '0')}-01`
      const endYear = endMonth === 12 ? selectedYear : selectedYear
      const lastDay = new Date(endYear, endMonth, 0).getDate()
      const to = `${selectedYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      return { from, to }
    } else {
      const from = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
      const to = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      return { from, to }
    }
  }, [selectedYear, viewMode, selectedQuarter, selectedMonth])

  // Full year range for KPI
  const yearRange = useMemo(() => {
    return {
      from: `${selectedYear}-01-01`,
      to: `${selectedYear}-12-31`,
    }
  }, [selectedYear])

  const [yearRenewals, setYearRenewals] = useState<RenewalItem[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [rangeData, yearData] = await Promise.all([
        window.api.getRenewalPipeline(dateRange.from, dateRange.to),
        window.api.getRenewalPipeline(yearRange.from, yearRange.to),
      ])
      if (Array.isArray(rangeData)) setRenewals(rangeData)
      if (Array.isArray(yearData)) setYearRenewals(yearData)
    } catch (err: any) {
      showError('Failed to load renewal pipeline: ' + (err?.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [dateRange, yearRange])

  useEffect(() => { loadData() }, [loadData])

  // Filtered & sorted data
  const filtered = useMemo(() => {
    let data = [...renewals]
    if (policyTypeFilter !== 'all') {
      data = data.filter(r => r.policyTypeId === policyTypeFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        r.vesselName?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q) ||
        r.policyNumber?.toLowerCase().includes(q) ||
        r.imoNumber?.toLowerCase().includes(q)
      )
    }
    data.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'vesselName': cmp = (a.vesselName || '').localeCompare(b.vesselName || ''); break
        case 'customerName': cmp = (a.customerName || '').localeCompare(b.customerName || ''); break
        case 'policyTypeName': cmp = (a.policyTypeName || '').localeCompare(b.policyTypeName || ''); break
        case 'premium': cmp = (a.premium || 0) - (b.premium || 0); break
        case 'endDate': cmp = (a.endDate || '').localeCompare(b.endDate || ''); break
        case 'renewalStatusName': cmp = (a.renewalStatusName || '').localeCompare(b.renewalStatusName || ''); break
        case 'daysUntil': cmp = daysUntil(a.endDate) - daysUntil(b.endDate); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return data
  }, [renewals, policyTypeFilter, search, sortField, sortDir])

  // Year-level KPIs
  const kpis = useMemo(() => {
    const yearData = policyTypeFilter !== 'all'
      ? yearRenewals.filter(r => r.policyTypeId === policyTypeFilter)
      : yearRenewals
    const total = yearData.length
    const totalPremium = yearData.reduce((sum, r) => sum + (r.premium || 0), 0)
    const avgPremium = total > 0 ? totalPremium / total : 0
    const withStatus = yearData.filter(r => r.renewalStatusName)
    const renewalRate = total > 0 ? Math.round((withStatus.length / total) * 100) : 0
    return { total, totalPremium, avgPremium, renewalRate }
  }, [yearRenewals, policyTypeFilter])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDir === 'asc'
      ? <ChevronUp size={14} style={{ marginLeft: 4, opacity: 0.7 }} />
      : <ChevronDownIcon size={14} style={{ marginLeft: 4, opacity: 0.7 }} />
  }

  // Excel export
  const exportExcel = () => {
    if (filtered.length === 0) return
    const rows = filtered.map(r => ({
      Vessel: r.vesselName,
      IMO: r.imoNumber,
      Customer: r.customerName || '',
      'Policy Type': r.policyTypeName,
      'Policy Number': r.policyNumber || '',
      'Current Premium': r.premium ?? '',
      Currency: r.currency || 'USD',
      'End Date': r.endDate || '',
      'Renewal Status': r.renewalStatusName || 'Not Set',
      'Days Until Expiry': daysUntil(r.endDate),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Renewal Pipeline')
    const label = viewMode === 'quarter'
      ? `Q${selectedQuarter}_${selectedYear}`
      : `${String(selectedMonth).padStart(2, '0')}_${selectedYear}`
    XLSX.writeFile(wb, `Renewal_Pipeline_${label}.xlsx`)
    showSuccess('Exported to Excel')
  }

  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]

  const headerStyle: React.CSSProperties = {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--table-border)',
  }

  const cellStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: '0.85rem',
    borderBottom: '1px solid var(--table-border)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  return (
    <div className="fade-in">
      {/* ── KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <KPI
          icon={<Calendar size={20} color="#fff" />}
          gradient={G.blue}
          label="Total Renewals"
          value={kpis.total}
          sub={`in ${selectedYear}`}
        />
        <KPI
          icon={<DollarSign size={20} color="#fff" />}
          gradient={G.green}
          label="Total Premium"
          value={kpis.totalPremium > 0 ? `$${Math.round(kpis.totalPremium).toLocaleString()}` : '--'}
          sub="combined value"
        />
        <KPI
          icon={<TrendingUp size={20} color="#fff" />}
          gradient={G.amber}
          label="Avg Premium"
          value={kpis.avgPremium > 0 ? `$${Math.round(kpis.avgPremium).toLocaleString()}` : '--'}
          sub="per policy"
        />
        <KPI
          icon={<Percent size={20} color="#fff" />}
          gradient={G.teal}
          label="Renewal Rate"
          value={`${kpis.renewalRate}%`}
          sub="with status assigned"
        />
      </div>

      {/* ── Filters Bar ── */}
      <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        {/* Year selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Year:</label>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--input-border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          >
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* View mode toggle */}
        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--input-border)' }}>
          {(['quarter', 'month'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: viewMode === mode ? 600 : 400,
                cursor: 'pointer',
                border: 'none',
                background: viewMode === mode ? 'var(--accent-primary)' : 'var(--bg-primary)',
                color: viewMode === mode ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {mode === 'quarter' ? 'Quarter' : 'Month'}
            </button>
          ))}
        </div>

        {/* Quarter / Month selector */}
        {viewMode === 'quarter' ? (
          <select
            value={selectedQuarter}
            onChange={e => setSelectedQuarter(Number(e.target.value))}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--input-border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          >
            {QUARTER_LABELS.map((label, i) => (
              <option key={i} value={i + 1}>{label}</option>
            ))}
          </select>
        ) : (
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--input-border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        )}

        {/* Policy type filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={14} style={{ color: 'var(--text-secondary)' }} />
          <select
            value={policyTypeFilter}
            onChange={e => setPolicyTypeFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--input-border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          >
            <option value="all">All Policy Types</option>
            {policyTypes.map(pt => (
              <option key={pt.id} value={pt.id}>{pt.name}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '180px' }}>
          <Search size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search vessel, customer, policy..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--input-border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button
            onClick={loadData}
            disabled={loading}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid var(--input-border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <button
            onClick={exportExcel}
            disabled={filtered.length === 0}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              background: filtered.length > 0 ? 'var(--accent-primary)' : 'var(--bg-secondary)',
              color: filtered.length > 0 ? '#fff' : 'var(--text-secondary)',
              fontSize: '0.8rem',
              cursor: filtered.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Download size={14} />
            Export Excel
          </button>
        </div>
      </div>

      {/* ── Pipeline Table ── */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headerStyle} onClick={() => toggleSort('vesselName')}>
                  Vessel <SortIcon field="vesselName" />
                </th>
                <th style={headerStyle} onClick={() => toggleSort('customerName')}>
                  Customer <SortIcon field="customerName" />
                </th>
                <th style={headerStyle} onClick={() => toggleSort('policyTypeName')}>
                  Policy Type <SortIcon field="policyTypeName" />
                </th>
                <th style={{ ...headerStyle, textAlign: 'right' }} onClick={() => toggleSort('premium')}>
                  Current Premium <SortIcon field="premium" />
                </th>
                <th style={headerStyle} onClick={() => toggleSort('endDate')}>
                  End Date <SortIcon field="endDate" />
                </th>
                <th style={headerStyle} onClick={() => toggleSort('renewalStatusName')}>
                  Renewal Status <SortIcon field="renewalStatusName" />
                </th>
                <th style={{ ...headerStyle, textAlign: 'right' }} onClick={() => toggleSort('daysUntil')}>
                  Days Until Expiry <SortIcon field="daysUntil" />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ ...cellStyle, textAlign: 'center', padding: '40px' }}>
                    <Loader2 size={20} className="spin" style={{ marginRight: 8 }} />
                    Loading pipeline data...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...cellStyle, textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    No renewals found for the selected period.
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => {
                  const days = daysUntil(r.endDate)
                  const isExpired = days < 0
                  const isUrgent = days >= 0 && days <= 30
                  const isSoon = days > 30 && days <= 90
                  const daysColor = isExpired
                    ? 'var(--danger)'
                    : isUrgent
                      ? '#f59e0b'
                      : isSoon
                        ? '#eab308'
                        : 'var(--text-primary)'

                  return (
                    <tr
                      key={`${r.id}-${idx}`}
                      style={{
                        background: idx % 2 === 0
                          ? 'transparent'
                          : isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                        transition: 'background 0.15s',
                      }}
                    >
                      <td style={cellStyle}>
                        <div style={{ fontWeight: 600 }}>{r.vesselName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{r.imoNumber}</div>
                      </td>
                      <td style={cellStyle}>
                        {r.customerName || <span style={{ color: 'var(--text-secondary)' }}>-</span>}
                      </td>
                      <td style={cellStyle}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 500,
                          background: 'rgba(0, 210, 255, 0.08)',
                          color: 'var(--accent-primary)',
                          border: '1px solid rgba(0, 210, 255, 0.2)',
                        }}>
                          {r.policyTypeName}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {formatPremium(r.premium, r.currency)}
                      </td>
                      <td style={cellStyle}>
                        {formatDateOrDash(r.endDate)}
                      </td>
                      <td style={cellStyle}>
                        {r.renewalStatusName ? (
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 500,
                            color: '#000',
                            background: (r.renewalStatusColor || '#888') + '22',
                            border: `2px solid ${r.renewalStatusColor || '#888'}`,
                          }}>
                            {r.renewalStatusName}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Not Set</span>
                        )}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: daysColor, fontVariantNumeric: 'tabular-nums' }}>
                        {isExpired ? `${Math.abs(days)}d overdue` : `${days}d`}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        {filtered.length > 0 && (
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--table-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
          }}>
            <span>{filtered.length} renewal{filtered.length !== 1 ? 's' : ''} shown</span>
            <span>
              Total premium: <strong style={{ color: 'var(--text-primary)' }}>
                ${Math.round(filtered.reduce((s, r) => s + (r.premium || 0), 0)).toLocaleString()}
              </strong>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
