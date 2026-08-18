import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  BorderStyle, AlignmentType, VerticalAlign, Header, Footer, ImageRun, TableLayoutType
} from 'docx'
import { parseHtmlToParagraphs } from '../utils/htmlToDocx'
import { numberToWords } from '../utils/numberToWords'
import { Receipt } from '../../../shared/types'

const FONT = 'Arial'
const FONT_SIZE = 22 // 11pt

// Column widths shared by the title row and the body table so they line up (DXA)
const COL_LABEL = 2600
const COL_VALUE = 6800
const TABLE_W = COL_LABEL + COL_VALUE

// ── Currency helpers ────────────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', AED: 'AED ', LBP: 'LBP ', CHF: 'CHF ', JPY: '¥'
}

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[(code || 'USD').toUpperCase()] || `${(code || '').toUpperCase()} `
}

export function formatReceiptAmount(amount: number, currency: string): string {
  const n = (amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return `${currencySymbol(currency)}${n}. -`
}

// Ordinal for instalment: 1 → 1st, 2 → 2nd, 3 → 3rd, 4 → 4th ...
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

// Title-case a city that may be stored uppercase, e.g. "BEIRUT" → "Beirut"
function titleCaseCity(city: string): string {
  return (city || 'Beirut').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// "Beirut, August 12, 2026"
export function formatReceiptDate(iso: string, city: string): string {
  if (!iso) return titleCaseCity(city)
  const [y, m, d] = iso.split('-').map(Number)
  return `${titleCaseCity(city)}, ${MONTHS[(m || 1) - 1]} ${d}, ${y}`
}

// Auto-compose the BEING line from policies + instalment + vessel (fallback only —
// the editor normally stores the composed beingText). Proper case to match the receipt.
export function buildBeingText(receipt: Receipt): string {
  const covers = (receipt.policies && receipt.policies.length > 0)
    ? receipt.policies.map(p => p.policyNumber).filter(Boolean).join(' & ')
    : (receipt.coversText || '')
  const instalmentPart = receipt.instalmentNumber
    ? `${ordinal(receipt.instalmentNumber)} installment of `
    : ''
  const coversPart = covers ? `cover ${covers} ` : ''
  const vesselPart = receipt.vesselName ? `Re: M/V “${receipt.vesselName}”` : ''
  return `Settlement ${instalmentPart}${coversPart}${vesselPart}`.trim()
}

async function loadLogoAsBuffer(logoPath: string): Promise<{ buffer: ArrayBuffer; width: number; height: number } | null> {
  try {
    const resp = await fetch(`safe-file://${logoPath}`)
    const blob = await resp.blob()
    const buffer = await blob.arrayBuffer()
    const bmp = await createImageBitmap(blob)
    return { buffer, width: bmp.width, height: bmp.height }
  } catch {
    return null
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = window.document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const cellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }

function labelValueRow(label: string, value: string, opts?: { valueBold?: boolean }): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: COL_LABEL, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: cellBorders,
        margins: { top: 80, bottom: 80, left: 0, right: 120 },
        children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: label, bold: true, size: FONT_SIZE, font: FONT, color: '000000' })] })]
      }),
      new TableCell({
        width: { size: COL_VALUE, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: cellBorders,
        margins: { top: 80, bottom: 80, left: 0, right: 0 },
        // Multi-line values (e.g. the BEING section) render one paragraph per line
        children: value.split('\n').map(line => new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: line, bold: opts?.valueBold, size: FONT_SIZE, font: FONT, color: '000000' })] }))
      })
    ]
  })
}

export async function buildReceiptBlob(receipt: Receipt): Promise<{ blob: Blob; fileName: string }> {
  // Shared letterhead (same as quotations/policies): logo image + docHeader rich-text
  let logoPath: string | null = null
  try { logoPath = await window.api.piGetQuotationLogoPath() } catch { /* no logo */ }
  let headerHtml = ''
  let headerSpacing: number | undefined
  try {
    const st = await window.api.piGetSectionTexts() as any
    headerHtml = st?.docHeader || ''
    headerSpacing = st?.docHeaderSpacing || undefined
  } catch { /* no header */ }
  let footerText = ''
  try {
    const raw = await window.api.getSetting('policyExportSettings')
    const parsed = raw ? JSON.parse(raw) : null
    footerText = parsed?.footerText || ''
  } catch { /* no footer */ }

  const being = receipt.beingText && receipt.beingText.trim() ? receipt.beingText.trim() : buildBeingText(receipt)
  const words = receipt.amountWords && receipt.amountWords.trim() ? receipt.amountWords.trim() : numberToWords(receipt.amount, receipt.currency)
  const dateStr = formatReceiptDate(receipt.receiptDate, receipt.city || 'BEIRUT')

  const children: (Paragraph | Table)[] = []

  // Logo image at top of body
  if (logoPath) {
    const logoData = await loadLogoAsBuffer(logoPath)
    if (logoData) {
      const scale = Math.min(200 / logoData.width, 80 / logoData.height)
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [new ImageRun({
          data: logoData.buffer,
          transformation: { width: Math.round(logoData.width * scale), height: Math.round(logoData.height * scale) },
          type: 'png'
        })]
      }))
    }
  }

  // Title row: RECEIPT (left) + number (right) — same column widths as the body so they line up
  children.push(new Table({
    width: { size: TABLE_W, type: WidthType.DXA },
    columnWidths: [COL_LABEL, COL_VALUE],
    layout: TableLayoutType.FIXED,
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: COL_LABEL, type: WidthType.DXA }, borders: cellBorders, verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'RECEIPT', bold: true, size: 26, font: FONT, color: '000000' })] })]
        }),
        new TableCell({
          width: { size: COL_VALUE, type: WidthType.DXA }, borders: cellBorders, verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [new TextRun({ text: receipt.receiptNumber, bold: true, size: 24, font: FONT, color: '000000' })] })]
        })
      ]
    })]
  }))
  children.push(new Paragraph({ spacing: { after: 120 }, children: [] }))

  // Body label/value table
  children.push(new Table({
    width: { size: TABLE_W, type: WidthType.DXA },
    columnWidths: [COL_LABEL, COL_VALUE],
    layout: TableLayoutType.FIXED,
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [
      labelValueRow('AMOUNT', formatReceiptAmount(receipt.amount, receipt.currency), { valueBold: true }),
      labelValueRow('RECEIVED FROM', receipt.payerName || '', { valueBold: true }),
      labelValueRow('THE SUM OF', words),
      labelValueRow('BEING', being),
      labelValueRow('DATE', dateStr)
    ]
  }))

  // Header (letterhead) + footer
  const headerParas = headerHtml
    ? parseHtmlToParagraphs(headerHtml, { size: 18, font: FONT, color: '666666', lineSpacing: headerSpacing, spacingAfter: 0 })
    : []
  const footerParas: Paragraph[] = []
  if (footerText) {
    const plain = footerText.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    for (const line of plain.split('\n')) {
      if (line.trim()) footerParas.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: line.trim(), size: 18, font: FONT, color: '999999' })] }))
    }
  }

  const document = new Document({
    sections: [{
      properties: { page: { margin: { top: 1200, bottom: 1000, left: 1100, right: 1100 } } },
      headers: headerParas.length > 0 ? { default: new Header({ children: headerParas }) } : undefined,
      footers: footerParas.length > 0 ? { default: new Footer({ children: footerParas }) } : undefined,
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  const safeNum = receipt.receiptNumber.replace(/[\/\\]/g, '-')
  const vName = receipt.vesselName ? ` - ${receipt.vesselName}` : ''
  return { blob, fileName: `Receipt ${safeNum}${vName}.docx` }
}

export async function exportReceiptDocx(receipt: Receipt): Promise<void> {
  const { blob, fileName } = await buildReceiptBlob(receipt)
  downloadBlob(blob, fileName)
}
