import { useState, useEffect, useMemo } from 'react'
import { Search, RefreshCw, Eye, ChevronUp, ChevronDown } from 'lucide-react'
import { ConditionSurvey, Vessel, Surveyor, SurveyDefect } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'

interface Props {
  onNavigateToVessel: (vesselId: string) => void
}

interface SurveyWithCounts extends ConditionSurvey {
  openDefects: number
  totalDefects: number
}

type SortKey = 'vessel' | 'date' | 'type' | 'surveyor' | 'location' | 'defects'

export default function ConditionSurveyList({ onNavigateToVessel }: Props) {
  const [surveys, setSurveys] = useState<SurveyWithCounts[]>([])
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [surveyors, setSurveyors] = useState<Surveyor[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const { showError } = useToast()

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
      setVessels(allVessels)
      setSurveyors(allSurveyors)

      // Load defect counts for each survey
      const surveysWithCounts: SurveyWithCounts[] = await Promise.all(
        allSurveys.map(async (survey) => {
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
    if (!searchTerm) return surveys
    const term = searchTerm.toLowerCase()
    return surveys.filter((s) => {
      const vessel = vesselMap.get(s.vesselId)
      const vesselName = vessel?.name?.toLowerCase() || ''
      const imoNumber = vessel?.imoNumber?.toLowerCase() || ''
      const surveyType = s.surveyType?.toLowerCase() || ''
      return vesselName.includes(term) || imoNumber.includes(term) || surveyType.includes(term)
    })
  }, [surveys, searchTerm, vesselMap])

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
        <button
          onClick={loadData}
          disabled={isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid var(--glass-border)',
            background: 'var(--glass-bg)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: '0.85rem'
          }}
          title="Refresh"
        >
          <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
          Refresh
        </button>
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
                <th style={thStyle} onClick={() => handleSort('vessel')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Vessel <SortIcon col="vessel" />
                  </span>
                </th>
                <th style={thStyle} onClick={() => handleSort('date')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Survey Date <SortIcon col="date" />
                  </span>
                </th>
                <th style={thStyle} onClick={() => handleSort('type')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Type <SortIcon col="type" />
                  </span>
                </th>
                <th style={thStyle} onClick={() => handleSort('surveyor')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Surveyor <SortIcon col="surveyor" />
                  </span>
                </th>
                <th style={thStyle} onClick={() => handleSort('location')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Location <SortIcon col="location" />
                  </span>
                </th>
                <th style={thStyle} onClick={() => handleSort('defects')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Defects <SortIcon col="defects" />
                  </span>
                </th>
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
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && surveys.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
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
                    colSpan={7}
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
                sorted.map((survey) => {
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
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                        {new Date(survey.surveyDate).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                        {survey.surveyType || '-'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                        {surveyor?.companyName || '-'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                        {survey.location || '-'}
                      </td>
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
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
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
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
