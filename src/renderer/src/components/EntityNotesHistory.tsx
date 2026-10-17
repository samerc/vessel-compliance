import { useEffect, useState } from 'react'
import { Trash2, StickyNote, History } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import type { ActivityLogEntry, EntityNote } from '../../../shared/types'
import { Badge, EmptyState, Spinner } from './ui'
import type { BadgeTone } from './ui'
import { confirmDialog } from './DialogHost'

// "Notes & history" tab of the Directory entity panel: free notes (@username notifies that user)
// and every activity-log entry recorded against the entity (edits, documents, sanctions...).

function when(s: string): string {
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const ACTION_TONES: Record<string, BadgeTone> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  DECIDE: 'warning',
  MERGE: 'violet',
  EXPORT: 'accent'
}

const sectionTitle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  margin: '0 0 8px',
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.7px',
  color: 'var(--text-secondary)',
  fontWeight: 600
}

export default function EntityNotesHistory({
  entityId,
  canAdd,
  onCountChange
}: {
  entityId: string
  /** May add notes (entities:edit) */
  canAdd: boolean
  /** Number of notes, for the tab label */
  onCountChange?: (n: number) => void
}): React.JSX.Element {
  const { showError } = useToast()
  const { user } = useAuth()
  const [notes, setNotes] = useState<EntityNote[] | null>(null)
  const [history, setHistory] = useState<ActivityLogEntry[] | null>(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([window.api.getEntityNotes(entityId), window.api.getEntityHistory(entityId)])
      .then(([n, h]) => {
        if (cancelled) return
        setNotes(Array.isArray(n) ? n : [])
        setHistory(Array.isArray(h) ? h : [])
      })
      .catch(() => {
        if (cancelled) return
        setNotes([])
        setHistory([])
      })
    return () => {
      cancelled = true
    }
  }, [entityId])

  useEffect(() => {
    if (notes) onCountChange?.(notes.length)
  }, [notes, onCountChange])

  const addNote = async (): Promise<void> => {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      const note = await window.api.addEntityNote(entityId, text.trim())
      setNotes((prev) => [note, ...(prev ?? [])])
      setText('')
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to add the note')
    } finally {
      setSaving(false)
    }
  }

  const removeNote = async (n: EntityNote): Promise<void> => {
    if (!(await confirmDialog('Delete this note?'))) return
    try {
      await window.api.deleteEntityNote(n.id)
      setNotes((prev) => (prev ?? []).filter((x) => x.id !== n.id))
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to delete the note')
    }
  }

  return (
    <div
      style={{ padding: '4px 20px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}
    >
      <section aria-label="Notes">
        <h3 style={sectionTitle}>
          <StickyNote size={13} /> Notes
        </h3>
        {canAdd && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}
          >
            <textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void addNote()
              }}
              placeholder="Add a note (Ctrl+Enter to save, @username to notify)"
              aria-label="New note"
              style={{ resize: 'vertical' }}
            />
            {text.trim() && (
              <button
                className="btn-primary btn-sm"
                style={{ alignSelf: 'flex-end' }}
                disabled={saving}
                onClick={() => void addNote()}
              >
                {saving ? 'Saving...' : 'Add note'}
              </button>
            )}
          </div>
        )}
        {notes === null ? (
          <Spinner size={16} />
        ) : notes.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
            No notes yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {notes.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--glass-border-color)'
                }}
              >
                <div
                  style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', wordBreak: 'break-word' }}
                >
                  {n.note}
                </div>
                <div
                  className="muted"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '4px',
                    fontSize: '0.72rem'
                  }}
                >
                  <span>
                    {n.createdByUsername || 'unknown'} · {when(n.createdAt)}
                  </span>
                  {canAdd && n.createdByUserId === user?.id && (
                    <button
                      title="Delete note"
                      aria-label="Delete note"
                      onClick={() => void removeNote(n)}
                      style={{
                        color: 'var(--danger)',
                        padding: '2px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex'
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="History">
        <h3 style={sectionTitle}>
          <History size={13} /> History
        </h3>
        {history === null ? (
          <Spinner size={16} />
        ) : history.length === 0 ? (
          <EmptyState compact title="No recorded changes" />
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {history.map((h) => (
              <li
                key={h.id}
                style={{
                  display: 'flex',
                  gap: '10px',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--table-border)'
                }}
              >
                <div style={{ flexShrink: 0, paddingTop: '1px' }}>
                  <Badge tone={ACTION_TONES[h.action] || 'neutral'}>{h.action.toLowerCase()}</Badge>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', wordBreak: 'break-word' }}>
                    {h.details || `${h.module} ${h.action.toLowerCase()}`}
                  </div>
                  <div className="muted" style={{ fontSize: '0.72rem', marginTop: '2px' }}>
                    {h.username || 'system'} · {when(h.createdAt)}
                    {h.module !== 'Entities' ? ` · ${h.module}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
