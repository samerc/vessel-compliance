import { useState, useEffect } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { Modal, Badge, type BadgeTone } from './ui'
import { WHATS_NEW, WhatsNewTag, currentWhatsNew } from '../whatsNew'
import { changelogService } from '../services/ChangelogService'
import { FEATURES } from '../features'

interface WhatsNewModalProps {
  onClose: () => void
  onViewChangelog: () => void
  /** Installed version (package.json); the notes shown must be for this version */
  appVersion?: string
  /** Opens a feature from a "Try it" link */
  onTry?: (featureId: string) => void
}

type ParsedItem =
  | { kind: 'tagged'; tag: WhatsNewTag; text: string; featureId?: string }
  | { kind: 'bullet'; text: string; featureId?: string }
  | { kind: 'heading'; text: string }

const TAG_TONES: Record<WhatsNewTag, BadgeTone> = {
  New: 'success',
  Improved: 'accent',
  Fixed: 'warning'
}

/**
 * Parse GitHub release markdown into display items.
 * Supports tagged lines: `- New: some text` / `- Improved: ...` / `- Fixed: ...`
 * Falls back to plain bullet for other `- item` lines.
 *
 * Write GitHub release notes like:
 *   - New: War Breach Calculator saves history
 *   - Improved: Fleet view sortable columns
 *   - Fixed: Entity panel scroll bug
 * End a line with `[try:feature-id]` (an id from src/features.ts) to add a "Try it" button.
 */
function parseNotes(notes: string): ParsedItem[] {
  const items: ParsedItem[] = []
  for (const raw of notes.split('\n')) {
    let line = raw.trim()
    if (!line) continue
    // Optional trailing [try:feature-id]
    let featureId: string | undefined
    const tryMatch = line.match(/\s*\[try:([a-z0-9-]+)\]\s*$/i)
    if (tryMatch) {
      featureId = tryMatch[1]
      line = line.slice(0, tryMatch.index).trim()
    }
    // Section headings
    if (line.startsWith('## ') || line.startsWith('### ')) {
      items.push({ kind: 'heading', text: line.replace(/^#+\s+/, '') })
      continue
    }
    // Tagged bullet: `- New: ...` / `* Improved: ...`
    const tagged = line.match(/^[*-]\s+(New|Improved|Fixed):\s+(.+)/i)
    if (tagged) {
      const tag = (tagged[1].charAt(0).toUpperCase() +
        tagged[1].slice(1).toLowerCase()) as WhatsNewTag
      if (tag === 'New' || tag === 'Improved' || tag === 'Fixed') {
        items.push({ kind: 'tagged', tag, text: tagged[2].trim(), featureId })
        continue
      }
    }
    // Plain bullet
    const bullet = line.match(/^[*-]\s+(.+)/)
    if (bullet) {
      items.push({ kind: 'bullet', text: bullet[1].trim(), featureId })
    }
  }
  return items
}

/** Version named by the first `## X.Y.Z` heading of a release body, if any */
function headingVersion(notes: string): string | null {
  const m = notes.match(/^#{1,3}\s+v?(\d+\.\d+\.\d+)\b/m)
  return m ? m[1] : null
}

export default function WhatsNewModal({
  onClose,
  onViewChangelog,
  appVersion,
  onTry
}: WhatsNewModalProps): React.JSX.Element {
  // Remote data from GitHub
  const [version, setVersion] = useState('')
  const [date, setDate] = useState('')
  const [items, setItems] = useState<ParsedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function loadFallback(): void {
      const entry = appVersion ? currentWhatsNew(appVersion) : WHATS_NEW[0]
      if (!entry) {
        if (appVersion) setVersion(appVersion)
        return
      }
      setVersion(entry.version)
      setDate(entry.date)
      setItems(
        entry.items.map((i) => ({
          kind: 'tagged' as const,
          tag: i.tag,
          text: i.text,
          featureId: i.featureId
        }))
      )
    }

    // A hot-update entry is only here (its GitHub release is the version's, not the update's)
    const isUpdate = !!appVersion && !!currentWhatsNew(appVersion)?.update
    ;(isUpdate ? Promise.resolve([]) : changelogService.getChangelogs())
      .then((data) => {
        // The release for the INSTALLED version (not just the newest one), and only
        // when its body is really about that version (a stale copy names another)
        const latest = appVersion
          ? data.find((r) => r.version.replace(/^v/, '') === appVersion)
          : data[0]
        if (latest) {
          const notes = latest.notes || ''
          const named = headingVersion(notes)
          const parsed =
            named && named !== latest.version.replace(/^v/, '') ? [] : parseNotes(notes)
          if (parsed.length > 0) {
            // Strip leading 'v' from tag_name (e.g. 'v5.4.0' → '5.4.0')
            setVersion(latest.version.replace(/^v/, ''))
            setDate(
              new Date(latest.date).toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric'
              })
            )
            setItems(parsed)
          } else {
            // GitHub release exists but body is empty — use hardcoded fallback
            loadFallback()
          }
        } else {
          loadFallback()
        }
      })
      .catch(() => loadFallback())
      .finally(() => setLoading(false))
  }, [appVersion])

  // Only for features that exist (an old note may name a removed one)
  const tryButton = (featureId?: string): React.JSX.Element | null =>
    featureId && onTry && FEATURES.some((f) => f.id === featureId) ? (
      <button
        className="btn-ghost btn-sm"
        style={{ color: 'var(--accent-primary)', flexShrink: 0, padding: '2px 8px' }}
        onClick={() => {
          onClose()
          onTry(featureId)
        }}
      >
        Try it
      </button>
    ) : null

  return (
    <Modal
      title="What's new"
      icon={<Sparkles size={18} />}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button
            onClick={() => {
              onClose()
              onViewChangelog()
            }}
            style={{
              marginRight: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--accent-primary)',
              fontSize: '0.8rem',
              padding: 0,
              textDecoration: 'underline',
              textUnderlineOffset: '3px'
            }}
          >
            View full changelog
          </button>
          <button onClick={onClose} className="btn-primary" style={{ padding: '10px 28px' }}>
            Got it
          </button>
        </>
      }
    >
      {!loading && version && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Badge tone="accent">v{version}</Badge>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{date}</span>
        </div>
      )}

      {/* Body */}
      <div>
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: 'var(--text-secondary)',
              padding: '24px 0'
            }}
          >
            <Loader2 size={18} className="spinner" /> Loading release notes…
          </div>
        ) : items.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.88rem' }}>
            No release notes for this version yet. Earlier changes are in the release history.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {items.map((item, i) => {
              if (item.kind === 'heading') {
                return (
                  <div
                    key={i}
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginTop: i > 0 ? '8px' : 0
                    }}
                  >
                    {item.text}
                  </div>
                )
              }
              if (item.kind === 'tagged') {
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <Badge tone={TAG_TONES[item.tag]} style={{ flexShrink: 0, marginTop: '2px' }}>
                      {item.tag}
                    </Badge>
                    <span style={{ fontSize: '0.88rem', lineHeight: '1.5', flex: 1 }}>
                      {item.text}
                    </span>
                    {tryButton(item.featureId)}
                  </div>
                )
              }
              // plain bullet
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    paddingLeft: '4px'
                  }}
                >
                  <span
                    style={{
                      color: 'var(--accent-primary)',
                      marginTop: '5px',
                      flexShrink: 0,
                      fontSize: '0.6rem'
                    }}
                  >
                    ●
                  </span>
                  <span style={{ fontSize: '0.88rem', lineHeight: '1.5', flex: 1 }}>
                    {item.text}
                  </span>
                  {tryButton(item.featureId)}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
