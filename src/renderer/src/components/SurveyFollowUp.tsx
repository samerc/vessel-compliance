import { useState, useEffect, useCallback, useRef } from 'react'
import { useRequestedSubTab, SubTabProps } from '../utils/useRequestedSubTab'
import {
  Bell,
  Check,
  AlertTriangle,
  RefreshCw,
  FileWarning,
  Ship,
  ChevronRight,
  Search,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  Download,
  CheckSquare
} from 'lucide-react'
import { PageHeader, Badge, Field, Modal, Tabs } from './ui'
import type { BadgeTone } from './ui'
import {
  SurveyWarranty,
  SurveyWarrantyReminder,
  WarrantyStatus,
  EndorsementDueRow
} from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatDateOrDash } from '../utils/dateUtils'
import { ok, isIpcError } from '../utils/ipc'

// Endorsement rows; snake_case fallbacks are read defensively for older rows
type EndorsementRow = EndorsementDueRow & {
  id?: string
  vessel_id?: string
  vessel_name?: string
  endorsement_reminder_date?: string
  survey_date?: string
  survey_type?: string | null
}

interface SurveyFollowUpProps extends SubTabProps {
  onNavigateToVessel?: (vesselId: string) => void
}

const STATUS_LABELS: Record<WarrantyStatus, string> = {
  pending: 'Pending',
  survey_done: 'Survey Carried Out',
  completed: 'Completed',
  waived: 'Waived'
}

const STATUS_TONES: Record<WarrantyStatus, BadgeTone> = {
  pending: 'warning',
  survey_done: 'info',
  completed: 'success',
  waived: 'neutral'
}

function calcDeadlineDate(inceptionDate: string, deadlineDays: number): Date {
  const d = new Date(inceptionDate)
  d.setDate(d.getDate() + deadlineDays)
  return d
}

function daysRemaining(deadlineDate: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

type UrgencyLevel = 'overdue' | 'urgent' | 'normal' | 'done'

function getUrgency(w: SurveyWarranty): UrgencyLevel {
  if (w.status === 'survey_done') return 'done'
  if (w.deadlineType === 'days' && w.deadlineDays && w.inceptionDate) {
    const remaining = daysRemaining(calcDeadlineDate(w.inceptionDate, w.deadlineDays))
    if (remaining < 0) return 'overdue'
    if (remaining <= 7) return 'urgent'
  }
  return 'normal'
}

const URGENCY_ORDER: Record<UrgencyLevel, number> = { overdue: 0, urgent: 1, normal: 2, done: 3 }

export default function SurveyFollowUp({
  onNavigateToVessel,
  subTab,
  subTabNonce
}: SurveyFollowUpProps): React.JSX.Element {
  const { user } = useAuth()
  const { showSuccess, showError } = useToast()

  const [warranties, setWarranties] = useState<SurveyWarranty[]>([])
  const [endorsementsDue, setEndorsementsDue] = useState<EndorsementRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')
  const [activeTab, setActiveTab] = useState<'warranties' | 'endorsements'>('warranties')
  useRequestedSubTab(subTab, subTabNonce, ['warranties', 'endorsements'] as const, setActiveTab)
  const [warrantySearch, setWarrantySearch] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [warrantyPage, setWarrantyPage] = useState(1)
  const ITEMS_PER_PAGE = 25
  const [wSortField, setWSortField] = useState<string>(
    () => localStorage.getItem('surveyFollowUp_sortField') || 'urgency'
  )
  const [wSortDir, setWSortDir] = useState<'asc' | 'desc'>(
    () => (localStorage.getItem('surveyFollowUp_sortDir') as 'asc' | 'desc') || 'asc'
  )
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('surveyFollowUp_colWidths') || '{}')
    } catch {
      return {}
    }
  })
  const resizingCol = useRef<{ key: string; startX: number; startW: number } | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const [expandedReminderId, setExpandedReminderId] = useState<string | null>(null)
  const [reminderHistory, setReminderHistory] = useState<Record<string, SurveyWarrantyReminder[]>>(
    {}
  )

  // Inline modals
  const [logReminderFor, setLogReminderFor] = useState<SurveyWarranty | null>(null)
  const [waiveFor, setWaiveFor] = useState<SurveyWarranty | null>(null)
  const [completeFor, setCompleteFor] = useState<SurveyWarranty | null>(null)

  // Reminder form
  const [reminderSentAt, setReminderSentAt] = useState('')
  const [reminderChannel, setReminderChannel] = useState<'email' | 'phone' | 'other'>('email')
  const [reminderReference, setReminderReference] = useState('')
  const [reminderNotes, setReminderNotes] = useState('')
  const [reminderNextDate, setReminderNextDate] = useState('')

  // Waive form
  const [waiveReason, setWaiveReason] = useState('')

  // Complete form
  const [completeNotes, setCompleteNotes] = useState('')

  const toggleSort = (field: string): void => {
    if (wSortField === field) {
      const next = wSortDir === 'asc' ? 'desc' : 'asc'
      setWSortDir(next)
      localStorage.setItem('surveyFollowUp_sortDir', next)
    } else {
      setWSortField(field)
      localStorage.setItem('surveyFollowUp_sortField', field)
      setWSortDir('asc')
      localStorage.setItem('surveyFollowUp_sortDir', 'asc')
    }
    setWarrantyPage(1)
  }

  const startResize = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const th = (e.target as HTMLElement).closest('th')
    if (!th) return
    resizingCol.current = { key, startX: e.clientX, startW: th.offsetWidth }
    const onMove = (me: MouseEvent): void => {
      if (!resizingCol.current) return
      const newW = Math.max(
        50,
        resizingCol.current.startW + (me.clientX - resizingCol.current.startX)
      )
      setColWidths((prev) => {
        const next = { ...prev, [key]: newW }
        localStorage.setItem('surveyFollowUp_colWidths', JSON.stringify(next))
        return next
      })
    }
    const onUp = (): void => {
      resizingCol.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const SortHeader = ({ field, label }: { field: string; label: string }): React.JSX.Element => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        cursor: 'pointer',
        userSelect: 'none'
      }}
      onClick={() => toggleSort(field)}
    >
      {label}
      {wSortField === field &&
        (wSortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDownIcon size={10} />)}
    </div>
  )

  const ResizeHandle = ({ colKey }: { colKey: string }): React.JSX.Element => (
    <div
      onMouseDown={(e) => startResize(colKey, e)}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '4px',
        cursor: 'col-resize',
        zIndex: 1
      }}
    />
  )

  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    const loadData = async (): Promise<void> => {
      setIsLoading(true)
      try {
        const [ws, eds] = await Promise.all([
          window.api.surveyWarrantyGetAll(),
          window.api.surveyWarrantyGetUnsentEndorsements()
        ])
        if (isIpcError(ws)) {
          showError('Failed to load warranties: ' + ws.message)
          setWarranties([])
        } else {
          setWarranties(Array.isArray(ws) ? ws : [])
        }
        setEndorsementsDue(Array.isArray(eds) ? eds : [])
      } catch (err) {
        showError('Failed to load data: ' + ((err instanceof Error && err.message) || err))
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [reloadKey, showError])
  const loadData = (): void => setReloadKey((k) => k + 1)

  const handleBulkMarkDone = async (): Promise<void> => {
    for (const id of selectedIds) {
      const w = warranties.find((ww) => ww.id === id)
      if (w && w.status === 'pending') {
        ok(await window.api.surveyWarrantyUpdate(id, { status: 'survey_done' }))
      }
    }
    setSelectedIds(new Set())
    setSelectMode(false)
    loadData()
  }

  const handleBulkComplete = async (): Promise<void> => {
    for (const id of selectedIds) {
      const w = warranties.find((ww) => ww.id === id)
      if (w && (w.status === 'pending' || w.status === 'survey_done')) {
        ok(await window.api.surveyWarrantyUpdate(id, { status: 'completed' }))
      }
    }
    setSelectedIds(new Set())
    setSelectMode(false)
    loadData()
  }

  const handleMarkEndorsementIssued = async (surveyId: string): Promise<void> => {
    try {
      await window.api.updateConditionSurveyEndorsement(surveyId, true)
      showSuccess('Endorsement marked as issued')
      loadData()
    } catch (err) {
      showError('Failed to update: ' + ((err instanceof Error && err.message) || err))
    }
  }

  const exportExcel = async (): Promise<void> => {
    const XLSX = (await import('xlsx-js-style')).default
    const data = allFiltered.map((w) => ({
      Vessel: w.vesselName || '',
      Description: w.description || '',
      Policy: w.policyTypeName || '',
      Deadline: w.deadlineDays ? calcDeadlineStr(w) : w.deadlineEvent || '',
      Status: w.status,
      Reminders: w.reminderCount || 0
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Warranties')
    XLSX.writeFile(wb, 'Survey Follow-Up.xlsx')
    showSuccess('Exported to Excel')
  }

  const calcDeadlineStr = (w: SurveyWarranty): string => {
    if (!w.inceptionDate || !w.deadlineDays) return ''
    const d = new Date(w.inceptionDate)
    d.setDate(d.getDate() + w.deadlineDays)
    return d.toISOString().split('T')[0]
  }

  const loadHistory = async (warrantyId: string): Promise<void> => {
    try {
      const data = await window.api.surveyWarrantyGetReminders(warrantyId)
      setReminderHistory((prev) => ({ ...prev, [warrantyId]: Array.isArray(data) ? data : [] }))
    } catch {
      /* ignore */
    }
  }

  const toggleHistory = async (warrantyId: string): Promise<void> => {
    if (expandedReminderId === warrantyId) {
      setExpandedReminderId(null)
    } else {
      setExpandedReminderId(warrantyId)
      await loadHistory(warrantyId)
    }
  }

  const handleMarkSurveyDone = async (w: SurveyWarranty): Promise<void> => {
    try {
      await window.api.surveyWarrantyUpdate(w.id, { status: 'survey_done' })
      showSuccess('Marked as Survey Carried Out')
      loadData()
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed')
    }
  }

  const handleComplete = async (): Promise<void> => {
    if (!completeFor) return
    try {
      ok(
        await window.api.surveyWarrantyUpdate(completeFor.id, {
          status: 'completed',
          completionNotes: completeNotes.trim() || null,
          completedAt: new Date().toISOString()
        })
      )
      showSuccess('Warranty completed')
      setCompleteFor(null)
      setCompleteNotes('')
      loadData()
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed')
    }
  }

  const handleWaive = async (): Promise<void> => {
    if (!waiveFor || !waiveReason.trim()) {
      showError('Waiver reason is required')
      return
    }
    try {
      await window.api.surveyWarrantyWaive(waiveFor.id, waiveReason.trim())
      showSuccess('Warranty waived')
      setWaiveFor(null)
      setWaiveReason('')
      loadData()
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed')
    }
  }

  const openLogReminder = (w: SurveyWarranty): void => {
    setLogReminderFor(w)
    setReminderSentAt(new Date().toISOString().split('T')[0])
    setReminderChannel('email')
    setReminderReference('')
    setReminderNotes('')
    setReminderNextDate('')
  }

  const handleLogReminder = async (): Promise<void> => {
    if (!logReminderFor || !reminderSentAt) {
      showError('Sent date is required')
      return
    }
    try {
      await window.api.surveyWarrantyLogReminder({
        warrantyId: logReminderFor.id,
        sentAt: reminderSentAt,
        channel: reminderChannel,
        reference: reminderReference.trim() || null,
        notes: reminderNotes.trim() || null,
        nextReminderDate: reminderNextDate || null,
        loggedBy: user?.id || null
      })
      showSuccess('Reminder logged')
      await loadHistory(logReminderFor.id)
      setLogReminderFor(null)
      loadData()
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed')
    }
  }

  // Filtered + sorted warranties
  const allFiltered = warranties
    .filter((w) =>
      statusFilter === 'active' ? w.status === 'pending' || w.status === 'survey_done' : true
    )
    .filter((w) => {
      if (!warrantySearch.trim()) return true
      const q = warrantySearch.toLowerCase()
      return (
        (w.vesselName || '').toLowerCase().includes(q) ||
        (w.description || '').toLowerCase().includes(q) ||
        (w.policyTypeName || '').toLowerCase().includes(q) ||
        (w.imoNumber || '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      let cmp = 0
      if (wSortField === 'urgency') {
        cmp = URGENCY_ORDER[getUrgency(a)] - URGENCY_ORDER[getUrgency(b)]
        if (cmp === 0) cmp = (a.vesselName || '').localeCompare(b.vesselName || '')
      } else if (wSortField === 'vessel') {
        cmp = (a.vesselName || '').localeCompare(b.vesselName || '')
      } else if (wSortField === 'warranty') {
        cmp = (a.description || '').localeCompare(b.description || '')
      } else if (wSortField === 'policy') {
        cmp = (a.policyTypeName || '').localeCompare(b.policyTypeName || '')
      } else if (wSortField === 'deadline') {
        const aD =
          a.deadlineDays && a.inceptionDate
            ? calcDeadlineDate(a.inceptionDate, a.deadlineDays).getTime()
            : 0
        const bD =
          b.deadlineDays && b.inceptionDate
            ? calcDeadlineDate(b.inceptionDate, b.deadlineDays).getTime()
            : 0
        cmp = aD - bD
      } else if (wSortField === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '')
      } else if (wSortField === 'reminders') {
        cmp = (a.reminderCount ?? 0) - (b.reminderCount ?? 0)
      }
      return wSortDir === 'asc' ? cmp : -cmp
    })
  const totalPages = Math.ceil(allFiltered.length / ITEMS_PER_PAGE)
  const filteredWarranties = allFiltered.slice(
    (warrantyPage - 1) * ITEMS_PER_PAGE,
    warrantyPage * ITEMS_PER_PAGE
  )

  // Active counts for badge
  const activeCount = warranties.filter(
    (w) => w.status === 'pending' || w.status === 'survey_done'
  ).length
  const overdueCount = warranties.filter((w) => getUrgency(w) === 'overdue').length

  const renderUrgencyPill = (w: SurveyWarranty): React.JSX.Element | null => {
    if (w.deadlineType !== 'days' || !w.deadlineDays || !w.inceptionDate) return null
    if (w.status !== 'pending' && w.status !== 'survey_done') return null
    const remaining = daysRemaining(calcDeadlineDate(w.inceptionDate, w.deadlineDays))
    const isOverdue = remaining < 0
    const isUrgent = remaining >= 0 && remaining <= 7
    if (!isOverdue && !isUrgent) return null
    return (
      <Badge tone={isOverdue ? 'danger' : 'warning'} style={{ flexShrink: 0 }}>
        <AlertTriangle size={10} />
        {isOverdue ? `${Math.abs(remaining)}d overdue` : `${remaining}d left`}
      </Badge>
    )
  }

  return (
    <div className="fade-in page">
      <PageHeader
        icon={<FileWarning size={26} />}
        title="Survey Follow-Up"
        subtitle="Track condition survey warranties and endorsement reminders"
        actions={
          <>
            {overdueCount > 0 && (
              <Badge tone="danger">
                <AlertTriangle size={12} /> {overdueCount} overdue
              </Badge>
            )}
            <button onClick={loadData} disabled={isLoading} className="btn-secondary btn-sm">
              <RefreshCw size={14} className={isLoading ? 'spinner' : undefined} />
              Refresh
            </button>
          </>
        }
      />

      {/* Summary stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '24px'
        }}
      >
        {[
          { label: 'Active', value: activeCount, color: 'var(--warning)' },
          { label: 'Overdue', value: overdueCount, color: 'var(--danger)' },
          {
            label: 'Survey Carried Out',
            value: warranties.filter((w) => w.status === 'survey_done').length,
            color: 'var(--info)'
          },
          {
            label: 'Unsent Endorsements',
            value: endorsementsDue.length,
            color: 'var(--warning)'
          }
        ].map((s) => (
          <div
            key={s.label}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              background: `color-mix(in srgb, ${s.color} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${s.color} 18%, transparent)`
            }}
          >
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: s.color, lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <Tabs
        items={[
          {
            key: 'warranties',
            label: 'Warranties',
            icon: <FileWarning size={15} />,
            count: activeCount > 0 ? activeCount : undefined
          },
          {
            key: 'endorsements',
            label: 'Endorsements',
            icon: <Bell size={15} />,
            count: endorsementsDue.length > 0 ? endorsementsDue.length : undefined
          }
        ]}
        value={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: '16px' }}
      />

      {/* ── Survey Warranties Tab ─────────────────────────────────── */}
      {activeTab === 'warranties' && (
        <div className="glass-card" style={{ padding: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['active', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setStatusFilter(f)
                    setWarrantyPage(1)
                  }}
                  className={statusFilter === f ? 'btn-primary' : 'btn-secondary'}
                  style={{ fontSize: '0.78rem', padding: '4px 12px' }}
                >
                  {f === 'active' ? 'Active' : 'All'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-secondary)'
                  }}
                />
                <input
                  type="text"
                  value={warrantySearch}
                  onChange={(e) => {
                    setWarrantySearch(e.target.value)
                    setWarrantyPage(1)
                  }}
                  placeholder="Search vessels or warranties..."
                  style={{ paddingLeft: '28px', width: '220px' }}
                />
              </div>
              <button
                onClick={() => {
                  setSelectMode(!selectMode)
                  setSelectedIds(new Set())
                }}
                className={selectMode ? 'btn-primary' : 'btn-secondary'}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <CheckSquare size={14} /> {selectMode ? 'Done' : 'Bulk select'}
              </button>
              <button
                onClick={exportExcel}
                className="btn-secondary"
                style={{
                  padding: '6px 12px',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Download size={14} /> Excel
              </button>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectMode && selectedIds.size > 0 && (
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(var(--accent-primary-rgb), 0.06)',
                border: '1px solid rgba(var(--accent-primary-rgb), 0.2)',
                alignItems: 'center'
              }}
            >
              <span
                style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-primary)' }}
              >
                {selectedIds.size} selected
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleBulkMarkDone}
                className="btn-secondary"
                style={{ padding: '5px 12px', fontSize: '0.75rem' }}
              >
                Mark Done
              </button>
              <button
                onClick={handleBulkComplete}
                className="btn-primary"
                style={{ padding: '5px 12px', fontSize: '0.75rem' }}
              >
                Complete
              </button>
              <button
                onClick={() => {
                  setSelectedIds(new Set())
                  setSelectMode(false)
                }}
                className="btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.75rem' }}
              >
                Clear
              </button>
            </div>
          )}

          {isLoading ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem'
              }}
            >
              Loading…
            </div>
          ) : filteredWarranties.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem'
              }}
            >
              {statusFilter === 'active' ? 'No active warranties.' : 'No warranties found.'}
            </div>
          ) : (
            <div className="table-wrap">
              <table ref={tableRef} className="data-table" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  {[
                    { key: 'vessel', def: '14%' },
                    { key: 'warranty', def: '24%' },
                    { key: 'policy', def: '7%' },
                    { key: 'deadline', def: '13%' },
                    { key: 'status', def: '9%' },
                    { key: 'reminders', def: '13%' },
                    { key: 'actions', def: '20%' }
                  ].map((c) => (
                    <col
                      key={c.key}
                      style={{ width: colWidths[c.key] ? `${colWidths[c.key]}px` : c.def }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {[
                      { key: 'vessel', label: 'Vessel' },
                      { key: 'warranty', label: 'Warranty' },
                      { key: 'policy', label: 'Policy' },
                      { key: 'deadline', label: 'Deadline' },
                      { key: 'status', label: 'Status' },
                      { key: 'reminders', label: 'Reminders' },
                      { key: 'actions', label: 'Actions' }
                    ].map((h) => (
                      <th key={h.key}>
                        {h.key !== 'actions' ? (
                          <SortHeader field={h.key} label={h.label} />
                        ) : (
                          h.label
                        )}
                        <ResizeHandle colKey={h.key} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredWarranties.map((w) => {
                    const urgency = getUrgency(w)
                    const rowBg =
                      urgency === 'overdue'
                        ? 'color-mix(in srgb, var(--danger) 4%, transparent)'
                        : urgency === 'urgent'
                          ? 'color-mix(in srgb, var(--warning) 4%, transparent)'
                          : undefined
                    const isHistoryExpanded = expandedReminderId === w.id
                    // The history row continues this row, so no divider between them
                    const hbStyle = isHistoryExpanded ? { borderBottom: 'none' } : undefined
                    const history = reminderHistory[w.id]

                    return (
                      <>
                        <tr key={w.id} style={{ background: rowBg }}>
                          {/* Bulk select checkbox */}
                          {selectMode && (
                            <td style={{ width: '24px', ...hbStyle }}>
                              {(w.status === 'pending' || w.status === 'survey_done') && (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(w.id)}
                                  onChange={() =>
                                    setSelectedIds((prev) => {
                                      const n = new Set(prev)
                                      if (n.has(w.id)) n.delete(w.id)
                                      else n.add(w.id)
                                      return n
                                    })
                                  }
                                  style={{ accentColor: 'var(--accent-primary)' }}
                                />
                              )}
                            </td>
                          )}
                          {/* Vessel */}
                          <td style={{ overflow: 'hidden', ...hbStyle }}>
                            {onNavigateToVessel ? (
                              <button
                                onClick={() => onNavigateToVessel(w.vesselId)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--accent-primary)',
                                  cursor: 'pointer',
                                  fontWeight: '600',
                                  padding: 0,
                                  fontSize: 'inherit',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: 'block',
                                  maxWidth: '100%'
                                }}
                              >
                                {w.vesselName || '—'}
                              </button>
                            ) : (
                              <span style={{ fontWeight: '600' }}>{w.vesselName || '—'}</span>
                            )}
                            {w.imoNumber && (
                              <div
                                className="mono"
                                style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}
                              >
                                {w.imoNumber}
                              </div>
                            )}
                          </td>

                          {/* Warranty description */}
                          <td style={{ overflow: 'hidden', ...hbStyle }}>
                            <div
                              style={{
                                fontWeight: '500',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {w.description}
                            </div>
                            {w.notes && (
                              <div
                                style={{
                                  fontSize: '0.68rem',
                                  color: 'var(--text-secondary)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontStyle: 'italic'
                                }}
                              >
                                {w.notes}
                              </div>
                            )}
                          </td>

                          {/* Policy */}
                          <td className="muted" style={hbStyle}>
                            {w.policyTypeName || '—'}
                          </td>

                          {/* Deadline */}
                          <td style={hbStyle}>
                            {w.deadlineType === 'days' && w.deadlineDays && w.inceptionDate ? (
                              <div>
                                <div
                                  style={{
                                    fontSize: '0.78rem',
                                    color: 'var(--text-primary)',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {formatDateOrDash(
                                    calcDeadlineDate(w.inceptionDate, w.deadlineDays)
                                      .toISOString()
                                      .split('T')[0]
                                  )}
                                </div>
                                {renderUrgencyPill(w)}
                              </div>
                            ) : w.deadlineType === 'event' ? (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {w.deadlineEvent}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* Status */}
                          <td style={hbStyle}>
                            <Badge tone={STATUS_TONES[w.status]}>{STATUS_LABELS[w.status]}</Badge>
                          </td>

                          {/* Reminders */}
                          <td style={hbStyle}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.78rem'
                              }}
                            >
                              <Bell size={11} style={{ color: 'var(--text-secondary)' }} />
                              <span style={{ color: 'var(--text-secondary)' }}>
                                {w.reminderCount ?? 0}
                              </span>
                              {w.nextReminderDate &&
                                (w.status === 'pending' || w.status === 'survey_done') && (
                                  <span style={{ fontSize: '0.68rem', color: 'var(--warning)' }}>
                                    → {formatDateOrDash(w.nextReminderDate)}
                                  </span>
                                )}
                            </div>
                            <button
                              onClick={() => toggleHistory(w.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--accent-primary)',
                                fontSize: '0.68rem',
                                padding: '1px 0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px'
                              }}
                            >
                              <ChevronRight
                                size={9}
                                style={{
                                  transform: isHistoryExpanded ? 'rotate(90deg)' : 'none',
                                  transition: 'transform 0.15s'
                                }}
                              />
                              History
                            </button>
                          </td>

                          {/* Actions */}
                          <td style={hbStyle}>
                            <div
                              style={{
                                display: 'flex',
                                gap: '4px',
                                flexWrap: 'nowrap',
                                alignItems: 'center'
                              }}
                            >
                              {(w.status === 'pending' || w.status === 'survey_done') && (
                                <button
                                  onClick={() => openLogReminder(w)}
                                  className="btn-secondary"
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '2px 7px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                  title="Log Reminder"
                                >
                                  <Bell size={11} /> Remind
                                </button>
                              )}
                              {w.status === 'pending' && (
                                <button
                                  onClick={() => handleMarkSurveyDone(w)}
                                  className="btn-secondary"
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '2px 7px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    color: 'var(--info)',
                                    borderColor: 'color-mix(in srgb, var(--info) 35%, transparent)'
                                  }}
                                  title="Mark survey received"
                                >
                                  <Check size={11} /> Done
                                </button>
                              )}
                              {w.status === 'survey_done' && (
                                <button
                                  onClick={() => {
                                    setCompleteFor(w)
                                    setCompleteNotes('')
                                  }}
                                  className="btn-secondary"
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '2px 7px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    color: 'var(--success)',
                                    borderColor:
                                      'color-mix(in srgb, var(--success) 35%, transparent)'
                                  }}
                                  title="Mark complete"
                                >
                                  <Check size={11} /> Complete
                                </button>
                              )}
                              {(w.status === 'pending' || w.status === 'survey_done') && (
                                <button
                                  onClick={() => {
                                    setWaiveFor(w)
                                    setWaiveReason('')
                                  }}
                                  className="btn-secondary"
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '2px 7px',
                                    color: 'var(--text-secondary)'
                                  }}
                                  title="Waive"
                                >
                                  Waive
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Reminder history row */}
                        {isHistoryExpanded && (
                          <tr key={`${w.id}-history`} style={{ background: rowBg }}>
                            <td
                              colSpan={7}
                              style={{
                                padding: '0 12px 12px 32px'
                              }}
                            >
                              {!history ? (
                                <div
                                  style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--text-secondary)',
                                    padding: '8px 0'
                                  }}
                                >
                                  Loading…
                                </div>
                              ) : history.length === 0 ? (
                                <div
                                  style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--text-secondary)',
                                    padding: '8px 0',
                                    fontStyle: 'italic'
                                  }}
                                >
                                  No reminders logged.
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '5px',
                                    paddingTop: '8px'
                                  }}
                                >
                                  {history.map((r) => (
                                    <div
                                      key={r.id}
                                      style={{
                                        fontSize: '0.8rem',
                                        padding: '6px 10px',
                                        borderRadius: '7px',
                                        background: 'var(--bg-card-hover)'
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '10px',
                                          flexWrap: 'wrap'
                                        }}
                                      >
                                        <span
                                          style={{
                                            color: 'var(--text-secondary)',
                                            fontSize: '0.7rem'
                                          }}
                                        >
                                          Sent:
                                        </span>
                                        <span style={{ fontWeight: '700', whiteSpace: 'nowrap' }}>
                                          {formatDateOrDash(r.sentAt)}
                                        </span>
                                        <span
                                          style={{
                                            padding: '1px 6px',
                                            borderRadius: '5px',
                                            fontSize: '0.7rem',
                                            background:
                                              'color-mix(in srgb, var(--info) 12%, transparent)',
                                            color: 'var(--info)',
                                            textTransform: 'uppercase'
                                          }}
                                        >
                                          {r.channel}
                                        </span>
                                        {r.reference && (
                                          <span
                                            style={{
                                              padding: '1px 7px',
                                              borderRadius: '5px',
                                              fontSize: '0.7rem',
                                              background: 'var(--bg-card-hover)',
                                              color: 'var(--text-primary)',
                                              fontFamily: 'var(--font-mono)',
                                              fontWeight: '600'
                                            }}
                                          >
                                            Ref: {r.reference}
                                          </span>
                                        )}
                                        {r.nextReminderDate && (
                                          <span
                                            style={{
                                              fontSize: '0.74rem',
                                              color: 'var(--warning)',
                                              whiteSpace: 'nowrap',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '3px',
                                              marginLeft: 'auto'
                                            }}
                                          >
                                            <Bell size={10} /> Next:{' '}
                                            {formatDateOrDash(r.nextReminderDate)}
                                          </span>
                                        )}
                                        {r.loggedByName && (
                                          <span
                                            style={{
                                              fontSize: '0.72rem',
                                              color: 'var(--text-secondary)',
                                              whiteSpace: 'nowrap'
                                            }}
                                          >
                                            by {r.loggedByName}
                                          </span>
                                        )}
                                      </div>
                                      {r.notes && (
                                        <div
                                          style={{
                                            marginTop: '3px',
                                            color: 'var(--text-secondary)',
                                            fontSize: '0.76rem'
                                          }}
                                        >
                                          {r.notes}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid var(--table-border)'
              }}
            >
              <button
                disabled={warrantyPage <= 1}
                onClick={() => setWarrantyPage((p) => p - 1)}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              >
                Previous
              </button>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Page {warrantyPage} of {totalPages} ({allFiltered.length} items)
              </span>
              <button
                disabled={warrantyPage >= totalPages}
                onClick={() => setWarrantyPage((p) => p + 1)}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Endorsements Tab ─────────────────────────────────────── */}
      {activeTab === 'endorsements' &&
        (() => {
          const dueTodayYmd = new Date().toISOString().split('T')[0]
          const remYmd = (v: string | null | undefined): string =>
            v ? new Date(v).toISOString().split('T')[0] : ''
          return (
            <div className="glass-card" style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Reservations endorsements not yet sent.{' '}
                <strong style={{ color: 'var(--warning)' }}>DUE</strong> means the reminder date has
                arrived; <strong>Upcoming</strong> is still within the reminder window. Mark issued
                once you send it.
              </p>
              {endorsementsDue.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem'
                  }}
                >
                  No unsent endorsements.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      {[
                        { key: 'e_vessel', def: '20%' },
                        { key: 'e_ref', def: '12%' },
                        { key: 'e_date', def: '13%' },
                        { key: 'e_type', def: '12%' },
                        { key: 'e_reminder', def: '15%' },
                        { key: 'e_status', def: '11%' },
                        { key: 'e_action', def: '17%' }
                      ].map((c) => (
                        <col
                          key={c.key}
                          style={{ width: colWidths[c.key] ? `${colWidths[c.key]}px` : c.def }}
                        />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {[
                          { key: 'e_vessel', label: 'Vessel' },
                          { key: 'e_ref', label: 'Reference' },
                          { key: 'e_date', label: 'Survey Date' },
                          { key: 'e_type', label: 'Type' },
                          { key: 'e_reminder', label: 'Reminder Date' },
                          { key: 'e_status', label: 'Status' },
                          { key: 'e_action', label: 'Action' }
                        ].map((h) => (
                          <th key={h.key}>
                            {h.label}
                            <ResizeHandle colKey={h.key} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {endorsementsDue.map((e) => {
                        const isDue =
                          remYmd(e.endorsementReminderDate || e.endorsement_reminder_date) <=
                          dueTodayYmd
                        return (
                          <tr key={e.surveyId || e.id}>
                            <td>
                              <div
                                style={{
                                  fontWeight: '600',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px'
                                }}
                              >
                                <Ship size={13} style={{ color: 'var(--text-secondary)' }} />
                                {onNavigateToVessel ? (
                                  <button
                                    onClick={() => onNavigateToVessel(e.vesselId)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--accent-primary)',
                                      cursor: 'pointer',
                                      fontWeight: '600',
                                      padding: 0,
                                      fontSize: 'inherit',
                                      textAlign: 'left'
                                    }}
                                  >
                                    {e.vesselName || e.vessel_name || '—'}
                                  </button>
                                ) : (
                                  e.vesselName || e.vessel_name || '—'
                                )}
                              </div>
                            </td>
                            <td>
                              {e.reference ? (
                                <span
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontWeight: 600,
                                    color: 'var(--accent-primary)'
                                  }}
                                >
                                  {e.reference}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>—</span>
                              )}
                            </td>
                            <td className="muted">
                              {formatDateOrDash(e.surveyDate || e.survey_date)}
                            </td>
                            <td className="muted">{e.surveyType || e.survey_type || '—'}</td>
                            <td>
                              <span
                                style={{
                                  color: isDue ? 'var(--warning)' : 'var(--text-secondary)',
                                  fontWeight: '600',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <Bell size={12} />
                                {formatDateOrDash(
                                  e.endorsementReminderDate || e.endorsement_reminder_date
                                )}
                              </span>
                            </td>
                            <td>
                              <Badge tone={isDue ? 'warning' : 'neutral'}>
                                {isDue ? 'Due' : 'Upcoming'}
                              </Badge>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => handleMarkEndorsementIssued(e.surveyId || e.id!)}
                                  className="btn-primary"
                                  style={{
                                    fontSize: '0.78rem',
                                    padding: '4px 10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="Mark this reservations endorsement as issued"
                                >
                                  <Check size={12} /> Mark Issued
                                </button>
                                {onNavigateToVessel && (
                                  <button
                                    onClick={() => onNavigateToVessel(e.vesselId || e.vessel_id!)}
                                    className="btn-secondary"
                                    style={{
                                      fontSize: '0.78rem',
                                      padding: '4px 10px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    <Ship size={12} /> View
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })()}

      {/* ── Log Reminder Modal ───────────────────────────────────── */}
      {logReminderFor && (
        <Modal
          title="Log Reminder"
          icon={<Bell size={18} />}
          onClose={() => setLogReminderFor(null)}
          width={440}
          closeOnOverlay={false}
          footer={
            <>
              <button onClick={() => setLogReminderFor(null)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleLogReminder} className="btn-primary">
                Log Reminder
              </button>
            </>
          }
        >
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
            {logReminderFor.vesselName} — {logReminderFor.description}
          </p>
          <div className="form-grid">
            <Field label="Sent on" required>
              <input
                type="date"
                value={reminderSentAt}
                onChange={(e) => setReminderSentAt(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Channel">
              <select
                value={reminderChannel}
                onChange={(e) => setReminderChannel(e.target.value as typeof reminderChannel)}
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Reference" hint="e.g. email subject / survey ref" span="all">
              <input
                value={reminderReference}
                onChange={(e) => setReminderReference(e.target.value)}
                placeholder="Optional — helps locate the email later"
              />
            </Field>
            <Field label="Notes" span="all">
              <input
                value={reminderNotes}
                onChange={(e) => setReminderNotes(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Next reminder date">
              <input
                type="date"
                value={reminderNextDate}
                onChange={(e) => setReminderNextDate(e.target.value)}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── Waive Modal ──────────────────────────────────────────── */}
      {waiveFor && (
        <Modal
          title="Waive Warranty"
          onClose={() => setWaiveFor(null)}
          width={400}
          closeOnOverlay={false}
          footer={
            <>
              <button onClick={() => setWaiveFor(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleWaive}
                disabled={!waiveReason.trim()}
                className="btn-secondary"
                style={{
                  color: 'var(--warning)',
                  borderColor: 'color-mix(in srgb, var(--warning) 35%, transparent)',
                  background: 'color-mix(in srgb, var(--warning) 15%, transparent)'
                }}
              >
                Waive
              </button>
            </>
          }
        >
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
            {waiveFor.vesselName} — {waiveFor.description}
          </p>
          <div className="form-grid">
            <Field label="Waiver reason" required span="all">
              <textarea
                value={waiveReason}
                onChange={(e) => setWaiveReason(e.target.value)}
                placeholder="Explain why this warranty is being waived…"
                rows={4}
                style={{ resize: 'vertical' }}
                autoFocus
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── Complete Modal ───────────────────────────────────────── */}
      {completeFor && (
        <Modal
          title="Complete Warranty"
          icon={<Check size={18} />}
          onClose={() => setCompleteFor(null)}
          width={400}
          closeOnOverlay={false}
          footer={
            <>
              <button onClick={() => setCompleteFor(null)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleComplete} className="btn-primary">
                Mark Complete
              </button>
            </>
          }
        >
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
            {completeFor.vesselName} — {completeFor.description}
          </p>
          <div className="form-grid">
            <Field label="Completion notes (optional)" span="all">
              <textarea
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="Any notes on completion…"
                rows={3}
                style={{ resize: 'vertical' }}
                autoFocus
              />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}
