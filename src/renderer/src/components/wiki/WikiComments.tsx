import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, Reply, Trash2 } from 'lucide-react'
import type { WikiComment } from '../../../../shared/types'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { formatDateTime } from '../../utils/dateUtils'
import { confirmDialog } from '../DialogHost'
import { Spinner } from '../ui'

/** Comment text with @usernames in the accent colour */
function withMentions(text: string): React.ReactNode {
  return text.split(/(@\w+)/g).map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
        {part}
      </span>
    ) : (
      part
    )
  )
}

/** A comment box with @username suggestions (Ctrl+Enter sends) */
function CommentBox({
  users,
  placeholder,
  autoFocus,
  busy,
  onSend,
  onCancel
}: {
  users: { id: string; username: string }[]
  placeholder: string
  autoFocus?: boolean
  busy: boolean
  onSend: (text: string) => Promise<boolean>
  onCancel?: () => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [mention, setMention] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const { user } = useAuth()

  const matches =
    mention === null
      ? []
      : users
          .filter((u) => u.id !== user?.id && u.username.toLowerCase().includes(mention))
          .slice(0, 6)

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const v = e.target.value
    setText(v)
    const before = v.slice(0, e.target.selectionStart || 0)
    const m = before.match(/@(\w*)$/)
    setMention(m ? m[1].toLowerCase() : null)
  }

  const pickUser = (username: string): void => {
    const el = ref.current
    const pos = el?.selectionStart ?? text.length
    const before = text.slice(0, pos).replace(/@(\w*)$/, `@${username} `)
    setText(before + text.slice(pos))
    setMention(null)
    el?.focus()
  }

  const send = async (): Promise<void> => {
    if (!text.trim() || busy) return
    if (await onSend(text.trim())) setText('')
  }

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <textarea
        ref={ref}
        dir="auto"
        rows={2}
        autoFocus={autoFocus}
        value={text}
        onChange={onChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send()
          else if (e.key === 'Escape' && mention !== null) setMention(null)
        }}
        placeholder={placeholder}
        style={{ resize: 'vertical' }}
      />
      {matches.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 50,
            background: 'var(--bg-primary)',
            border: '1px solid var(--glass-border-color)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            minWidth: '160px'
          }}
        >
          {matches.map((u) => (
            <button
              key={u.id}
              type="button"
              className="wiki-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickUser(u.username)}
            >
              @{u.username}
            </button>
          ))}
        </div>
      )}
      {(text.trim() || onCancel) && (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          {onCancel && (
            <button className="btn-ghost btn-sm" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button
            className="btn-primary btn-sm"
            disabled={busy || !text.trim()}
            onClick={() => void send()}
          >
            {busy ? 'Sending...' : 'Comment'}
          </button>
        </div>
      )}
    </div>
  )
}

/** Questions and remarks under a topic; @username notifies that person, a reply the author */
export default function WikiComments({ topicId }: { topicId: string }): React.JSX.Element {
  const { user, hasPermission } = useAuth()
  const { showError } = useToast()
  const [comments, setComments] = useState<WikiComment[] | null>(null)
  const [users, setUsers] = useState<{ id: string; username: string }[]>([])
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isAdmin = hasPermission('admin:settings')

  useEffect(() => {
    let live = true
    window.api
      .wikiComments(topicId)
      .then((rows) => live && setComments(Array.isArray(rows) ? rows : []))
      .catch(() => live && setComments([]))
    return () => {
      live = false
    }
  }, [topicId])

  useEffect(() => {
    window.api
      .notificationsGetUsernames()
      .then((rows) => Array.isArray(rows) && setUsers(rows))
      .catch(() => {})
  }, [])

  const threads = useMemo(() => {
    const list = comments || []
    return list
      .filter((c) => !c.parentId)
      .map((c) => ({ c, replies: list.filter((r) => r.parentId === c.id) }))
  }, [comments])

  const send = async (text: string, parentId: string | null): Promise<boolean> => {
    setBusy(true)
    try {
      const c = await window.api.wikiAddComment(topicId, text, parentId)
      setComments((list) => [...(list || []), c])
      setReplyTo(null)
      return true
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to add the comment')
      return false
    } finally {
      setBusy(false)
    }
  }

  const remove = async (c: WikiComment): Promise<void> => {
    if (!(await confirmDialog('Delete this comment and its replies?'))) return
    try {
      await window.api.wikiDeleteComment(c.id)
      setComments((list) => (list || []).filter((x) => x.id !== c.id && x.parentId !== c.id))
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to delete the comment')
    }
  }

  const renderComment = (c: WikiComment, isReply: boolean): React.JSX.Element => (
    <div key={c.id} className="wiki-comment" style={isReply ? { marginLeft: '18px' } : undefined}>
      <div
        className="muted"
        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}
      >
        <strong style={{ color: 'var(--text-primary)' }}>{c.username}</strong>
        <span>{formatDateTime(c.createdAt)}</span>
        <span style={{ flex: 1 }} />
        {!isReply && (
          <button
            className="btn-ghost btn-icon btn-sm"
            title="Reply"
            aria-label="Reply"
            onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
          >
            <Reply size={13} />
          </button>
        )}
        {(c.userId === user?.id || isAdmin) && (
          <button
            className="btn-ghost btn-icon btn-sm"
            title="Delete"
            aria-label="Delete comment"
            onClick={() => void remove(c)}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <div className="wiki-comment-body" dir="auto">
        {withMentions(c.body)}
      </div>
    </div>
  )

  return (
    <section aria-label="Comments">
      <h3 className="wiki-section-title">
        <MessageSquare size={13} /> Comments{comments?.length ? ` (${comments.length})` : ''}
      </h3>
      {comments === null ? (
        <Spinner size={14} />
      ) : (
        <>
          {threads.map(({ c, replies }) => (
            <div key={c.id}>
              {renderComment(c, false)}
              {replies.map((r) => renderComment(r, true))}
              {replyTo === c.id && (
                <div style={{ marginLeft: '18px', marginBottom: '12px' }}>
                  <CommentBox
                    users={users}
                    autoFocus
                    busy={busy}
                    placeholder={`Reply to ${c.username}...`}
                    onSend={(text) => send(text, c.id)}
                    onCancel={() => setReplyTo(null)}
                  />
                </div>
              )}
            </div>
          ))}
          <CommentBox
            users={users}
            busy={busy}
            placeholder="Ask a question or add a remark (@username to notify, Ctrl+Enter to send)"
            onSend={(text) => send(text, null)}
          />
        </>
      )}
    </section>
  )
}
