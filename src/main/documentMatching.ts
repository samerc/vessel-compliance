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
