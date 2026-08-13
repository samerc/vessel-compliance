import { useState, useEffect, useMemo } from 'react'
import { Search, RefreshCw, Eye, ChevronUp, ChevronDown, Download } from 'lucide-react'
import { ConditionSurvey, Vessel, Surveyor, SurveyDefect } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDate } from '../utils/dateUtils'
import ColumnSelector, { useColumnPrefs, ColumnDef } from './ColumnSelector'
import XLSX from 'xlsx-js-style'

interface Props {
  onNavigateToVessel: (vesselId: string) => void
}

interface SurveyWithCounts extends ConditionSurvey {
  openDefects: number
  totalDefects: number
}

type SortKey = 'vessel' | 'reference' | 'date' | 'type' | 'surveyor' | 'location' | 'defects'

const SURVEY_COLUMNS: ColumnDef[] = [
  { id: 'vessel', label: 'Vessel', defaultVisible: true },
  { id: 'reference', label: 'Reference', defaultVisible: true },
  { id: 'date', label: 'Survey Date', defaultVisible: true },
  { id: 'type', label: 'Type', defaultVisible: true },
  { id: 'surveyor', label: 'Surveyor', defaultVisible: true },
  { id: 'location', label: 'Location', defaultVisible: true },
  { id: 'defects', label: 'Defects', defaultVisible: true },
  { id: 'actions', label: 'Actions', defaultVisible: true }
]

export default function ConditionSurveyList({ onNavigateToVessel }: Props) {
  const [surveys, setSurveys] = useState<SurveyWithCounts[]>([])
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [surveyors, setSurveyors] = useState<Surveyor[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [surveyorFilter, setSurveyorFilter] = useState('')
  const [surveyorDropdownOpen, setSurveyorDropdownOpen] = useState(false)
  const [surveyorSearch, setSurveyorSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [openDefectsOnly, setOpenDefectsOnly] = useState(false)
  const { showError, showSuccess } = useToast()
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
  const dropdownBg = isLight ? '#ffffff' : '#1a1d28'
  const { visibleColumns: svVisibleCols, setVisibleColumns: setSvVisibleCols } = useColumnPrefs('surveys', SURVEY_COLUMNS)
  const svVisSet = new Set(svVisibleCols)

  const vesselMap = useMemo(() => {
    const map = new Map<string, Vessel>()
    for (const v of vessels) map.set(v.id, v)
    return map
  }, [vessels])

  const surveyorMap = useMemo(() => {
    const map = new Map<string, Surveyor>()
    for (const s of surveyors) map.set(s.id, s)
    return map
  }, [surveyors])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [allSurveys, allVessels, allSurveyors] = await Promise.all([
        window.api.getConditionSurveys(),
        window.api.getVessels(),
        window.api.getSurveyors()
      ])
      setVessels(Array.isArray(allVessels) ? allVessels : [])
      setSurveyors(Array.isArray(allSurveyors) ? allSurveyors : [])

      // Load defect counts for each survey
      const surveysWithCounts: SurveyWithCounts[] = await Promise.all(
        (Array.isArray(allSurveys) ? allSurveys : []).map(async (survey) => {
          try {
            const defects: SurveyDefect[] = await window.api.getSurveyDefects(survey.id)
            const openDefects = defects.filter((d) => d.status === 'OPEN').length
            return { ...survey, openDefects, totalDefects: defects.length }
          } catch {
            return { ...survey, openDefects: 0, totalDefects: 0 }
          }
        })
      )

      setSurveys(surveysWithCounts)
    } catch (err: any) {
      showError('Failed to load surveys: ' + (err.message || err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filtered = useMemo(() => {
    let result = surveys
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter((s) => {
        const vessel = vesselMap.get(s.vesselId)
        const vesselName = vessel?.name?.toLowerCase() || ''
        const imoNumber = vessel?.imoNumber?.toLowerCase() || ''
        const surveyType = s.surveyType?.toLowerCase() || ''
        const surveyor = surveyorMap.get(s.surveyorId)?.companyName?.toLowerCase() || ''
        const reference = s.reference?.toLowerCase() || ''
        return vesselName.includes(term) || imoNumber.includes(term) || surveyType.includes(term) || surveyor.includes(term) || reference.includes(term)
      })
    }
    if (dateFrom) result = result.filter(s => s.surveyDate >= dateFrom)
    if (dateTo) result = result.filter(s => s.surveyDate <= dateTo)
    if (surveyorFilter) result = result.filter(s => s.surveyorId === surveyorFilter)
    if (typeFilter) result = result.filter(s => s.surveyType === typeFilter)
    if (openDefectsOnly) result = result.filter(s => s.openDefects > 0)
    return result
  }, [surveys, searchTerm, vesselMap, surveyorMap, dateFrom, dateTo, surveyorFilter, typeFilter, openDefectsOnly])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [searchTerm, dateFrom, dateTo, surveyorFilter, typeFilter, openDefectsOnly])

  // Unique survey types for filter dropdown
  const surveyTypes = useMemo(() => [...new Set(surveys.map(s => s.surveyType).filter(Boolean))].sort(), [surveys])

  // Per-surveyor survey counts (only surveyors that actually have surveys), most first
  const surveyorCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of surveys) m.set(s.surveyorId, (m.get(s.surveyorId) || 0) + 1)
    return [...m.entries()]
      .map(([id, count]) => ({ id, count, name: surveyorMap.get(id)?.companyName || 'Unknown' }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [surveys, surveyorMap])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'vessel': {
          const aName = vesselMap.get(a.vesselId)?.name || ''
          const bName = vesselMap.get(b.vesselId)?.name || ''
          return aName.localeCompare(bName) * dir
        }
        case 'reference':
          return (a.reference || '').localeCompare(b.reference || '') * dir
        case 'date':
          return (new Date(a.surveyDate).getTime() - new Date(b.surveyDate).getTime()) * dir
        case 'type':
          return (a.surveyType || '').localeCompare(b.surveyType || '') * dir
        case 'surveyor': {
          const aSurveyor = surveyorMap.get(a.surveyorId)?.companyName || ''
          const bSurveyor = surveyorMap.get(b.surveyorId)?.companyName || ''
          return aSurveyor.localeCompare(bSurveyor) * dir
        }
        case 'location':
          return (a.location || '').localeCompare(b.location || '') * dir
        case 'defects':
          return (a.openDefects - b.openDefects) * dir
        default:
          return 0
      }
    })
  }, [filtered, sortKey, sortDir, vesselMap, surveyorMap])

  // Pagination
  const totalPages = Math.ceil(sorted.length / pageSize)
  const paginated = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const exportExcel = () => {
    if (sorted.length === 0) return
    const data = sorted.map(s => ({
      'Vessel': vesselMap.get(s.vesselId)?.name || '',
      'IMO': vesselMap.get(s.vesselId)?.imoNumber || '',
      'Reference': s.reference || '',
      'Date': s.surveyDate,
      'Type': s.surveyType || '',
      'Surveyor': surveyorMap.get(s.surveyorId)?.companyName || '',
      'Location': s.location || '',
      'Open Defects': s.openDefects,
      'Total Defects': s.totalDefects
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Surveys')
    XLSX.writeFile(wb, `Condition Surveys.xlsx`)
    showSuccess('Exported to Excel')
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp size={12} style={{ opacity: 0.25 }} />
    return sortDir === 'asc' ? (
      <ChevronUp size={12} style={{ color: 'var(--accent-primary)' }} />
    ) : (
      <ChevronDown size={12} style={{ color: 'var(--accent-primary)' }} />
    )
  }

  const thStyle = {
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontSize: '0.8rem',
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  }

  return (
    <div className="fade-in" style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Condition Surveys</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          All active condition surveys across all vessels
        </p>
      </div>

      {/* By surveyor — searchable dropdown with per-surveyor survey counts */}
      {surveyorCounts.length > 0 && (
        <div style={{ marginBottom: '20px', maxWidth: '380px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
            Surveys by Surveyor
          </div>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setSurveyorDropdownOpen(o => !o); setSurveyorSearch('') }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${surveyorFilter ? 'var(--accent-primary)' : 'var(--input-border)'}`, background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.86rem', fontWeight: 600, cursor: 'pointer' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {surveyorFilter ? (surveyorMap.get(surveyorFilter)?.companyName || 'Unknown') : 'All Surveyors'}
                <span style={{ marginLeft: '8px', color: 'var(--accent-primary)' }}>
                  {surveyorFilter ? (surveyorCounts.find(sc => sc.id === surveyorFilter)?.count ?? 0) : surveys.length}
                </span>
              </span>
              <ChevronDown size={16} style={{ flexShrink: 0, opacity: 0.6, transform: surveyorDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
            {surveyorDropdownOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setSurveyorDropdownOpen(false)} />
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', zIndex: 91, background: dropdownBg, border: '1px solid var(--input-border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '340px' }}>
                  <div style={{ position: 'relative', padding: '8px', borderBottom: '1px solid var(--table-border)' }}>
                    <Search size={14} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                      autoFocus
                      value={surveyorSearch}
                      onChange={e => setSurveyorSearch(e.target.value)}
                      placeholder="Search surveyors..."
                      style={{ width: '100%', paddingLeft: '30px', fontSize: '0.84rem' }}
                    />
                  </div>
                  <div style={{ overflowY: 'auto' }}>
                    <div
                      onClick={() => { setSurveyorFilter(''); setSurveyorDropdownOpen(false) }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: !surveyorFilter ? 700 : 500, background: !surveyorFilter ? 'rgba(0,210,255,0.08)' : 'transparent' }}
                      onMouseEnter={e => { if (surveyorFilter) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                      onMouseLeave={e => { if (surveyorFilter) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span>All Surveyors</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{surveys.length}</span>
                    </div>
                    {surveyorCounts
                      .filter(sc => !surveyorSearch || sc.name.toLowerCase().includes(surveyorSearch.toLowerCase()))
                      .map(sc => {
                        const active = surveyorFilter === sc.id
                        return (
                          <div
                            key={sc.id}
                            onClick={() => { setSurveyorFilter(sc.id); setSurveyorDropdownOpen(false) }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: active ? 700 : 500, color: active ? 'var(--accent-primary)' : 'var(--text-primary)', background: active ? 'rgba(0,210,255,0.08)' : 'transparent' }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.name}</span>
                            <span style={{ flexShrink: 0, minWidth: '22px', textAlign: 'center', padding: '1px 7px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700, background: 'var(--table-header-bg)', color: 'var(--text-secondary)' }}>{sc.count}</span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Search and refresh bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)'
            }}
          />
          <input
            type="text"
            placeholder="Search by vessel name, IMO, or survey type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', paddingLeft: '36px' }}
          />
        </div>
        <button onClick={loadData} disabled={isLoading} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', fontSize: '0.85rem' }} title="Refresh">
          <RefreshCw size={16} className={isLoading ? 'spin' : ''} /> Refresh
        </button>
        <button onClick={exportExcel} disabled={sorted.length === 0} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', fontSize: '0.85rem' }}>
          <Download size={16} /> Export Excel
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.82rem' }} title="From date" />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.82rem' }} title="To date" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
          <option value="">All Types</option>
          {surveyTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={openDefectsOnly} onChange={e => setOpenDefectsOnly(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
          Open defects only
        </label>
      </div>

      {/* Survey count */}
      <div
        style={{
          marginBottom: '16px',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)'
        }}
      >
        {sorted.length} survey{sorted.length !== 1 ? 's' : ''} found
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr
                style={{
                  background: 'var(--table-header-bg)',
                  borderBottom: '1px solid var(--table-border)'
                }}
              >
                {svVisSet.has('vessel') && (
                <th style={thStyle} onClick={() => handleSort('vessel')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Vessel <SortIcon col="vessel" />
                  </span>
                </th>
                )}
                {svVisSet.has('reference') && (
                <th style={thStyle} onClick={() => handleSort('reference')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Reference <SortIcon col="reference" />
                  </span>
                </th>
                )}
                {svVisSet.has('date') && (
                <th style={thStyle} onClick={() => handleSort('date')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Survey Date <SortIcon col="date" />
                  </span>
                </th>
                )}
                {svVisSet.has('type') && (
                <th style={thStyle} onClick={() => handleSort('type')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Type <SortIcon col="type" />
                  </span>
                </th>
                )}
                {svVisSet.has('surveyor') && (
                <th style={thStyle} onClick={() => handleSort('surveyor')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Surveyor <SortIcon col="surveyor" />
                  </span>
                </th>
                )}
                {svVisSet.has('location') && (
                <th style={thStyle} onClick={() => handleSort('location')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Location <SortIcon col="location" />
                  </span>
                </th>
                )}
                {svVisSet.has('defects') && (
                <th style={thStyle} onClick={() => handleSort('defects')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Defects <SortIcon col="defects" />
                  </span>
                </th>
                )}
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    {svVisSet.has('actions') && 'Actions'}
                    <ColumnSelector
                      pageKey="surveys"
                      allColumns={SURVEY_COLUMNS}
                      visibleColumns={svVisibleCols}
                      onChange={setSvVisibleCols}
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && surveys.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: '40px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    Loading surveys...
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: '40px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {searchTerm ? 'No surveys match your search.' : 'No condition surveys found.'}
                  </td>
                </tr>
              ) : (
                paginated.map((survey) => {
                  const vessel = vesselMap.get(survey.vesselId)
                  const surveyor = surveyorMap.get(survey.surveyorId)
                  const hasOpenDefects = survey.openDefects > 0

                  return (
                    <tr
                      key={survey.id}
                      style={{
                        borderBottom: '1px solid var(--table-border)',
                        transition: 'background 0.15s'
                      }}
                      className="hover-effect"
                    >
                      {svVisSet.has('vessel') && (
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '600', textTransform: 'uppercase' }}>
                          {vessel?.name || 'Unknown Vessel'}
                        </div>
                        {vessel?.imoNumber && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                              marginTop: '2px'
                            }}
                          >
                            IMO: {vessel.imoNumber}
                          </div>
                        )}
                      </td>
                      )}
                      {svVisSet.has('reference') && (
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                        {survey.reference
                          ? <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-primary)' }}>{survey.reference}</span>
                          : <span style={{ color: 'var(--text-secondary)' }}>-</span>}
                      </td>
                      )}
                      {svVisSet.has('date') && (
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                        {formatDate(survey.surveyDate)}
                      </td>
                      )}
                      {svVisSet.has('type') && (
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                        {survey.surveyType || '-'}
                      </td>
                      )}
                      {svVisSet.has('surveyor') && (
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                        {surveyor?.companyName || '-'}
                      </td>
                      )}
                      {svVisSet.has('location') && (
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                        {survey.location || '-'}
                      </td>
                      )}
                      {svVisSet.has('defects') && (
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            background: hasOpenDefects
                              ? 'rgba(239, 68, 68, 0.15)'
                              : survey.totalDefects > 0
                                ? 'rgba(34, 197, 94, 0.15)'
                                : 'rgba(148, 163, 184, 0.15)',
                            color: hasOpenDefects
                              ? 'var(--danger)'
                              : survey.totalDefects > 0
                                ? 'var(--success)'
                                : 'var(--text-secondary)'
                          }}
                        >
                          {survey.openDefects} open / {survey.totalDefects} total
                        </span>
                      </td>
                      )}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {svVisSet.has('actions') && (
                        <button
                          onClick={() => onNavigateToVessel(survey.vesselId)}
                          title="View vessel surveys"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: '1px solid var(--glass-border)',
                            background: 'var(--glass-bg)',
                            color: 'var(--accent-primary)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '500'
                          }}
                        >
                          <Eye size={14} />
                          View
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
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button onClick={() => setPage(0)} disabled={page === 0} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.78rem' }}>First</button>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.78rem' }}>Prev</button>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Page {page + 1} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.78rem' }}>Next</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.78rem' }}>Last</button>
          </div>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0) }} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      )}
    </div>
  )
}
