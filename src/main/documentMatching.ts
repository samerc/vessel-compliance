// Guesses the document type of a file being filed (dropped on a vessel's documents page) from its
// file name, then from its text (PDF / Word). The user always reviews the guess before filing.

export interface MatchableType {
  id: string
  name: string
  shortCode?: string | null
}

export interface TypeGuess {
  typeId: string | null
  /** Where the type was recognised */
  source: 'name' | 'content' | null
  /** The words that matched, shown to the user */
  matched?: string
}

// Common other wordings, attached to every type whose name matches the pattern
const SYNONYMS: [RegExp, string[]][] = [
  [
    /regist/i,
    [
      'certificate of registry',
      'registry certificate',
      'certificate of registration',
      'registration certificate',
      'provisional certificate of registry',
      'permanent certificate of registry',
      'registry',
      'cor',
      'reg'
    ]
  ],
  [
    /class/i,
    [
      'classification certificate',
      'certificate of classification',
      'class certificate',
      'class cert',
      'classification',
      'class'
    ]
  ],
  [/smc|safety management/i, ['safety management certificate', 'smc']],
  [/\bdoc\b|document of compliance/i, ['document of compliance', 'doc']],
  [/dry.?dock/i, ['dry dock', 'drydock', 'dry docking', 'docking survey', 'dd report']],
  [/utm|thickness/i, ['thickness measurement', 'ultrasonic thickness', 'utm']],
  [/p&i application/i, ['p&i application', 'pi application', 'p and i application']],
  [/hull application/i, ['hull application', 'h&m application', 'hm application']],
  [/crew list/i, ['crew list']],
  [/crew contract/i, ['seafarer employment agreement', 'crew contract', 'employment contract']],
  [/salar/i, ['salaries', 'salary', 'wages']],
  [/medical/i, ['medical examination', 'medical']],
  [/kyc/i, ['know your customer', 'kyc']],
  [/incorporation/i, ['certificate of incorporation', 'incorporation']],
  [/good standing/i, ['certificate of good standing', 'good standing']],
  [/incumbency/i, ['certificate of incumbency', 'incumbency']],
  [/passport/i, ['passport']],
  [/articles/i, ['articles of association', 'memorandum and articles']]
]

/** Lower case, '&' kept, every other separator a single space, padded for whole-word search */
function normalise(text: string): string {
  return (
    ' ' +
    text
      .toLowerCase()
      .replace(/[^a-z0-9&]+/g, ' ')
      .trim() +
    ' '
  )
}

function phrasesFor(t: MatchableType): string[] {
  const out = new Set<string>()
  if (t.shortCode) out.add(normalise(t.shortCode).trim())
  out.add(normalise(t.name).trim())
  for (const [re, words] of SYNONYMS) if (re.test(t.name)) words.forEach((w) => out.add(w))
  return [...out].filter(Boolean)
}

/**
 * The most likely type. The file name wins over the text (people name files on purpose); a
 * one-word phrase (COR, class, wages...) only counts in the file name, as such words appear in
 * many certificates; in the text the phrase found first (the title) wins. A tie = no guess.
 */
export function guessDocumentType(
  fileName: string,
  text: string,
  types: MatchableType[]
): TypeGuess {
  const name = normalise(fileName.replace(/\.[a-z0-9]+$/i, ''))
  const body = normalise(text)
  let best: { id: string; score: number; source: 'name' | 'content'; matched: string } | null = null
  let tie = false
  for (const t of types) {
    for (const p of phrasesFor(t)) {
      const needle = normalise(p)
      let score = 0
      let source: 'name' | 'content' = 'name'
      if (name.includes(needle)) score = 1000 + needle.length
      else if (needle.trim().includes(' ')) {
        const at = body.indexOf(needle)
        if (at >= 0) {
          score = 500 - Math.min(at / 20, 400) + needle.length / 10
          source = 'content'
        }
      }
      if (score <= 0) continue
      if (!best || score > best.score) {
        tie = false
        best = { id: t.id, score, source, matched: p }
      } else if (score === best.score && best.id !== t.id) tie = true
    }
  }
  if (!best || tie) return { typeId: null, source: null }
  return { typeId: best.id, source: best.source, matched: best.matched }
}

export interface MatchableVessel {
  id: string
  name: string
  imoNumber?: string | null
  isActive?: boolean
}

export interface VesselGuess {
  vesselId: string | null
  source: 'name' | 'content' | null
  /** What matched, shown to the user (IMO 9255062 / the vessel name) */
  matched?: string
}

/** A real IMO number: the 7th digit is the check digit of the first six (weights 7..2) */
export function isValidImo(imo: string): boolean {
  if (!/^\d{7}$/.test(imo)) return false
  const sum = [...imo.slice(0, 6)].reduce((s, d, i) => s + Number(d) * (7 - i), 0)
  return sum % 10 === Number(imo[6])
}

/** One vessel among several with the same name or IMO: the active one, else none */
function single(vs: MatchableVessel[]): MatchableVessel | null {
  if (vs.length === 1) return vs[0]
  const active = vs.filter((v) => v.isActive !== false)
  return active.length === 1 ? active[0] : null
}

/**
 * The vessel a file is about. An IMO number (checked by its check digit) wins; else the vessel
 * name, the longest one found. In the file name any name of 3+ letters counts; in the text only
 * names of 6+ letters or two words (short names like STAR appear in ordinary text). Two vessels
 * found = no guess.
 */
export function guessVessel(
  fileName: string,
  text: string,
  vessels: MatchableVessel[]
): VesselGuess {
  const sources: ['name' | 'content', string][] = [
    ['name', fileName.replace(/\.[a-z0-9]+$/i, '')],
    ['content', text]
  ]
  for (const [source, raw] of sources) {
    if (!raw) continue
    const imos = new Set((raw.match(/(?<!\d)\d{7}(?!\d)/g) || []).filter(isValidImo))
    const byImo = new Map<string, MatchableVessel[]>()
    for (const v of vessels) {
      const imo = String(v.imoNumber || '').replace(/\D/g, '')
      if (imos.has(imo)) byImo.set(imo, [...(byImo.get(imo) || []), v])
    }
    if (byImo.size === 1) {
      const [imo, vs] = [...byImo.entries()][0]
      const v = single(vs)
      if (v) return { vesselId: v.id, source, matched: `IMO ${imo}` }
    }
    if (byImo.size > 1) return { vesselId: null, source: null }
  }
  for (const [source, raw] of sources) {
    if (!raw) continue
    const hay = normalise(raw)
    let best: MatchableVessel[] = []
    let bestLen = 0
    for (const v of vessels) {
      const name = normalise(v.name).trim()
      const long = name.length >= 6 || name.includes(' ')
      if (name.length < 3 || (source === 'content' && !long)) continue
      if (!hay.includes(` ${name} `)) continue
      if (name.length > bestLen) {
        best = [v]
        bestLen = name.length
      } else if (name.length === bestLen) best.push(v)
    }
    if (best.length > 0) {
      const names = new Set(best.map((v) => normalise(v.name).trim()))
      const v = names.size === 1 ? single(best) : null
      return v ? { vesselId: v.id, source, matched: v.name } : { vesselId: null, source: null }
    }
  }
  return { vesselId: null, source: null }
}
