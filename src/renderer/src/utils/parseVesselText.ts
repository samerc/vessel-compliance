/**
 * Reads vessel particulars out of free text pasted from a broker's or owner's email:
 * "GT: 1,234", "Flag - Panama", "Built 1998/2010", a pasted table (label <tab> value), several
 * pairs on one line ("Flag: Togo / GT: 999"). Each value follows its label; there is no fixed
 * format. Flags, vessel types and class societies are matched to the app's lists when they can
 * be; anything else is kept as written.
 */
import type { ClassificationSociety, FlagState, VesselType } from '../../../shared/types'

export interface ParsedVesselFields {
  name?: string
  imoNumber?: string
  builtYear?: string
  rebuiltYear?: string
  grossTonnage?: string
  flag?: string
  vesselType?: string
  classification?: string
  callSign?: string
}

export type ParsedField = keyof ParsedVesselFields

export interface ParseVesselResult {
  values: ParsedVesselFields
  /** Flag / type / class found in the app's lists (false = kept as written) */
  inList: Partial<Record<ParsedField, boolean>>
}

export interface ParseVesselLists {
  flags: FlagState[]
  types: VesselType[]
  societies: ClassificationSociety[]
}

type LabelField = ParsedField | 'tonnage' | null

/** Label patterns per field. `null` = a label we do not use: it only ends the previous value. */
const LABELS: [LabelField, string][] = [
  ['name', "(?:vessel|ship)'?s?\\s+name"],
  ['name', 'name\\s+of\\s+(?:the\\s+)?(?:vessel|ship)'],
  ['name', 'vessel'],
  ['name', 'ship'],
  ['name', 'name'],
  ['imoNumber', 'imo(?:\\s*(?:no\\.?|number|nr\\.?|#))?'],
  ['rebuiltYear', 're-?buil[dt](?:\\s+(?:in|year))?'],
  ['rebuiltYear', 'year\\s+(?:of\\s+)?re-?buil[dt]'],
  ['rebuiltYear', 'convert(?:ed|ion)(?:\\s+(?:in|year))?'],
  ['builtYear', 'year\\s+(?:of\\s+)?buil[dt]'],
  ['builtYear', 'buil[dt]\\s+year'],
  ['builtYear', 'date\\s+of\\s+build'],
  ['builtYear', 'y\\.?o\\.?b\\.?'],
  ['builtYear', 'buil[dt](?:\\s+in)?'],
  ['builtYear', 'delivered'],
  ['grossTonnage', 'gross\\s+(?:register(?:ed)?\\s+)?ton(?:nage|s)?'],
  ['grossTonnage', 'g\\.?r\\.?t\\.?'],
  ['grossTonnage', 'g\\.?t\\.?'],
  ['grossTonnage', 'gross'],
  ['tonnage', 'tonnages?'],
  ['flag', 'flag(?:\\s+state)?'],
  ['flag', 'nationality'],
  ['vesselType', "(?:vessel|ship)'?s?\\s+type"],
  ['vesselType', 'type\\s+of\\s+(?:vessel|ship)'],
  ['vesselType', 'type'],
  ['classification', 'class(?:ification)?(?:\\s+society)?'],
  ['classification', 'classed(?:\\s+(?:with|by))?'],
  ['callSign', 'call\\s*-?\\s*sign'],
  ['callSign', 'call\\s+letters'],
  ['callSign', 'c\\/s'],
  // Labels we read past
  [null, 'port\\s+of\\s+regist(?:ry|er)'],
  [null, 'place\\s+of\\s+build'],
  [null, 'd\\.?w\\.?t\\.?'],
  [null, 'dead\\s*weight'],
  [null, 'n\\.?r\\.?t\\.?'],
  [null, 'n\\.?t\\.?'],
  [null, 'net\\s+(?:register(?:ed)?\\s+)?ton(?:nage|s)?'],
  [null, 'l\\.?o\\.?a\\.?'],
  [null, 'length'],
  [null, 'breadth'],
  [null, 'beam'],
  [null, 'depth'],
  [null, 'draft'],
  [null, 'draught'],
  [null, 'mmsi'],
  [null, "(?:registered\\s+)?owner'?s?(?:\\s+name)?"],
  [null, "manager'?s?(?:\\s+name)?"],
  [null, "operator'?s?(?:\\s+name)?"],
  [null, 'assureds?'],
  [null, 'builders?'],
  [null, 'yard'],
  [null, 'engines?'],
  [null, 'speed'],
  [null, 'hull\\s+(?:and\\s+machinery\\s+)?value'],
  [null, 'insured\\s+value'],
  [null, 'agreed\\s+value'],
  [null, 'value'],
  [null, 'trading(?:\\s+area)?'],
  [null, 'p\\s*&\\s*i'],
  [null, '(?:ex|former|previous)[-\\s]names?'],
  [null, 'teu'],
  [null, 'crew'],
  [null, 'email'],
  [null, 'tel(?:ephone)?'],
  [null, 'address']
]

// Longest pattern first so "vessel type" wins over "vessel" and "rebuilt" over "built"
const ORDERED = [...LABELS].sort((a, b) => b[1].length - a[1].length)
const LABEL_RE = new RegExp(
  // A label starts a line or follows a separator (; | , / tab, bullet, or 2+ spaces)
  '(?<=^|[\\n;|,/\\t•]|\\s{2})[ \\t]*(?:[-*•]\\s*|\\d{1,2}[.)]\\s+)?(' +
    ORDERED.map((l) => l[1]).join('|') +
    ")(?![a-z0-9'])[ \\t]*(?:\\([^)\\n]{0,20}\\))?[ \\t]*([:=]+|[-–—](?=\\s)|\\.{2,}|\\t)?[ \\t]*",
  'gim'
)
const FIELD_OF = ORDERED.map(([field, src]) => ({
  field,
  re: new RegExp('^(?:' + src + ')$', 'i')
}))

function fieldOfLabel(label: string): LabelField {
  const t = label.trim().replace(/\s+/g, ' ')
  for (const f of FIELD_OF) if (f.re.test(t)) return f.field
  return null
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bst\.?(?=\s)/g, 'saint')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const thisYear = new Date().getFullYear()
function years(v: string): number[] {
  return [...v.matchAll(/(?<!\d)(19\d{2}|20\d{2})(?!\d)/g)]
    .map((m) => Number(m[1]))
    .filter((y) => y <= thisYear + 2)
}

/** "1,234" / "1.234" / "1 234" / "1,234.5" -> "1234" / "1234.5" */
export function parseNumberText(v: string): string | undefined {
  const m = v.match(/\d[\d.,' ]*\d|\d/)
  if (!m) return undefined
  let s = m[0].replace(/[' ]/g, '')
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '')
  else if (s.includes('.') && s.includes(',')) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    s = s.replace(dec === '.' ? /,/g : /\./g, '').replace(',', '.')
  } else s = s.replace(',', '.')
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return String(Math.round(n * 100) / 100)
}

/** A 7-digit number with a valid IMO check digit */
function isImo(d: string): boolean {
  if (!/^\d{7}$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 6; i++) sum += Number(d[i]) * (7 - i)
  return sum % 10 === Number(d[6])
}

// Adjectives brokers write for a flag ("Maltese flag")
const FLAG_WORDS: Record<string, string> = {
  maltese: 'malta',
  lebanese: 'lebanon',
  comorian: 'comoros',
  comoro: 'comoros',
  cypriot: 'cyprus',
  greek: 'greece',
  egyptian: 'egypt',
  turkish: 'turkey',
  emirati: 'united arab emirates',
  uae: 'united arab emirates',
  uk: 'united kingdom',
  british: 'united kingdom',
  french: 'france',
  polish: 'poland',
  saudi: 'saudi arabia',
  marshall: 'marshall islands',
  vincentian: 'saint vincent and the grenadines',
  svg: 'saint vincent and the grenadines',
  kitts: 'saint kitts and nevis',
  bahraini: 'bahrain',
  gambian: 'gambia',
  mauritanian: 'mauritania',
  somali: 'somalia'
}

function matchFlag(v: string, flags: FlagState[]): FlagState | undefined {
  const t = norm(v)
  if (!t) return undefined
  const code = v.trim().toUpperCase()
  const exact = flags.find(
    (f) =>
      norm(f.name) === t ||
      (f.displayName && norm(f.displayName) === t) ||
      (f.iso3Code && f.iso3Code.toUpperCase() === code)
  )
  if (exact) return exact
  const padded = ` ${t} `
  const contained = flags
    .filter((f) => padded.includes(` ${norm(f.name)} `))
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (contained) return contained
  for (const w of t.split(' ')) {
    const mapped = FLAG_WORDS[w]
    if (mapped) {
      const hit = flags.find((f) => norm(f.name) === mapped)
      if (hit) return hit
    }
    // "Panamanian", "Liberian", "Togolese"
    if (w.length >= 5) {
      const hit = flags.find((f) => {
        const n = norm(f.name)
        return (
          !n.includes(' ') && n.length >= 4 && w.startsWith(n.slice(0, Math.max(4, n.length - 1)))
        )
      })
      if (hit) return hit
    }
  }
  return undefined
}

function matchType(v: string, types: VesselType[]): VesselType | undefined {
  const t = norm(v)
  return types.find((x) => norm(x.name) === t)
}

function matchSociety(
  v: string,
  societies: ClassificationSociety[]
): ClassificationSociety | undefined {
  const t = norm(v)
  if (!t || t === 'none') return undefined
  const words = new Set(
    v
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean)
  )
  return (
    societies.find((s) => norm(s.name) === t) ||
    societies.find((s) => s.abbreviation && words.has(s.abbreviation.toUpperCase())) ||
    societies
      .filter((s) => s.name && norm(s.name).length >= 4 && ` ${t} `.includes(` ${norm(s.name)} `))
      .sort((a, b) => b.name.length - a.name.length)[0]
  )
}

function cleanName(v: string): string {
  return v
    .replace(/^\s*(?:m\s*[./]?\s*[vt]\b\.?|s\.?s\.?(?=\s)|mt(?=\s))\s*/i, '')
    .replace(/\s*\(\s*ex[\s.].*$/i, '')
    .replace(/\s+[-–—]\s+.*$/, '')
    .replace(/\s*\bIMO\b.*$/i, '')
    .replace(/[\s([-]+$/, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim()
    .toUpperCase()
}

export function parseVesselText(text: string, lists: ParseVesselLists): ParseVesselResult {
  const values: ParsedVesselFields = {}
  const inList: ParseVesselResult['inList'] = {}
  const src = (text || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
  const hits = [...src.matchAll(LABEL_RE)]
  const set = (f: ParsedField, v: string | undefined): void => {
    if (v && !values[f]) values[f] = v
  }

  hits.forEach((m, i) => {
    const field = fieldOfLabel(m[1])
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < hits.length ? (hits[i + 1].index ?? src.length) : src.length
    let raw = src.slice(start, end)
    // A value never runs past its line; a label alone on its line takes the next line
    const nl = raw.indexOf('\n')
    if (nl >= 0) {
      const first = raw.slice(0, nl).trim()
      // (the slice ends where the next label starts, so a label line gives nothing)
      raw = first || raw.slice(nl + 1).split('\n')[0]
    }
    const v = raw.replace(/[\s,;|/•]+$/, '').trim()
    if (!v || !field) return
    // "Built 1998" needs no colon, but a word value without one ("type of cover...") is only
    // taken when it is in the app's lists (flag / type / class) or, for name and call sign,
    // when it starts a line in capitals
    if (!m[2]) {
      const lineStart = (m.index ?? 0) === 0 || src[(m.index ?? 0) - 1] === '\n'
      if (field === 'name' || field === 'callSign') {
        if (!lineStart || !/^[A-Z0-9"“]/.test(v)) return
      } else if (field === 'flag') {
        if (!matchFlag(v.replace(/\bflag\b/i, ''), lists.flags)) return
      } else if (field === 'vesselType') {
        if (!matchType(v, lists.types)) return
      } else if (field === 'classification') {
        if (!matchSociety(v, lists.societies)) return
      }
    }
    switch (field) {
      case 'name': {
        const n = cleanName(v)
        if (n && /[A-Z]/.test(n)) set('name', n)
        break
      }
      case 'imoNumber': {
        const d = v.match(/(?<!\d)\d{7}(?!\d)/)
        if (d) set('imoNumber', d[0])
        break
      }
      case 'builtYear': {
        const ys = years(v)
        if (ys[0]) set('builtYear', String(ys[0]))
        if (ys[1] && ys[1] > ys[0]) set('rebuiltYear', String(ys[1]))
        break
      }
      case 'rebuiltYear': {
        const ys = years(v)
        if (ys[0]) set('rebuiltYear', String(ys[0]))
        break
      }
      case 'grossTonnage':
        set('grossTonnage', parseNumberText(v))
        break
      case 'tonnage': {
        // "Tonnage: 1,234 GT / 567 NT" or "GT 1234 NT 567"
        const g =
          v.match(/(\d[\d.,' ]*)\s*(?:g\.?r?\.?t\.?)\b/i) ||
          v.match(/\bg\.?r?\.?t\.?\s*[:=]?\s*(\d[\d.,']*)/i)
        if (g) set('grossTonnage', parseNumberText(g[1]))
        else if (!/\b(?:n\.?t|nrt|dwt)\b/i.test(v)) set('grossTonnage', parseNumberText(v))
        break
      }
      case 'flag': {
        const hit = matchFlag(v.replace(/\bflag\b/i, ''), lists.flags)
        if (!values.flag) {
          values.flag = hit ? hit.name : v
          inList.flag = !!hit
        }
        break
      }
      case 'vesselType': {
        const hit = matchType(v, lists.types)
        if (!values.vesselType) {
          values.vesselType = hit ? hit.name : v
          inList.vesselType = !!hit
        }
        break
      }
      case 'classification': {
        const hit = matchSociety(v, lists.societies)
        if (!values.classification) {
          values.classification = hit ? hit.name : v
          inList.classification = !!hit
        }
        break
      }
      case 'callSign': {
        const cs = v.toUpperCase().match(/[A-Z0-9]+(?:[ -]?[A-Z0-9]+)?/)
        if (cs) set('callSign', cs[0].replace(/\s/g, ''))
        break
      }
    }
  })

  // Without labels: "IMO 9123456" anywhere, or any 7-digit number with a valid check digit
  if (!values.imoNumber) {
    const d =
      src.match(/\bIMO\b\D{0,12}?(\d{7})(?!\d)/i)?.[1] ||
      [...src.matchAll(/(?<![\d.,])\d{7}(?![\d.,])/g)].map((m) => m[0]).find(isImo)
    if (d) values.imoNumber = d
  }
  // "MV OCEAN STAR" anywhere
  if (!values.name) {
    const mv = src.match(
      /(?:^|[\s(])[mM]\s*[./]?\s*[vVtT]\.?\s+([A-Z0-9][A-Z0-9 .'&-]{1,40}?)(?=\s*(?:[,(\n;|]|\s[-–—]\s|\bIMO\b|$))/m
    )
    if (mv) {
      const n = cleanName(mv[1])
      if (n) values.name = n
    }
  }
  // "Panamanian flag" / "flag of Togo" without a label
  if (!values.flag) {
    for (const m of src.matchAll(
      /([A-Za-z][A-Za-z .&'-]{2,40}?)\s+flag(?:ged)?\b|\bflag(?:ged)?\s+(?:of\s+|in\s+)?([A-Za-z][A-Za-z .&'-]{2,40})/gi
    )) {
      const hit = matchFlag((m[1] || m[2] || '').split(/[,;\n]/).pop() || '', lists.flags)
      if (hit) {
        values.flag = hit.name
        inList.flag = true
        break
      }
    }
  }
  return { values, inList }
}
