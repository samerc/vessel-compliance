// Name match score for sanctions screening (pure, testable).
//
// The searches find candidates (a "contains" search and the fuzzy index); this decides how well
// each one matches. Whole words count, not letters inside a word ("red" is not in "CREDISA"):
// each word of the searched name is compared with the words of the listed name (exact, or close
// spelling such as Mohamed / Muhammad), and the score is how many of the searched words are found,
// a little lower when the listed name has more words that were not searched. The best of the
// name and its aliases counts; a parent's name counts less (it is not the person's own name).

import { foldArabic } from './normalize'

export type MatchField = 'name' | 'alias' | 'imo' | 'father' | 'mother'

export interface MatchResult {
  score: number // 0-1
  field: MatchField
  value: string // the listed name / alias / IMO that matched
}

export interface ScorableEntity {
  name: string
  aliases?: string[] | null
  vessel_imo?: string | null
  father_name?: string | null
  mother_name?: string | null
}

// Words that say nothing about who it is (company forms, articles)
const NOISE = new Set([
  'ltd',
  'limited',
  'llc',
  'inc',
  'corp',
  'corporation',
  'co',
  'company',
  'plc',
  'gmbh',
  'sa',
  'sal',
  'sarl',
  'wll',
  'fze',
  'fzco',
  'bv',
  'ag',
  'srl',
  'spa',
  'jsc',
  'pjsc',
  'ojsc',
  'the',
  'and',
  'of',
  'for',
  'al',
  'el',
  'de',
  'du',
  'la'
])

/** Lower case, accents and Arabic spelling variants folded, punctuation out; meaningful words */
export function nameTokens(s: string): string[] {
  const words = foldArabic(String(s || ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // initials / abbreviations: "W.L.L." -> "wll", "S.A." -> "sa"
    .replace(/\b(\p{L})\.(?=\p{L}\.)/gu, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  const kept = words.filter((w) => !NOISE.has(w))
  return kept.length > 0 ? kept : words
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aM = new Array(a.length).fill(false)
  const bM = new Array(b.length).fill(false)
  let m = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bM[j] || a[i] !== b[j]) continue
      aM[i] = bM[j] = true
      m++
      break
    }
  }
  if (!m) return 0
  let t = 0
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!aM[i]) continue
    while (!bM[k]) k++
    if (a[i] !== b[k]) t++
    k++
  }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3
  let p = 0
  while (p < 4 && p < a.length && p < b.length && a[p] === b[p]) p++
  return jaro + p * 0.1 * (1 - jaro)
}

/** Similarity of two words: exact = 1; close spellings high; a word inside a longer one low */
export function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const maxLen = Math.max(a.length, b.length)
  const lev = 1 - levenshtein(a, b) / maxLen
  // Jaro-Winkler suits spelling variants of similar length (Mohamed / Muhammad); for very
  // different lengths it rates a short word inside a long one too high, so edits decide there
  if (Math.min(a.length, b.length) / maxLen >= 0.75 && Math.min(a.length, b.length) >= 4)
    return Math.max(lev, jaroWinkler(a, b))
  return lev
}

/** How many listed entities use a word (0 when unknown); see wordWeight */
export type WordCount = (w: string) => number

// Words used by more listed names than this say little on their own ("red", "ali", "trading")
const COMMON_WORD_MIN = 10

/** A word's weight in a name: rare words decide ("Kaddourah"), common ones count little
 *  ("Shipping", "Mohamad"): 1 for an unknown word, about 0.3 at 10 uses, 0.1 at 3,000 */
export function wordWeight(count: number): number {
  return 1 / (1 + Math.log(1 + count))
}

/** How well the searched words match one listed name (0-1) */
export function scoreTokens(q: string[], n: string[], wordCount: WordCount = () => 0): number {
  if (q.length === 0 || n.length === 0) return 0
  // A close spelling gets partial credit (squared: 0.95 -> 0.9, 0.85 -> 0.72); a weak word
  // match is no match at all (it would add up across long names)
  const credit = (s: number): number => {
    const c = s >= 1 ? 1 : s * s
    return c >= 0.7 ? c : 0
  }
  const avg = (words: string[], other: string[]): number => {
    let sum = 0
    let total = 0
    for (const w of words) {
      const wt = wordWeight(wordCount(w))
      sum += wt * credit(Math.max(...other.map((x) => wordSimilarity(w, x))))
      total += wt
    }
    return total > 0 ? sum / total : 0
  }
  const recall = avg(q, n)
  const coverage = avg(n, q)
  let score = recall * (0.75 + 0.25 * coverage)
  // One common searched word ("red", "ali") against a longer name is a weak lead, never a
  // strong match; a rare one ("rosneft") still points at that name
  if (q.length === 1 && n.length > 1 && wordCount(q[0]) > COMMON_WORD_MIN) score *= 0.85
  // Written together or apart ("AlBahriah" / "Al Bahriah"): only when the word counts differ,
  // and on letter edits only (a spelling measure rates any two names sharing a first word high)
  if (q.length !== n.length) {
    const a = q.join('')
    const b = n.join('')
    const joined = 1 - levenshtein(a, b) / Math.max(a.length, b.length)
    if (joined >= 0.9) score = Math.max(score, joined)
  }
  return Math.min(1, score)
}

/** Best match of a searched name against a listed entity: its name, aliases, IMO, parents */
export function matchEntity(
  query: string,
  e: ScorableEntity,
  qTokens = nameTokens(query),
  wordCount?: WordCount
): MatchResult {
  const trimmed = query.trim()
  if (
    e.vessel_imo &&
    /^\d{7}$/.test(trimmed.replace(/^imo\s*/i, '')) &&
    trimmed.replace(/^imo\s*/i, '') === String(e.vessel_imo).trim()
  )
    return { score: 1, field: 'imo', value: String(e.vessel_imo) }
  let best: MatchResult = { score: 0, field: 'name', value: e.name }
  const consider = (value: string | null | undefined, field: MatchField, weight = 1): void => {
    if (!value) return
    const s = scoreTokens(qTokens, nameTokens(value), wordCount) * weight
    if (s > best.score) best = { score: s, field, value }
  }
  consider(e.name, 'name')
  for (const a of e.aliases || []) consider(a, 'alias')
  // A parent's name matching is a lead for review, not the person's own name
  consider(e.father_name, 'father', 0.7)
  consider(e.mother_name, 'mother', 0.7)
  return { ...best, score: Math.round(best.score * 10000) / 10000 }
}
