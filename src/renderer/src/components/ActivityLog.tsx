import { useState, useEffect, useCallback } from 'react'
import { ScrollText, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Filter, ShieldAlert } from 'lucide-react'
import { ActivityLogEntry, ActivityLogFilters } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDateTime } from '../utils/dateUtils'

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
  const { hasPermission } = useAuth()
  const { theme } = useTheme()
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
                { label: 'Date / Time', width: '155px' },
                { label: 'User', width: '110px' },
                { label: 'Module', width: '110px' },
                { label: 'Action', width: '120px' },
                { label: 'Entity', width: 'auto' },
                { label: 'Details', width: '35%' },
              ].map((h) => (
                <th
                  key={h.label}
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Loading...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '64px 20px', textAlign: 'center' }}>
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
                  <td style={{ padding: '10px 16px', fontSize: '0.8rem', whiteSpace: 'nowrap', color: isLight ? '#64748b' : 'var(--text-secondary)', fontFamily: 'monospace', letterSpacing: '-0.3px' }}>
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {entry.username}
                  </td>
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
                  <td style={{ padding: '10px 16px', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                    {entry.entityName ? (
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.entityName}</span>
                    ) : entry.entityType ? (
                      <span style={{ color: 'var(--text-primary)', opacity: 0.7 }}>{entry.entityType}</span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', opacity: 0.35 }}>&mdash;</span>
                    )}
                  </td>
                  <td style={{
                    padding: '10px 16px', fontSize: '0.8rem', color: isLight ? '#64748b' : 'var(--text-secondary)',
                    maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                    title={entry.details || ''}
                  >
                    {entry.details || ''}
                  </td>
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
