import { useState, useEffect, useCallback } from 'react'
import { ScrollText, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Filter, ShieldAlert, FileText, Table } from 'lucide-react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ActivityLogEntry, ActivityLogFilters } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime } from '../utils/dateUtils'
import { getReportSettings } from '../services/ReportSettingsService'
import ColumnSelector, { useColumnPrefs, ColumnDef } from './ColumnSelector'

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  CREATE: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  CREATE_DEFECT: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  CREATE_REVISION: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  CREATE_GROUP: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  UPDATE: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  DELETE: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  DELETE_GROUP: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  UPLOAD: { bg: 'rgba(14,165,233,0.15)', color: '#0ea5e9' },
  LOGIN: { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6' },
  EXPORT: { bg: 'rgba(0,170,200,0.15)', color: '#00aac8' },
  RESTORE: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  DUPLICATE: { bg: 'rgba(20,184,166,0.15)', color: '#14b8a6' },
  CLOSE_DEFECT: { bg: 'rgba(234,179,8,0.15)', color: '#eab308' },
  DECIDE: { bg: 'rgba(249,115,22,0.15)', color: '#f97316' },
  RUN_CHECK: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
}

const MODULE_COLORS: Record<string, string> = {
  Vessels: '#3b82f6',
  Entities: '#10b981',
  Quotations: '#f59e0b',
  Policies: '#8b5cf6',
  Surveys: '#ec4899',
  Surveyors: '#f472b6',
  Users: '#6366f1',
  Auth: '#a78bfa',
  Documents: '#0ea5e9',
  Settings: '#94a3b8',
  Compliance: '#ef4444',
  Fleets: '#06b6d4',
  Email: '#f97316',
  RBAC: '#8b5cf6',
  System: '#64748b',
}

function getActionStyle(action: string) {
  return ACTION_COLORS[action?.toUpperCase()] || { bg: 'rgba(100,116,139,0.15)', color: '#64748b' }
}

function getModuleColor(module: string) {
  return MODULE_COLORS[module] || '#64748b'
}

export default function ActivityLog() {
  const { hasPermission, user } = useAuth()
  const { theme } = useTheme()
  const { showSuccess, showError } = useToast()
  const isLight = theme === 'light'

  if (!hasPermission('admin:activityLog')) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px' }}>
        <ShieldAlert size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.3 }} />
        <div style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
          Access Denied
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>You do not have permission to view the activity log.</p>
      </div>
    )
  }

  // Column preferences
  const ACTIVITY_COLUMNS: ColumnDef[] = [
    { id: 'date', label: 'Date / Time', defaultVisible: true },
    { id: 'user', label: 'User', defaultVisible: true },
    { id: 'module', label: 'Module', defaultVisible: true },
    { id: 'action', label: 'Action', defaultVisible: true },
    { id: 'entity', label: 'Entity', defaultVisible: true },
    { id: 'details', label: 'Details', defaultVisible: true },
  ]
  const { visibleColumns: actVisibleCols, setVisibleColumns: setActVisibleCols } = useColumnPrefs('activity-log', ACTIVITY_COLUMNS)
  const actVisibleSet = new Set(actVisibleCols)

  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Filter state
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  // Filter options (loaded from DB)
  const [modules, setModules] = useState<string[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [users, setUsers] = useState<{ id: string; username: string }[]>([])

  const LIMIT = 25

  const loadFilters = useCallback(async () => {
    try {
      const [mods, acts, usrs] = await Promise.all([
        window.api.activityGetDistinctModules(),
        window.api.activityGetDistinctActions(),
        window.api.activityGetDistinctUsers(),
      ])
      if (Array.isArray(mods)) setModules(mods)
      if (Array.isArray(acts)) setActions(acts)
      if (Array.isArray(usrs)) setUsers(usrs)
    } catch {
      // Filters are optional
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const filters: ActivityLogFilters = {
        page,
        limit: LIMIT,
      }
      if (moduleFilter) filters.module = moduleFilter
      if (actionFilter) filters.action = actionFilter
      if (userFilter) filters.userId = userFilter
      if (dateFrom) filters.dateFrom = dateFrom
      if (dateTo) filters.dateTo = dateTo
      if (search) filters.search = search

      const result = await window.api.activityGetLog(filters)
      if (result && Array.isArray(result.data)) {
        setEntries(result.data)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      } else {
        setEntries([])
        setTotal(0)
        setTotalPages(0)
      }
    } catch {
      setEntries([])
      setTotal(0)
      setTotalPages(0)
    } finally {
      setLoading(false)
    }
  }, [page, moduleFilter, actionFilter, userFilter, dateFrom, dateTo, search])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleReset = () => {
    setModuleFilter('')
    setActionFilter('')
    setUserFilter('')
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setPage(1)
  }

  const handleExportPDF = async () => {
    try {
      // Fetch all entries matching current filters (up to 5000)
      const filters: ActivityLogFilters = { page: 1, limit: 5000 }
      if (moduleFilter) filters.module = moduleFilter
      if (actionFilter) filters.action = actionFilter
      if (userFilter) filters.userId = userFilter
      if (dateFrom) filters.dateFrom = dateFrom
      if (dateTo) filters.dateTo = dateTo
      if (search) filters.search = search

      const result = await window.api.activityGetLog(filters)
      const allEntries: ActivityLogEntry[] = result?.data || []
      if (allEntries.length === 0) {
        showError('No entries to export')
        return
      }

      const settings = await getReportSettings()
      const doc = new jsPDF({ orientation: 'landscape' })
      const pageW = doc.internal.pageSize.getWidth()

      // Header
      doc.setFillColor(10, 22, 40)
      doc.rect(0, 0, pageW, 22, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(settings.companyName || 'Activity Audit Report', 14, 14)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('Activity Audit Report', pageW - 14, 10, { align: 'right' })
      const rangeLabel = dateFrom || dateTo
        ? `${dateFrom || 'Start'} to ${dateTo || 'Present'}`
        : 'All Time'
      doc.text(rangeLabel, pageW - 14, 16, { align: 'right' })

      const tableData = allEntries.map(e => [
        formatDateTime(e.createdAt),
        e.username || '',
        e.action?.replace(/_/g, ' ') || '',
        e.module || '',
        e.entityName || e.entityType || '',
        (e.details || '').slice(0, 80),
      ])

      autoTable(doc, {
        startY: 28,
        head: [['Date / Time', 'User', 'Action', 'Module', 'Entity', 'Details']],
        body: tableData,
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [10, 22, 40], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 },
      })

      // Footer on each page
      const pageCount = doc.getNumberOfPages()
      const now = new Date().toLocaleDateString()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        const pageH = doc.internal.pageSize.getHeight()
        doc.setDrawColor(180, 180, 180)
        doc.line(14, pageH - 12, pageW - 14, pageH - 12)
        doc.setFontSize(7)
        doc.setTextColor(120, 120, 120)
        doc.text(`Generated on ${now} by ${user?.username || 'Unknown'}`, 14, pageH - 7)
        doc.text(`Page ${i} of ${pageCount}`, pageW - 14, pageH - 7, { align: 'right' })
      }

      doc.save('Activity_Audit_Report.pdf')
      showSuccess('Audit report exported')
    } catch (err: any) {
      showError(err.message || 'Failed to export report')
    }
  }

  const handleExportExcel = async () => {
    try {
      const allEntries = await window.api.activityGetLog({
        page: 1, limit: 5000,
        module: moduleFilter || undefined,
        action: actionFilter || undefined,
        userId: userFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
      })
      const rows = (allEntries.data || []).map((e: ActivityLogEntry) => ({
        'Date/Time': formatDateTime(e.createdAt),
        'User': e.username || '',
        'Action': e.action || '',
        'Module': e.module || '',
        'Entity': e.entityName || '',
        'Details': e.details || '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Activity Log')
      const colWidths = [{ wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 50 }]
      ws['!cols'] = colWidths
      XLSX.writeFile(wb, 'Activity_Log.xlsx')
      showSuccess('Activity log exported to Excel')
    } catch (err: any) {
      showError(err.message || 'Failed to export')
    }
  }

  const selectStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid var(--input-border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '0.82rem',
    minWidth: '120px',
  }

  const inputStyle: React.CSSProperties = {
    ...selectStyle,
    minWidth: '100px',
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ScrollText size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Activity Log</h1>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              System-wide audit trail
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {total} {total === 1 ? 'entry' : 'entries'}
            </span>
            <button
              onClick={handleExportPDF}
              style={{
                background: 'transparent', border: '1px solid var(--glass-border)',
                borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
                color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '0.8rem',
              }}
              className="hover-effect"
              title="Export filtered entries to PDF"
            >
              <FileText size={14} /> Export PDF
            </button>
            <button
              onClick={handleExportExcel}
              style={{
                background: 'transparent', border: '1px solid var(--glass-border)',
                borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
                color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '0.8rem',
              }}
              className="hover-effect"
              title="Export filtered entries to Excel"
            >
              <Table size={14} /> Export Excel
            </button>
            <button
              onClick={() => { loadData(); loadFilters() }}
              style={{
                background: 'transparent', border: '1px solid var(--glass-border)',
                borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
                color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '0.8rem',
              }}
              className="hover-effect"
              title="Refresh"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center',
        padding: '12px 16px', marginBottom: '16px', borderRadius: '8px',
        background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
        border: '1px solid var(--glass-border)',
      }}>
        <Filter size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />

        <select value={moduleFilter} onChange={(e) => { setModuleFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="">All Modules</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="">All Users</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
          style={inputStyle}
          title="From date"
        />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
          style={inputStyle}
          title="To date"
        />

        <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
          <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search entities, details, users..."
            style={{ ...inputStyle, width: '100%', paddingLeft: '28px' }}
          />
        </div>

        {(moduleFilter || actionFilter || userFilter || dateFrom || dateTo || search) && (
          <button
            onClick={handleReset}
            style={{
              background: 'transparent', border: '1px solid var(--glass-border)',
              borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: '0.78rem',
            }}
            className="hover-effect"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{
        borderRadius: '10px',
        border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'var(--glass-border)'}`,
        overflow: 'hidden',
        background: isLight ? '#ffffff' : 'var(--bg-card)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{
              background: isLight ? '#f8fafc' : 'rgba(255,255,255,0.04)',
              borderBottom: `2px solid ${isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)'}`,
            }}>
              {[
                { id: 'date', label: 'Date / Time', width: '155px' },
                { id: 'user', label: 'User', width: '110px' },
                { id: 'module', label: 'Module', width: '110px' },
                { id: 'action', label: 'Action', width: '120px' },
                { id: 'entity', label: 'Entity', width: 'auto' },
                { id: 'details', label: 'Details', width: '35%' },
              ].filter(h => actVisibleSet.has(h.id)).map((h) => (
                <th
                  key={h.id}
                  style={{
                    padding: '11px 16px', textAlign: 'left', fontSize: '0.7rem',
                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px',
                    color: isLight ? '#64748b' : 'var(--text-secondary)',
                    width: h.width,
                  }}
                >
                  {h.label}
                </th>
              ))}
              <th style={{ padding: '11px 8px', textAlign: 'right', width: '40px' }}>
                <ColumnSelector pageKey="activity-log" allColumns={ACTIVITY_COLUMNS} visibleColumns={actVisibleCols} onChange={setActVisibleCols} />
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={actVisibleCols.length + 1} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Loading...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={actVisibleCols.length + 1} style={{ padding: '64px 20px', textAlign: 'center' }}>
                  <ScrollText size={36} style={{ color: 'var(--text-secondary)', opacity: 0.2, marginBottom: '12px' }} />
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', fontWeight: 500 }}>
                    No activity entries found
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', opacity: 0.6, marginTop: '4px' }}>
                    {total === 0 && !moduleFilter && !actionFilter && !userFilter && !dateFrom && !dateTo && !search
                      ? 'Activity will appear here as actions are logged across the system.'
                      : 'Try adjusting your filters to see more results.'
                    }
                  </div>
                </td>
              </tr>
            ) : entries.map((entry, idx) => {
              const actionStyle = getActionStyle(entry.action)
              const moduleColor = getModuleColor(entry.module)
              return (
                <tr
                  key={entry.id}
                  style={{
                    borderBottom: `1px solid ${isLight ? '#f1f5f9' : 'rgba(255,255,255,0.04)'}`,
                    background: idx % 2 === 0 ? 'transparent' : (isLight ? '#fafbfc' : 'rgba(255,255,255,0.015)'),
                    transition: 'background 0.15s',
                  }}
                >
                  {actVisibleSet.has('date') && (
                  <td style={{ padding: '10px 16px', fontSize: '0.8rem', whiteSpace: 'nowrap', color: isLight ? '#64748b' : 'var(--text-secondary)', fontFamily: 'monospace', letterSpacing: '-0.3px' }}>
                    {formatDateTime(entry.createdAt)}
                  </td>
                  )}
                  {actVisibleSet.has('user') && (
                  <td style={{ padding: '10px 16px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {entry.username}
                  </td>
                  )}
                  {actVisibleSet.has('module') && (
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: '6px',
                      fontSize: '0.7rem', fontWeight: 600,
                      background: `${moduleColor}15`, color: isLight ? moduleColor : moduleColor,
                      border: `1px solid ${moduleColor}30`,
                      whiteSpace: 'nowrap',
                    }}>
                      {entry.module}
                    </span>
                  </td>
                  )}
                  {actVisibleSet.has('action') && (
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: '6px',
                      fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                      background: actionStyle.bg, color: isLight ? actionStyle.color : actionStyle.color,
                    }}>
                      {entry.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  )}
                  {actVisibleSet.has('entity') && (
                  <td style={{ padding: '10px 16px', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                    {entry.entityName ? (
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.entityName}</span>
                    ) : entry.entityType ? (
                      <span style={{ color: 'var(--text-primary)', opacity: 0.7 }}>{entry.entityType}</span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', opacity: 0.35 }}>&mdash;</span>
                    )}
                  </td>
                  )}
                  {actVisibleSet.has('details') && (
                  <td style={{
                    padding: '10px 16px', fontSize: '0.8rem', color: isLight ? '#64748b' : 'var(--text-secondary)',
                    maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                    title={entry.details || ''}
                  >
                    {entry.details || ''}
                  </td>
                  )}
                  <td />{/* spacer for column selector header */}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '6px', marginTop: '16px',
        }}>
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            style={{
              background: 'transparent', border: '1px solid var(--glass-border)',
              borderRadius: '6px', padding: '5px 8px', cursor: page === 1 ? 'default' : 'pointer',
              color: 'var(--text-secondary)', opacity: page === 1 ? 0.4 : 1,
            }}
            className="hover-effect"
          >
            <ChevronsLeft size={14} />
          </button>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              background: 'transparent', border: '1px solid var(--glass-border)',
              borderRadius: '6px', padding: '5px 8px', cursor: page === 1 ? 'default' : 'pointer',
              color: 'var(--text-secondary)', opacity: page === 1 ? 0.4 : 1,
            }}
            className="hover-effect"
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '0 8px' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              background: 'transparent', border: '1px solid var(--glass-border)',
              borderRadius: '6px', padding: '5px 8px', cursor: page === totalPages ? 'default' : 'pointer',
              color: 'var(--text-secondary)', opacity: page === totalPages ? 0.4 : 1,
            }}
            className="hover-effect"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            style={{
              background: 'transparent', border: '1px solid var(--glass-border)',
              borderRadius: '6px', padding: '5px 8px', cursor: page === totalPages ? 'default' : 'pointer',
              color: 'var(--text-secondary)', opacity: page === totalPages ? 0.4 : 1,
            }}
            className="hover-effect"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
