import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  VerticalAlign,
  PageOrientation,
  TableLayoutType,
  Footer,
  Header,
  PageNumber,
  ShadingType
} from 'docx'
import { parseHtmlToParagraphs } from '../utils/htmlToDocx'
import { formatDateLong } from '../utils/dateUtils'
import {
  columnTotals,
  formatMoney,
  type StatementColumn,
  type StatementRow
} from '../utils/statementParser'
import { isIpcError } from '../utils/ipc'

// Statement of Account / invoice letter: the uploaded Excel formatted on the company letterhead
// (same header and footer as the Debit Advice). Word document; PDF via the Word/LibreOffice
// converter. The table always fits the page width; long statements flow onto more pages with
// the column header repeated.

// ---------- Settings (app_settings key `statement_settings`) ----------

export interface StatementTitleOption {
  title: string
  /** Text above the table. Placeholders: {to} {date} {reference} {total} */
  intro: string
  /** Text below the table. Same placeholders */
  closing: string
}

export interface StatementSettings {
  titles: StatementTitleOption[]
  /** Printed column names, keyed by the Excel header ("Num" -> "Debit Note No.") */
  columnLabels: Record<string, string>
  /** Text put in the Reference box of a new statement (e.g. "SOA/26/") */
  referencePrefix: string
  /** Table font size in points */
  fontSize: number
}

export const STATEMENT_SETTINGS_KEY = 'statement_settings'

export const STATEMENT_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: '{to}', label: 'Addressed to' },
  { key: '{date}', label: 'Statement date' },
  { key: '{reference}', label: 'Reference number' },
  { key: '{total}', label: 'Total due (per currency)' }
]

export const DEFAULT_STATEMENT_SETTINGS: StatementSettings = {
  titles: [
    {
      title: 'Statement of Account',
      intro: 'Please find below the statement of your outstanding premiums as at {date}.',
      closing: 'Kindly arrange settlement of the above at your earliest convenience.'
    },
    { title: 'Invoice', intro: '', closing: '' }
  ],
  columnLabels: {},
  referencePrefix: '',
  fontSize: 9
}

export async function loadStatementSettings(): Promise<StatementSettings> {
  try {
    const raw = await window.api.getSetting(STATEMENT_SETTINGS_KEY)
    if (raw && typeof raw === 'string') {
      const p = JSON.parse(raw) as Partial<StatementSettings>
      return {
        ...DEFAULT_STATEMENT_SETTINGS,
        ...p,
        titles:
          Array.isArray(p.titles) && p.titles.length > 0
            ? p.titles
            : DEFAULT_STATEMENT_SETTINGS.titles,
        columnLabels: p.columnLabels || {}
      }
    }
  } catch {
    /* defaults */
  }
  return DEFAULT_STATEMENT_SETTINGS
}

export async function saveStatementSettings(s: StatementSettings): Promise<void> {
  await window.api.setSetting(STATEMENT_SETTINGS_KEY, JSON.stringify(s))
}

// ---------- Export ----------

export interface StatementExportInput {
  title: string
  reference: string
  /** ISO YYYY-MM-DD */
  date: string
  to: string
  intro: string
  closing: string
  columns: StatementColumn[]
  /** Visible column keys, in print order */
  visible: string[]
  labels: Record<string, string>
  rows: StatementRow[]
  /** Show a sub-heading per group (customer) */
  showGroups: boolean
  totalKey: string | null
  currencyKey: string | null
  orientation: 'auto' | 'portrait' | 'landscape'
  fontSize: number
}

// A4 + the policy/DA margins
const PAGE_W = 11906
const PAGE_H = 16838
const MARGIN_LR = 850
const MARGIN_TOP = 900
const MARGIN_BOT = 850
const HEADER_DXA = 450
const FOOTER_DXA = 450
const BODY_FONT = 20 // 10pt, half-points

const thin = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' }
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }

function para(
  text: string,
  o: {
    bold?: boolean
    size?: number
    align?: (typeof AlignmentType)[keyof typeof AlignmentType]
    after?: number
    underline?: boolean
    color?: string
  } = {}
): Paragraph {
  return new Paragraph({
    alignment: o.align,
    spacing: { before: 0, after: o.after ?? 0, line: 240, lineRule: 'auto' as const },
    children: [
      new TextRun({
        text,
        bold: o.bold,
        size: o.size ?? BODY_FONT,
        font: 'Arial',
        color: o.color ?? '000000',
        underline: o.underline ? {} : undefined
      })
    ]
  })
}

function fillPlaceholders(text: string, input: StatementExportInput, totalText: string): string {
  return text
    .replace(/\{to\}/g, input.to)
    .replace(/\{date\}/g, input.date ? formatDateLong(input.date) : '')
    .replace(/\{reference\}/g, input.reference)
    .replace(/\{total\}/g, totalText)
}

/** Relative column widths from the longest word of the label and the longest value. */
function columnWeights(input: StatementExportInput): number[] {
  return input.visible.map((key) => {
    const col = input.columns.find((c) => c.key === key)
    const label = input.labels[key] || key
    const longestWord = Math.max(...label.split(/\s+/).map((w) => w.length))
    const longestValue = Math.max(0, ...input.rows.map((r) => (r.cells[key] || '').length))
    const min = col?.kind === 'money' || col?.kind === 'date' ? 10 : 4
    return Math.min(32, Math.max(min, longestWord + 1, longestValue + 1))
  })
}

export async function buildStatementDocx(
  input: StatementExportInput
): Promise<{ blob: Blob; fileName: string }> {
  const fontHalf = Math.round((input.fontSize || 9) * 2)
  const weights = columnWeights(input)
  // Average Arial character ~0.5em; cell insets 2 x 60 twips
  const needed = weights.reduce((s, w) => s + w * fontHalf * 5 + 120, 0)
  const portraitW = PAGE_W - 2 * MARGIN_LR
  const landscape =
    input.orientation === 'landscape' || (input.orientation === 'auto' && needed > portraitW)
  const contentW = (landscape ? PAGE_H : PAGE_W) - 2 * MARGIN_LR

  // Widths always add up to the content width, so the table never runs off the page
  const sumW = weights.reduce((s, w) => s + w, 0)
  const widths = weights.map((w) => Math.floor((w / sumW) * contentW))
  widths[widths.length - 1] += contentW - widths.reduce((s, w) => s + w, 0)

  const kindOf = (key: string): StatementColumn['kind'] =>
    input.columns.find((c) => c.key === key)?.kind || 'text'
  const alignOf = (key: string): (typeof AlignmentType)[keyof typeof AlignmentType] =>
    kindOf(key) === 'money' || kindOf(key) === 'number' ? AlignmentType.RIGHT : AlignmentType.LEFT

  const cell = (
    text: string,
    width: number,
    o: {
      bold?: boolean
      align?: (typeof AlignmentType)[keyof typeof AlignmentType]
      shade?: string
      span?: number
    } = {}
  ): TableCell =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      columnSpan: o.span,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 40, bottom: 40, left: 60, right: 60 },
      borders: { top: thin, bottom: thin, left: thin, right: thin },
      shading: o.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: o.shade } : undefined,
      children: [
        new Paragraph({
          alignment: o.align,
          spacing: { before: 0, after: 0 },
          children: [
            new TextRun({ text, bold: o.bold, size: fontHalf, font: 'Arial', color: '000000' })
          ]
        })
      ]
    })

  // ---- Data table ----
  const tableRows: TableRow[] = []
  tableRows.push(
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: input.visible.map((key, i) =>
        cell(input.labels[key] || key, widths[i], {
          bold: true,
          shade: 'D9E2F3',
          align: alignOf(key) === AlignmentType.RIGHT ? AlignmentType.RIGHT : AlignmentType.LEFT
        })
      )
    })
  )
  let lastGroup: string | null = null
  for (const row of input.rows) {
    if (input.showGroups && row.group !== lastGroup) {
      lastGroup = row.group
      if (row.group) {
        tableRows.push(
          new TableRow({
            cantSplit: true,
            children: [
              cell(row.group, contentW, { bold: true, shade: 'F2F2F2', span: input.visible.length })
            ]
          })
        )
      }
    }
    tableRows.push(
      new TableRow({
        cantSplit: true,
        children: input.visible.map((key, i) =>
          cell(row.cells[key] || '', widths[i], { align: alignOf(key) })
        )
      })
    )
  }

  // ---- Total row(s): one per currency ----
  const totals =
    input.totalKey && input.visible.includes(input.totalKey)
      ? columnTotals(input.rows, input.totalKey, input.currencyKey)
      : []
  const totalText = totals
    .map((t) => `${t.currency ? t.currency + ' ' : ''}${formatMoney(t.total)}`)
    .join(' and ')
  if (input.totalKey && totals.length > 0) {
    const ti = input.visible.indexOf(input.totalKey)
    const ci = input.currencyKey ? input.visible.indexOf(input.currencyKey) : -1
    for (const t of totals) {
      const cells: TableCell[] = []
      const labelW = widths.slice(0, ti).reduce((s, w) => s + w, 0)
      if (ti > 0) {
        cells.push(
          cell(
            totals.length > 1 && t.currency && ci < 0 ? `Total (${t.currency})` : 'Total',
            labelW,
            { bold: true, shade: 'F2F2F2', span: ti, align: AlignmentType.RIGHT }
          )
        )
      }
      for (let i = ti; i < input.visible.length; i++) {
        const key = input.visible[i]
        let text = ''
        if (i === ti) text = formatMoney(t.total)
        else if (i === ci) text = t.currency
        cells.push(
          cell(text, widths[i], {
            bold: true,
            shade: 'F2F2F2',
            align: i === ti ? AlignmentType.RIGHT : alignOf(key)
          })
        )
      }
      tableRows.push(new TableRow({ cantSplit: true, children: cells }))
    }
  }

  const dataTable = new Table({
    width: { size: contentW, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: tableRows
  })

  // ---- Body ----
  const children: (Paragraph | Table)[] = []
  children.push(
    para(input.title.toUpperCase(), {
      bold: true,
      underline: true,
      align: AlignmentType.CENTER,
      size: 22,
      after: 240
    })
  )

  // To (left) | Ref + Date (right)
  const leftW = Math.round(contentW * 0.6)
  const infoCell = (lines: Paragraph[], w: number): TableCell =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      borders: { top: none, bottom: none, left: none, right: none },
      children: lines.length > 0 ? lines : [para('')]
    })
  const labelled = (label: string, value: string, align?: typeof AlignmentType.RIGHT): Paragraph =>
    new Paragraph({
      alignment: align,
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: BODY_FONT, font: 'Arial' }),
        new TextRun({ text: value, size: BODY_FONT, font: 'Arial' })
      ]
    })
  const right: Paragraph[] = []
  if (input.reference) right.push(labelled('Ref', input.reference, AlignmentType.RIGHT))
  if (input.date) right.push(labelled('Date', formatDateLong(input.date), AlignmentType.RIGHT))
  children.push(
    new Table({
      width: { size: contentW, type: WidthType.DXA },
      columnWidths: [leftW, contentW - leftW],
      layout: TableLayoutType.FIXED,
      borders: {
        top: none,
        bottom: none,
        left: none,
        right: none,
        insideHorizontal: none,
        insideVertical: none
      },
      rows: [
        new TableRow({
          children: [
            infoCell(input.to ? [labelled('To', input.to)] : [], leftW),
            infoCell(right, contentW - leftW)
          ]
        })
      ]
    })
  )
  children.push(para('', { after: 160 }))

  const textBlock = (text: string): void => {
    const lines = fillPlaceholders(text, input, totalText).split('\n')
    for (const line of lines) children.push(para(line, { after: 60 }))
    children.push(para('', { after: 120 }))
  }
  if (input.intro.trim()) textBlock(input.intro)
  children.push(dataTable)
  children.push(para('', { after: 160 }))
  if (input.closing.trim()) textBlock(input.closing)

  // ---- Letterhead + footer (same source as the Debit Advice) ----
  const headerParas: Paragraph[] = []
  try {
    const st = await window.api.piGetSectionTexts()
    if (st && !isIpcError(st) && st.docHeader) {
      headerParas.push(
        ...parseHtmlToParagraphs(st.docHeader, {
          size: 18,
          font: 'Times New Roman',
          color: '666666',
          lineSpacing: st.docHeaderSpacing || 220,
          spacingAfter: 0
        })
      )
    }
  } catch {
    /* no letterhead configured */
  }
  const footerLines: string[] = []
  try {
    const raw = await window.api.getSetting('policyExportSettings')
    const ft = raw ? (JSON.parse(raw) as { footerText?: string }).footerText : ''
    if (ft) {
      const plain = ft
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
      for (const l of plain.split('\n')) if (l.trim()) footerLines.push(l.trim())
    }
  } catch {
    /* no footer configured */
  }
  const pn = { size: 16, font: 'Arial', color: '999999' }
  const footer = new Footer({
    children: [
      ...footerLines.map((l) => para(l, { size: 18, color: '999999' })),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({ text: 'Page ', ...pn }),
          new TextRun({ children: [PageNumber.CURRENT], ...pn }),
          new TextRun({ text: ' of ', ...pn }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], ...pn })
        ]
      })
    ]
  })

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            // docx takes the portrait size and swaps it for landscape
            size: {
              width: PAGE_W,
              height: PAGE_H,
              orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
            },
            margin: {
              top: MARGIN_TOP,
              bottom: MARGIN_BOT,
              left: MARGIN_LR,
              right: MARGIN_LR,
              header: HEADER_DXA,
              footer: FOOTER_DXA
            }
          }
        },
        headers: {
          default: new Header({ children: headerParas.length > 0 ? headerParas : [para('')] })
        },
        footers: { default: footer },
        children
      }
    ]
  })

  const blob = await Packer.toBlob(document)
  const safe = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, '-').trim()
  const parts = [input.title, input.to, input.reference].map(safe).filter(Boolean)
  return { blob, fileName: `${parts.join(' - ') || 'Statement'}.docx` }
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = window.document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportStatementDocx(input: StatementExportInput): Promise<void> {
  const { blob, fileName } = await buildStatementDocx(input)
  download(blob, fileName)
}

/** PDF through the Word / LibreOffice converter (same as the policy PDF export). */
export async function exportStatementPdf(input: StatementExportInput): Promise<void> {
  const { blob, fileName } = await buildStatementDocx(input)
  const docxData = Array.from(new Uint8Array(await blob.arrayBuffer()))
  const res = await window.api.convertDocxBufferToPdf({ docxData, fileName })
  if (isIpcError(res)) throw new Error(res.message || 'PDF conversion failed')
  download(
    new Blob([new Uint8Array(res.data)], { type: 'application/pdf' }),
    fileName.replace(/\.docx$/i, '.pdf')
  )
}
