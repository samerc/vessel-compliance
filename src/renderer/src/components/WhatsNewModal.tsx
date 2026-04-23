import { useState, useEffect } from 'react'
import { X, Sparkles, Loader2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { WHATS_NEW, WhatsNewTag } from '../whatsNew'
import { changelogService } from '../services/ChangelogService'

interface WhatsNewModalProps {
  onClose: () => void
  onViewChangelog: () => void
}

type ParsedItem =
  | { kind: 'tagged'; tag: WhatsNewTag; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'heading'; text: string }

const TAG_STYLES: Record<WhatsNewTag, { bg: string; color: string; lightBg: string; lightColor: string }> = {
  New: {
    bg: 'rgba(0,200,100,0.15)', color: '#00c853',
    lightBg: 'rgba(0,140,70,0.1)', lightColor: '#007a3d',
  },
  Improved: {
    bg: 'rgba(0,170,255,0.15)', color: 'var(--accent-primary)',
    lightBg: 'rgba(0,119,163,0.1)', lightColor: 'var(--accent-primary)',
  },
  Fixed: {
    bg: 'rgba(255,193,7,0.15)', color: '#ffc107',
    lightBg: 'rgba(200,130,0,0.1)', lightColor: '#a06000',
  },
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
 */
function parseNotes(notes: string): ParsedItem[] {
  const items: ParsedItem[] = []
  for (const raw of notes.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    // Section headings
    if (line.startsWith('## ') || line.startsWith('### ')) {
      items.push({ kind: 'heading', text: line.replace(/^#+\s+/, '') })
      continue
    }
    // Tagged bullet: `- New: ...` / `* Improved: ...`
    const tagged = line.match(/^[*-]\s+(New|Improved|Fixed):\s+(.+)/i)
    if (tagged) {
      const tag = (tagged[1].charAt(0).toUpperCase() + tagged[1].slice(1).toLowerCase()) as WhatsNewTag
      if (tag === 'New' || tag === 'Improved' || tag === 'Fixed') {
        items.push({ kind: 'tagged', tag, text: tagged[2].trim() })
        continue
      }
    }
    // Plain bullet
    const bullet = line.match(/^[*-]\s+(.+)/)
    if (bullet) {
      items.push({ kind: 'bullet', text: bullet[1].trim() })
    }
  }
  return items
}

export default function WhatsNewModal({ onClose, onViewChangelog }: WhatsNewModalProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'

  // Remote data from GitHub
  const [version, setVersion] = useState('')
  const [date, setDate] = useState('')
  const [items, setItems] = useState<ParsedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    changelogService.getChangelogs()
      .then(data => {
        if (data.length > 0) {
          const latest = data[0]
          const parsed = parseNotes(latest.notes || '')
          if (parsed.length > 0) {
            // Strip leading 'v' from tag_name (e.g. 'v5.4.0' → '5.4.0')
            setVersion(latest.version.replace(/^v/, ''))
            setDate(new Date(latest.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))
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
  }, [])

  function loadFallback() {
    const entry = WHATS_NEW[0]
    if (!entry) return
    setVersion(entry.version)
    setDate(entry.date)
    setItems(entry.items.map(i => ({ kind: 'tagged' as const, tag: i.tag, text: i.text })))
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: '20px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: isLight ? '#ffffff' : '#1a1d28',
        borderRadius: '18px',
        padding: '32px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 32px 96px rgba(0,0,0,0.45)',
        position: 'relative',
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex' }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '22px', flexShrink: 0 }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Sparkles size={22} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>What's New</h2>
            {!loading && version && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                <span style={{
                  padding: '2px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: '700',
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  color: 'white',
                }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)', padding: '24px 0' }}>
              <Loader2 size={18} className="spinner" /> Loading release notes…
            </div>
          ) : items.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.88rem' }}>No release notes available.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map((item, i) => {
                if (item.kind === 'heading') {
                  return (
                    <div key={i} style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: i > 0 ? '8px' : 0 }}>
                      {item.text}
                    </div>
                  )
                }
                if (item.kind === 'tagged') {
                  const s = TAG_STYLES[item.tag]
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{
                        flexShrink: 0, marginTop: '2px',
                        padding: '2px 9px', borderRadius: '20px',
                        fontSize: '0.68rem', fontWeight: '700', letterSpacing: '0.04em',
                        background: isLight ? s.lightBg : s.bg,
                        color: isLight ? s.lightColor : s.color,
                        whiteSpace: 'nowrap',
                      }}>
                        {item.tag}
                      </span>
                      <span style={{ fontSize: '0.88rem', lineHeight: '1.5' }}>{item.text}</span>
                    </div>
                  )
                }
                // plain bullet
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', paddingLeft: '4px' }}>
                    <span style={{ color: 'var(--accent-primary)', marginTop: '5px', flexShrink: 0, fontSize: '0.6rem' }}>●</span>
                    <span style={{ fontSize: '0.88rem', lineHeight: '1.5' }}>{item.text}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <button
            onClick={() => { onClose(); onViewChangelog() }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent-primary)', fontSize: '0.8rem',
              padding: 0, textDecoration: 'underline', textUnderlineOffset: '3px',
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
