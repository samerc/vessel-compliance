import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Edit, Trash2, Save, X, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  MapPin, Phone, User, FileText, CheckCircle, AlertCircle,
  Loader2, Anchor, ClipboardList, Globe
} from 'lucide-react'
import { Surveyor, SurveyorQueryParams, ConditionSurvey, SurveyDefect, Vessel } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { formatDateShort } from '../utils/dateUtils'
import ColumnSelector, { useColumnPrefs, ColumnDef } from './ColumnSelector'
import { confirmDialog } from './DialogHost'

function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

export default function SurveyorDirectory() {
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
  const { showError, showSuccess } = useToast()
  const { hasPermission } = useAuth()
  const canManage = hasPermission('surveys:manage')

  // Column preferences
  const SURVEYOR_COLUMNS: ColumnDef[] = [
    { id: 'company', label: 'Company', defaultVisible: true },
    { id: 'country', label: 'Country', defaultVisible: true },
    { id: 'contact', label: 'Contact Person', defaultVisible: true },
    { id: 'surveys', label: 'Surveys', defaultVisible: true },
  ]
  const { visibleColumns: survVisibleCols, setVisibleColumns: setSurvVisibleCols } = useColumnPrefs('surveyors', SURVEYOR_COLUMNS)
  const survVisibleSet = new Set(survVisibleCols)

  // ── Surveyors (paginated) ────────────────────────────────────────────────────
  const [surveyors, setSurveyors] = useState<Surveyor[]>([])
  const [allSurveyorCount, setAllSurveyorCount] = useState(0)
  const [selectedSurveyor, setSelectedSurveyor] = useState<Surveyor | null>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [filterCountry, setFilterCountry] = useState('all')
  const [sortBy, setSortBy] = useState<'name' | 'country'>('name')
  const [searchTerm, setSearchTerm] = useState('')
  const [allCountries, setAllCountries] = useState<string[]>([])
  const debouncedSearch = useDebounceValue(searchTerm, 500)

  // ── Surveys + related data ───────────────────────────────────────────────────
  const [allSurveys, setAllSurveys] = useState<ConditionSurvey[]>([])
  const [allDefects, setAllDefects] = useState<SurveyDefect[]>([])
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [surveyTypes, setSurveyTypes] = useState<{ id: string; name: string }[]>([])

  // ── Form / modal state ───────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formCompanyName, setFormCompanyName] = useState('')
  const [formCountry, setFormCountry] = useState('')
  const [formContactPerson, setFormContactPerson] = useState('')
  const [formContactDetails, setFormContactDetails] = useState('')
  const [formNotes, setFormNotes] = useState('')

  // ── Data loading ─────────────────────────────────────────────────────────────
  const loadSurveyors = async () => {
    setIsLoading(true)
    try {
      const params: SurveyorQueryParams = {
        page, limit,
        search: debouncedSearch || undefined,
        country: filterCountry !== 'all' ? filterCountry : undefined,
        sortField: sortBy === 'name' ? 'companyName' : 'country',
        sortOrder: 'asc'
      }
      const result = await window.api.getSurveyorsPaginated(params)
      setSurveyors(Array.isArray(result?.data) ? result.data : [])
      setTotal(result?.total ?? 0)
      setTotalPages(result?.totalPages ?? 1)
    } catch (error: any) {
      showError(error.message || 'Failed to load surveyors')
    } finally {
      setIsLoading(false)
    }
  }

  const loadRelatedData = async () => {
    try {
      const [surveys, defects, vs, types, all] = await Promise.all([
        window.api.getConditionSurveys(),
        window.api.getSurveyDefects(),
        window.api.getVessels(),
        window.api.getConditionSurveyTypes(),
        window.api.getSurveyors()
      ])
      setAllSurveys(Array.isArray(surveys) ? surveys : [])
      setAllDefects(Array.isArray(defects) ? defects : [])
      setVessels(Array.isArray(vs) ? vs : [])
      setSurveyTypes(Array.isArray(types) ? types : [])
      const allSafe = Array.isArray(all) ? all : []
      setAllSurveyorCount(allSafe.length)
      setAllCountries([...new Set(allSafe.map(s => s.country).filter(Boolean))].sort())
    } catch {
      // non-critical
    }
  }

  useEffect(() => { loadSurveyors() }, [page, limit, debouncedSearch, filterCountry, sortBy])
  useEffect(() => { setPage(1) }, [debouncedSearch, filterCountry, sortBy, limit])
  useEffect(() => { loadRelatedData() }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getSurveyorSurveys = (surveyorId: string) =>
    allSurveys
      .filter(s => s.surveyorId === surveyorId)
      .sort((a, b) => b.surveyDate.localeCompare(a.surveyDate))

  const getSurveyStatus = (surveyId: string) => {
    const defects = allDefects.filter(d => d.surveyId === surveyId)
    if (defects.length === 0) return { label: 'NO DEFECTS', color: 'closed' as const, open: 0, closed: 0 }
    const open = defects.filter(d => d.status === 'OPEN').length
    const closed = defects.filter(d => d.status === 'CLOSED').length
    if (open === 0) return { label: 'CLOSED', color: 'closed' as const, open, closed }
    return { label: 'OPEN', color: 'open' as const, open, closed }
  }

  const getVesselName = (vesselId: string) =>
    vessels.find(v => v.id === vesselId)?.name ?? '—'

  const getSurveyTypeName = (surveyType: string) => {
    const found = surveyTypes.find(t => t.id === surveyType || t.name === surveyType)
    return found?.name ?? surveyType
  }

  const getSurveyCount = (surveyorId: string) =>
    allSurveys.filter(s => s.surveyorId === surveyorId).length

  const openSurveysCount = useMemo(() => {
    const surveyIdsWithOpenDefects = new Set(
      allDefects.filter(d => d.status === 'OPEN').map(d => d.surveyId)
    )
    return allSurveys.filter(s => surveyIdsWithOpenDefects.has(s.id)).length
  }, [allSurveys, allDefects])

  // ── Form handlers ────────────────────────────────────────────────────────────
  const resetForm = () => {
    setFormCompanyName(''); setFormCountry(''); setFormContactPerson('')
    setFormContactDetails(''); setFormNotes(''); setEditingId(null)
  }

  const openAddModal = () => { resetForm(); setShowModal(true) }

  const openEditModal = (s: Surveyor) => {
    setEditingId(s.id)
    setFormCompanyName(s.companyName)
    setFormCountry(s.country)
    setFormContactPerson(s.contactPerson || '')
    setFormContactDetails(s.contactDetails || '')
    setFormNotes(s.notes || '')
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); resetForm() }

  const handleSubmit = async () => {
    if (!formCompanyName.trim() || !formCountry.trim()) return
    setIsSubmitting(true)
    try {
      const data = {
        companyName: formCompanyName.trim(),
        country: formCountry.trim(),
        contactPerson: formContactPerson.trim() || undefined,
        contactDetails: formContactDetails.trim() || undefined,
        notes: formNotes.trim() || undefined
      }
      if (editingId) {
        await window.api.updateSurveyor(editingId, data)
        setSelectedSurveyor(prev => prev?.id === editingId ? { ...prev, ...data } : prev)
        showSuccess('Surveyor updated')
      } else {
        await window.api.addSurveyor(data)
        showSuccess('Surveyor added')
      }
      closeModal()
      loadSurveyors()
      loadRelatedData()
    } catch (error: any) {
      showError(error.message || 'Failed to save surveyor')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (surveyor: Surveyor) => {
    if (!(await confirmDialog(`Delete ${surveyor.companyName}? This will fail if they are referenced in any surveys.`))) return
    try {
      await window.api.deleteSurveyor(surveyor.id)
      if (selectedSurveyor?.id === surveyor.id) setSelectedSurveyor(null)
      showSuccess('Surveyor deleted')
      loadSurveyors()
      loadRelatedData()
    } catch (error: any) {
      showError(error.message || 'Cannot delete surveyor: referenced in existing surveys.')
    }
  }

  // ── Style constants ──────────────────────────────────────────────────────────
  const accentBg = isLight ? 'rgba(26,115,232,0.1)' : 'rgba(0,210,255,0.1)'
  const closedColor = isLight ? '#008c46' : '#00c264'
  const closedBg = isLight ? 'rgba(0,140,70,0.1)' : 'rgba(0,194,100,0.1)'
  const openColor = isLight ? '#b45309' : '#f59e0b'
  const openBg = isLight ? 'rgba(180,83,9,0.1)' : 'rgba(245,158,11,0.1)'

  const StatusPill = ({ status }: { status: ReturnType<typeof getSurveyStatus> }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '5px', fontSize: '0.67rem', fontWeight: 700,
      letterSpacing: '0.4px',
      background: status.color === 'closed' ? closedBg : openBg,
      color: status.color === 'closed' ? closedColor : openColor,
      border: `1px solid ${status.color === 'closed' ? (isLight ? 'rgba(0,140,70,0.2)' : 'rgba(0,194,100,0.2)') : (isLight ? 'rgba(180,83,9,0.2)' : 'rgba(245,158,11,0.2)')}`,
    }}>
      {status.color === 'closed'
        ? <CheckCircle size={9} />
        : <AlertCircle size={9} />}
      {status.label}
    </span>
  )

  const selectedSurveys = selectedSurveyor ? getSurveyorSurveys(selectedSurveyor.id) : []

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in">

      {/* Header */}
      <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '4px' }}>Surveyor Directory</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Manage surveying companies, contacts, and their survey history.</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', fontSize: '0.9rem', flexShrink: 0 }}>
            <Plus size={16} /> Add Surveyor
          </button>
        )}
      </header>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Anchor size={20} color="white" />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.1 }}>{allSurveyorCount}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Surveyors</div>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={20} color="var(--accent-primary)" />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.1 }}>{allSurveys.length}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Total Surveys</div>
          </div>
        </div>
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: openSurveysCount > 0 ? (isLight ? 'rgba(180,83,9,0.1)' : 'rgba(245,158,11,0.1)') : closedBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={20} color={openSurveysCount > 0 ? openColor : closedColor} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.1, color: openSurveysCount > 0 ? openColor : closedColor }}>{openSurveysCount}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Open Surveys</div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }} />
        <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} style={{ padding: '7px 10px', fontSize: '0.82rem', minWidth: '150px' }}>
          <option value="all">All Countries</option>
          {allCountries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ padding: '7px 10px', fontSize: '0.82rem' }}>
          <option value="name">Sort by Name</option>
          <option value="country">Sort by Country</option>
        </select>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={15} />
          <input
            type="text"
            placeholder="Search surveyors..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '34px', paddingRight: '10px', width: '220px', fontSize: '0.88rem' }}
          />
        </div>
      </div>

      {/* Main: table + slide-in */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* Table */}
        <div className="glass-card" style={{ flex: 1, minWidth: 0, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 'auto' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '80px' }} />
              </colgroup>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)', position: 'sticky', top: 0, zIndex: 1 }}>
                  {[
                    { id: 'company', label: 'Company' },
                    { id: 'country', label: 'Country' },
                    { id: 'contact', label: 'Contact Person' },
                    { id: 'surveys', label: 'Surveys' },
                  ].filter(col => survVisibleSet.has(col.id)).map(col => (
                    <th key={col.id} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.69rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{col.label}</th>
                  ))}
                  <th style={{ padding: '10px 16px', textAlign: 'right', width: '40px' }}>
                    <ColumnSelector pageKey="surveyors" allColumns={SURVEYOR_COLUMNS} visibleColumns={survVisibleCols} onChange={setSurvVisibleCols} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && surveyors.length === 0 ? (
                  <tr><td colSpan={survVisibleCols.length + 1} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Loader2 size={22} className="spinner" style={{ display: 'block', margin: '0 auto 10px' }} />
                    Loading surveyors...
                  </td></tr>
                ) : surveyors.length === 0 ? (
                  <tr><td colSpan={survVisibleCols.length + 1} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Anchor size={30} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.25 }} />
                    No surveyors found
                  </td></tr>
                ) : surveyors.map(surveyor => {
                  const isSelected = selectedSurveyor?.id === surveyor.id
                  const count = getSurveyCount(surveyor.id)
                  return (
                    <tr
                      key={surveyor.id}
                      onClick={() => setSelectedSurveyor(isSelected ? null : surveyor)}
                      className="hover-effect"
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--table-border)',
                        background: isSelected ? (isLight ? 'rgba(26,115,232,0.07)' : 'rgba(0,210,255,0.07)') : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--accent-primary)' : '3px solid transparent',
                        transition: 'background 0.12s, border-color 0.12s'
                      }}
                    >
                      {/* Company */}
                      {survVisibleSet.has('company') && (
                      <td style={{ padding: '12px 16px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Anchor size={15} color="white" />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{surveyor.companyName}</div>
                            {surveyor.contactDetails && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{surveyor.contactDetails.split('\n')[0]}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      )}
                      {/* Country */}
                      {survVisibleSet.has('country') && (
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                          <Globe size={12} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{surveyor.country}</span>
                        </div>
                      </td>
                      )}
                      {/* Contact Person */}
                      {survVisibleSet.has('contact') && (
                      <td style={{ padding: '12px 16px' }}>
                        {surveyor.contactPerson ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.83rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <User size={12} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                            {surveyor.contactPerson}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', opacity: 0.5 }}>—</span>
                        )}
                      </td>
                      )}
                      {/* Surveys */}
                      {survVisibleSet.has('surveys') && (
                      <td style={{ padding: '12px 16px' }}>
                        {count > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-primary)', background: accentBg, padding: '2px 8px', borderRadius: '10px' }}>
                            <FileText size={11} />{count}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                        )}
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
          {!isLoading && totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid var(--table-border)', fontSize: '0.82rem' }}>
              <div style={{ color: 'var(--text-secondary)' }}>
                {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(1)} style={{ padding: '4px 6px' }}><ChevronsLeft size={13} /></button>
                <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '4px 6px' }}><ChevronLeft size={13} /></button>
                <span style={{ margin: '0 6px', color: 'var(--text-secondary)' }}>{page}/{totalPages}</span>
                <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ padding: '4px 6px' }}><ChevronRight size={13} /></button>
                <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage(totalPages)} style={{ padding: '4px 6px' }}><ChevronsRight size={13} /></button>
                <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={{ marginLeft: '8px', padding: '3px 6px', fontSize: '0.82rem' }}>
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Slide-in detail panel */}
        {selectedSurveyor && (
          <div className="glass-card fade-in" style={{ width: '400px', flexShrink: 0, padding: 0, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* Panel header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--table-border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Anchor size={24} color="white" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.2, marginBottom: '5px', wordBreak: 'break-word' }}>{selectedSurveyor.companyName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <Globe size={12} color="var(--accent-primary)" />{selectedSurveyor.country}
                  </div>
                </div>
                <button onClick={() => setSelectedSurveyor(null)} style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}>
                  <X size={16} />
                </button>
              </div>

              {/* Contact details */}
              {(selectedSurveyor.contactPerson || selectedSurveyor.contactDetails) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px' }}>
                  {selectedSurveyor.contactPerson && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <User size={12} color="var(--accent-primary)" />{selectedSurveyor.contactPerson}
                    </div>
                  )}
                  {selectedSurveyor.contactDetails && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <Phone size={12} color="var(--accent-primary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{selectedSurveyor.contactDetails}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              {selectedSurveyor.notes && (
                <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--table-border)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {selectedSurveyor.notes}
                </div>
              )}

              {/* Actions */}
              {canManage && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '14px' }}>
                  <button onClick={() => openEditModal(selectedSurveyor)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Edit size={13} /> Edit
                  </button>
                  <button onClick={() => handleDelete(selectedSurveyor)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--danger)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Performance metrics */}
            {selectedSurveys.length > 0 && (() => {
              const totalDefects = selectedSurveys.reduce((sum, s) => sum + allDefects.filter(d => d.surveyId === s.id).length, 0)
              const avgDefects = selectedSurveys.length > 0 ? (totalDefects / selectedSurveys.length).toFixed(1) : '0'
              const lastSurveyDate = selectedSurveys.length > 0 ? selectedSurveys[0].surveyDate : null
              const daysSince = lastSurveyDate ? Math.floor((Date.now() - new Date(lastSurveyDate).getTime()) / 86400000) : null
              const sinceLabel = daysSince === null ? '—' : daysSince === 0 ? 'Today' : daysSince === 1 ? '1 day ago' : daysSince < 7 ? `${daysSince}d ago` : daysSince < 30 ? `${Math.floor(daysSince / 7)}w ago` : daysSince < 365 ? `${Math.floor(daysSince / 30)}mo ago` : `${Math.floor(daysSince / 365)}y ago`
              return (
                <div style={{ padding: '12px 20px', display: 'flex', gap: '20px', borderBottom: '1px solid var(--table-border)', fontSize: '0.78rem' }}>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Last survey: </span><strong>{sinceLabel}</strong></div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Avg defects: </span><strong>{avgDefects}</strong></div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Total surveys: </span><strong>{selectedSurveys.length}</strong></div>
                </div>
              )
            })()}

            {/* Survey history section */}
            <div style={{ padding: '16px 20px', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Survey History
                  {selectedSurveys.length > 0 && (
                    <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '8px', background: accentBg, color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.65rem' }}>{selectedSurveys.length}</span>
                  )}
                </div>
                {selectedSurveys.length > 0 && (() => {
                  const openCount = selectedSurveys.filter(s => {
                    const def = allDefects.filter(d => d.surveyId === s.id)
                    return def.some(d => d.status === 'OPEN')
                  }).length
                  return openCount > 0 ? (
                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '8px', background: openBg, color: openColor, fontWeight: 600, border: `1px solid ${isLight ? 'rgba(180,83,9,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
                      {openCount} open
                    </span>
                  ) : null
                })()}
              </div>

              {selectedSurveys.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <ClipboardList size={32} style={{ opacity: 0.2, display: 'block', margin: '0 auto 10px' }} />
                  No surveys recorded for this surveyor
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedSurveys.map(survey => {
                    const status = getSurveyStatus(survey.id)
                    const vesselName = getVesselName(survey.vesselId)
                    const typeName = getSurveyTypeName(survey.surveyType)
                    const defectCount = allDefects.filter(d => d.surveyId === survey.id).length

                    return (
                      <div
                        key={survey.id}
                        style={{
                          borderRadius: '10px',
                          border: `1px solid ${status.color === 'closed'
                            ? (isLight ? 'rgba(0,140,70,0.18)' : 'rgba(0,194,100,0.15)')
                            : (isLight ? 'rgba(180,83,9,0.2)' : 'rgba(245,158,11,0.18)')}`,
                          borderLeft: `3px solid ${status.color === 'closed' ? closedColor : openColor}`,
                          background: status.color === 'closed'
                            ? (isLight ? 'rgba(0,140,70,0.03)' : 'rgba(0,194,100,0.03)')
                            : (isLight ? 'rgba(180,83,9,0.03)' : 'rgba(245,158,11,0.03)'),
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        {/* Top row: vessel name + status */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                            {vesselName}
                          </div>
                          <StatusPill status={status} />
                        </div>

                        {/* Meta row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                            {formatDateShort(survey.surveyDate)}
                          </span>
                          {typeName && (
                            <span style={{ fontSize: '0.73rem', padding: '1px 7px', borderRadius: '4px', background: accentBg, border: `1px solid ${isLight ? 'rgba(26,115,232,0.12)' : 'rgba(0,210,255,0.12)'}`, color: 'var(--accent-primary)', fontWeight: 500 }}>
                              {typeName}
                            </span>
                          )}
                          {survey.location && (
                            <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <MapPin size={10} />{survey.location}
                            </span>
                          )}
                        </div>

                        {/* Defect summary */}
                        {defectCount > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{defectCount} defect{defectCount !== 1 ? 's' : ''}</span>
                            {status.open > 0 && (
                              <span style={{ color: openColor, fontWeight: 600 }}>{status.open} open</span>
                            )}
                            {status.closed > 0 && (
                              <span style={{ color: closedColor, fontWeight: 600 }}>{status.closed} closed</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={closeModal}>
          <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '16px', padding: '32px', width: '520px', maxWidth: '90vw', border: '1px solid var(--glass-border)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Anchor size={18} color="white" />
                </div>
                <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{editingId ? 'Edit Surveyor' : 'Add Surveyor'}</h3>
              </div>
              <button onClick={closeModal} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Company Name *</label>
                  <input type="text" value={formCompanyName} onChange={e => setFormCompanyName(e.target.value)} style={{ width: '100%' }} placeholder="e.g., Bureau Veritas" autoFocus={!editingId} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Country *</label>
                  <input type="text" value={formCountry} onChange={e => setFormCountry(e.target.value)} style={{ width: '100%' }} placeholder="e.g., France" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Contact Person</label>
                <input type="text" value={formContactPerson} onChange={e => setFormContactPerson(e.target.value)} style={{ width: '100%' }} placeholder="e.g., John Smith" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Contact Details</label>
                <textarea value={formContactDetails} onChange={e => setFormContactDetails(e.target.value)} rows={3} placeholder="Phone, email, address..." style={{ resize: 'vertical', width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Notes</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} placeholder="Additional notes..." style={{ resize: 'vertical', width: '100%' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button onClick={closeModal} className="btn-secondary">Cancel</button>
                <button
                  onClick={handleSubmit}
                  className="btn-primary"
                  disabled={!formCompanyName.trim() || !formCountry.trim() || isSubmitting}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {isSubmitting ? <Loader2 size={14} className="spinner" /> : <Save size={14} />}
                  {editingId ? 'Save Changes' : 'Add Surveyor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
