import { useState, useEffect, useRef } from 'react'
import {
  Plus,
  ChevronDown,
  Bell,
  Check,
  AlertTriangle,
  Clock,
  FileWarning,
  ClipboardCheck,
  Link2
} from 'lucide-react'
import {
  SurveyWarranty,
  SurveyWarrantyReminder,
  VesselDynamicPolicy,
  WarrantyStatus,
  ConditionSurvey,
  Surveyor
} from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatDateShort, formatDateOrDash } from '../utils/dateUtils'
import { confirmDialog } from './DialogHost'
import { Field, Modal } from './ui'
import { ok, isIpcError } from '../utils/ipc'

interface WarrantyManagerProps {
  vesselId: string
  dynamicPolicies: VesselDynamicPolicy[]
  isLight: boolean
}

const STATUS_LABELS: Record<WarrantyStatus, string> = {
  pending: 'Pending',
  survey_done: 'Survey Carried Out',
  completed: 'Completed',
  waived: 'Waived'
}

const STATUS_COLORS: Record<WarrantyStatus, { bg: string; color: string }> = {
  pending: { bg: 'rgba(255,165,0,0.12)', color: 'var(--warning)' },
  survey_done: { bg: 'rgba(var(--accent-primary-rgb), 0.12)', color: 'var(--accent-primary)' },
  completed: { bg: 'rgba(0,200,100,0.12)', color: 'var(--success)' },
  waived: { bg: 'rgba(128,128,128,0.1)', color: 'var(--text-secondary)' }
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

export default function WarrantyManager({
  vesselId,
  dynamicPolicies,
  isLight
}: WarrantyManagerProps): React.JSX.Element {
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('surveys:manage')
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

  // Link-to-survey modal
  const [linkWarranty, setLinkWarranty] = useState<SurveyWarranty | null>(null)
  const [availableSurveys, setAvailableSurveys] = useState<ConditionSurvey[]>([])
  const [surveyorMap, setSurveyorMap] = useState<Record<string, string>>({})
  const [linkSearch, setLinkSearch] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)

  // Convert-to-survey modal
  const [convertWarranty, setConvertWarranty] = useState<SurveyWarranty | null>(null)
  const [convertSurveyorId, setConvertSurveyorId] = useState('')
  const [convertDate, setConvertDate] = useState('')
  const [convertType, setConvertType] = useState('')
  const [convertReference, setConvertReference] = useState('')
  const [convertSaving, setConvertSaving] = useState(false)
  const [surveyorsList, setSurveyorsList] = useState<Surveyor[]>([])
  const [surveyTypesList, setSurveyTypesList] = useState<{ id: string; name: string }[]>([])

  // Add/edit form
  const [formDescription, setFormDescription] = useState('')
  const [formDeadlineType, setFormDeadlineType] = useState<'days' | 'event'>('days')
  const [formDeadlineDays, setFormDeadlineDays] = useState('')
  const [formDeadlineEvent, setFormDeadlineEvent] = useState('')
  const [formInceptionDate, setFormInceptionDate] = useState('')
  const [formPolicyId, setFormPolicyId] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formReference, setFormReference] = useState('')
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

  const [linkedSurveyCounts, setLinkedSurveyCounts] = useState<
    Record<string, { open: number; closed: number }>
  >({})

  // Loads on mount / vessel change, and again whenever loadWarranties() is called
  const [warrantiesKey, setWarrantiesKey] = useState(0)
  const loadWarranties = (): void => setWarrantiesKey((k) => k + 1)
  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      try {
        const data = await window.api.surveyWarrantyGetByVessel(vesselId)
        if (!alive) return
        const safe = Array.isArray(data) ? data : []
        setWarranties(safe)
        // Load defect counts for linked surveys
        const counts: Record<string, { open: number; closed: number }> = {}
        for (const w of safe) {
          if (w.conditionSurveyId) {
            try {
              const defects = await window.api.getSurveyDefects(w.conditionSurveyId)
              const open = defects.filter((d) => d.status === 'OPEN').length
              const closed = defects.filter((d) => d.status !== 'OPEN').length
              counts[w.id] = { open, closed }
            } catch {
              /* ignore */
            }
          }
        }
        if (alive) setLinkedSurveyCounts(counts)
      } catch (err) {
        if (alive) showError((err instanceof Error && err.message) || 'Failed to load warranties')
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [vesselId, showError, warrantiesKey])

  const loadReminders = async (warrantyId: string): Promise<void> => {
    try {
      const data = await window.api.surveyWarrantyGetReminders(warrantyId)
      setReminders((prev) => ({ ...prev, [warrantyId]: Array.isArray(data) ? data : [] }))
    } catch {
      /* ignore */
    }
  }

  const toggleExpand = async (id: string): Promise<void> => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      await loadReminders(id)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────
  const getPolicyInceptionDate = (policyId: string): string => {
    const policy = dynamicPolicies.find((p) => p.id === policyId)
    const val = policy?.values?.find(
      (v) =>
        v.characteristicName?.toLowerCase().includes('inception date') ||
        v.characteristicName?.toLowerCase().includes('start date')
    )
    return val?.valueDate || new Date().toISOString().split('T')[0]
  }

  // Reference is SUR + the policy serial: strip the leading letter + 4-digit year
  // code (e.g. P2620 / H2520) and keep the rest. P26209438 -> SUR9438, and it
  // extends naturally when serials reach 5 digits (P262010000 -> SUR10000).
  const deriveSurReference = (policyId: string): string => {
    const policy = dynamicPolicies.find((p) => p.id === policyId)
    const num = policy?.policyNumber
    if (!num) return ''
    const serial = num.trim().replace(/^[A-Za-z]\d{4}/, '')
    return serial ? `SUR${serial}` : ''
  }

  const handlePolicyChange = (policyId: string): void => {
    setFormPolicyId(policyId)
    if (policyId) setFormInceptionDate(getPolicyInceptionDate(policyId))
    setFormReference(deriveSurReference(policyId))
  }

  // ── Add / Edit ──────────────────────────────────────────────────
  const openAddModal = (): void => {
    setEditingWarranty(null)
    setFormDescription('')
    setFormDeadlineType('days')
    setFormDeadlineDays('')
    setFormDeadlineEvent('')
    const firstPolicyId = dynamicPolicies[0]?.id || ''
    setFormPolicyId(firstPolicyId)
    setFormInceptionDate(
      firstPolicyId ? getPolicyInceptionDate(firstPolicyId) : new Date().toISOString().split('T')[0]
    )
    setFormNotes('')
    setFormReference(deriveSurReference(firstPolicyId))
    setFormStatus('pending')
    setShowAddModal(true)
  }

  const openEditModal = (w: SurveyWarranty): void => {
    setEditingWarranty(w)
    setFormDescription(w.description)
    setFormDeadlineType(w.deadlineType)
    setFormDeadlineDays(w.deadlineDays != null ? String(w.deadlineDays) : '')
    setFormDeadlineEvent(w.deadlineEvent || '')
    setFormInceptionDate(w.inceptionDate)
    setFormPolicyId(w.policyId || '')
    setFormNotes(w.notes || '')
    setFormReference(w.reference || '')
    setFormStatus(w.status)
    setShowAddModal(true)
  }

  // One save at a time (double click must not add the warranty twice)
  const savingWarrantyRef = useRef(false)
  const [savingWarranty, setSavingWarranty] = useState(false)
  const handleSaveWarranty = async (): Promise<void> => {
    if (savingWarrantyRef.current) return
    savingWarrantyRef.current = true
    setSavingWarranty(true)
    try {
      await saveWarrantyNow()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to save warranty')
    } finally {
      savingWarrantyRef.current = false
      setSavingWarranty(false)
    }
  }

  const saveWarrantyNow = async (): Promise<void> => {
    if (!formDescription.trim()) {
      showError('Description is required')
      return
    }
    if (!formInceptionDate) {
      showError('Inception date is required')
      return
    }
    if (formDeadlineType === 'days' && !formDeadlineDays) {
      showError('Deadline days is required')
      return
    }
    if (formDeadlineType === 'event' && !formDeadlineEvent.trim()) {
      showError('Deadline event is required')
      return
    }

    try {
      const payload = {
        vesselId,
        policyId: formPolicyId || null,
        description: formDescription.trim(),
        deadlineType: formDeadlineType,
        deadlineDays: formDeadlineType === 'days' ? parseInt(formDeadlineDays) : null,
        deadlineEvent: formDeadlineType === 'event' ? formDeadlineEvent.trim() : null,
        inceptionDate: formInceptionDate,
        notes: formNotes.trim() || null,
        reference: formReference.trim() || null
      }

      if (editingWarranty) {
        ok(
          await window.api.surveyWarrantyUpdate(editingWarranty.id, {
            ...payload,
            status: formStatus
          })
        )
        showSuccess('Warranty updated')
      } else {
        await window.api.surveyWarrantyCreate(payload)
        showSuccess('Warranty added')
      }
      setShowAddModal(false)
      setEditingWarranty(null)
      loadWarranties()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to save warranty')
    }
  }

  // ── Mark survey done ─────────────────────────────────────────────
  const handleMarkSurveyDone = async (w: SurveyWarranty): Promise<void> => {
    try {
      await window.api.surveyWarrantyUpdate(w.id, { status: 'survey_done' })
      showSuccess('Warranty marked as survey carried out')
      loadWarranties()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to update status')
    }
  }

  // ── Convert to Survey (quick modal) ─────────────────────────────
  const openConvertModal = async (w: SurveyWarranty): Promise<void> => {
    setConvertWarranty(w)
    setConvertDate(new Date().toISOString().split('T')[0])
    setConvertReference(w.reference || '')
    setConvertSurveyorId('')
    setConvertType('Warranty Survey')
    try {
      const [surveyors, types] = await Promise.all([
        window.api.getSurveyors(),
        window.api.getConditionSurveyTypes()
      ])
      setSurveyorsList(Array.isArray(surveyors) ? surveyors : [])
      const safeTypes = Array.isArray(types) ? types : []
      setSurveyTypesList(safeTypes)
      // Default the type to a "warranty" survey type if one exists, else the first
      const warrantyType = safeTypes.find((t) => /warranty/i.test(t.name))
      setConvertType(warrantyType?.name || safeTypes[0]?.name || 'Warranty Survey')
    } catch {
      /* keep defaults */
    }
  }

  const handleConfirmConvert = async (): Promise<void> => {
    if (!convertWarranty) return
    if (!convertSurveyorId) {
      showError('Please choose a surveyor')
      return
    }
    if (!convertDate) {
      showError('Survey date is required')
      return
    }
    setConvertSaving(true)
    try {
      const newSurvey = await window.api.addConditionSurvey({
        vesselId: convertWarranty.vesselId,
        surveyDate: convertDate,
        surveyorId: convertSurveyorId,
        surveyType: convertType || 'Warranty Survey',
        reference: convertReference.trim() || undefined,
        notes: undefined,
        createdBy: user?.username || 'System'
      })
      ok(
        await window.api.surveyWarrantyUpdate(convertWarranty.id, {
          conditionSurveyId: newSurvey.id,
          status: 'survey_done'
        })
      )
      showSuccess('Survey created and linked to warranty')
      setConvertWarranty(null)
      loadWarranties()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to convert to survey')
    } finally {
      setConvertSaving(false)
    }
  }

  // ── Link to existing Survey ─────────────────────────────────────
  const openLinkModal = async (w: SurveyWarranty): Promise<void> => {
    setLinkWarranty(w)
    setLinkSearch('')
    setLinkLoading(true)
    try {
      const [surveys, surveyors] = await Promise.all([
        window.api.getConditionSurveys(w.vesselId),
        window.api.getSurveyors()
      ])
      setAvailableSurveys(Array.isArray(surveys) ? surveys : [])
      const map: Record<string, string> = {}
      for (const s of (Array.isArray(surveyors) ? surveyors : []) as Surveyor[])
        map[s.id] = s.companyName
      setSurveyorMap(map)
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to load surveys')
    } finally {
      setLinkLoading(false)
    }
  }

  const handleLinkSurvey = async (surveyId: string): Promise<void> => {
    if (!linkWarranty) return
    try {
      ok(
        await window.api.surveyWarrantyUpdate(linkWarranty.id, {
          conditionSurveyId: surveyId,
          status: 'survey_done'
        })
      )
      showSuccess('Survey linked to warranty')
      setLinkWarranty(null)
      loadWarranties()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to link survey')
    }
  }

  // ── Complete ─────────────────────────────────────────────────────
  const handleComplete = async (): Promise<void> => {
    if (!completeWarrantyId) return
    try {
      const warranty = warranties.find((w) => w.id === completeWarrantyId)
      if (warranty?.conditionSurveyId) {
        await window.api.surveyWarrantyCompleteWithSurvey(
          completeWarrantyId,
          completeNotes.trim() || null,
          user?.id || ''
        )
        showSuccess('Warranty and linked survey completed')
      } else {
        ok(
          await window.api.surveyWarrantyUpdate(completeWarrantyId, {
            status: 'completed',
            completionNotes: completeNotes.trim() || null,
            completedAt: new Date().toISOString()
          })
        )
        showSuccess('Warranty completed')
      }
      setCompleteWarrantyId(null)
      setCompleteNotes('')
      loadWarranties()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to complete warranty')
    }
  }

  // ── Waive ────────────────────────────────────────────────────────
  const handleWaive = async (): Promise<void> => {
    if (!waiveWarrantyId || !waiveReason.trim()) {
      showError('Waiver reason is required')
      return
    }
    try {
      await window.api.surveyWarrantyWaive(waiveWarrantyId, waiveReason.trim())
      showSuccess('Warranty waived')
      setWaiveWarrantyId(null)
      setWaiveReason('')
      loadWarranties()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to waive warranty')
    }
  }

  // ── Log Reminder ─────────────────────────────────────────────────
  const openReminderModal = (warrantyId: string): void => {
    setReminderWarrantyId(warrantyId)
    setReminderSentAt(new Date().toISOString().split('T')[0])
    setReminderChannel('email')
    setReminderReference('')
    setReminderNotes('')
    setReminderNextDate('')
  }

  const handleLogReminder = async (): Promise<void> => {
    if (!reminderWarrantyId || !reminderSentAt) {
      showError('Sent date is required')
      return
    }
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
      if (isIpcError(result)) {
        showError(result.message || 'Failed to log reminder')
        return
      }
      showSuccess('Reminder logged')
      setReminderWarrantyId(null)
      await loadReminders(wid)
      loadWarranties()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to log reminder')
    }
  }

  // ── Delete ───────────────────────────────────────────────────────
  const handleDelete = async (id: string): Promise<void> => {
    if (!(await confirmDialog('Delete this warranty? This cannot be undone.'))) return
    try {
      await window.api.surveyWarrantyDelete(id)
      showSuccess('Warranty deleted')
      loadWarranties()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to delete')
    }
  }

  // ── Group by policy ──────────────────────────────────────────────
  const grouped = new Map<string, { label: string; items: SurveyWarranty[] }>()
  const unassigned: SurveyWarranty[] = []

  for (const w of warranties) {
    if (w.policyId) {
      if (!grouped.has(w.policyId)) {
        const policy = dynamicPolicies.find((p) => p.id === w.policyId)
        grouped.set(w.policyId, {
          label: policy
            ? `${policy.policyTypeName}${policy.policyNumber ? ` #${policy.policyNumber}` : ''}`
            : w.policyTypeName || 'Policy',
          items: []
        })
      }
      grouped.get(w.policyId)!.items.push(w)
    } else {
      unassigned.push(w)
    }
  }

  const renderWarrantyCard = (w: SurveyWarranty): React.JSX.Element => {
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
            <span
              style={{
                padding: '1px 7px',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '0.72rem',
                background: isOverdue
                  ? 'rgba(255,77,77,0.15)'
                  : urgentSoon
                    ? 'rgba(255,165,0,0.15)'
                    : 'rgba(0,200,100,0.10)',
                color: isOverdue
                  ? 'var(--danger)'
                  : urgentSoon
                    ? 'var(--warning)'
                    : 'var(--success)'
              }}
            >
              {isOverdue ? `${Math.abs(remaining)}d overdue` : `${remaining}d left`}
            </span>
          )}
        </span>
      )
    } else if (w.deadlineType === 'event' && w.deadlineEvent) {
      deadlineInfo = (
        <span
          style={{
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <AlertTriangle size={12} />
          {w.deadlineEvent}
        </span>
      )
    }

    const reminderList = reminders[w.id]

    return (
      <div
        key={w.id}
        className="glass-card"
        style={{ padding: 0, overflow: 'hidden', marginBottom: '8px' }}
      >
        {/* Header row — matches policy card style */}
        <div
          onClick={() => toggleExpand(w.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            cursor: 'pointer',
            userSelect: 'none',
            background: isExpanded ? 'rgba(var(--accent-primary-rgb), 0.03)' : 'transparent'
          }}
        >
          <ChevronDown
            size={16}
            style={{
              transform: isExpanded ? 'none' : 'rotate(-90deg)',
              transition: 'transform 0.2s',
              color: 'var(--text-secondary)',
              flexShrink: 0
            }}
          />
          <span style={{ fontWeight: '600', fontSize: '0.9rem', flex: 1 }}>{w.description}</span>
          {w.reference && (
            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
                color: 'var(--text-secondary)'
              }}
            >
              {w.reference}
            </span>
          )}
          {w.policyTypeName && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'rgba(var(--accent-primary-rgb), 0.1)',
                color: 'var(--accent-primary)'
              }}
            >
              {w.policyTypeName}
            </span>
          )}
          {/* Status badge */}
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '0.7rem',
              fontWeight: '600',
              textTransform: 'uppercase',
              background: sc.bg,
              color: sc.color
            }}
          >
            {STATUS_LABELS[w.status]}
          </span>
          {/* Reminder count */}
          {(w.reminderCount ?? 0) > 0 && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                padding: '2px 7px',
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)'
              }}
            >
              <Bell size={11} />
              {w.reminderCount}
            </span>
          )}
        </div>

        {/* Sub-info row */}
        {(deadlineInfo || w.inceptionDate || w.conditionSurveyId) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '0 16px 10px 42px',
              color: 'var(--text-secondary)',
              flexWrap: 'wrap'
            }}
          >
            {deadlineInfo}
            {w.inceptionDate && (
              <span style={{ fontSize: '0.78rem' }}>
                Inception: {formatDateOrDash(w.inceptionDate)}
              </span>
            )}
            {w.nextReminderDate && isActive && (
              <span
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--warning)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <Bell size={11} /> Next: {formatDateOrDash(w.nextReminderDate)}
              </span>
            )}
            {w.conditionSurveyId &&
              (() => {
                const lsc = linkedSurveyCounts[w.id]
                const total = lsc ? lsc.open + lsc.closed : 0
                return (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '1px 8px',
                      borderRadius: '8px',
                      background: 'rgba(var(--accent-primary-rgb), 0.12)',
                      color: 'var(--accent-primary)'
                    }}
                  >
                    <Link2 size={11} /> Survey
                    {lsc && total > 0 ? ` — ${lsc.closed}/${total} closed` : ''}
                  </span>
                )
              })()}
          </div>
        )}

        {/* Expanded body */}
        {isExpanded && (
          <div style={{ borderTop: '1px solid var(--table-border)', padding: '0 16px 16px' }}>
            {/* Info grid — matches policy card value grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '8px',
                paddingTop: '12px'
              }}
            >
              {w.deadlineType === 'days' && w.deadlineDays && (
                <div style={{ fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    Deadline
                  </span>
                  <div style={{ fontWeight: '500' }}>{w.deadlineDays} days from inception</div>
                </div>
              )}
              {w.deadlineType === 'event' && w.deadlineEvent && (
                <div style={{ fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    Deadline Event
                  </span>
                  <div style={{ fontWeight: '500' }}>{w.deadlineEvent}</div>
                </div>
              )}
              {w.inceptionDate && (
                <div style={{ fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    Inception Date
                  </span>
                  <div style={{ fontWeight: '500' }}>{formatDateOrDash(w.inceptionDate)}</div>
                </div>
              )}
              {w.completedAt && (
                <div style={{ fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    Completed
                  </span>
                  <div style={{ fontWeight: '500' }}>{formatDateOrDash(w.completedAt)}</div>
                </div>
              )}
            </div>
            {w.notes && (
              <p
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                  fontStyle: 'italic',
                  marginBottom: '12px'
                }}
              >
                {w.notes}
              </p>
            )}
            {w.waiverReason && (
              <div
                style={{
                  fontSize: '0.82rem',
                  marginBottom: '12px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(128,128,128,0.08)',
                  color: 'var(--text-secondary)'
                }}
              >
                <strong>Waiver reason:</strong> {w.waiverReason}
              </div>
            )}
            {w.completionNotes && (
              <div
                style={{
                  fontSize: '0.82rem',
                  marginBottom: '12px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(0,200,100,0.07)',
                  color: 'var(--text-primary)'
                }}
              >
                <strong>Completion notes:</strong> {w.completionNotes}
              </div>
            )}

            {/* Reminder history */}
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  fontWeight: '600',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em'
                }}
              >
                Reminder History
              </div>
              {!reminderList ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Loading…</div>
              ) : reminderList.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  No reminders logged yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {reminderList.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                        fontSize: '0.8rem'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: '10px',
                          alignItems: 'center',
                          flexWrap: 'wrap'
                        }}
                      >
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                          Sent:
                        </span>
                        <span style={{ fontWeight: '700' }}>{formatDateOrDash(r.sentAt)}</span>
                        <span
                          style={{
                            padding: '1px 6px',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            background: 'rgba(var(--accent-primary-rgb), 0.12)',
                            color: 'var(--accent-primary)',
                            textTransform: 'uppercase'
                          }}
                        >
                          {r.channel}
                        </span>
                        {r.reference && (
                          <span
                            style={{
                              padding: '1px 7px',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              background: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)',
                              color: 'var(--text-primary)',
                              fontFamily: 'monospace',
                              fontWeight: '600'
                            }}
                          >
                            Ref: {r.reference}
                          </span>
                        )}
                        {r.nextReminderDate && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--warning)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                              marginLeft: 'auto'
                            }}
                          >
                            <Bell size={11} /> Next: {formatDateOrDash(r.nextReminderDate)}
                          </span>
                        )}
                      </div>
                      {r.notes && (
                        <div
                          style={{
                            marginTop: '4px',
                            color: 'var(--text-secondary)',
                            fontSize: '0.78rem'
                          }}
                        >
                          {r.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {canManage && isActive && (
                <button
                  onClick={() => openReminderModal(w.id)}
                  className="btn-secondary"
                  style={{
                    fontSize: '0.78rem',
                    padding: '4px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Bell size={13} /> Log Reminder
                </button>
              )}
              {canManage && w.status === 'pending' && !w.conditionSurveyId && (
                <button
                  onClick={() => openConvertModal(w)}
                  className="btn-secondary"
                  style={{
                    fontSize: '0.78rem',
                    padding: '4px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--accent-primary)',
                    borderColor: 'rgba(var(--accent-primary-rgb), 0.35)'
                  }}
                >
                  <ClipboardCheck size={13} /> Convert to Survey
                </button>
              )}
              {canManage && w.status === 'pending' && !w.conditionSurveyId && (
                <button
                  onClick={() => openLinkModal(w)}
                  className="btn-secondary"
                  style={{
                    fontSize: '0.78rem',
                    padding: '4px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--violet)',
                    borderColor: 'rgba(138,125,255,0.35)'
                  }}
                >
                  <Link2 size={13} /> Link to Survey
                </button>
              )}
              {canManage && w.status === 'pending' && (
                <button
                  onClick={() => handleMarkSurveyDone(w)}
                  className="btn-secondary"
                  style={{
                    fontSize: '0.78rem',
                    padding: '4px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--accent-primary)',
                    borderColor: 'rgba(var(--accent-primary-rgb), 0.35)'
                  }}
                >
                  <Check size={13} /> Survey Carried Out
                </button>
              )}
              {canManage && w.status === 'survey_done' && (
                <button
                  onClick={() => {
                    setCompleteWarrantyId(w.id)
                    setCompleteNotes('')
                  }}
                  className="btn-secondary"
                  style={{
                    fontSize: '0.78rem',
                    padding: '4px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--success)',
                    borderColor: 'rgba(0,200,100,0.35)'
                  }}
                >
                  <Check size={13} /> Mark Complete
                </button>
              )}
              {canManage && isActive && (
                <button
                  onClick={() => openEditModal(w)}
                  className="btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '4px 12px' }}
                >
                  Edit
                </button>
              )}
              {canManage && isActive && (
                <button
                  onClick={() => {
                    setWaiveWarrantyId(w.id)
                    setWaiveReason('')
                  }}
                  className="btn-secondary"
                  style={{
                    fontSize: '0.78rem',
                    padding: '4px 12px',
                    color: 'var(--warning)',
                    borderColor: 'rgba(230,168,0,0.35)'
                  }}
                >
                  Waive
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => handleDelete(w.id)}
                  style={{
                    fontSize: '0.78rem',
                    padding: '4px 12px',
                    cursor: 'pointer',
                    background: 'rgba(255,77,77,0.12)',
                    border: '1px solid rgba(255,77,77,0.35)',
                    color: 'var(--danger)',
                    borderRadius: '8px'
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderGroup = (label: string, items: SurveyWarranty[]): React.JSX.Element => (
    <div key={label} style={{ marginBottom: '20px' }}>
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-secondary)',
          marginBottom: '8px',
          paddingLeft: '2px'
        }}
      >
        {label}
      </div>
      {items.map((w) => renderWarrantyCard(w))}
    </div>
  )

  return (
    <div style={{ marginTop: '24px' }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileWarning size={16} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>Survey Warranties</span>
          {warranties.filter((w) => w.status === 'pending' || w.status === 'survey_done').length >
            0 && (
            <span
              style={{
                padding: '1px 8px',
                borderRadius: '10px',
                fontSize: '0.7rem',
                fontWeight: '700',
                background: 'rgba(255,165,0,0.15)',
                color: 'var(--warning)'
              }}
            >
              {
                warranties.filter((w) => w.status === 'pending' || w.status === 'survey_done')
                  .length
              }{' '}
              active
            </span>
          )}
        </div>
        {canManage && (
          <button
            onClick={openAddModal}
            className="btn-secondary"
            style={{
              fontSize: '0.8rem',
              padding: '4px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Plus size={14} /> Add Warranty
          </button>
        )}
      </div>

      {/* Content */}
      {warranties.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '32px 24px',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem'
          }}
        >
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
        <Modal
          title={editingWarranty ? 'Edit Warranty' : 'Add Survey Warranty'}
          icon={<ClipboardCheck size={18} />}
          onClose={() => setShowAddModal(false)}
          width={480}
          closeOnOverlay={false}
          footer={
            <>
              <button onClick={() => setShowAddModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSaveWarranty}
                disabled={savingWarranty}
                className="btn-primary"
              >
                {editingWarranty ? 'Save Changes' : 'Add Warranty'}
              </button>
            </>
          }
        >
          <div className="form-grid cols-2">
            <Field label="Description" required span="all">
              <input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g. Follow-up condition survey"
                autoFocus
              />
            </Field>
            <Field label="Linked policy">
              <select value={formPolicyId} onChange={(e) => handlePolicyChange(e.target.value)}>
                <option value="">— None —</option>
                {dynamicPolicies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.policyTypeName}
                    {p.policyNumber ? ` #${p.policyNumber}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reference" hint="Filled in from the policy">
              <input
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
                placeholder="e.g. SUR9438"
              />
            </Field>
            <Field label="Inception date" required>
              <input
                type="date"
                value={formInceptionDate}
                onChange={(e) => setFormInceptionDate(e.target.value)}
              />
            </Field>
            <Field label="Deadline type" required>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['days', 'event'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFormDeadlineType(t)}
                    className={`${formDeadlineType === t ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  >
                    {t === 'days' ? 'Number of days' : 'Event'}
                  </button>
                ))}
              </div>
            </Field>
            {formDeadlineType === 'days' ? (
              <Field label="Deadline (days from inception)" required>
                <input
                  type="number"
                  min="1"
                  value={formDeadlineDays}
                  onChange={(e) => setFormDeadlineDays(e.target.value)}
                  placeholder="e.g. 30"
                />
              </Field>
            ) : (
              <Field label="Deadline event" required>
                <input
                  value={formDeadlineEvent}
                  onChange={(e) => setFormDeadlineEvent(e.target.value)}
                  placeholder="e.g. Prior to sailing"
                />
              </Field>
            )}
            {editingWarranty && (
              <Field label="Status">
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as WarrantyStatus)}
                >
                  {(['pending', 'survey_done', 'completed', 'waived'] as WarrantyStatus[]).map(
                    (s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    )
                  )}
                </select>
              </Field>
            )}
            <Field label="Notes" span="all">
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Optional context for follow-up"
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── Convert to Survey Modal ───────────────────────────── */}
      {convertWarranty && (
        <Modal
          title="Convert to Survey"
          icon={<ClipboardCheck size={18} />}
          onClose={() => setConvertWarranty(null)}
          width={440}
          closeOnOverlay={false}
          footer={
            <>
              <button onClick={() => setConvertWarranty(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleConfirmConvert}
                disabled={convertSaving}
                className="btn-primary"
              >
                {convertSaving ? 'Creating…' : 'Create & Link'}
              </button>
            </>
          }
        >
          <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Creates a new condition survey and links it to “{convertWarranty.description}”.
          </p>
          <div className="form-grid">
            <Field label="Surveyor" required span="all">
              <select
                value={convertSurveyorId}
                onChange={(e) => setConvertSurveyorId(e.target.value)}
                autoFocus
              >
                <option value="">— Select a surveyor —</option>
                {surveyorsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.companyName}
                    {s.country ? ` (${s.country})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Survey date" required span="all">
              <input
                type="date"
                value={convertDate}
                onChange={(e) => setConvertDate(e.target.value)}
              />
            </Field>
            <Field label="Survey type" span="all">
              {surveyTypesList.length > 0 ? (
                <select value={convertType} onChange={(e) => setConvertType(e.target.value)}>
                  {!surveyTypesList.some((t) => t.name === convertType) && convertType && (
                    <option value={convertType}>{convertType}</option>
                  )}
                  {surveyTypesList.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={convertType} onChange={(e) => setConvertType(e.target.value)} />
              )}
            </Field>
            <Field label="Reference" hint="Taken from the warranty" span="all">
              <input
                value={convertReference}
                onChange={(e) => setConvertReference(e.target.value)}
                placeholder="e.g. SUR9438"
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── Log Reminder Modal ────────────────────────────────── */}
      {reminderWarrantyId && (
        <Modal
          title="Log Reminder"
          icon={<Bell size={18} />}
          onClose={() => setReminderWarrantyId(null)}
          width={400}
          closeOnOverlay={false}
          footer={
            <>
              <button onClick={() => setReminderWarrantyId(null)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleLogReminder} className="btn-primary">
                Log Reminder
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Sent on" required span="all">
              <input
                type="date"
                value={reminderSentAt}
                onChange={(e) => setReminderSentAt(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Channel" span="all">
              <select
                value={reminderChannel}
                onChange={(e) => setReminderChannel(e.target.value as 'email' | 'phone' | 'other')}
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
            <Field label="Next reminder date" span="all">
              <input
                type="date"
                value={reminderNextDate}
                onChange={(e) => setReminderNextDate(e.target.value)}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* ── Waive Modal ───────────────────────────────────────── */}
      {waiveWarrantyId && (
        <Modal
          title="Waive Warranty"
          icon={<FileWarning size={18} />}
          onClose={() => setWaiveWarrantyId(null)}
          width={400}
          closeOnOverlay={false}
          footer={
            <>
              <button onClick={() => setWaiveWarrantyId(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleWaive}
                disabled={!waiveReason.trim()}
                className="btn-secondary"
                style={{
                  background: 'rgba(255,165,0,0.15)',
                  borderColor: 'rgba(255,165,0,0.35)',
                  color: 'var(--warning)',
                  fontWeight: 600,
                  opacity: waiveReason.trim() ? 1 : 0.5
                }}
              >
                Waive Warranty
              </button>
            </>
          }
        >
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

      {/* ── Complete Modal ────────────────────────────────────── */}
      {completeWarrantyId && (
        <Modal
          title="Complete Warranty"
          icon={<Check size={18} />}
          onClose={() => setCompleteWarrantyId(null)}
          width={400}
          closeOnOverlay={false}
          footer={
            <>
              <button onClick={() => setCompleteWarrantyId(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleComplete}
                className="btn-secondary"
                style={{
                  background: 'rgba(0,200,100,0.15)',
                  borderColor: 'rgba(0,200,100,0.35)',
                  color: 'var(--success)',
                  fontWeight: 600
                }}
              >
                Mark Complete
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Completion notes" hint="Optional" span="all">
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

      {/* ── Link to Survey Modal ──────────────────────────────── */}
      {linkWarranty && (
        <Modal
          title="Link to Survey"
          icon={<Link2 size={18} />}
          onClose={() => setLinkWarranty(null)}
          width={560}
        >
          <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Pick an existing survey on file for this vessel to link to:{' '}
            <span style={{ color: 'var(--text-primary)' }}>{linkWarranty.description}</span>
          </p>
          <input
            type="text"
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
            placeholder="Search by type, reference, surveyor…"
            style={{ width: '100%', marginBottom: '12px' }}
          />
          <div>
            {linkLoading ? (
              <div
                style={{
                  padding: '30px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem'
                }}
              >
                Loading surveys…
              </div>
            ) : (
              (() => {
                const q = linkSearch.trim().toLowerCase()
                const filtered = availableSurveys.filter((s) => {
                  if (!q) return true
                  const surveyor = (surveyorMap[s.surveyorId] || '').toLowerCase()
                  return (
                    (s.surveyType || '').toLowerCase().includes(q) ||
                    (s.reference || '').toLowerCase().includes(q) ||
                    surveyor.includes(q) ||
                    (s.surveyDate || '').includes(q)
                  )
                })
                if (availableSurveys.length === 0) {
                  return (
                    <div
                      style={{
                        padding: '30px',
                        textAlign: 'center',
                        color: 'var(--text-secondary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      No condition surveys recorded for this vessel.
                      <br />
                      Use “Convert to Survey” to create one.
                    </div>
                  )
                }
                if (filtered.length === 0) {
                  return (
                    <div
                      style={{
                        padding: '30px',
                        textAlign: 'center',
                        color: 'var(--text-secondary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      No surveys match your search.
                    </div>
                  )
                }
                return filtered.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '10px 12px',
                      marginBottom: '8px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border-color)',
                      background: 'var(--bg-card)'
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)'
                        }}
                      >
                        {formatDateShort(s.surveyDate)} · {s.surveyType || 'Survey'}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {surveyorMap[s.surveyorId] || 'Unknown surveyor'}
                        {s.reference ? ` — ${s.reference}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLinkSurvey(s.id)}
                      className="btn-secondary btn-sm"
                      style={{
                        color: 'var(--violet)',
                        borderColor: 'rgba(138,125,255,0.35)',
                        flexShrink: 0
                      }}
                    >
                      <Link2 size={13} /> Link
                    </button>
                  </div>
                ))
              })()
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
