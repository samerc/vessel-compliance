/**
 * Condition-survey "DEFICIENCIES & RECOMMENDATIONS" parser (Al-Bahriah survey report format).
 *
 * Two sections are recognised:
 *  - the list of deficiencies (after "Ref", before "NOTE")          -> defects
 *  - "This section is for the observations and the outstanding tests" -> severity 'Observation'
 *    (observations, items not surveyed / not inspected)
 *
 * Word files are read from their TABLE rows (reference cell + description cell), which is exact.
 * PDFs (and Word files without tables) are read from text: a defect starts on a line beginning
 * with a reference ("7.6", "13", "8.4 / 27.2", "N/I 3", "01") and runs until the next reference,
 * so multi-line descriptions and sub-items ("1. ...", "2- ...", "- ...") stay with their reference.
 * A reference that wraps in its narrow column ("10.1" / "0/1" / "0.1" / "1") is joined again.
 *
 * "time scale: 10 day" / "time for rectification : 3 month" becomes a due date counted from the
 * survey date in the report header ("immediately"/"ASAP" = the survey date); a time scale that is
 * an event ("before next sailing", "at next dry dock") becomes the defect's due EVENT.
 */

export interface ParsedDefect {
  number: string
  description: string
  dueDate?: string
  /** Event deadline when the time scale is not a period ("At next dry dock", "Before next sailing") */
  dueEvent?: string
  severity: string
}

type Section = 'none' | 'deficiencies' | 'observations'

// A survey reference: chapter[.item] (chapters run 1..40), a 2-digit list number ("01"), or "N/I 3"
const REF = String.raw`(?:N\/I\s*\d{1,2}|0\d|[1-9]\d?(?:\.\d{1,2})?)`
// Whole line is a reference (optionally a combined "8.4 /" or "15.14/ 17.3") with optional text after it
const REF_LINE = new RegExp(String.raw`^(${REF}(?:\s*\/\s*(?:${REF})?)*)(?:\s+(\S.*))?$`)
// A piece of a reference that wrapped onto its own line ("0/1", "14.", "4", "/")
const REF_FRAGMENT = /^[\d./]+$/

const OBSERVATION_START = /This section is for the observations/i
const NOISE = [
  /Condition Survey Report Format/i,          // page header
  /^--\s*\d+\s+of\s+\d+\s*--$/,               // pdf-parse page marker
  /DEFICIENCIES\s*&\s*RECOMMENDATIONS/i,
  /^[.…\s]{6,}$/,                             // signature dotted lines
  /^Vessel.{0,3}s\s+Master\b/i,               // signature captions
  /Attending Surveyor\s*$/i,
  /^Capt\.?\s.*(…|\.{3,}|Surveyor)/i,
  /^No\.?\s+(Recommendation|ITEMS NOT SURVEYED)\b/i,
  /^(Recommendation|ITEMS NOT SURVEYED)$/i
]
// "time scale: 10 day", "TIME SCALE : 3 month", "time sacle : 15 day", "time scale ( 1 month )",
// "time for rectification : 30 day"
const TIME_SCALE = /(?:^|\s)time\s*(?:s[ca]{2}le|for\s+rectification)\s*[:(]?\s*([^()]*?)\s*\)?\s*\.?$/i

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
}

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "19.01.2026", "23/8/2026", "2026-08-23", "26 Aug 2026" -> Date (day-first, as in the reports) */
export function parseReportDate(text: string): Date | null {
  const t = text.trim()
  let m = t.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  m = t.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    const d = new Date(y, +m[2] - 1, +m[1])
    return d.getMonth() === +m[2] - 1 ? d : null
  }
  m = t.match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/)
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1])
  return null
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, on: 1 /* "on week" typo */, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, thirty: 30
}

/** Due date for a time-scale value, or null when it is not a period ("at next dry dock") */
function dueFromTimeScale(value: string, surveyDate: Date | null): string | null {
  if (!surveyDate) return null
  const v = value.toLowerCase().trim()
  if (/^(immediately|immediate|asap|as soon as possible)\b/.test(v)) return iso(surveyDate)
  const m = v.match(/^(\d+|[a-z]+)\s*(day|days|week|weeks|month|months|year|years)\b/)
  if (!m) return null
  const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : WORD_NUMBERS[m[1]]
  if (!n) return null
  const d = new Date(surveyDate)
  if (m[2].startsWith('day')) d.setDate(d.getDate() + n)
  else if (m[2].startsWith('week')) d.setDate(d.getDate() + n * 7)
  else if (m[2].startsWith('month')) d.setMonth(d.getMonth() + n)
  else d.setFullYear(d.getFullYear() + n)
  return iso(d)
}

function chapterOk(ref: string): boolean {
  // "2023" (a page number glued to a ref) or "45.1" are not survey references
  if (/^N\/I/i.test(ref)) return true
  const n = parseInt(ref.split(/[./\s]/)[0], 10)
  return n >= 0 && n <= 40
}

function normRef(ref: string): string {
  return ref.replace(/\s*\/\s*/g, '/').replace(/\/$/, '').replace(/N\/I\s*/i, 'N/I ').trim()
}

function cleanText(s: string): string {
  return s
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** A trailing date counts as the due date only when worded as one ("due 15/10/2026", "by ...") */
function extractDueDate(description: string): { description: string; dueDate?: string } {
  const m = description.match(/[\s,(]*\b(?:due(?: date)?|by|before|until|deadline|not later than)\s*:?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2})\s*\)?\.?$/i)
  if (!m) return { description }
  const d = parseReportDate(m[1])
  if (!d) return { description }
  return { description: description.slice(0, description.length - m[0].length).trim(), dueDate: iso(d) }
}

function finish(number: string, lines: string[], section: Section, surveyDate: Date | null): ParsedDefect | null {
  // Pull out the time scale (own line, or at the end of the last line)
  let dueDate: string | undefined
  let dueEvent: string | undefined
  const kept: string[] = []
  for (const l of lines) {
    const ts = l.match(TIME_SCALE)
    if (ts) {
      const before = l.slice(0, ts.index ?? 0).trim()
      if (before) kept.push(before)
      const due = dueFromTimeScale(ts[1], surveyDate)
      if (due) dueDate = due
      else if (ts[1]) {
        // an event, or a period that could not be dated (report without a survey date)
        const ev = ts[1].replace(/[.\s]+$/, '').trim()
        dueEvent = ev.charAt(0).toUpperCase() + ev.slice(1)
      }
      continue
    }
    kept.push(l)
  }
  // Sub-items ("1. ", "2- ", "- ") start a new line; wrapped lines of the same sentence are joined
  let text = ''
  for (const l of kept) {
    if (!text) text = l
    else if (/^(\d{1,2}\s*[.)-]|[-•▪])/.test(l) || /:$/.test(text)) text += '\n' + l
    else text += ' ' + l
  }
  text = cleanText(text)
  if (!text || /^[-.\s]*$/.test(text)) return null
  const extracted = extractDueDate(text)
  return {
    number,
    description: extracted.description,
    dueDate: dueDate ?? extracted.dueDate,
    dueEvent: (dueDate ?? extracted.dueDate) ? undefined : dueEvent,
    severity: section === 'observations' ? 'Observation' : ''
  }
}

/** Text parser (PDF text, or a Word file read as plain text) */
export function parseDefectText(raw: string): ParsedDefect[] {
  const lines = raw.replace(/\r/g, '').split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim())
  const out: ParsedDefect[] = []
  let section: Section = 'none'
  let surveyDate: Date | null = null
  // refOpen: the reference line had no text yet, so a wrapped fragment ("0/1") may follow
  let current: { number: string; lines: string[]; refOpen: boolean; closed: boolean } | null = null
  let observationCount = 0
  let afterHeader = false

  const flush = (): void => {
    if (current) {
      const d = finish(normRef(current.number), current.lines, section, surveyDate)
      if (d) out.push(d)
    }
    current = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue

    if (/Condition Survey Report Format/i.test(line)) { afterHeader = true; continue }
    if (afterHeader && /^\d{1,3}$/.test(line)) { afterHeader = false; continue }
    afterHeader = false

    if (!surveyDate && section === 'none') {
      const dm = line.match(/^Date\b\s*:?\s*(.+)$/i)
      if (dm) { surveyDate = parseReportDate(dm[1]); continue }
    }
    if (OBSERVATION_START.test(line)) { flush(); section = 'observations'; continue }
    if (section === 'none') {
      if (/^Ref\b/i.test(line)) section = 'deficiencies'
      continue
    }
    if (/^Ref$/i.test(line)) continue
    if (/^NOTE\b/i.test(line) || /^If the defects are not rectified/i.test(line)) {
      flush()
      // skip the NOTE paragraph up to the signature block
      while (i + 1 < lines.length && lines[i + 1] && !/^[.…\s]{6,}$/.test(lines[i + 1]) && !OBSERVATION_START.test(lines[i + 1])) i++
      continue
    }
    if (NOISE.some(re => re.test(line))) {
      // signature block ends the current item
      if (/Master|Surveyor|^[.…\s]{6,}$/.test(line)) flush()
      continue
    }

    // A reference wrapped onto several lines in its narrow column: join the pieces
    if (current && current.refOpen && REF_FRAGMENT.test(line) &&
        (/[./]$/.test(current.number) || /^[0./]/.test(line) || /^\d$/.test(line))) {
      current.number += line
      continue
    }

    const m = line.match(REF_LINE)
    const isSubItem = /^\d{1,2}\s*[.)-](\s|$|[A-Za-z-])/.test(line) && !/^\d{1,2}\.\d/.test(line)
    if (m && !isSubItem && chapterOk(m[1])) {
      flush()
      current = { number: m[1], lines: m[2] ? [m[2]] : [], refOpen: !m[2], closed: false }
      continue
    }

    if (current && !current.closed) {
      current.refOpen = false
      current.lines.push(line)
      // a time scale is the last line of an item: anything after it is a new (unnumbered) item
      if (TIME_SCALE.test(line)) current.closed = true
    } else if (current && current.closed) {
      flush()
      if (line === '-') { current = { number: '-', lines: [], refOpen: false, closed: false }; continue }
      current = { number: '-', lines: [line], refOpen: false, closed: false }
    } else if (section === 'observations' && line.length > 15) {
      // free-text observation without a number (e.g. a single observation paragraph)
      observationCount++
      current = { number: `OBS ${observationCount}`, lines: [line], refOpen: false, closed: false }
    }
  }
  flush()
  return out
}

/** Word table parser: rows of [reference, description] cells (HTML from mammoth.convertToHtml) */
export function parseDefectTables(html: string): ParsedDefect[] | null {
  if (!/<table/i.test(html)) return null
  const cellText = (c: string): string =>
    c.replace(/<\/p>\s*<p[^>]*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/li>\s*<li[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const out: ParsedDefect[] = []
  let section: Section = 'none'
  let surveyDate: Date | null = null
  let observationCount = 0
  const rows = html.split(/<tr[^>]*>/i).slice(1).map(r => r.split(/<\/tr>/i)[0])
  for (const r of rows) {
    const cells = r.split(/<t[dh][^>]*>/i).slice(1).map(c => cleanText(cellText(c.split(/<\/t[dh]>/i)[0])))
    const nonEmpty = cells.filter(Boolean)
    if (nonEmpty.length === 0) continue
    const joined = nonEmpty.join(' ')
    if (section === 'none' && /^Date\b/i.test(nonEmpty[0]) && nonEmpty[1]) { surveyDate = parseReportDate(nonEmpty[1]); continue }
    if (OBSERVATION_START.test(joined)) { section = 'observations'; continue }
    if (/^Ref$/i.test(nonEmpty[0])) { section = 'deficiencies'; continue }
    if (section === 'none') continue
    if (/^NOTE\b/i.test(joined) || /If the defects are not rectified/i.test(joined)) continue
    if (/Master|Attending Surveyor|Superintendent/i.test(joined) && /[.…]{3,}|Capt/i.test(joined)) continue
    if (/^No\.?$/i.test(nonEmpty[0]) && nonEmpty.length > 1) continue // "No. | Recommendation" header

    const first = nonEmpty[0]
    const refMatch = first.replace(/\s+/g, ' ').match(new RegExp(String.raw`^${REF}(?:\s*[\/-]\s*(?:${REF})?)*$`))
    if (refMatch && chapterOk(first) && nonEmpty.length >= 2) {
      const d = finish(normRef(first), nonEmpty.slice(1).join('\n').split('\n'), section, surveyDate)
      if (d) out.push(d)
    } else if (section === 'observations' && nonEmpty.length === 1 && first.length > 15) {
      observationCount++
      const d = finish(`OBS ${observationCount}`, first.split('\n'), section, surveyDate)
      if (d) out.push(d)
    } else if (nonEmpty.length >= 2 && !refMatch && first.length <= 12 && /\d/.test(first)) {
      // unusual reference format ("7.5/7/6/7.7", "A1"): keep it rather than drop the row
      const d = finish(first, nonEmpty.slice(1).join('\n').split('\n'), section, surveyDate)
      if (d) out.push(d)
    }
  }
  return out.length ? out : null
}
