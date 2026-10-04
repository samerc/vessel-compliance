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
 * so multi-line descriptions and numbered sub-items ("1. ...") stay with their reference.
 */

export interface ParsedDefect {
  number: string
  description: string
  dueDate?: string
  severity: string
}

type Section = 'none' | 'deficiencies' | 'observations'

// A survey reference: chapter[.item] (chapters run 1..40), a 2-digit list number ("01"), or "N/I 3"
const REF = String.raw`(?:N\/I\s*\d{1,2}|0\d|[1-9]\d?(?:\.\d{1,2})?)`
// Whole line is a reference (optionally a combined "8.4 /" or "15.14/ 17.3") with optional text after it
const REF_LINE = new RegExp(String.raw`^(${REF}(?:\s*\/\s*(?:${REF})?)*)(?:\s+(\S.*))?$`)

const OBSERVATION_START = /This section is for the observations/i
const DEFICIENCY_START = /^(Ref|LIST OF DEFICIENCIES)\b/i
const NOISE = [
  /Condition Survey Report Format/i,          // page header
  /^--\s*\d+\s+of\s+\d+\s*--$/,               // pdf-parse page marker
  /^\d{1,3}$/,                                // bare page number (only checked right after a header)
  /DEFICIENCIES\s*&\s*RECOMMENDATIONS/i,
  /^[.…\s]{6,}$/,                             // signature dotted lines
  /^Vessel.{0,3}s\s+Master/i,               // signature captions
  /Attending Surveyor\s*$/i,
  /^Capt\.?\s.*(…|\.{3,}|Surveyor)/i,
  /^No\.?\s+(Recommendation|ITEMS NOT SURVEYED)\b/i,
  /^(Recommendation|ITEMS NOT SURVEYED)$/i,
  /^Ref$/i
]

function chapterOk(ref: string): boolean {
  // "2023" (a page number glued to a ref) or "45.1" are not survey references
  const first = ref.replace(/^N\/I\s*/i, '').split(/[./\s]/)[0]
  const n = parseInt(first, 10)
  return /^N\/I/i.test(ref) || (n >= 0 && n <= 40)
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

/** Pulls a trailing due date ("... 15/10/2026") off a description, returned as YYYY-MM-DD */
function extractDueDate(description: string): { description: string; dueDate?: string } {
  const m = description.match(/\s+((?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})|(?:\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}))$/)
  if (!m) return { description }
  const parts = m[1].split(/[/\-.]/)
  let dueDate: string | undefined
  if (parts[0].length === 4) dueDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
  else if (parts[2].length === 4) dueDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  else dueDate = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  if (isNaN(new Date(dueDate).getTime())) return { description }
  return { description: description.slice(0, description.length - m[0].length).trim(), dueDate }
}

function finish(number: string, lines: string[], section: Section): ParsedDefect | null {
  // Sub-items ("1. ...") start a new line; wrapped lines of the same sentence are joined
  let text = ''
  for (const l of lines) {
    if (!text) text = l
    else if (/^(\d{1,2}[.)]|[-•▪])\s/.test(l) || /:$/.test(text)) text += '\n' + l
    else text += ' ' + l
  }
  text = cleanText(text)
  if (!text || /^[.\s]*$/.test(text)) return null
  const { description, dueDate } = extractDueDate(text)
  return { number, description, dueDate, severity: section === 'observations' ? 'Observation' : '' }
}

/** Text parser (PDF text, or a Word file read as plain text) */
export function parseDefectText(raw: string): ParsedDefect[] {
  const lines = raw.replace(/\r/g, '').split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim())
  const out: ParsedDefect[] = []
  let section: Section = 'none'
  let current: { number: string; lines: string[] } | null = null
  let pendingRef: string | null = null      // "8.4 /" waiting for the "27.2" on the next line
  let observationCount = 0
  let afterHeader = false

  const flush = (): void => {
    if (current) {
      const d = finish(current.number, current.lines, section)
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

    if (OBSERVATION_START.test(line)) { flush(); section = 'observations'; continue }
    if (section === 'none' && DEFICIENCY_START.test(line)) {
      if (/^Ref\b/i.test(line)) section = 'deficiencies'
      continue
    }
    if (/^NOTE\b/i.test(line) || /^If the defects are not rectified/i.test(line)) {
      flush()
      // skip the NOTE paragraph up to the signature block
      while (i + 1 < lines.length && lines[i + 1] && !/^[.…\s]{6,}$/.test(lines[i + 1]) && !OBSERVATION_START.test(lines[i + 1])) i++
      continue
    }
    if (section === 'none') continue
    if (NOISE.some(re => re.test(line)) && !/^\d{1,3}$/.test(line)) {
      // signature block ends the current item
      if (/Master|Surveyor|^[.…\s]{6,}$/.test(line)) flush()
      continue
    }

    const m = line.match(REF_LINE)
    const isSubItem = /^\d{1,2}\.\s+\S/.test(line) && !/^\d{1,2}\.\d/.test(line)
    if (m && !isSubItem && chapterOk(m[1])) {
      const ref = normRef(m[1])
      if (pendingRef) {
        pendingRef = `${pendingRef}/${ref}`
        if (!m[2]) { flush(); current = { number: pendingRef, lines: [] }; pendingRef = null; continue }
        flush(); current = { number: pendingRef, lines: [m[2]] }; pendingRef = null; continue
      }
      if (/\/\s*$/.test(m[1]) && !m[2]) { flush(); pendingRef = ref; continue }
      flush()
      current = { number: ref, lines: m[2] ? [m[2]] : [] }
      continue
    }

    if (current) {
      current.lines.push(line)
    } else if (section === 'observations' && line.length > 15) {
      // free-text observation without a number (e.g. a single observation paragraph)
      observationCount++
      current = { number: `OBS ${observationCount}`, lines: [line] }
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
  let observationCount = 0
  const rows = html.split(/<tr[^>]*>/i).slice(1).map(r => r.split(/<\/tr>/i)[0])
  for (const r of rows) {
    const cells = r.split(/<t[dh][^>]*>/i).slice(1).map(c => cleanText(cellText(c.split(/<\/t[dh]>/i)[0])))
    const nonEmpty = cells.filter(Boolean)
    if (nonEmpty.length === 0) continue
    const joined = nonEmpty.join(' ')
    if (OBSERVATION_START.test(joined)) { section = 'observations'; continue }
    if (/^Ref$/i.test(nonEmpty[0])) { section = 'deficiencies'; continue }
    if (section === 'none') continue
    if (/^NOTE\b/i.test(joined) || /If the defects are not rectified/i.test(joined)) continue
    if (/Master|Attending Surveyor|Superintendent/i.test(joined) && /[.…]{3,}|Capt/i.test(joined)) continue
    if (/^No\.?$/i.test(nonEmpty[0]) && nonEmpty.length > 1) continue // "No. | Recommendation" header

    const first = nonEmpty[0]
    const refMatch = first.match(new RegExp(String.raw`^${REF}(?:\s*\/\s*(?:${REF})?)*$`))
    if (refMatch && chapterOk(first) && nonEmpty.length >= 2) {
      const d = finish(normRef(first), nonEmpty.slice(1).join('\n').split('\n'), section)
      if (d) out.push(d)
    } else if (section === 'observations' && nonEmpty.length === 1 && first.length > 15) {
      observationCount++
      const d = finish(`OBS ${observationCount}`, first.split('\n'), section)
      if (d) out.push(d)
    } else if (nonEmpty.length >= 2 && !refMatch && first.length <= 12 && /\d/.test(first)) {
      // unusual reference format ("7.5/7/6/7.7", "A1"): keep it rather than drop the row
      const d = finish(first, nonEmpty.slice(1).join('\n').split('\n'), section)
      if (d) out.push(d)
    }
  }
  return out.length ? out : null
}
