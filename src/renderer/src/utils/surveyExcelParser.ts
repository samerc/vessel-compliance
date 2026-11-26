import XLSX from 'xlsx-js-style'
import type {
  SurveyImportDefect,
  SurveyImportFile,
  SurveyImportNotes,
  SurveyImportSurvey
} from '../../../shared/types'

// Reads the defects Excel (one sheet per survey + Deadlines + Alerts). Pure: no UI, no IPC.
//
// Each sheet: A1 "Type" | B1 Survey / Deadlines / Alerts (that cell tells the sheets apart, not
// the sheet name). Rows 1-11: label in A, value in B (Vessel, IMO, Survey, Survey date, Survey
// kind, Surveyor, Place, Line, Survey ref, Documents). Headings on row 13, lines from row 14.

/** "2026-11-18" from a date cell, an Excel serial or a YYYY-MM-DD / DD/MM/YYYY text */
function isoDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const t = String(v ?? '').trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

const text = (v: unknown): string =>
  v instanceof Date
    ? isoDate(v) || ''
    : String(v ?? '')
        .replace(/\r\n?/g, '\n')
        .trim()

/** "25/11/2026" for the notes */
const shortDate = (iso: string | null): string => (iso ? iso.split('-').reverse().join('/') : '')

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** The header block (label in A, value in B) above the table */
function headerBlock(rows: unknown[][], upto: number): Map<string, unknown> {
  const out = new Map<string, unknown>()
  for (let r = 0; r < Math.min(upto, rows.length); r++) {
    const label = norm(text(rows[r]?.[0]))
    if (label && !out.has(label)) out.set(label, rows[r]?.[1])
  }
  return out
}

/** The table: the headings row (first row from 12 on whose A cell is a heading) and its lines */
function table(rows: unknown[][]): { head: string[]; lines: unknown[][] } {
  let h = rows.findIndex((r, i) => i >= 11 && /^(item|id)$/i.test(text(r?.[0])))
  if (h < 0) h = 12
  const head = (rows[h] || []).map((c) => norm(text(c)))
  const lines = rows.slice(h + 1).filter((r) => (r || []).some((c) => text(c)))
  return { head, lines }
}

function parseSurvey(sheet: string, rows: unknown[][]): SurveyImportSurvey {
  const b = headerBlock(rows, 12)
  const get = (label: string): string => text(b.get(label))
  const { head, lines } = table(rows)
  const col = (...names: string[]): number => {
    for (const n of names) {
      const i = head.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }
  const c = {
    item: col('item', 'id'),
    ref: col('report ref', 'ref'),
    defect: col('defect', 'description'),
    wording: col('wording'),
    area: col('area'),
    kind: col('kind'),
    status: col('status'),
    lastUpdate: col('last update'),
    lastBy: col('last update by'),
    lastNote: col('last note'),
    reservation: col('reservation'),
    history: col('history'),
    due: col('due', 'due date'),
    dueCondition: col('due condition')
  }
  const at = (r: unknown[], i: number): unknown => (i >= 0 ? r[i] : '')
  const defects: SurveyImportDefect[] = lines
    .map((r) => ({
      item: text(at(r, c.item)),
      reportRef: text(at(r, c.ref)),
      text: text(at(r, c.defect)),
      generated: /generated/i.test(text(at(r, c.wording))),
      area: text(at(r, c.area)),
      notSurveyed: /not\s*(surveyed|tested)/i.test(text(at(r, c.kind))),
      status: /^(closed|rectified|accepted|done|cleared)/i.test(text(at(r, c.status)))
        ? ('CLOSED' as const)
        : ('OPEN' as const),
      lastUpdate: isoDate(at(r, c.lastUpdate)),
      lastUpdateBy: text(at(r, c.lastBy)),
      lastNote: text(at(r, c.lastNote)),
      reservation: text(at(r, c.reservation)),
      history: text(at(r, c.history)),
      due: isoDate(at(r, c.due)),
      dueCondition: text(at(r, c.dueCondition))
    }))
    .filter((d) => d.item && d.text)
  return {
    sheet,
    imo: get('imo'),
    vesselName: get('vessel'),
    code: get('survey'),
    date: isoDate(b.get('survey date')),
    kind: get('survey kind'),
    surveyor: get('surveyor'),
    place: get('place'),
    line: get('line'),
    reference: get('survey ref'),
    documents: get('documents')
      .split(/[;\n]/)
      // "PRIMA - UT Result.pdf (report to follow)" -> the file name
      .map((d) => d.replace(/\s*\([^)]*\)\s*$/, '').trim())
      .filter(Boolean),
    defects
  }
}

/** Deadlines / Alerts lines, as they go into the survey notes */
function parseNotes(
  sheet: string,
  type: SurveyImportNotes['type'],
  rows: unknown[][]
): SurveyImportNotes {
  const b = headerBlock(rows, 12)
  const { head, lines } = table(rows)
  const idx = (n: string): number => head.indexOf(n)
  const id = Math.max(0, idx('id'))
  const date = idx('date')
  const kind = idx('kind')
  const what = type === 'Deadlines' ? idx('what') : idx('alert')
  const out: string[] = []
  for (const r of lines) {
    const ref = text(r[id])
    const body = text(what >= 0 ? r[what] : r[r.length - 1])
    if (!body) continue
    const parts = [
      shortDate(date >= 0 ? isoDate(r[date]) : null),
      kind >= 0 ? text(r[kind]) : ''
    ].filter(Boolean)
    out.push(
      `${type === 'Deadlines' ? 'Deadline' : 'Alert'} ${ref || '-'}${parts.length ? ` · ${parts.join(' · ')}` : ''}: ${body}`
    )
  }
  return { sheet, type, imo: text(b.get('imo')), lines: out }
}

export function parseSurveyWorkbook(buf: ArrayBuffer): SurveyImportFile {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const file: SurveyImportFile = { surveys: [], notes: [] }
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: ''
    })
    if (!/^type$/i.test(text(rows[0]?.[0]))) continue
    const type = text(rows[0]?.[1]).toLowerCase()
    if (type === 'survey') file.surveys.push(parseSurvey(name, rows))
    else if (type === 'deadlines') file.notes.push(parseNotes(name, 'Deadlines', rows))
    else if (type === 'alerts') file.notes.push(parseNotes(name, 'Alerts', rows))
  }
  return file
}
