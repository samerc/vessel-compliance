// Sanctions Search page helpers (pure): extra details that narrow the results, score bands,
// list freshness.

export type DetailCheck = 'match' | 'differs' | null

const years = (s?: string | null): string[] => String(s || '').match(/\b(18|19|20)\d{2}\b/g) || []

/** Date of birth: compared on the year (the lists write dates in many ways, often year only).
 *  null = nothing to compare (no date typed, or none on the list) */
export function checkBirth(typed: string, listed?: string | null): DetailCheck {
  const t = years(typed)
  const l = years(listed)
  if (t.length === 0 || l.length === 0) return null
  return t.some((y) => l.includes(y)) ? 'match' : 'differs'
}

const words = (s?: string | null): string[] =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3)

let regionNames: Intl.DisplayNames | null = null
/** A listed nationality as read: two-letter country codes ("af", "IR") become country names */
export function nationalityName(listed?: string | null): string {
  const s = String(listed || '').trim()
  if (!s) return ''
  return s
    .split(/\s*[;,]\s*/)
    .map((part) => {
      if (!/^[a-z]{2}$/i.test(part)) return part
      try {
        regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' })
        return regionNames.of(part.toUpperCase()) || part
      } catch {
        return part
      }
    })
    .join(', ')
}

/** Nationality: the same word stem counts ("Iran" / "Iranian", "Lebanon" / "Lebanese") */
export function checkNationality(typed: string, listed?: string | null): DetailCheck {
  const t = words(typed)
  const l = words(nationalityName(listed))
  if (t.length === 0 || l.length === 0) return null
  const stem = (w: string): string => w.slice(0, Math.min(5, w.length - 1))
  return t.some((a) => l.some((b) => a.startsWith(stem(b)) || b.startsWith(stem(a))))
    ? 'match'
    : 'differs'
}

/** IMO: 7 digits, equal or not */
export function checkImo(typed: string, listed?: string | null): DetailCheck {
  const t = typed.replace(/\D/g, '')
  const l = String(listed || '').replace(/\D/g, '')
  if (t.length !== 7 || !l) return null
  return t === l ? 'match' : 'differs'
}

export interface ScoreBand {
  label: string
  color: string
}

/** 90%+ strong (red), 80-89% possible (amber), below weak (grey) */
export function scoreBand(score?: number): ScoreBand {
  const s = score || 0
  if (s >= 0.9) return { label: 'Strong', color: 'var(--danger)' }
  if (s >= 0.8) return { label: 'Possible', color: 'var(--warning)' }
  return { label: 'Weak', color: 'var(--text-secondary)' }
}

/** "today", "3d ago", "5w ago"; '' when never updated */
export function updatedAgo(iso?: string | null, now = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso.includes('T') || iso.includes('Z') ? iso : iso.replace(' ', 'T')).getTime()
  if (isNaN(t)) return ''
  const days = Math.floor((now - t) / 86400000)
  if (days <= 0) return 'today'
  if (days < 14) return `${days}d ago`
  if (days < 70) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

/** Days since the list was updated (Infinity when never) */
export function daysSince(iso?: string | null, now = Date.now()): number {
  if (!iso) return Infinity
  const t = new Date(iso.includes('T') || iso.includes('Z') ? iso : iso.replace(' ', 'T')).getTime()
  return isNaN(t) ? Infinity : (now - t) / 86400000
}
