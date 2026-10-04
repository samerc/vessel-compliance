import { useState, useEffect } from 'react'
import { X, Sparkles, Loader2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { WHATS_NEW, WhatsNewTag } from '../whatsNew'
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

const TAG_STYLES: Record<
  WhatsNewTag,
  { bg: string; color: string; lightBg: string; lightColor: string }
> = {
  New: {
    bg: 'rgba(0,200,100,0.15)',
    color: '#00c853',
    lightBg: 'rgba(0,140,70,0.1)',
    lightColor: '#007a3d'
  },
  Improved: {
    bg: 'rgba(var(--accent-primary-rgb), 0.15)',
    color: 'var(--accent-primary)',
    lightBg: 'rgba(0,119,163,0.1)',
    lightColor: 'var(--accent-primary)'
  },
  Fixed: {
    bg: 'rgba(255,193,7,0.15)',
    color: '#ffc107',
    lightBg: 'rgba(200,130,0,0.1)',
    lightColor: '#a06000'
  }
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
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'

  // Remote data from GitHub
  const [version, setVersion] = useState('')
  const [date, setDate] = useState('')
  const [items, setItems] = useState<ParsedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function loadFallback(): void {
      const entry = appVersion ? WHATS_NEW.find((e) => e.version === appVersion) : WHATS_NEW[0]
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

    changelogService
      .getChangelogs()
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: isLight ? '#ffffff' : '#1a1d28',
          borderRadius: '18px',
          padding: '32px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 32px 96px rgba(0,0,0,0.45)',
          position: 'relative'
        }}
      >
        {/* Close */}
        <button
          title="Close"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            padding: '4px',
            display: 'flex'
          }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            marginBottom: '22px',
            flexShrink: 0
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Sparkles size={22} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>What&apos;s New</h2>
            {!loading && version && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: '20px',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                    color: 'white'
                  }}
                >
                  v{version}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{date}</span>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '22px' }}>
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
                  const s = TAG_STYLES[item.tag]
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span
                        style={{
                          flexShrink: 0,
                          marginTop: '2px',
                          padding: '2px 9px',
                          borderRadius: '20px',
                          fontSize: '0.68rem',
                          fontWeight: '700',
                          letterSpacing: '0.04em',
                          background: isLight ? s.lightBg : s.bg,
                          color: isLight ? s.lightColor : s.color,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.tag}
                      </span>
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

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <button
            onClick={() => {
              onClose()
              onViewChangelog()
            }}
            style={{
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
        </div>
      </div>
    </div>
  )
}
