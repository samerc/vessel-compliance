import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Pencil,
  History,
  Trash2,
  Paperclip,
  ExternalLink,
  FolderOpen,
  X,
  FileText,
  AlertTriangle,
  Tag
} from 'lucide-react'
import type { WikiAttachment, WikiTopic } from '../../../../shared/types'
import { foldSearch } from '../../../../shared/wikiSearch'
import { sanitizeHtml } from '../../utils/sanitize'
import { withAutoDir } from './autoDir'
import { formatDateTime } from '../../utils/dateUtils'
import { useToast } from '../../contexts/ToastContext'
import { Badge } from '../ui'
import { confirmDialog } from '../DialogHost'
import WikiHistoryModal from './WikiHistoryModal'
import WikiComments from './WikiComments'

interface Props {
  topic: WikiTopic
  /** A deleted topic: no editing, files or comments changes */
  readOnly?: boolean
  commentsEnabled: boolean
  /** Searched words, highlighted in the text */
  words: string[]
  /** Title of the app page the topic explains ('' = none) */
  featureTitle: string
  onOpenTopic: (id: string) => void
  onOpenFeature: () => void
  onEdit: () => void
  onDelete: () => void
  /** An earlier version was made current */
  onRestored: (topic: WikiTopic) => void
}

const HIGHLIGHT = 'wiki-hit'

/** Marks the searched words in the text (CSS Custom Highlight: the HTML is not changed) */
function useSearchHighlight(el: HTMLElement | null, words: string[], html: string): void {
  useEffect(() => {
    const registry = typeof CSS !== 'undefined' ? CSS.highlights : undefined
    if (!registry) return
    registry.delete(HIGHLIGHT)
    if (!el || words.length === 0) return
    const ranges: Range[] = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n && ranges.length < 500; n = walker.nextNode()) {
      const text = n.textContent || ''
      const re = /[\p{L}\p{N}\p{M}]+/gu
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const f = foldSearch(m[0])
        if (!f || !words.some((w) => f.includes(w))) continue
        const r = document.createRange()
        r.setStart(n, m.index)
        r.setEnd(n, m.index + m[0].length)
        ranges.push(r)
      }
    }
    if (ranges.length) registry.set(HIGHLIGHT, new Highlight(...ranges))
    return () => {
      registry.delete(HIGHLIGHT)
    }
  }, [el, words, html])
}

export default function WikiTopicView({
  topic,
  readOnly,
  commentsEnabled,
  words,
  featureTitle,
  onOpenTopic,
  onOpenFeature,
  onEdit,
  onDelete,
  onRestored
}: Props): React.JSX.Element {
  const { showError } = useToast()
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null)
  const [attachments, setAttachments] = useState<WikiAttachment[]>([])
  const [exists, setExists] = useState<Record<string, boolean>>({})
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)

  const html = useMemo(() => withAutoDir(sanitizeHtml(topic.bodyHtml || '')), [topic.bodyHtml])
  useSearchHighlight(bodyEl, words, html)

  useEffect(() => {
    let live = true
    window.api
      .wikiAttachments(topic.id)
      .then((rows) => live && setAttachments(Array.isArray(rows) ? rows : []))
      .catch(() => live && setAttachments([]))
    return () => {
      live = false
    }
  }, [topic.id])

  // Files are linked, not copied: say so when one is no longer where it was
  useEffect(() => {
    if (attachments.length === 0) return
    let live = true
    window.api
      .fsExistsMany(attachments.map((a) => a.filePath))
      .then((flags: unknown) => {
        if (!live || !Array.isArray(flags)) return
        const m: Record<string, boolean> = {}
        attachments.forEach((a, i) => (m[a.id] = !!flags[i]))
        setExists(m)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [attachments])

  const attach = async (paths?: string[]): Promise<void> => {
    try {
      const rows = await window.api.wikiAddAttachments(topic.id, paths)
      if (Array.isArray(rows)) setAttachments(rows)
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to attach the files')
    }
  }

  const unlink = async (a: WikiAttachment): Promise<void> => {
    if (
      !(await confirmDialog(`Remove "${a.fileName}" from this topic? The file itself is kept.`, {
        title: 'Remove file',
        confirmLabel: 'Remove'
      }))
    )
      return
    try {
      await window.api.wikiRemoveAttachment(a.id)
      setAttachments((list) => list.filter((x) => x.id !== a.id))
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to remove the file')
    }
  }

  const openFile = async (a: WikiAttachment): Promise<void> => {
    const res = (await window.api.fsOpen(a.filePath).catch((e: unknown) => ({
      error: true,
      message: e instanceof Error ? e.message : String(e)
    }))) as unknown
    if (res && typeof res === 'object' && 'error' in res)
      showError((res as { message?: string }).message || 'The file could not be opened')
  }

  // Links: another topic opens here, web links in the browser
  const onBodyClick = (e: React.MouseEvent): void => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    e.preventDefault()
    const href = a.getAttribute('href') || ''
    if (href.startsWith('#wiki/')) onOpenTopic(href.slice(6))
    else if (/^(https?:|mailto:)/i.test(href)) window.open(href, '_blank')
  }

  const dropProps = readOnly
    ? {}
    : {
        onDragEnter: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return
          dragDepth.current++
          setDragOver(true)
        },
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragOver(false)
        },
        onDragOver: (e: React.DragEvent) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault()
        },
        onDrop: (e: React.DragEvent) => {
          dragDepth.current = 0
          setDragOver(false)
          const files = Array.from(e.dataTransfer.files || [])
          if (files.length === 0) return
          e.preventDefault()
          const paths = files.map((f) => window.api.getFilePath(f)).filter(Boolean)
          if (paths.length) void attach(paths)
        }
      }

  return (
    <div className={dragOver ? 'wiki-drop' : undefined} {...dropProps}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="wiki-title" dir="auto">
            {topic.title}
          </h2>
          <div className="wiki-meta">
            {topic.category && <Badge tone="accent">{topic.category}</Badge>}
            {topic.tags.map((t) => (
              <span key={t} className="wiki-tag" dir="auto">
                <Tag size={10} style={{ marginRight: '3px', verticalAlign: '-1px' }} />
                {t}
              </span>
            ))}
            <span>
              Updated {formatDateTime(topic.updatedAt)}
              {topic.updatedByUsername ? ` by ${topic.updatedByUsername}` : ''}
            </span>
          </div>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button className="btn-primary btn-sm" onClick={onEdit}>
              <Pencil size={13} /> Edit
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setHistoryOpen(true)}>
              <History size={13} /> History
            </button>
            <button
              className="btn-ghost btn-icon btn-sm"
              onClick={onDelete}
              title="Delete topic"
              aria-label="Delete topic"
            >
              <Trash2 size={14} style={{ color: 'var(--danger)' }} />
            </button>
          </div>
        )}
      </div>

      {featureTitle && !readOnly && (
        <button className="btn-ghost btn-sm" style={{ marginTop: '10px' }} onClick={onOpenFeature}>
          <ExternalLink size={13} /> Open {featureTitle} in the app
        </button>
      )}

      <div
        ref={setBodyEl}
        className="wiki-body"
        style={{ marginTop: '16px' }}
        onClick={onBodyClick}
        dangerouslySetInnerHTML={{
          __html: html || '<p style="color: var(--text-secondary)">No text yet.</p>'
        }}
      />

      {(attachments.length > 0 || !readOnly) && (
        <section aria-label="Files">
          <h3 className="wiki-section-title">
            <Paperclip size={13} /> Files
            {!readOnly && (
              <button
                className="btn-ghost btn-sm"
                style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}
                onClick={() => void attach()}
                title="Link files to this topic; they stay where they are"
              >
                <Paperclip size={13} /> Attach files
              </button>
            )}
          </h3>
          {attachments.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
              No files. Attach or drop files here: they are linked where they are, never copied.
            </p>
          ) : (
            attachments.map((a) => {
              const missing = exists[a.id] === false
              return (
                <div key={a.id} className={`wiki-attachment${missing ? ' missing' : ''}`}>
                  {missing ? (
                    <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                  ) : (
                    <FileText size={15} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button
                      className="btn-link"
                      style={{
                        fontWeight: 600,
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'var(--text-primary)',
                        cursor: missing ? 'default' : 'pointer',
                        textAlign: 'start'
                      }}
                      disabled={missing}
                      onClick={() => void openFile(a)}
                      title={missing ? 'File not found where it was linked' : 'Open'}
                    >
                      {a.fileName}
                    </button>
                    <div
                      className="muted"
                      style={{
                        fontSize: '0.72rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={a.filePath}
                    >
                      {missing ? 'Not found: ' : ''}
                      {a.filePath}
                    </div>
                  </div>
                  {!missing && (
                    <button
                      className="btn-ghost btn-icon btn-sm"
                      title="Show in folder"
                      aria-label="Show in folder"
                      onClick={() => void window.api.shellShowItemInFolder(a.filePath)}
                    >
                      <FolderOpen size={14} />
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      className="btn-ghost btn-icon btn-sm"
                      title="Remove from this topic (the file is kept)"
                      aria-label="Remove file"
                      onClick={() => void unlink(a)}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </section>
      )}

      {commentsEnabled && !readOnly && <WikiComments topicId={topic.id} />}

      {historyOpen && (
        <WikiHistoryModal
          topic={topic}
          onClose={() => setHistoryOpen(false)}
          onRestored={(t) => {
            setHistoryOpen(false)
            onRestored(t)
          }}
        />
      )}
    </div>
  )
}
