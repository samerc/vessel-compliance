// Reads the OCR lines of a scanned SIC letter into suggested entries. Two layouts are known:
// Arabic lists ("• "حسن أحمد مقلد" (لبناني، مواليد ...)") and English OFAC-style numbered lists
// ("1. ARDAKANI, Masoud Mahdavi (Arabic: ...), DOB 06 Sep 1970; nationality Iran"). Letters about
// one person name them inside the paragraph. Everything here is a suggestion the user can fix.
import type { SicOcrLine } from '../../../shared/types'
import {
  toWesternDigits,
  hasArabic,
  cleanArabic,
  arabicTokens,
  transliterateWord,
  transliterateName,
  transliterateCompany,
  nationalityFromArabic,
  SpellingDictionary
} from './arabicNames'

export type LetterKind = 'freeze' | 'inquiry' | 'circulate' | 'other'

export interface LetterHeader {
  reference: string
  letterDate: string
  kind: LetterKind
}

export interface ParsedEntry {
  /** Indexes of the OCR lines this entry came from (on its page) */
  lines: number[]
  entityType: 'individual' | 'entity'
  arName: string
  enName: string
  arFather: string
  enFather: string
  arMother: string
  enMother: string
  nationality: string
  dob: string
  aliases: string[]
  notes: string
}

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12'
}

/** Reference and date from the file name the SIC uses (4737_26_22092026.pdf), and the letter type */
export function parseLetterHeader(fileName: string, lines: SicOcrLine[]): LetterHeader {
  const base = fileName.replace(/^.*[\\/]/, '')
  const m = base.match(/^(\d{2,6})_(\d{2})_(\d{2})(\d{2})(\d{4})/)
  let reference = m ? `${m[1]}/${m[2]}` : ''
  const letterDate = m ? `${m[5]}-${m[4]}-${m[3]}` : ''
  const text = lines.map((l) => l.text).join('\n')
  // English case code printed next to the reference: "(G 26.139)" -> "/G26.139"
  const g = text.match(/G\s*(\d{2})\s*[.,]\s*(\d{2,4})/)
  if (reference && g) reference += `/G${g[1]}.${g[2]}`
  let kind: LetterKind = 'other'
  if (/[اإ]ستعلام/.test(text)) kind = 'inquiry'
  // Circulated ID copies (the decision may also freeze e-wallets)
  else if (/تعميم\s*نسخ/.test(text)) kind = 'circulate'
  // The freeze letters ask to keep the life policies linked to investment units (الغاء البوالص)
  else if (/تجميد|freeze|البوالص|وحدات\s*الاستثمار/i.test(text)) kind = 'freeze'
  else if (/تعميم|الهوية/.test(text)) kind = 'circulate'
  return { reference, letterDate, kind }
}

// ---- Arabic lists ----

const COMPANY_START = /^(شركة|شركه|مؤسسة|مؤسسه|جمعية|جمعيه|بنك|مصرف|مكتب)\s/
const COMPANY_MARK =
  /ش\s*\.?\s*م\s*\.?\s*[لم]|\bS\.?A\.?L\b|\bLLC\b|\bLtd\b|\bInc\b|\bFZE\b|Company|Holding/i
const BULLET_TOKEN = /^(?:[•«»®©°*·\-–.،ec0٠o]{1,2}|ه|e[ce]?|\(?[0-9\u0660-\u0669]{1,3}[-.)])$/i
// Signature block, footer, or the closing formula: the list is over
const LIST_END =
  /وتفضلوا|بقبول\s*ال[إا]حترام|أمين\s*عام|امين\s*عام|^\s*هيئة\s*ال|ص\s*ب\s*:|P\s*O\s*Box|www\.|هاتف/
// Words that show a line holds an entry's details (birth, mother, ID papers, registration)
// Quoted names that are the sender or the addressees, not listed persons ("هيئة التحقيق الخاصة")
const NOT_A_SUBJECT = /^(ال)?هيئة|^مصرف لبنان|^حاكم|^المصارف|^شركات التأمين|^شركة التأمين/
const DETAIL_WORDS = /مو\s?اليد|و\s?الدت|سجل|الجواز|جواز|المدني|الهوية|تأسست|تاسست|مسجلة|مسجله/

// The SIC letterhead printed at the top of every page
const LETTERHEAD =
  /SPECIAL INVESTIGATION|INVESTIGATION COMMISSION|Fighting Money|Banque du Liban|هيئة\s*التحقيق\s*الخاصة|مكافحة\s*تبييض/i

/** Index of the last letterhead line at the top of a page (-1 if none) */
function letterheadEnd(lines: SicOcrLine[]): number {
  let end = -1
  lines.slice(0, 8).forEach((l, i) => {
    if (LETTERHEAD.test(l.text)) end = i
  })
  // "Banque du Liban" is the letterhead's last line; it is sometimes read on its own line below
  const next = end >= 0 ? lines[end + 1]?.text || '' : ''
  if (/Banque|Liban/.test(next) || (/مصرف/.test(next) && next.length < 25)) end++
  return end
}

function startsWithBullet(text: string): boolean {
  const words = text.split(' ')
  return words.length > 1 && BULLET_TOKEN.test(words[0])
}

// A word of a name has at least two Arabic letters; anything before the first such word is a
// misread bullet or number ("٠ه", "a", "؟-", "©", "11")
const isJunkToken = (t: string): boolean => !/^["“]/.test(t) && !/[\u0621-\u064a]{2}/.test(t)

function stripBullet(text: string): string {
  const words = text.split(' ')
  // A quoted name right after a misread bullet ("ها "حسين علي ...")
  const q = words.slice(0, 3).findIndex((w) => /^["“]/.test(w))
  if (q > 0) return words.slice(q).join(' ')
  let i = 0
  // ...but a name written in Latin letters ("JOHN SMITH") is two Latin words in a row
  const latinWord = (w?: string): boolean => !!w && /^[A-Za-z][A-Za-z'.-]{2,}$/.test(w)
  while (
    i < words.length - 1 &&
    isJunkToken(words[i]) &&
    !(latinWord(words[i]) && latinWord(words[i + 1]))
  )
    i++
  return words.slice(i).join(' ')
}

/** Does this line start a person / company entry? */
function looksLikeEntry(text: string): boolean {
  const t = stripBullet(text)
  if (/^["“][\u0600-\u06ff]/.test(t) || /^["“][A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(t)) return true
  if (COMPANY_START.test(t)) return true
  const paren = t.search(/[()]/)
  if (paren > 0 && paren < 60) {
    const inside = t.slice(paren)
    if (DETAIL_WORDS.test(inside)) return true
    if (nationalityFromArabic(inside.replace(/[()]/g, ' ').split(/[،,؛»]/)[0])) return true
  }
  return false
}

// ---- English (OFAC style) numbered lists ----

const NUMBERED_EN = /^\s*\d{1,3}\s*[.)]\s+["A-Z]/
// Counting list items: a Latin capital after the number (an Arabic list may number quoted names)
const NUMBERED_LATIN = /^\s*\d{1,3}\s*[.)]\s+"?[A-Z]/

function englishDob(text: string): string {
  const d = text.match(/DOB\s+(?:circa\s+)?(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/i)
  if (d && MONTHS[d[2].toLowerCase()])
    return `${d[3]}-${MONTHS[d[2].toLowerCase()]}-${d[1].padStart(2, '0')}`
  const y = text.match(/DOB\s+(?:circa\s+)?(\d{4})/i)
  return y ? y[1] : ''
}

const titleCase = (s: string): string =>
  s.toLowerCase().replace(/(^|[\s\-'])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())

/** "ARDAKANI, Masoud Mahdavi" -> "Masoud Mahdavi Ardakani" */
function personFromOfac(s: string): string {
  const [last, first] = s.split(',').map((x) => x.trim())
  return first ? `${first} ${titleCase(last)}` : titleCase(s)
}

// A listed vessel: "AL SAFA (3E3958) Oil Products Tanker Panama flag; Vessel Year of Build ..."
const VESSEL_DETAILS = /\bVessel\b|\bMMSI\b|\bflag\b/i
const PERSON_DETAILS = /\bDOB\b|nationality|\bPOB\b|Gender|citizen/i

function parseEnglishEntry(text: string, lines: number[]): ParsedEntry {
  const raw = text.replace(/^\s*\d{1,3}\s*[.)]\s*/, '')
  // OCR adds stray Arabic letters to English lines ("nationality Turkey ظ"): keep Arabic only
  // inside "(Arabic: ...)"
  const body = raw
    .replace(/(\(Arabic:[^)]*\)?)|[\u0600-\u06ff]+/g, (_m, keep?: string) => keep || ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const isVessel = VESSEL_DETAILS.test(body) && !PERSON_DETAILS.test(body)
  const isPerson = !isVessel && PERSON_DETAILS.test(body)
  // OFAC writes names in capitals: a company / vessel name is the leading capitals, up to a
  // bracket, a ";" or a ", Word" detail ("ELYSIAN HORIZON CORP, Identification Number ...");
  // a person is "LAST, First Middle" up to the first detail
  const caps = body.match(/^[^a-z;({]+?(?=\s*(?:[({]|;|,?\s+[A-Z][a-z]|$))/)
  const personEnd = body.search(
    /\s*[({]|;|,\s*(?:DOB|POB|nationality|Gender|citizen|Passport|National ID|Organization)/i
  )
  const rawName = (
    isPerson
      ? personEnd > 0
        ? body.slice(0, personEnd)
        : body
      : caps && caps[0].trim().length > 1
        ? caps[0]
        : body.split(/[;(]/)[0]
  )
    .trim()
    .replace(/[,;\s]+$/, '')
  const isOrg =
    isVessel ||
    (!isPerson &&
      /Organization|Company|\bCO\b|CORP|LLC|L\.L\.C|FZE|FZCO|LTD|Limited|Inc\b|S\.?A\.?L\b|Trading|Group|Bank|Brotherhood|Establishment|Registration|\bIMO\b/i.test(
        body
      ))
  const arabicParts = [...body.matchAll(/Arabic:\s*([^)]*)\)?/g)]
    .map((m) => cleanArabic(m[1].replace(/[^\u0600-\u06ff\s]/g, ' ')))
    .filter((a) => a.length > 1)
  const akas = [...body.matchAll(/a\.k\.a\.?\s*"?([^;()"]+)"?/gi)]
    .map((m) => m[1].trim().replace(/^[,\s]+|[,.\s]+$/g, ''))
    .filter((a) => a && !/^Arabic/i.test(a))
    .map((a) => (isOrg ? a : personFromOfac(a)))
  const nat = body.match(/nationality\s+([A-Za-z][A-Za-z ]+?)(?:\s*[;,.)]|$)/i)
  // Organisations: keep the registration details as notes
  const notes = isOrg
    ? body
        .slice(rawName.length)
        .replace(/\(Arabic:[^)]*\)?/g, '')
        .replace(/\(a\.k\.a\.[^)]*\)?/gi, '')
        .replace(/^[\s,;)]+/, '')
        .trim()
    : ''
  return {
    lines,
    entityType: isOrg ? 'entity' : 'individual',
    arName: arabicParts[0] || '',
    enName: isOrg ? rawName : personFromOfac(rawName),
    arFather: '',
    enFather: '',
    arMother: '',
    enMother: '',
    nationality: nat ? nat[1].trim() : '',
    dob: englishDob(body),
    aliases: [...new Set([...akas, ...arabicParts.slice(1)])],
    notes
  }
}

// ---- One Arabic entry ----

/** A date the letter wrote in a form we can trust: "1967", "1967/2/17", "17/2/1967" */
function arabicDob(raw: string): string {
  const s = toWesternDigits(raw).replace(/[^\d/]/g, '')
  let m = s.match(/^(19|20)\d{2}$/)
  if (m) return s
  m = s.match(/^((?:19|20)\d{2})\/(\d{1,2})\/(\d{1,2})$/)
  if (m && +m[2] <= 12 && +m[3] <= 31)
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/((?:19|20)\d{2})$/)
  if (m && +m[2] <= 12 && +m[1] <= 31)
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}

const LATIN_RUN = /[A-Za-z][A-Za-z0-9&.,'’\- ]{2,}[A-Za-z.]/g

export function parseArabicEntry(
  text: string,
  lines: number[],
  learned: SpellingDictionary = {}
): ParsedEntry {
  let t = stripBullet(text.trim())
    .replace(/مو\s+اليد/g, 'مواليد')
    .replace(/(^|\s)و\s+الدت/g, '$1والدت')
    .replace(/^(السيد|السيدة|السيده|السادة|الساده|الآنسة|الانسة)\s+/, '')
  // Most letters quote the name: "فادي عزيز بربر" (لبناني، ...)
  const quoted = t.match(/["“”]\s*([\u0600-\u06ff][^"“”()]{1,60}?)\s*["“”]/)
  if (quoted && quoted.index !== undefined && quoted.index < 25) {
    t = `${quoted[1]} ${t.slice(quoted.index + quoted[0].length)}`
  }
  t = t.replace(/["“”]/g, '')
  // Latin run: a company's own name, e.g. "CTEX Company for Exchange SAL"
  const latin =
    (t.match(LATIN_RUN) || []).map((s) => s.trim()).sort((a, b) => b.length - a.length)[0] || ''
  const isCompany = COMPANY_START.test(t) || COMPANY_MARK.test(t)
  // The name runs to the first bracket; OCR often mirrors brackets in Arabic text, so take either
  const cut = t.search(/[()]/)
  const namePart = (cut >= 0 ? t.slice(0, cut) : t.split(/[،,؛»]/)[0]).trim()
  const details = cut >= 0 ? t.slice(cut).replace(/[()]/g, ' ') : t.slice(namePart.length)

  // OCR reads the Arabic comma after a word as a hamza ("سكرء"): put the comma back (not after alef: "علاء")
  const d = details.replace(/([^\sا])ء(?=\s|$)/g, '$1،')
  const STOP = '(?=\\s*(?:[،,؛;»]|سجل|رقم|مواليد|والدت|$))'
  const notes: string[] = []
  // Nationality: the first detail ("لبناني/فرنسي"), else any detail that is one
  const segments = d
    .split(/[،,؛;»]/)
    .map((s) => s.trim())
    .filter(Boolean)
  let nationality = ''
  for (const seg of segments) {
    const n = nationalityFromArabic(seg.replace(/مواليد.*$/, '').trim())
    if (n) {
      nationality = n
      break
    }
  }
  const dobM = d.match(new RegExp(`مواليد\\s*(.+?)${STOP}`))
  const dob = dobM ? arabicDob(dobM[1]) : ''
  const motherM = d.match(new RegExp(`والدت(?:ه|ها)\\s+([\\u0600-\\u06ff ]+?)${STOP}`))
  const arMother = motherM ? cleanArabic(motherM[1]).split(' ').slice(0, 3).join(' ') : ''
  const passM = d.match(/جواز[^A-Z0-9]*([A-Z]{0,3}\s?\d{5,})/)
  if (passM) notes.push(`Passport ${passM[1].replace(/\s/g, '')}`)
  const idM = d.match(
    /(?:الرقم\s*المدني|رقم\s*الهوية|الهوية\s*رقم)[^0-9\u0660-\u0669]*([0-9\u0660-\u0669/]{5,})/
  )
  if (idM) notes.push(`ID no. ${toWesternDigits(idM[1])}`)
  const regM = d.match(/(?:^|\s)(?:ال)?سجل(?:\s+رقم)?\s+([^،,؛;»]+)/)
  if (regM) notes.push(`Register no. ${toWesternDigits(regM[1]).trim()}`)
  // Companies: where and when registered
  for (const seg of segments) {
    if (/مسجلة|مسجله|تأسست|تاسست/.test(seg))
      notes.push(toWesternDigits(seg).replace(LATIN_RUN, '').trim())
  }
  const noteText = notes.filter(Boolean).join('; ')

  if (isCompany) {
    let arName = cleanArabic(namePart.replace(/[A-Za-z][A-Za-z0-9&.,'’\- ]*/g, ' '))
    // Only the word "company" left: the name was written in Latin letters
    if (/^(شركة|شركه)$/.test(arName)) arName = ''
    return {
      lines,
      entityType: 'entity',
      arName,
      enName: latin || transliterateCompany(arName, learned),
      arFather: '',
      enFather: '',
      arMother: '',
      enMother: '',
      nationality,
      dob: '',
      aliases: [],
      notes: noteText
    }
  }

  // Lebanese names are written first name, father's name, family name
  const tokens = arabicTokens(namePart.replace(/[^\u0600-\u06ff\s]/g, ' ')).filter((w) =>
    /[\u0621-\u064a]{2}/.test(w)
  )
  const first = tokens[0] || ''
  const father = tokens.length >= 3 ? tokens[1] : ''
  const family = tokens.slice(tokens.length >= 3 ? 2 : 1)
  // A foreign name written in Latin letters ("JOHN SMITH" (بريطاني، ...)): use it as written
  const latinName = (namePart.match(LATIN_RUN) || [])
    .map((s) => s.trim())
    .sort((a, b) => b.length - a.length)[0]
  if (latinName && latinName.length >= 4 && tokens.length < 2) {
    return {
      lines,
      entityType: 'individual',
      arName: tokens.join(' '),
      enName: latinName === latinName.toUpperCase() ? titleCase(latinName) : latinName,
      arFather: '',
      enFather: '',
      arMother,
      enMother: arMother ? transliterateName(arMother, learned) : '',
      nationality,
      dob,
      aliases: [],
      notes: noteText
    }
  }
  return {
    lines,
    entityType: 'individual',
    arName: tokens.join(' '),
    enName: [first, ...family]
      .map((w) => transliterateWord(w, learned))
      .filter(Boolean)
      .join(' '),
    arFather: father,
    enFather: father ? transliterateWord(father, learned) : '',
    arMother,
    enMother: arMother ? transliterateName(arMother, learned) : '',
    nationality,
    dob,
    aliases: [],
    notes: noteText
  }
}

/** Groups the OCR lines of a page into entries and parses each */
export function parseLetterEntries(
  lines: SicOcrLine[],
  learned: SpellingDictionary = {}
): ParsedEntry[] {
  // English (OFAC style) list; a later page of one may hold only vessels or companies
  const numbered = lines.filter((l) => NUMBERED_LATIN.test(l.text)).length
  if (
    numbered >= 2 ||
    (numbered === 1 &&
      lines.some((l) =>
        /DOB|nationality|Organization|a\.k\.a|\bIMO\b|MMSI|Registration/i.test(l.text)
      ))
  ) {
    return englishEntries(lines)
  }

  // Arabic list: from the first line that looks like an entry (after the subject line) to the
  // signature / footer or a large gap
  // After the subject line: the addressee above it ("شركة التأمين") is not an entry
  let subject = lines.findIndex((l) => /الموضوع/.test(l.text))
  if (subject < 0) subject = lines.findIndex((l) => /المرجع|الرقم/.test(l.text))
  // A later page has no subject line, only the letterhead: start below it
  subject = Math.max(subject, letterheadEnd(lines))
  const first = lines.findIndex(
    (l, i) => i > subject && hasArabic(l.text) && looksLikeEntry(l.text)
  )
  if (first < 0) return paragraphEntries(lines, learned)
  const heights = lines.map((l) => l.bbox.y1 - l.bbox.y0).sort((x, y) => x - y)
  const lineH = Math.max(20, heights[Math.floor(heights.length / 2)])
  const body: { l: SicOcrLine; i: number }[] = []
  for (let i = first; i < lines.length; i++) {
    const l = lines[i]
    if (LIST_END.test(l.text)) break
    const prev = body[body.length - 1]
    if (prev && l.bbox.y0 - prev.l.bbox.y1 > lineH * 3.5) break
    if (stripBullet(l.text).length > 1) body.push({ l, i })
  }
  if (!body.length) return []

  // Entry lines start further right (the bullet / number) than their continuation lines
  const entryRights = body
    .filter(({ l }) => startsWithBullet(l.text) || looksLikeEntry(l.text))
    .map(({ l }) => l.bbox.x1)
    .sort((a, b) => a - b)
  const bulletX = entryRights.length >= 2 ? entryRights[Math.floor(entryRights.length / 2)] : null
  const groups: number[][] = []
  for (const { l, i } of body) {
    const isNew =
      groups.length === 0 ||
      looksLikeEntry(l.text) ||
      (!/^[)(]/.test(l.text) &&
        (startsWithBullet(l.text) || (bulletX !== null && l.bbox.x1 >= bulletX - lineH * 0.6)))
    if (isNew) groups.push([i])
    else groups[groups.length - 1].push(i)
  }
  return groups
    .map((g) => parseArabicEntry(g.map((i) => lines[i].text).join(' '), g, learned))
    .filter((e) => (e.arName || e.enName) && !NOT_A_SUBJECT.test(e.arName))
}

function englishEntries(lines: SicOcrLine[]): ParsedEntry[] {
  const groups: number[][] = []
  let open = false
  lines.forEach((l, i) => {
    if (NUMBERED_EN.test(l.text)) {
      groups.push([i])
      open = true
      return
    }
    if (!open) return
    const g = groups[groups.length - 1]
    const prev = lines[g[g.length - 1]]
    // Continuation of the current item; a big gap, the signature or the footer ends it
    if (LIST_END.test(l.text) || l.bbox.y0 - prev.bbox.y1 > (prev.bbox.y1 - prev.bbox.y0) * 2.5) {
      open = false
      return
    }
    g.push(i)
  })
  return groups.map((g) => parseEnglishEntry(g.map((i) => lines[i].text).join(' '), g))
}

/** Letters about one or two people name them inside the paragraph: العائدة للسيد "X" (والدته Y),
 *  or a circulated ID: الهوية الصادرة بإسم "X" */
function paragraphEntries(lines: SicOcrLine[], learned: SpellingDictionary): ParsedEntry[] {
  const out: ParsedEntry[] = []
  lines.forEach((l, i) => {
    for (const m of l.text.matchAll(
      /(?:للسيد[ةه]?|السيد[ةه]?|للآنسة|للانسة|ب[إا]سم)\s*["“”]([^"“”]{3,60})["“”]\s*(\([^)]*\)?)?/g
    )) {
      const next =
        !m[2] && lines[i + 1] ? lines[i + 1].text.match(/^\s*(\([^)]*\)?)/)?.[1] || '' : ''
      const entry = parseArabicEntry(`"${m[1]}" ${m[2] || next}`, [i], learned)
      if (!NOT_A_SUBJECT.test(entry.arName)) out.push(entry)
    }
  })
  return out
}

/** Is this text Arabic (a real Arabic word, not a stray letter OCR added to an English line)? */
export function isArabicText(text: string): boolean {
  const t = text.replace(/\(Arabic:[^)]*\)?/g, '')
  const ar = (t.match(/[\u0621-\u064a]/g) || []).length
  const latin = (t.match(/[A-Za-z]/g) || []).length
  return /[\u0621-\u064a]{3}/.test(t) && ar * 3 >= latin
}

/** Parse an entry from any lines the user picked */
export function parseLinesAsEntry(
  lines: SicOcrLine[],
  indexes: number[],
  learned: SpellingDictionary = {}
): ParsedEntry {
  const sorted = [...indexes].sort((a, b) => lines[a].bbox.y0 - lines[b].bbox.y0)
  const text = sorted.map((i) => lines[i].text).join(' ')
  return isArabicText(text) && !NUMBERED_LATIN.test(text)
    ? parseArabicEntry(text, sorted, learned)
    : parseEnglishEntry(text, sorted)
}
