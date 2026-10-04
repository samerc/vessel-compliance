import XLSX from 'xlsx-js-style'

// Reads an accounting Excel export (QuickBooks "open invoices" style) into a clean table for the
// Statement of Account report. Pure: no UI, no IPC.
//
// The export layout it understands:
// - a header row (Type | Date | Num | ... | Open Balance | Currency) somewhere near the top,
//   usually with empty spacer columns between the real ones;
// - group rows that only carry a name (the customer, e.g. "Alfamarine") left of the data;
// - data rows; QuickBooks "Total ..." rows are dropped (the report computes its own totals).

export type StatementColumnKind = 'text' | 'date' | 'money' | 'number'

export interface StatementColumn {
  /** Header text as written in the Excel (unique within the file) */
  key: string
  kind: StatementColumnKind
  /** Every value is empty or a placeholder like "--" */
  empty: boolean
}

export interface StatementRow {
  /** Group (customer) the row belongs to; '' when the file has no group rows */
  group: string
  /** Display text per column key */
  cells: Record<string, string>
  /** Numeric value per money/number column key (null when empty) */
  values: Record<string, number | null>
}

export interface ParsedStatement {
  sheetName: string
  columns: StatementColumn[]
  rows: StatementRow[]
  groups: string[]
}

const HEADER_HINT = /^(type|date|num|no\.?|number|amount|balance|currency|memo|due date|terms)/i
const PLACEHOLDER = /^[-–—\s]*$/

interface RawCell {
  text: string
  num: number | null
  isDate: boolean
}

function readCell(ws: XLSX.WorkSheet, r: number, c: number): RawCell {
  const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
  if (!cell || cell.v == null || cell.v === '') return { text: '', num: null, isDate: false }
  if (cell.t === 'n' && typeof cell.v === 'number') {
    const fmt = typeof cell.z === 'string' ? cell.z : ''
    const isDate = !!fmt && XLSX.SSF.is_date(fmt)
    if (isDate) {
      const p = XLSX.SSF.parse_date_code(cell.v)
      const text = p
        ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`
        : String(cell.w ?? cell.v)
      return { text, num: null, isDate: true }
    }
    return { text: String(cell.w ?? cell.v).trim(), num: cell.v, isDate: false }
  }
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v
    const text = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    return { text, num: null, isDate: true }
  }
  return { text: String(cell.w ?? cell.v).trim(), num: null, isDate: false }
}

/** Finds the header row: the first row with 3+ text cells, one of them a known column name. */
function findHeaderRow(ws: XLSX.WorkSheet, range: XLSX.Range): number {
  const last = Math.min(range.e.r, range.s.r + 30)
  for (let r = range.s.r; r <= last; r++) {
    const texts: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = readCell(ws, r, c)
      if (v.text && v.num == null && !v.isDate) texts.push(v.text)
    }
    if (texts.length >= 3 && texts.some((t) => HEADER_HINT.test(t))) return r
  }
  return -1
}

function parseSheet(ws: XLSX.WorkSheet, sheetName: string): ParsedStatement | null {
  if (!ws['!ref']) return null
  const range = XLSX.utils.decode_range(ws['!ref'])
  const headerRow = findHeaderRow(ws, range)
  if (headerRow < 0) return null

  // Real columns = the header cells that have a name (skips the spacer columns)
  const colIdx: number[] = []
  const keys: string[] = []
  const seen = new Map<string, number>()
  for (let c = range.s.c; c <= range.e.c; c++) {
    const name = readCell(ws, headerRow, c).text
    if (!name) continue
    const n = (seen.get(name) || 0) + 1
    seen.set(name, n)
    colIdx.push(c)
    keys.push(n > 1 ? `${name} (${n})` : name)
  }
  if (keys.length === 0) return null

  const rows: StatementRow[] = []
  const groups: string[] = []
  const rawByCol: RawCell[][] = keys.map(() => [])
  let group = ''

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const cells = colIdx.map((c) => readCell(ws, r, c))
    // Every text on the row, spacer and group columns included
    const texts: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = readCell(ws, r, c)
      if (v.text && !PLACEHOLDER.test(v.text)) texts.push(v.text)
    }
    if (texts.length === 0) continue
    if (/^total\b/i.test(texts[0])) continue // QuickBooks subtotal / grand total
    // Group (customer) row: a lone name with no figures or dates
    if (texts.length === 1 && !cells.some((v) => v.num != null || v.isDate)) {
      group = texts[0]
      if (!groups.includes(group)) groups.push(group)
      continue
    }
    const row: StatementRow = { group, cells: {}, values: {} }
    cells.forEach((v, i) => {
      row.cells[keys[i]] = v.text
      row.values[keys[i]] = v.num
      rawByCol[i].push(v)
    })
    rows.push(row)
  }
  if (rows.length === 0) return null

  const columns: StatementColumn[] = keys.map((key, i) => {
    const vals = rawByCol[i].filter((v) => v.text && !PLACEHOLDER.test(v.text))
    let kind: StatementColumnKind = 'text'
    if (vals.length > 0 && vals.every((v) => v.isDate)) kind = 'date'
    else if (vals.length > 0 && vals.every((v) => v.num != null)) {
      const decimals = vals.some((v) => /[.,]\d{2}$/.test(v.text) || !Number.isInteger(v.num))
      kind = decimals ? 'money' : 'number'
    }
    return { key, kind, empty: vals.length === 0 }
  })

  // Money cells print with two decimals and thousand separators
  for (const row of rows) {
    for (const col of columns) {
      const n = row.values[col.key]
      if (col.kind === 'money' && n != null) row.cells[col.key] = formatMoney(n)
    }
  }

  return { sheetName, columns, rows, groups }
}

export function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Parses the workbook; uses the sheet with the most data rows (skips help/tips sheets). */
export function parseStatementWorkbook(buffer: ArrayBuffer): ParsedStatement | null {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, cellNF: true })
  let best: ParsedStatement | null = null
  for (const name of wb.SheetNames) {
    const parsed = parseSheet(wb.Sheets[name], name)
    if (parsed && (!best || parsed.rows.length > best.rows.length)) best = parsed
  }
  return best
}

/** Columns shown by default: drop empty ones and a running balance next to an open balance. */
export function defaultVisibleColumns(columns: StatementColumn[]): string[] {
  const hasOpen = columns.some((c) => /open balance|amount/i.test(c.key))
  return columns
    .filter((c) => !c.empty)
    .filter((c) => !(hasOpen && /^(foreign\s+)?balance$/i.test(c.key)))
    .map((c) => c.key)
}

/** The money column that is totalled: an open balance / amount column, else the first money one. */
export function defaultTotalColumn(columns: StatementColumn[]): string | null {
  const money = columns.filter((c) => c.kind === 'money')
  return (
    money.find((c) => /open balance/i.test(c.key))?.key ||
    money.find((c) => /amount|balance due|due/i.test(c.key))?.key ||
    money[0]?.key ||
    null
  )
}

/** The currency column, when the file has one. */
export function currencyColumn(columns: StatementColumn[]): string | null {
  return columns.find((c) => /^(currency|cur\.?|ccy)$/i.test(c.key))?.key || null
}

/** Totals of a column per currency (one entry with currency '' when there is no currency column). */
export function columnTotals(
  rows: StatementRow[],
  totalKey: string,
  currencyKey: string | null
): { currency: string; total: number }[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const n = r.values[totalKey]
    if (n == null) continue
    const cur = currencyKey ? r.cells[currencyKey] || '' : ''
    map.set(cur, (map.get(cur) || 0) + n)
  }
  return [...map.entries()].map(([currency, total]) => ({
    currency,
    total: Math.round(total * 100) / 100
  }))
}
