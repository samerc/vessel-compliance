import { useEffect, useState } from 'react'
import { useToast } from '../contexts/ToastContext'
import type { VesselAuditEntry, VesselNote } from '../../../shared/types'

// Notes and recent activity beside the vessel tabs. The full notes (replies, mentions)
// stay in the notes window; the full history is the Activity tab.

interface Props {
  vesselId: string
  /** Changes when notes were added or removed elsewhere (the notes window) */
  noteCount: number
  /** May add notes (vessels:edit) */
  canAdd: boolean
  onNoteAdded: () => void
  onOpenAllNotes: () => void
  onOpenActivity: () => void
}

function ago(s: string): string {
  const t = new Date(s).getTime()
  if (isNaN(t)) return ''
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(s).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

// "Assured Added" etc. read as they are; other fields get "changed"
function auditTitle(e: VesselAuditEntry): string {
  return /^Assured /.test(e.fieldName) ? e.fieldName : `${e.fieldName} changed`
}

const sectionTitle: React.CSSProperties = { margin: 0, fontSize: '0.95rem', fontWeight: 600 }
const linkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--accent-primary)',
  font: 'inherit',
  fontSize: '0.8rem',
  fontWeight: 500,
  cursor: 'pointer'
}

export default function VesselSidePanel({
  vesselId,
  noteCount,
  canAdd,
  onNoteAdded,
  onOpenAllNotes,
  onOpenActivity
}: Props): React.JSX.Element {
  const { showError } = useToast()
  const [notes, setNotes] = useState<VesselNote[] | null>(null)
  const [activity, setActivity] = useState<VesselAuditEntry[] | null>(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api
      .getVesselNotes(vesselId)
      .then((d) => !cancelled && setNotes(Array.isArray(d) ? d : []))
      .catch(() => !cancelled && setNotes([]))
    return () => {
      cancelled = true
    }
  }, [vesselId, noteCount])

  useEffect(() => {
    let cancelled = false
    window.api
      .getVesselAuditLog(vesselId)
      .then((d) => !cancelled && setActivity(Array.isArray(d) ? d : []))
      .catch(() => !cancelled && setActivity([]))
    return () => {
      cancelled = true
    }
  }, [vesselId])

  const addNote = async (): Promise<void> => {
    if (!text.trim()) return
    setSaving(true)
    try {
      const note = await window.api.addVesselNote(vesselId, text.trim())
      setNotes((prev) => [...(prev ?? []), note])
      setText('')
      onNoteAdded()
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to add the note')
    } finally {
      setSaving(false)
    }
  }

  const latestNotes = (notes ?? [])
    .filter((n) => !n.parentNoteId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
  const latestActivity = [...(activity ?? [])]
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, 5)

  return (
    <aside
      aria-label="Notes and activity"
      style={{
        flex: '0 0 300px',
        position: 'sticky',
        top: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '16px',
        background: 'var(--bg-card)',
        border: '1px solid var(--glass-border-color)',
        borderRadius: 'var(--radius-card)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={sectionTitle}>Notes</h2>
        <button style={linkStyle} onClick={onOpenAllNotes}>
          All notes{notes && notes.length > 0 ? ` (${notes.length})` : ''}
        </button>
      </div>
      {canAdd && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void addNote()
            }}
            placeholder="Add a note (Ctrl+Enter to save)"
            aria-label="Add a note"
            style={{ resize: 'vertical', width: '100%', fontSize: '0.85rem' }}
          />
          {text.trim() && (
            <button
              className="btn-primary btn-sm"
              style={{ alignSelf: 'flex-end' }}
              onClick={addNote}
              disabled={saving}
            >
              Add note
            </button>
          )}
        </div>
      )}
      {notes === null ? (
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Loading…</span>
      ) : latestNotes.length === 0 ? (
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No notes yet.</span>
      ) : (
        latestNotes.map((n) => (
          <div
            key={n.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'var(--bg-secondary)'
            }}
          >
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {n.createdByUsername}
              </strong>{' '}
              · {ago(n.createdAt)}
            </span>
            <span
              style={{
                fontSize: '0.85rem',
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {n.note}
            </span>
          </div>
        ))
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '4px'
        }}
      >
        <h2 style={sectionTitle}>Activity</h2>
        <button style={linkStyle} onClick={onOpenActivity}>
          See all
        </button>
      </div>
      {activity === null ? (
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Loading…</span>
      ) : latestActivity.length === 0 ? (
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          No changes recorded yet.
        </span>
      ) : (
        <ol
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          {latestActivity.map((e) => (
            <li key={e.id} style={{ display: 'flex', gap: '10px', fontSize: '0.82rem' }}>
              <span
                aria-hidden="true"
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '4px',
                  marginTop: '6px',
                  flex: 'none',
                  background: 'var(--accent-primary)'
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block' }}>{auditTitle(e)}</span>
                {e.newValue && (
                  <span
                    style={{
                      display: 'block',
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {e.newValue}
                  </span>
                )}
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  {ago(e.changedAt)}
                  {e.changedBy ? ` · ${e.changedBy}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
