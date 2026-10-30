import { useCallback, useEffect, useState } from 'react'
import {
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion
} from 'lucide-react'
import type {
  PartyScreeningStatus,
  SanctionsScreening,
  ScreenedParty,
  ScreeningStatus
} from '../../../shared/types'
import { Badge, Modal } from './ui'
import type { BadgeTone } from './ui'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime } from '../utils/dateUtils'
import { saveFile, SaveCancelledError } from '../utils/saveFile'
import { requestNavigate } from '../features'
import {
  buildScreeningReportPdf,
  screeningReportFileName,
  SCREENING_STATUS_LABELS,
  SCREENING_TRIGGER_LABELS
} from '../services/ScreeningReportService'

const TONES: Record<PartyScreeningStatus, BadgeTone> = {
  CLEAR: 'success',
  REVIEW: 'warning',
  MATCH: 'danger',
  NOT_SCREENED: 'neutral',
  ERROR: 'danger'
}

export function ScreeningStatusPill({
  status,
  overridden
}: {
  status: PartyScreeningStatus
  overridden?: boolean
}): React.JSX.Element {
  const Icon =
    status === 'CLEAR' ? ShieldCheck : status === 'NOT_SCREENED' ? ShieldQuestion : ShieldAlert
  return (
    <Badge tone={overridden ? 'violet' : TONES[status]}>
      <Icon size={11} /> {SCREENING_STATUS_LABELS[status]}
      {overridden ? ' - overridden' : ''}
    </Badge>
  )
}

export function ScreeningPartiesTable({
  parties
}: {
  parties: ScreenedParty[]
}): React.JSX.Element {
  if (parties.length === 0)
    return <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No parties to screen.</p>
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Party</th>
            <th>Role</th>
            <th>Result</th>
            <th>Checked</th>
          </tr>
        </thead>
        <tbody>
          {parties.map((p) => (
            <tr key={`${p.kind}:${p.id}`}>
              <td>
                {p.name}
                {p.kind === 'name' && (
                  <span
                    style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginLeft: 6 }}
                    title="Typed by hand, not in the Directory: screened by the name"
                  >
                    (typed)
                  </span>
                )}
              </td>
              <td style={{ color: 'var(--text-secondary)' }}>{p.role}</td>
              <td>
                <ScreeningStatusPill status={p.status} />
                {p.bestScore ? (
                  <span style={{ marginLeft: 6, fontSize: '0.78rem' }}>{p.bestScore}%</span>
                ) : null}
              </td>
              <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                {p.checkedAt ? formatDateTime(p.checkedAt) : '-'}
                {p.reused && p.status === 'CLEAR' ? ' (earlier check)' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

async function downloadReport(s: SanctionsScreening): Promise<void> {
  const blob = await buildScreeningReportPdf(s)
  await saveFile(blob, screeningReportFileName(s))
}

/**
 * The sanctions check of a blocking step (conversion, endorsement): the parties, the result,
 * and for the admin / Compliance group an override with a reason. `screening` null = not
 * run yet.
 */
export function ScreeningPanel({
  screening,
  running,
  onRun,
  onChange,
  blockingText
}: {
  screening: SanctionsScreening | null
  running: boolean
  onRun: () => void
  onChange: (s: SanctionsScreening) => void
  /** What a hit stops, e.g. "Create Policy" */
  blockingText: string
}): React.JSX.Element {
  const { hasPermission } = useAuth()
  const { showError } = useToast()
  const [overriding, setOverriding] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  // A party confirmed sanctioned (MATCH) can never be overridden
  const sanctioned = screening?.outcome === 'MATCH'
  const canOverride = hasPermission('compliance:override') && !sanctioned

  const blocked = !!screening && screening.outcome !== 'CLEAR' && !screening.overrideAt
  const tone =
    !screening || running
      ? 'var(--text-secondary)'
      : screening.outcome === 'CLEAR'
        ? 'var(--success)'
        : screening.overrideAt
          ? 'var(--accent-primary)'
          : 'var(--danger)'

  const saveOverride = async (): Promise<void> => {
    if (!screening) return
    setSaving(true)
    try {
      const s = await window.api.screeningSetOverride(screening.id, reason)
      onChange(s)
      setOverriding(false)
      setReason('')
    } catch (e) {
      showError((e instanceof Error && e.message) || 'The override was not saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-label="Sanctions check"
      style={{
        border: `1px solid ${tone}`,
        borderRadius: '10px',
        padding: '14px 16px',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.95rem' }}>Sanctions check</strong>
        {running ? (
          <Badge tone="accent">
            <Loader2 size={11} className="spinner" /> Screening the parties...
          </Badge>
        ) : screening ? (
          <ScreeningStatusPill status={screening.outcome} overridden={!!screening.overrideAt} />
        ) : null}
        <span style={{ flex: 1 }} />
        {screening && !running && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              void downloadReport(screening).catch((e) => {
                if (!(e instanceof SaveCancelledError)) showError('The report was not saved')
              })
            }
          >
            <Download size={14} /> Report
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onRun} disabled={running}>
          <RefreshCw size={14} /> Screen again
        </button>
      </div>

      {screening && !running && (
        <>
          <p style={{ margin: 0, fontSize: '0.86rem', color: tone }}>
            {screening.outcome === 'CLEAR'
              ? 'Every party is clear.'
              : screening.overrideAt
                ? `Overridden by ${screening.overrideBy} on ${formatDateTime(screening.overrideAt)}: ${screening.overrideReason}`
                : screening.outcome === 'ERROR'
                  ? `${screening.error || 'Some parties could not be checked.'} ${blockingText} stays blocked until they are checked.`
                  : sanctioned
                    ? `A party is confirmed sanctioned. ${blockingText} is blocked and cannot be overridden; only reversing the decision in the Compliance Center (by a user allowed to clear hits) lifts it.`
                    : `${blockingText} is blocked until the hits are reviewed in the Compliance Center (Clear or Sanction)${canOverride ? ', or you override the block with a reason' : ', or a Compliance user overrides it'}.`}
          </p>
          <ScreeningPartiesTable parties={screening.parties} />
          {blocked && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {screening.outcome !== 'ERROR' && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => requestNavigate({ tab: 'compliance', sub: 'sanctions' })}
                >
                  Open the Compliance Center
                </button>
              )}
              {canOverride && !overriding && (
                <button type="button" className="btn-secondary" onClick={() => setOverriding(true)}>
                  Override the block...
                </button>
              )}
            </div>
          )}
          {blocked && canOverride && overriding && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85rem' }}>
                Why may this go ahead? (kept with the screening and in the activity log)
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  style={{ width: '100%', marginTop: '6px' }}
                  aria-label="Reason for the override"
                />
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving || reason.trim().length < 5}
                  onClick={() => void saveOverride()}
                >
                  Override and go ahead
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setOverriding(false)
                    setReason('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/**
 * The sanctions badge of a quotation / policy header: the worst status of its parties. A click
 * shows each party, the screenings so far, and Screen now.
 */
export function ScreeningBadge({
  contextType,
  contextId,
  refreshKey
}: {
  contextType: 'quotation' | 'policy'
  contextId: string
  /** Change it to reload (e.g. after a background screening) */
  refreshKey?: unknown
}): React.JSX.Element | null {
  const { showError } = useToast()
  const [status, setStatus] = useState<ScreeningStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<SanctionsScreening[]>([])
  const [running, setRunning] = useState(false)

  const load = useCallback(
    (): Promise<void> =>
      window.api.screeningGetStatus(contextType, contextId).then((s) => {
        if (s && !('error' in s)) setStatus(s)
      }),
    [contextType, contextId]
  )

  useEffect(() => {
    let alive = true
    window.api.screeningGetStatus(contextType, contextId).then((s) => {
      if (alive && s && !('error' in s)) setStatus(s)
    })
    return () => {
      alive = false
    }
  }, [contextType, contextId, refreshKey])

  const openDetails = async (): Promise<void> => {
    setOpen(true)
    const h = await window.api.screeningList(contextType, [contextId])
    setHistory(Array.isArray(h) ? h : [])
  }

  const screenNow = async (): Promise<void> => {
    setRunning(true)
    try {
      const s = await window.api.screeningCreate({ trigger: 'manual', contextType, contextId })
      setHistory((h) => [s, ...h])
      await load()
    } catch (e) {
      showError((e instanceof Error && e.message) || 'The screening failed')
    } finally {
      setRunning(false)
    }
  }

  if (!status) return null
  return (
    <>
      <button
        type="button"
        onClick={() => void openDetails()}
        title="Sanctions status of the vessel, assureds and customer: click for details"
        aria-label={`Sanctions: ${SCREENING_STATUS_LABELS[status.outcome]}`}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <ScreeningStatusPill status={status.outcome} />
      </button>
      {open && (
        <Modal
          title="Sanctions screening"
          onClose={() => setOpen(false)}
          width={760}
          footer={
            <>
              {status.outcome === 'REVIEW' && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setOpen(false)
                    requestNavigate({ tab: 'compliance', sub: 'sanctions' })
                  }}
                >
                  Open the Compliance Center
                </button>
              )}
              <button className="btn-primary" onClick={() => void screenNow()} disabled={running}>
                {running ? <Loader2 size={14} className="spinner" /> : <RefreshCw size={14} />}{' '}
                Screen now
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
            A party counts as clear for 30 days after a clear check (and only if the lists were not
            updated since). Screen now checks the others.
          </p>
          <ScreeningPartiesTable parties={status.parties} />
          {history.length > 0 && (
            <>
              <h4 className="form-section-title" style={{ marginTop: '20px' }}>
                Screenings
              </h4>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>For</th>
                      <th>Result</th>
                      <th>By</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>{formatDateTime(h.createdAt)}</td>
                        <td>{SCREENING_TRIGGER_LABELS[h.trigger]}</td>
                        <td>
                          <ScreeningStatusPill status={h.outcome} overridden={!!h.overrideAt} />
                          {h.overrideAt && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              {h.overrideBy}: {h.overrideReason}
                            </div>
                          )}
                        </td>
                        <td>{h.createdBy || '-'}</td>
                        <td>
                          <button
                            className="btn-secondary"
                            title="Download the screening report (PDF)"
                            aria-label="Download the screening report"
                            onClick={() =>
                              void downloadReport(h).catch((e) => {
                                if (!(e instanceof SaveCancelledError))
                                  showError('The report was not saved')
                              })
                            }
                          >
                            <Download size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  )
}
