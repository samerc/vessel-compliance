import { useState, useEffect } from 'react'
import { Bell, Check, AlertTriangle, Clock, RefreshCw, X, FileWarning, Ship, ChevronRight } from 'lucide-react'
import { SurveyWarranty, SurveyWarrantyReminder, WarrantyStatus } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'

interface SurveyFollowUpProps {
  onNavigateToVessel?: (vesselId: string) => void
}

const STATUS_LABELS: Record<WarrantyStatus, string> = {
  pending: 'Pending',
  survey_done: 'Survey Done',
  completed: 'Completed',
  waived: 'Waived'
}

const STATUS_COLORS: Record<WarrantyStatus, { bg: string; color: string }> = {
  pending: { bg: 'rgba(255,165,0,0.12)', color: '#e6a800' },
  survey_done: { bg: 'rgba(0,170,255,0.12)', color: '#00aaff' },
  completed: { bg: 'rgba(0,200,100,0.12)', color: '#00c864' },
  waived: { bg: 'rgba(128,128,128,0.1)', color: '#888' }
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

function formatDate(s?: string | null): string {
  if (!s) return '-'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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

export default function SurveyFollowUp({ onNavigateToVessel }: SurveyFollowUpProps) {
  const { user } = useAuth()
  const { theme } = useTheme()
  const { showSuccess, showError } = useToast()
  const isLight = theme === 'light'

  const [warranties, setWarranties] = useState<SurveyWarranty[]>([])
  const [endorsementsDue, setEndorsementsDue] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')
  const [expandedReminderId, setExpandedReminderId] = useState<string | null>(null)
  const [reminderHistory, setReminderHistory] = useState<Record<string, SurveyWarrantyReminder[]>>({})

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

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [ws, eds] = await Promise.all([
        window.api.surveyWarrantyGetAll(),
        window.api.surveyWarrantyGetEndorsementsDue()
      ])
      if (ws && (ws as any).error) {
        showError('Failed to load warranties: ' + (ws as any).message)
        setWarranties([])
      } else {
        setWarranties(Array.isArray(ws) ? ws : [])
      }
      setEndorsementsDue(Array.isArray(eds) ? eds : [])
    } catch (err: any) {
      showError('Failed to load data: ' + (err.message || err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const loadHistory = async (warrantyId: string) => {
    try {
      const data = await window.api.surveyWarrantyGetReminders(warrantyId)
      setReminderHistory(prev => ({ ...prev, [warrantyId]: Array.isArray(data) ? data : [] }))
    } catch { /* ignore */ }
  }

  const toggleHistory = async (warrantyId: string) => {
    if (expandedReminderId === warrantyId) {
      setExpandedReminderId(null)
    } else {
      setExpandedReminderId(warrantyId)
      await loadHistory(warrantyId)
    }
  }

  const handleMarkSurveyDone = async (w: SurveyWarranty) => {
    try {
      await window.api.surveyWarrantyUpdate(w.id, { status: 'survey_done' })
      showSuccess('Marked as Survey Done')
      loadData()
    } catch (err: any) { showError(err.message || 'Failed') }
  }

  const handleComplete = async () => {
    if (!completeFor) return
    try {
      await window.api.surveyWarrantyUpdate(completeFor.id, {
        status: 'completed',
        completionNotes: completeNotes.trim() || null,
        completedAt: new Date().toISOString()
      })
      showSuccess('Warranty completed')
      setCompleteFor(null)
      setCompleteNotes('')
      loadData()
    } catch (err: any) { showError(err.message || 'Failed') }
  }

  const handleWaive = async () => {
    if (!waiveFor || !waiveReason.trim()) { showError('Waiver reason is required'); return }
    try {
      await window.api.surveyWarrantyWaive(waiveFor.id, waiveReason.trim())
      showSuccess('Warranty waived')
      setWaiveFor(null)
      setWaiveReason('')
      loadData()
    } catch (err: any) { showError(err.message || 'Failed') }
  }

  const openLogReminder = (w: SurveyWarranty) => {
    setLogReminderFor(w)
    setReminderSentAt(new Date().toISOString().split('T')[0])
    setReminderChannel('email')
    setReminderReference('')
    setReminderNotes('')
    setReminderNextDate('')
  }

  const handleLogReminder = async () => {
    if (!logReminderFor || !reminderSentAt) { showError('Sent date is required'); return }
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
    } catch (err: any) { showError(err.message || 'Failed') }
  }

  // Filtered + sorted warranties
  const filteredWarranties = warranties
    .filter(w => statusFilter === 'active' ? (w.status === 'pending' || w.status === 'survey_done') : true)
    .sort((a, b) => {
      const ua = URGENCY_ORDER[getUrgency(a)]
      const ub = URGENCY_ORDER[getUrgency(b)]
      if (ua !== ub) return ua - ub
      return (a.vesselName || '').localeCompare(b.vesselName || '')
    })

  // Active counts for badge
  const activeCount = warranties.filter(w => w.status === 'pending' || w.status === 'survey_done').length
  const overdueCount = warranties.filter(w => getUrgency(w) === 'overdue').length

  // ── Styles ──────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem',
    border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)'
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block'
  }
  const modalBg: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 1100
  }
  const modalCard: React.CSSProperties = {
    background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '16px',
    padding: '24px', width: '440px', maxWidth: '92vw',
    border: '1px solid var(--glass-border)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
    maxHeight: '85vh', overflowY: 'auto'
  }

  const renderUrgencyPill = (w: SurveyWarranty) => {
    if (w.deadlineType !== 'days' || !w.deadlineDays || !w.inceptionDate) return null
    if (w.status !== 'pending' && w.status !== 'survey_done') return null
    const remaining = daysRemaining(calcDeadlineDate(w.inceptionDate, w.deadlineDays))
    const isOverdue = remaining < 0
    const isUrgent = remaining >= 0 && remaining <= 7
    if (!isOverdue && !isUrgent) return null
    return (
      <span style={{
        padding: '2px 8px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: '700',
        background: isOverdue ? 'rgba(255,77,77,0.15)' : 'rgba(255,165,0,0.15)',
        color: isOverdue ? 'var(--danger)' : '#e6a800',
        display: 'flex', alignItems: 'center', gap: '3px'
      }}>
        <AlertTriangle size={10} />
        {isOverdue ? `${Math.abs(remaining)}d overdue` : `${remaining}d left`}
      </span>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <FileWarning size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '700' }}>Survey Follow-Up</h1>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Track condition survey warranties and endorsement reminders
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {overdueCount > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: '700',
              background: 'rgba(255,77,77,0.15)', color: 'var(--danger)',
              display: 'flex', alignItems: 'center', gap: '5px'
            }}>
              <AlertTriangle size={13} /> {overdueCount} overdue
            </span>
          )}
          <button
            onClick={loadData}
            disabled={isLoading}
            className="btn-secondary"
            style={{ fontSize: '0.82rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Active', value: activeCount, color: '#e6a800', bg: 'rgba(255,165,0,0.08)' },
          { label: 'Overdue', value: overdueCount, color: 'var(--danger)', bg: 'rgba(255,77,77,0.08)' },
          { label: 'Survey Done', value: warranties.filter(w => w.status === 'survey_done').length, color: '#00aaff', bg: 'rgba(0,170,255,0.08)' },
          { label: 'Endorsements Due', value: endorsementsDue.length, color: '#e6a800', bg: 'rgba(255,165,0,0.08)' }
        ].map(s => (
          <div key={s.label} style={{
            padding: '14px 16px', borderRadius: '10px', background: s.bg,
            border: `1px solid ${s.bg.replace('0.08', '0.18')}`
          }}>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Survey Warranties Section ─────────────────────────────── */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileWarning size={16} style={{ color: 'var(--accent-primary)' }} />
            Survey Warranties
            {activeCount > 0 && (
              <span style={{ padding: '1px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '700', background: 'rgba(255,165,0,0.15)', color: '#e6a800' }}>
                {activeCount}
              </span>
            )}
          </h2>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['active', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={statusFilter === f ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: '0.78rem', padding: '4px 12px' }}
              >
                {f === 'active' ? 'Active' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading…</div>
        ) : filteredWarranties.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {statusFilter === 'active' ? 'No active warranties.' : 'No warranties found.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--table-border)' }}>
                  {['Vessel', 'Warranty', 'Policy', 'Deadline', 'Status', 'Reminders', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredWarranties.map((w, idx) => {
                  const sc = STATUS_COLORS[w.status]
                  const urgency = getUrgency(w)
                  const rowBg = urgency === 'overdue'
                    ? 'rgba(255,77,77,0.04)'
                    : urgency === 'urgent'
                      ? 'rgba(255,165,0,0.04)'
                      : idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.01)')
                  const isHistoryExpanded = expandedReminderId === w.id
                  const history = reminderHistory[w.id]

                  return (
                    <>
                      <tr key={w.id} style={{ background: rowBg, borderBottom: isHistoryExpanded ? 'none' : '1px solid var(--table-border)' }}>
                        {/* Vessel */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Ship size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                            {onNavigateToVessel ? (
                              <button
                                onClick={() => onNavigateToVessel(w.vesselId)}
                                style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: '600', padding: 0, fontSize: '0.85rem' }}
                              >
                                {w.vesselName || '—'}
                              </button>
                            ) : (
                              <span style={{ fontWeight: '600' }}>{w.vesselName || '—'}</span>
                            )}
                          </div>
                          {w.imoNumber && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', paddingLeft: '19px' }}>IMO {w.imoNumber}</div>}
                        </td>

                        {/* Warranty description */}
                        <td style={{ padding: '10px 12px', maxWidth: '220px' }}>
                          <div style={{ fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.description}</div>
                          {w.notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>{w.notes}</div>}
                        </td>

                        {/* Policy */}
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {w.policyTypeName || '—'}
                        </td>

                        {/* Deadline */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          {w.deadlineType === 'days' && w.deadlineDays && w.inceptionDate ? (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                <Clock size={12} />
                                {formatDate(calcDeadlineDate(w.inceptionDate, w.deadlineDays).toISOString().split('T')[0])}
                              </div>
                              <div style={{ marginTop: '3px' }}>{renderUrgencyPill(w)}</div>
                            </div>
                          ) : w.deadlineType === 'event' ? (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <AlertTriangle size={12} />{w.deadlineEvent}
                            </span>
                          ) : '—'}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            padding: '2px 9px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '700',
                            textTransform: 'uppercase', background: sc.bg, color: sc.color
                          }}>{STATUS_LABELS[w.status]}</span>
                        </td>

                        {/* Reminders */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <Bell size={12} />{w.reminderCount ?? 0}
                            </span>
                            {w.nextReminderDate && (w.status === 'pending' || w.status === 'survey_done') && (
                              <span style={{ fontSize: '0.72rem', color: '#e6a800' }}>→ {formatDate(w.nextReminderDate)}</span>
                            )}
                          </div>
                          <button
                            onClick={() => toggleHistory(w.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '0.72rem', padding: '2px 0', display: 'flex', alignItems: 'center', gap: '2px' }}
                          >
                            <ChevronRight size={11} style={{ transform: isHistoryExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                            History
                          </button>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap', alignItems: 'center' }}>
                            {(w.status === 'pending' || w.status === 'survey_done') && (
                              <button
                                onClick={() => openLogReminder(w)}
                                className="btn-secondary"
                                style={{ fontSize: '0.74rem', padding: '3px 9px', display: 'flex', alignItems: 'center', gap: '3px' }}
                                title="Log Reminder"
                              >
                                <Bell size={11} /> Remind
                              </button>
                            )}
                            {w.status === 'pending' && (
                              <button
                                onClick={() => handleMarkSurveyDone(w)}
                                className="btn-secondary"
                                style={{ fontSize: '0.74rem', padding: '3px 9px', display: 'flex', alignItems: 'center', gap: '3px', color: '#00aaff', borderColor: 'rgba(0,170,255,0.35)' }}
                                title="Mark survey received"
                              >
                                <Check size={11} /> Done
                              </button>
                            )}
                            {w.status === 'survey_done' && (
                              <button
                                onClick={() => { setCompleteFor(w); setCompleteNotes('') }}
                                className="btn-secondary"
                                style={{ fontSize: '0.74rem', padding: '3px 9px', display: 'flex', alignItems: 'center', gap: '3px', color: '#00c864', borderColor: 'rgba(0,200,100,0.35)' }}
                                title="Mark complete"
                              >
                                <Check size={11} /> Complete
                              </button>
                            )}
                            {(w.status === 'pending' || w.status === 'survey_done') && (
                              <button
                                onClick={() => { setWaiveFor(w); setWaiveReason('') }}
                                className="btn-secondary"
                                style={{ fontSize: '0.74rem', padding: '3px 9px', color: '#888', borderColor: 'rgba(128,128,128,0.3)' }}
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
                          <td colSpan={7} style={{ padding: '0 12px 12px 32px', borderBottom: '1px solid var(--table-border)' }}>
                            {!history ? (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '8px 0' }}>Loading…</div>
                            ) : history.length === 0 ? (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '8px 0', fontStyle: 'italic' }}>No reminders logged.</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingTop: '8px' }}>
                                {history.map(r => (
                                  <div key={r.id} style={{
                                    fontSize: '0.8rem', padding: '6px 10px', borderRadius: '7px',
                                    background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Sent:</span>
                                      <span style={{ fontWeight: '700', whiteSpace: 'nowrap' }}>{formatDate(r.sentAt)}</span>
                                      <span style={{ padding: '1px 6px', borderRadius: '5px', fontSize: '0.7rem', background: 'rgba(0,170,255,0.12)', color: '#00aaff', textTransform: 'uppercase' }}>{r.channel}</span>
                                      {r.reference && (
                                        <span style={{ padding: '1px 7px', borderRadius: '5px', fontSize: '0.7rem', background: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)', color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: '600' }}>
                                          Ref: {r.reference}
                                        </span>
                                      )}
                                      {r.nextReminderDate && (
                                        <span style={{ fontSize: '0.74rem', color: '#e6a800', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px', marginLeft: 'auto' }}>
                                          <Bell size={10} /> Next: {formatDate(r.nextReminderDate)}
                                        </span>
                                      )}
                                      {r.loggedByName && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>by {r.loggedByName}</span>}
                                    </div>
                                    {r.notes && <div style={{ marginTop: '3px', color: 'var(--text-secondary)', fontSize: '0.76rem' }}>{r.notes}</div>}
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
      </div>

      {/* ── Endorsement Reminders Section ────────────────────────── */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} style={{ color: '#e6a800' }} />
          Endorsement Reminders Due
          {endorsementsDue.length > 0 && (
            <span style={{ padding: '1px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '700', background: 'rgba(255,165,0,0.15)', color: '#e6a800' }}>
              {endorsementsDue.length}
            </span>
          )}
        </h2>
        {endorsementsDue.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No endorsement reminders due.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--table-border)' }}>
                {['Vessel', 'Survey Date', 'Type', 'Reminder Date', 'Action'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {endorsementsDue.map((e: any, idx: number) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--table-border)', background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.01)') }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Ship size={13} style={{ color: 'var(--text-secondary)' }} />
                      {onNavigateToVessel ? (
                        <button onClick={() => onNavigateToVessel(e.vesselId)} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: '600', padding: 0, fontSize: '0.85rem' }}>
                          {e.vesselName || e.vessel_name || '—'}
                        </button>
                      ) : (e.vesselName || e.vessel_name || '—')}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{formatDate(e.surveyDate || e.survey_date)}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{e.surveyType || e.survey_type || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ color: '#e6a800', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Bell size={12} />
                      {formatDate(e.endorsementReminderDate || e.endorsement_reminder_date)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {onNavigateToVessel && (
                      <button
                        onClick={() => onNavigateToVessel(e.vesselId || e.vessel_id)}
                        className="btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Ship size={12} /> View Survey
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Log Reminder Modal ───────────────────────────────────── */}
      {logReminderFor && (
        <div style={modalBg} onClick={() => setLogReminderFor(null)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Log Reminder</h3>
              <button onClick={() => setLogReminderFor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {logReminderFor.vesselName} — {logReminderFor.description}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Sent On *</label>
                <input type="date" value={reminderSentAt} onChange={e => setReminderSentAt(e.target.value)} style={inputStyle} autoFocus />
              </div>
              <div>
                <label style={labelStyle}>Channel</label>
                <select value={reminderChannel} onChange={e => setReminderChannel(e.target.value as any)} style={inputStyle}>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Reference <span style={{ fontWeight: 400, opacity: 0.6 }}>(e.g. email subject / survey ref)</span></label>
                <input value={reminderReference} onChange={e => setReminderReference(e.target.value)} placeholder="Optional — helps locate the email later" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input value={reminderNotes} onChange={e => setReminderNotes(e.target.value)} placeholder="Optional" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Next Reminder Date</label>
                <input type="date" value={reminderNextDate} onChange={e => setReminderNextDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setLogReminderFor(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleLogReminder} className="btn-primary">Log Reminder</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Waive Modal ──────────────────────────────────────────── */}
      {waiveFor && (
        <div style={modalBg} onClick={() => setWaiveFor(null)}>
          <div style={{ ...modalCard, width: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Waive Warranty</h3>
              <button onClick={() => setWaiveFor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {waiveFor.vesselName} — {waiveFor.description}
            </p>
            <div>
              <label style={labelStyle}>Waiver Reason *</label>
              <textarea value={waiveReason} onChange={e => setWaiveReason(e.target.value)} placeholder="Explain why this warranty is being waived…" rows={4} style={{ ...inputStyle, resize: 'vertical' }} autoFocus />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setWaiveFor(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleWaive} disabled={!waiveReason.trim()}
                style={{ background: 'rgba(255,165,0,0.15)', border: '1px solid rgba(255,165,0,0.35)', color: '#e6a800', borderRadius: '8px', padding: '6px 16px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', opacity: waiveReason.trim() ? 1 : 0.5 }}
              >
                Waive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Complete Modal ───────────────────────────────────────── */}
      {completeFor && (
        <div style={modalBg} onClick={() => setCompleteFor(null)}>
          <div style={{ ...modalCard, width: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Complete Warranty</h3>
              <button onClick={() => setCompleteFor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {completeFor.vesselName} — {completeFor.description}
            </p>
            <div>
              <label style={labelStyle}>Completion Notes (optional)</label>
              <textarea value={completeNotes} onChange={e => setCompleteNotes(e.target.value)} placeholder="Any notes on completion…" rows={3} style={{ ...inputStyle, resize: 'vertical' }} autoFocus />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setCompleteFor(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleComplete}
                style={{ background: 'rgba(0,200,100,0.15)', border: '1px solid rgba(0,200,100,0.35)', color: '#00c864', borderRadius: '8px', padding: '6px 16px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}
              >
                Mark Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
