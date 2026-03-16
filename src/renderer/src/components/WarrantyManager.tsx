import { useState, useEffect } from 'react'
import { Plus, ChevronDown, ChevronRight, Bell, Check, X, AlertTriangle, Clock, FileWarning, ClipboardCheck, Link2 } from 'lucide-react'
import { SurveyWarranty, SurveyWarrantyReminder, VesselDynamicPolicy, WarrantyStatus } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatDateShort } from '../utils/dateUtils'

interface WarrantyManagerProps {
  vesselId: string
  dynamicPolicies: VesselDynamicPolicy[]
  isLight: boolean
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
  const diff = deadlineDate.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDate(s?: string | null): string {
  if (!s) return '-'
  return formatDateShort(s) || s
}

export default function WarrantyManager({ vesselId, dynamicPolicies, isLight }: WarrantyManagerProps) {
  const { user } = useAuth()
  const { showSuccess, showError } = useToast()

  const [warranties, setWarranties] = useState<SurveyWarranty[]>([])
  const [reminders, setReminders] = useState<Record<string, SurveyWarrantyReminder[]>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingWarranty, setEditingWarranty] = useState<SurveyWarranty | null>(null)
  const [reminderWarrantyId, setReminderWarrantyId] = useState<string | null>(null)
  const [waiveWarrantyId, setWaiveWarrantyId] = useState<string | null>(null)
  const [completeWarrantyId, setCompleteWarrantyId] = useState<string | null>(null)

  // Add/edit form
  const [formDescription, setFormDescription] = useState('')
  const [formDeadlineType, setFormDeadlineType] = useState<'days' | 'event'>('days')
  const [formDeadlineDays, setFormDeadlineDays] = useState('')
  const [formDeadlineEvent, setFormDeadlineEvent] = useState('')
  const [formInceptionDate, setFormInceptionDate] = useState('')
  const [formPolicyId, setFormPolicyId] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formStatus, setFormStatus] = useState<WarrantyStatus>('pending')

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

  useEffect(() => {
    loadWarranties()
  }, [vesselId])

  const loadWarranties = async () => {
    try {
      const data = await window.api.surveyWarrantyGetByVessel(vesselId)
      setWarranties(Array.isArray(data) ? data : [])
    } catch (err: any) {
      showError(err.message || 'Failed to load warranties')
    }
  }

  const loadReminders = async (warrantyId: string) => {
    try {
      const data = await window.api.surveyWarrantyGetReminders(warrantyId)
      setReminders(prev => ({ ...prev, [warrantyId]: Array.isArray(data) ? data : [] }))
    } catch { /* ignore */ }
  }

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      await loadReminders(id)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────
  const getPolicyInceptionDate = (policyId: string): string => {
    const policy = dynamicPolicies.find(p => p.id === policyId)
    const val = policy?.values?.find(v =>
      v.characteristicName?.toLowerCase().includes('inception date') ||
      v.characteristicName?.toLowerCase().includes('start date')
    )
    return val?.valueDate || new Date().toISOString().split('T')[0]
  }

  const handlePolicyChange = (policyId: string) => {
    setFormPolicyId(policyId)
    if (policyId) setFormInceptionDate(getPolicyInceptionDate(policyId))
  }

  // ── Add / Edit ──────────────────────────────────────────────────
  const openAddModal = () => {
    setEditingWarranty(null)
    setFormDescription('')
    setFormDeadlineType('days')
    setFormDeadlineDays('')
    setFormDeadlineEvent('')
    const firstPolicyId = dynamicPolicies[0]?.id || ''
    setFormPolicyId(firstPolicyId)
    setFormInceptionDate(firstPolicyId ? getPolicyInceptionDate(firstPolicyId) : new Date().toISOString().split('T')[0])
    setFormNotes('')
    setFormStatus('pending')
    setShowAddModal(true)
  }

  const openEditModal = (w: SurveyWarranty) => {
    setEditingWarranty(w)
    setFormDescription(w.description)
    setFormDeadlineType(w.deadlineType)
    setFormDeadlineDays(w.deadlineDays != null ? String(w.deadlineDays) : '')
    setFormDeadlineEvent(w.deadlineEvent || '')
    setFormInceptionDate(w.inceptionDate)
    setFormPolicyId(w.policyId || '')
    setFormNotes(w.notes || '')
    setFormStatus(w.status)
    setShowAddModal(true)
  }

  const handleSaveWarranty = async () => {
    if (!formDescription.trim()) { showError('Description is required'); return }
    if (!formInceptionDate) { showError('Inception date is required'); return }
    if (formDeadlineType === 'days' && !formDeadlineDays) { showError('Deadline days is required'); return }
    if (formDeadlineType === 'event' && !formDeadlineEvent.trim()) { showError('Deadline event is required'); return }

    try {
      const payload = {
        vesselId,
        policyId: formPolicyId || null,
        description: formDescription.trim(),
        deadlineType: formDeadlineType,
        deadlineDays: formDeadlineType === 'days' ? parseInt(formDeadlineDays) : null,
        deadlineEvent: formDeadlineType === 'event' ? formDeadlineEvent.trim() : null,
        inceptionDate: formInceptionDate,
        notes: formNotes.trim() || null
      }

      if (editingWarranty) {
        await window.api.surveyWarrantyUpdate(editingWarranty.id, { ...payload, status: formStatus })
        showSuccess('Warranty updated')
      } else {
        await window.api.surveyWarrantyCreate(payload)
        showSuccess('Warranty added')
      }
      setShowAddModal(false)
      setEditingWarranty(null)
      loadWarranties()
    } catch (err: any) {
      showError(err.message || 'Failed to save warranty')
    }
  }

  // ── Mark survey done ─────────────────────────────────────────────
  const handleMarkSurveyDone = async (w: SurveyWarranty) => {
    try {
      await window.api.surveyWarrantyUpdate(w.id, { status: 'survey_done' })
      showSuccess('Warranty marked as survey done')
      loadWarranties()
    } catch (err: any) {
      showError(err.message || 'Failed to update status')
    }
  }

  // ── Convert to Survey ───────────────────────────────────────────
  const handleConvertToSurvey = async (w: SurveyWarranty) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const newSurvey = await window.api.addConditionSurvey({
        vesselId: w.vesselId,
        surveyDate: today,
        surveyorId: '',
        surveyType: 'Warranty Survey',
        reference: w.description.length > 100 ? w.description.substring(0, 100) + '...' : w.description,
        notes: `Warranty: ${w.description}`,
        createdBy: user?.username || 'System'
      })
      await window.api.surveyWarrantyUpdate(w.id, {
        conditionSurveyId: newSurvey.id,
        status: 'survey_done'
      })
      showSuccess('Survey created and linked to warranty')
      loadWarranties()
    } catch (err: any) {
      showError(err.message || 'Failed to convert to survey')
    }
  }

  // ── Complete ─────────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!completeWarrantyId) return
    try {
      const warranty = warranties.find(w => w.id === completeWarrantyId)
      if (warranty?.conditionSurveyId) {
        await window.api.surveyWarrantyCompleteWithSurvey(
          completeWarrantyId,
          completeNotes.trim() || null,
          user?.id || ''
        )
        showSuccess('Warranty and linked survey completed')
      } else {
        await window.api.surveyWarrantyUpdate(completeWarrantyId, {
          status: 'completed',
          completionNotes: completeNotes.trim() || null,
          completedAt: new Date().toISOString()
        })
        showSuccess('Warranty completed')
      }
      setCompleteWarrantyId(null)
      setCompleteNotes('')
      loadWarranties()
    } catch (err: any) {
      showError(err.message || 'Failed to complete warranty')
    }
  }

  // ── Waive ────────────────────────────────────────────────────────
  const handleWaive = async () => {
    if (!waiveWarrantyId || !waiveReason.trim()) { showError('Waiver reason is required'); return }
    try {
      await window.api.surveyWarrantyWaive(waiveWarrantyId, waiveReason.trim())
      showSuccess('Warranty waived')
      setWaiveWarrantyId(null)
      setWaiveReason('')
      loadWarranties()
    } catch (err: any) {
      showError(err.message || 'Failed to waive warranty')
    }
  }

  // ── Log Reminder ─────────────────────────────────────────────────
  const openReminderModal = (warrantyId: string) => {
    setReminderWarrantyId(warrantyId)
    setReminderSentAt(new Date().toISOString().split('T')[0])
    setReminderChannel('email')
    setReminderReference('')
    setReminderNotes('')
    setReminderNextDate('')
  }

  const handleLogReminder = async () => {
    if (!reminderWarrantyId || !reminderSentAt) { showError('Sent date is required'); return }
    const wid = reminderWarrantyId
    try {
      const result = await window.api.surveyWarrantyLogReminder({
        warrantyId: wid,
        sentAt: reminderSentAt,
        channel: reminderChannel,
        reference: reminderReference.trim() || null,
        notes: reminderNotes.trim() || null,
        nextReminderDate: reminderNextDate || null,
        loggedBy: user?.id || null
      })
      if (result && typeof result === 'object' && (result as any).error) {
        showError((result as any).message || 'Failed to log reminder'); return
      }
      showSuccess('Reminder logged')
      setReminderWarrantyId(null)
      await loadReminders(wid)
      loadWarranties()
    } catch (err: any) {
      showError(err.message || 'Failed to log reminder')
    }
  }

  // ── Delete ───────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this warranty? This cannot be undone.')) return
    try {
      await window.api.surveyWarrantyDelete(id)
      showSuccess('Warranty deleted')
      loadWarranties()
    } catch (err: any) {
      showError(err.message || 'Failed to delete')
    }
  }

  // ── Group by policy ──────────────────────────────────────────────
  const grouped = new Map<string, { label: string; items: SurveyWarranty[] }>()
  const unassigned: SurveyWarranty[] = []

  for (const w of warranties) {
    if (w.policyId) {
      if (!grouped.has(w.policyId)) {
        const policy = dynamicPolicies.find(p => p.id === w.policyId)
        grouped.set(w.policyId, {
          label: policy ? `${policy.policyTypeName}${policy.policyNumber ? ` #${policy.policyNumber}` : ''}` : w.policyTypeName || 'Policy',
          items: []
        })
      }
      grouped.get(w.policyId)!.items.push(w)
    } else {
      unassigned.push(w)
    }
  }

  // ── Styles ───────────────────────────────────────────────────────
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
    padding: '24px', width: '480px', maxWidth: '92vw',
    border: '1px solid var(--glass-border)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
    maxHeight: '85vh', overflowY: 'auto'
  }

  const renderWarrantyCard = (w: SurveyWarranty) => {
    const sc = STATUS_COLORS[w.status]
    const isExpanded = expandedId === w.id
    const isActive = w.status === 'pending' || w.status === 'survey_done'

    let deadlineInfo: React.ReactNode = null
    if (w.deadlineType === 'days' && w.deadlineDays) {
      const deadlineDate = calcDeadlineDate(w.inceptionDate, w.deadlineDays)
      const remaining = daysRemaining(deadlineDate)
      const isOverdue = remaining < 0
      const urgentSoon = remaining >= 0 && remaining <= 7
      const deadlineDateStr = formatDateShort(deadlineDate)

      deadlineInfo = (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}>
          <Clock size={12} style={{ flexShrink: 0 }} />
          <span>Due {deadlineDateStr}</span>
          {isActive && (
            <span style={{
              padding: '1px 7px', borderRadius: '8px', fontWeight: '700', fontSize: '0.72rem',
              background: isOverdue ? 'rgba(255,77,77,0.15)' : urgentSoon ? 'rgba(255,165,0,0.15)' : 'rgba(0,200,100,0.10)',
              color: isOverdue ? 'var(--danger)' : urgentSoon ? '#e6a800' : '#00c864'
            }}>
              {isOverdue ? `${Math.abs(remaining)}d overdue` : `${remaining}d left`}
            </span>
          )}
        </span>
      )
    } else if (w.deadlineType === 'event' && w.deadlineEvent) {
      deadlineInfo = (
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <AlertTriangle size={12} />
          {w.deadlineEvent}
        </span>
      )
    }

    const reminderList = reminders[w.id]

    return (
      <div key={w.id} style={{
        borderRadius: '10px', overflow: 'hidden',
        border: `1px solid ${isLight ? '#e0e3e8' : 'rgba(255,255,255,0.08)'}`,
        background: isLight ? '#fafbfc' : 'rgba(255,255,255,0.02)',
        marginBottom: '8px'
      }}>
        {/* Header row */}
        <div
          onClick={() => toggleExpand(w.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
            cursor: 'pointer', userSelect: 'none'
          }}
        >
          {isExpanded ? <ChevronDown size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
          <span style={{ fontWeight: '600', fontSize: '0.88rem', flex: 1 }}>{w.description}</span>
          {/* Status badge */}
          <span style={{
            padding: '2px 9px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            background: sc.bg, color: sc.color
          }}>{STATUS_LABELS[w.status]}</span>
          {/* Reminder count */}
          {(w.reminderCount ?? 0) > 0 && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: '3px',
              fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '2px 7px',
              borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'
            }}>
              <Bell size={11} />{w.reminderCount}
            </span>
          )}
        </div>

        {/* Sub-info row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 14px 10px 38px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          {deadlineInfo}
          {w.inceptionDate && (
            <span style={{ fontSize: '0.78rem' }}>Inception: {formatDate(w.inceptionDate)}</span>
          )}
          {w.nextReminderDate && isActive && (
            <span style={{ fontSize: '0.78rem', color: '#e6a800', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Bell size={11} /> Next: {formatDate(w.nextReminderDate)}
            </span>
          )}
          {w.conditionSurveyId && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: '3px',
              fontSize: '0.72rem', fontWeight: 700, padding: '1px 8px',
              borderRadius: '8px', background: 'rgba(0,170,200,0.12)', color: '#00aac8'
            }}>
              <Link2 size={11} /> Linked Survey
            </span>
          )}
        </div>

        {/* Expanded body */}
        {isExpanded && (
          <div style={{ borderTop: `1px solid ${isLight ? '#e0e3e8' : 'rgba(255,255,255,0.07)'}`, padding: '12px 14px 14px' }}>
            {w.notes && (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '12px' }}>
                {w.notes}
              </p>
            )}
            {w.waiverReason && (
              <div style={{ fontSize: '0.82rem', marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(128,128,128,0.08)', color: 'var(--text-secondary)' }}>
                <strong>Waiver reason:</strong> {w.waiverReason}
              </div>
            )}
            {w.completionNotes && (
              <div style={{ fontSize: '0.82rem', marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,200,100,0.07)', color: 'var(--text-primary)' }}>
                <strong>Completion notes:</strong> {w.completionNotes}
              </div>
            )}

            {/* Reminder history */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Reminder History
              </div>
              {!reminderList ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Loading…</div>
              ) : reminderList.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No reminders logged yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {reminderList.map(r => (
                    <div key={r.id} style={{
                      padding: '8px 10px', borderRadius: '8px',
                      background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
                      fontSize: '0.8rem'
                    }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Sent:</span>
                        <span style={{ fontWeight: '700' }}>{formatDate(r.sentAt)}</span>
                        <span style={{ padding: '1px 6px', borderRadius: '6px', fontSize: '0.7rem', background: 'rgba(0,170,255,0.12)', color: '#00aaff', textTransform: 'uppercase' }}>
                          {r.channel}
                        </span>
                        {r.reference && (
                          <span style={{ padding: '1px 7px', borderRadius: '6px', fontSize: '0.7rem', background: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)', color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: '600' }}>
                            Ref: {r.reference}
                          </span>
                        )}
                        {r.nextReminderDate && (
                          <span style={{ fontSize: '0.75rem', color: '#e6a800', display: 'flex', alignItems: 'center', gap: '3px', marginLeft: 'auto' }}>
                            <Bell size={11} /> Next: {formatDate(r.nextReminderDate)}
                          </span>
                        )}
                      </div>
                      {r.notes && <div style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{r.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {isActive && (
                <button
                  onClick={() => openReminderModal(w.id)}
                  className="btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Bell size={13} /> Log Reminder
                </button>
              )}
              {w.status === 'pending' && !w.conditionSurveyId && (
                <button
                  onClick={() => handleConvertToSurvey(w)}
                  className="btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#00aac8', borderColor: 'rgba(0,170,200,0.35)' }}
                >
                  <ClipboardCheck size={13} /> Convert to Survey
                </button>
              )}
              {w.status === 'pending' && (
                <button
                  onClick={() => handleMarkSurveyDone(w)}
                  className="btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#00aaff', borderColor: 'rgba(0,170,255,0.35)' }}
                >
                  <Check size={13} /> Survey Done
                </button>
              )}
              {w.status === 'survey_done' && (
                <button
                  onClick={() => { setCompleteWarrantyId(w.id); setCompleteNotes('') }}
                  className="btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#00c864', borderColor: 'rgba(0,200,100,0.35)' }}
                >
                  <Check size={13} /> Mark Complete
                </button>
              )}
              {isActive && (
                <button
                  onClick={() => openEditModal(w)}
                  className="btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '4px 12px' }}
                >
                  Edit
                </button>
              )}
              {isActive && (
                <button
                  onClick={() => { setWaiveWarrantyId(w.id); setWaiveReason('') }}
                  className="btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '4px 12px', color: '#e6a800', borderColor: 'rgba(230,168,0,0.35)' }}
                >
                  Waive
                </button>
              )}
              <button
                onClick={() => handleDelete(w.id)}
                style={{
                  fontSize: '0.78rem', padding: '4px 12px', cursor: 'pointer',
                  background: 'rgba(255,77,77,0.12)', border: '1px solid rgba(255,77,77,0.35)',
                  color: 'var(--danger)', borderRadius: '8px'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderGroup = (label: string, items: SurveyWarranty[]) => (
    <div key={label} style={{ marginBottom: '20px' }}>
      <div style={{
        fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--text-secondary)', marginBottom: '8px', paddingLeft: '2px'
      }}>
        {label}
      </div>
      {items.map(w => renderWarrantyCard(w))}
    </div>
  )

  return (
    <div style={{ marginTop: '24px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileWarning size={16} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>Survey Warranties</span>
          {warranties.filter(w => w.status === 'pending' || w.status === 'survey_done').length > 0 && (
            <span style={{
              padding: '1px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '700',
              background: 'rgba(255,165,0,0.15)', color: '#e6a800'
            }}>
              {warranties.filter(w => w.status === 'pending' || w.status === 'survey_done').length} active
            </span>
          )}
        </div>
        <button onClick={openAddModal} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={14} /> Add Warranty
        </button>
      </div>

      {/* Content */}
      {warranties.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          No survey warranties added yet.
        </div>
      ) : (
        <>
          {Array.from(grouped.entries()).map(([, { label, items }]) => renderGroup(label, items))}
          {unassigned.length > 0 && renderGroup('No Policy Assigned', unassigned)}
        </>
      )}

      {/* ── Add/Edit Modal ─────────────────────────────────────── */}
      {showAddModal && (
        <div style={modalBg} onClick={() => setShowAddModal(false)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{editingWarranty ? 'Edit Warranty' : 'Add Survey Warranty'}</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Description *</label>
                <input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="e.g. Follow-up condition survey" style={inputStyle} autoFocus />
              </div>
              <div>
                <label style={labelStyle}>Linked Policy</label>
                <select value={formPolicyId} onChange={e => handlePolicyChange(e.target.value)} style={inputStyle}>
                  <option value="">— None —</option>
                  {dynamicPolicies.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.policyTypeName}{p.policyNumber ? ` #${p.policyNumber}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Inception Date *</label>
                <input type="date" value={formInceptionDate} onChange={e => setFormInceptionDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Deadline Type *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['days', 'event'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setFormDeadlineType(t)}
                      className={formDeadlineType === t ? 'btn-primary' : 'btn-secondary'}
                      style={{ fontSize: '0.82rem', padding: '5px 16px' }}
                    >
                      {t === 'days' ? 'Number of days' : 'Event'}
                    </button>
                  ))}
                </div>
              </div>
              {formDeadlineType === 'days' ? (
                <div>
                  <label style={labelStyle}>Deadline (days from inception) *</label>
                  <input type="number" min="1" value={formDeadlineDays} onChange={e => setFormDeadlineDays(e.target.value)} placeholder="e.g. 30" style={inputStyle} />
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>Deadline Event *</label>
                  <input value={formDeadlineEvent} onChange={e => setFormDeadlineEvent(e.target.value)} placeholder="e.g. Prior to sailing" style={inputStyle} />
                </div>
              )}
              {editingWarranty && (
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={formStatus} onChange={e => setFormStatus(e.target.value as WarrantyStatus)} style={inputStyle}>
                    {(['pending', 'survey_done', 'completed', 'waived'] as WarrantyStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Optional context for follow-up" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSaveWarranty} className="btn-primary">{editingWarranty ? 'Save Changes' : 'Add Warranty'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Log Reminder Modal ────────────────────────────────── */}
      {reminderWarrantyId && (
        <div style={modalBg} onClick={() => setReminderWarrantyId(null)}>
          <div style={{ ...modalCard, width: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Log Reminder</h3>
              <button onClick={() => setReminderWarrantyId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
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
              <button onClick={() => setReminderWarrantyId(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleLogReminder} className="btn-primary">Log Reminder</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Waive Modal ───────────────────────────────────────── */}
      {waiveWarrantyId && (
        <div style={modalBg} onClick={() => setWaiveWarrantyId(null)}>
          <div style={{ ...modalCard, width: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Waive Warranty</h3>
              <button onClick={() => setWaiveWarrantyId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div>
              <label style={labelStyle}>Waiver Reason *</label>
              <textarea
                value={waiveReason} onChange={e => setWaiveReason(e.target.value)}
                placeholder="Explain why this warranty is being waived…" rows={4}
                style={{ ...inputStyle, resize: 'vertical' }} autoFocus
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setWaiveWarrantyId(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleWaive}
                disabled={!waiveReason.trim()}
                style={{
                  background: 'rgba(255,165,0,0.15)', border: '1px solid rgba(255,165,0,0.35)',
                  color: '#e6a800', borderRadius: '8px', padding: '6px 16px', cursor: 'pointer',
                  fontWeight: '600', fontSize: '0.85rem', opacity: waiveReason.trim() ? 1 : 0.5
                }}
              >
                Waive Warranty
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Complete Modal ────────────────────────────────────── */}
      {completeWarrantyId && (
        <div style={modalBg} onClick={() => setCompleteWarrantyId(null)}>
          <div style={{ ...modalCard, width: '400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Complete Warranty</h3>
              <button onClick={() => setCompleteWarrantyId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div>
              <label style={labelStyle}>Completion Notes (optional)</label>
              <textarea
                value={completeNotes} onChange={e => setCompleteNotes(e.target.value)}
                placeholder="Any notes on completion…" rows={3}
                style={{ ...inputStyle, resize: 'vertical' }} autoFocus
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setCompleteWarrantyId(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleComplete}
                style={{
                  background: 'rgba(0,200,100,0.15)', border: '1px solid rgba(0,200,100,0.35)',
                  color: '#00c864', borderRadius: '8px', padding: '6px 16px', cursor: 'pointer',
                  fontWeight: '600', fontSize: '0.85rem'
                }}
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
