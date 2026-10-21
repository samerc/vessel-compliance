/**
 * Wiki search helpers (pure, used by the main process and the renderer).
 *
 * Text is folded before it is compared, so a search finds a topic however it is spelled:
 * lower case, accents removed ("Avarie" = "avarié"), Arabic short vowels / tatweel removed,
 * hamza seats joined (أ إ آ ٱ -> ا, ؤ -> و, ئ -> ي), ى -> ي, ة -> ه, Arabic-Indic digits -> 0-9,
 * punctuation -> spaces.
 */

export function foldSearch(text: string | null | undefined): string {
  if (!text) return ''
  return (
    text
      // NFKD splits hamza / madda off their seats and accents off Latin letters; marks dropped
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/ـ/g, '')
      .replace(/ٱ/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  )
}

/** The searched words, folded, without repeats */
export function searchWords(query: string): string[] {
  return [...new Set(foldSearch(query).split(' ').filter(Boolean))]
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

/** Plain text of the editor's HTML (blocks on their own lines), for search and snippets */
export function htmlToSearchText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/tr|\/div)\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1))
        return isNaN(code) ? m : String.fromCodePoint(code)
      }
      return ENTITIES[e.toLowerCase()] ?? m
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

/** Folded text stored with a topic: title, tags and body together */
export function topicSearchText(title: string, tags: string[], bodyText: string): string {
  return [foldSearch(title), foldSearch(tags.join(' ')), foldSearch(bodyText)].join(' \n ')
}

/**
 * Ranking of a topic that contains every searched word: title first (whole title, then all /
 * some words in it), then tags, then how often the words occur in the text.
 */
export function rankTopic(
  t: { title: string; tags: string[]; bodyText: string },
  words: string[]
): number {
  if (words.length === 0) return 0
  const title = foldSearch(t.title)
  const tags = foldSearch(t.tags.join(' '))
  const body = foldSearch(t.bodyText)
  const q = words.join(' ')
  let score = 0
  if (title === q) score += 400
  else if (title.startsWith(q)) score += 250
  else if (words.every((w) => title.includes(w))) score += 150
  for (const w of words) {
    if (title.includes(w)) score += 30
    if (tags.includes(w)) score += 20
    let n = 0
    for (let i = body.indexOf(w); i !== -1 && n < 10; i = body.indexOf(w, i + w.length)) n++
    score += n
  }
  return score
}

export interface TextPart {
  text: string
  hit: boolean
}

/** Splits text into parts, marking the words that contain a searched word (for highlighting) */
export function highlightParts(text: string, words: string[]): TextPart[] {
  if (!text) return []
  if (words.length === 0) return [{ text, hit: false }]
  const parts: TextPart[] = []
  // Words (letters, digits and their marks) and what lies between them, alternately
  for (const piece of text.split(/([\p{L}\p{N}\p{M}]+)/u)) {
    if (!piece) continue
    const f = foldSearch(piece)
    const hit = !!f && words.some((w) => f.includes(w))
    const last = parts[parts.length - 1]
    if (last && last.hit === hit && !hit) last.text += piece
    else parts.push({ text: piece, hit })
  }
  return parts
}

/** About `max` characters of the text around the first searched word (… where cut) */
export function snippetText(text: string, words: string[], max = 220): string {
  const flat = (text || '').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  let at = -1
  if (words.length) {
    const re = /[\p{L}\p{N}\p{M}]+/gu
    for (let m = re.exec(flat); m; m = re.exec(flat)) {
      const f = foldSearch(m[0])
      if (words.some((w) => f.includes(w))) {
        at = m.index
        break
      }
    }
  }
  let start = at <= 60 ? 0 : flat.lastIndexOf(' ', at - 60) + 1
  if (start < 0) start = 0
  let end = Math.min(flat.length, start + max)
  if (end < flat.length) {
    const sp = flat.lastIndexOf(' ', end)
    if (sp > start + max / 2) end = sp
  }
  return (start > 0 ? '… ' : '') + flat.slice(start, end) + (end < flat.length ? ' …' : '')
}
