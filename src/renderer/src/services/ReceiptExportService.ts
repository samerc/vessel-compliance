import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  BorderStyle, AlignmentType, VerticalAlign, Header, Footer, ImageRun
} from 'docx'
import { parseHtmlToParagraphs } from '../utils/htmlToDocx'
import { Receipt } from '../../../shared/types'

const FONT = 'Arial'
const FONT_SIZE = 22 // 11pt

// ── Currency helpers ────────────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', AED: 'AED ', LBP: 'LBP ', CHF: 'CHF ', JPY: '¥'
}
const CURRENCY_WORDS: Record<string, string> = {
  USD: 'US DOLLARS', EUR: 'EUROS', GBP: 'BRITISH POUNDS', AED: 'UAE DIRHAMS',
  LBP: 'LEBANESE POUNDS', CHF: 'SWISS FRANCS', JPY: 'JAPANESE YEN'
}

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[(code || 'USD').toUpperCase()] || `${(code || '').toUpperCase()} `
}

export function formatReceiptAmount(amount: number, currency: string): string {
  const n = (amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return `${currencySymbol(currency)}${n}. -`
}

// ── Number → words (uppercase, hyphenated compound tens) ────────────────
const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN']
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  return o === 0 ? TENS[t] : `${TENS[t]}-${ONES[o]}`
}

function threeDigitsToWords(n: number): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (h > 0) parts.push(`${ONES[h]} HUNDRED`)
  if (rest > 0) parts.push(twoDigitsToWords(rest))
  return parts.join(' ')
}

export function integerToWords(n: number): string {
  if (n === 0) return 'ZERO'
  const scales: [number, string][] = [
    [1_000_000_000, 'BILLION'],
    [1_000_000, 'MILLION'],
    [1_000, 'THOUSAND']
  ]
  const parts: string[] = []
  let remaining = Math.floor(n)
  for (const [value, name] of scales) {
    if (remaining >= value) {
      const count = Math.floor(remaining / value)
      parts.push(`${threeDigitsToWords(count)} ${name}`)
      remaining %= value
    }
  }
  if (remaining > 0) parts.push(threeDigitsToWords(remaining))
  return parts.join(' ')
}

// Full uppercase amount in words: "US DOLLARS FIFTY-SEVEN THOUSAND TWO HUNDRED FIFTY ONLY"
export function amountInWords(amount: number, currency: string): string {
  const word = CURRENCY_WORDS[(currency || 'USD').toUpperCase()] || (currency || 'US DOLLARS').toUpperCase()
  const rounded = Math.round((amount || 0) * 100) / 100
  const intPart = Math.floor(rounded)
  const cents = Math.round((rounded - intPart) * 100)
  let s = `${word} ${integerToWords(intPart)}`
  if (cents > 0) s += ` AND ${integerToWords(cents)} CENTS`
  return `${s} ONLY`
}

// Ordinal for instalment: 1 → 1ST, 2 → 2ND, 3 → 3RD, 4 → 4TH ...
export function ordinal(n: number): string {
  const s = ['TH', 'ST', 'ND', 'RD']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
  'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

// "BEIRUT, AUGUST 12, 2026"
export function formatReceiptDate(iso: string, city: string): string {
  if (!iso) return (city || 'BEIRUT').toUpperCase()
  const [y, m, d] = iso.split('-').map(Number)
  return `${(city || 'BEIRUT').toUpperCase()}, ${MONTHS[(m || 1) - 1]} ${d}, ${y}`
}

// Auto-compose the BEING line from policies + instalment + vessel
export function buildBeingText(receipt: Receipt): string {
  const covers = (receipt.policies && receipt.policies.length > 0)
    ? receipt.policies.map(p => p.policyNumber).filter(Boolean).join(' & ')
    : (receipt.coversText || '')
  const instalmentPart = receipt.instalmentNumber
    ? `${ordinal(receipt.instalmentNumber)} INSTALLMENT OF `
    : ''
  const coversPart = covers ? `COVERS ${covers} ` : ''
  const vesselPart = receipt.vesselName ? `RE: M/V “${receipt.vesselName}”` : ''
  return `SETTLEMENT ${instalmentPart}${coversPart}${vesselPart}`.trim()
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
        width: { size: 2600, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        borders: cellBorders,
        margins: { top: 80, bottom: 80, left: 0, right: 120 },
        children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: label, bold: true, size: FONT_SIZE, font: FONT, color: '000000' })] })]
      }),
      new TableCell({
        width: { size: 6800, type: WidthType.DXA },
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
  const words = receipt.amountWords && receipt.amountWords.trim() ? receipt.amountWords.trim() : amountInWords(receipt.amount, receipt.currency)
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

  // Title row: RECEIPT (left, large bold) + number (right, bold)
  children.push(new Table({
    width: { size: 9400, type: WidthType.DXA },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 4700, type: WidthType.DXA }, borders: cellBorders, verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'RECEIPT', bold: true, size: 34, font: FONT, color: '000000' })] })]
        }),
        new TableCell({
          width: { size: 4700, type: WidthType.DXA }, borders: cellBorders, verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [new TextRun({ text: receipt.receiptNumber, bold: true, size: 26, font: FONT, color: '000000' })] })]
        })
      ]
    })]
  }))
  children.push(new Paragraph({ spacing: { after: 120 }, children: [] }))

  // Body label/value table
  children.push(new Table({
    width: { size: 9400, type: WidthType.DXA },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [
      labelValueRow('AMOUNT', formatReceiptAmount(receipt.amount, receipt.currency), { valueBold: true }),
      labelValueRow('RECEIVED FROM', (receipt.payerName || '').toUpperCase(), { valueBold: true }),
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
