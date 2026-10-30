import type { PartyScreeningStatus, SanctionsScreening } from '../../../shared/types'
import { getReportSettings } from './ReportSettingsService'
import { formatDateTime } from '../utils/dateUtils'

export const SCREENING_STATUS_LABELS: Record<PartyScreeningStatus, string> = {
  CLEAR: 'Clear',
  REVIEW: 'To review',
  MATCH: 'Match',
  NOT_SCREENED: 'Not screened',
  ERROR: 'Not checked'
}

export const SCREENING_TRIGGER_LABELS: Record<SanctionsScreening['trigger'], string> = {
  quotation: 'Quotation',
  approval: 'Approval',
  conversion: 'Conversion to policy',
  endorsement: 'Endorsement',
  receipt: 'Receipt',
  manual: 'Checked by hand'
}

const STATUS_RGB: Record<PartyScreeningStatus, [number, number, number]> = {
  CLEAR: [22, 163, 74],
  REVIEW: [217, 119, 6],
  MATCH: [192, 0, 0],
  NOT_SCREENED: [110, 110, 110],
  ERROR: [192, 0, 0]
}

export function screeningReportFileName(s: SanctionsScreening): string {
  const label = (s.contextLabel || s.contextType).replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, '')
  return `Sanctions screening - ${label} - ${s.createdAt.slice(0, 10)}.pdf`
}

/** The screening of a conversion / endorsement / receipt as a PDF (saved in the policy folder) */
export async function buildScreeningReportPdf(s: SanctionsScreening): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }, rs] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    getReportSettings()
  ])
  const doc = new jsPDF()

  // Header band (as the Sanctions Check Report)
  doc.setFillColor(15, 18, 24)
  doc.rect(0, 5, 210, rs.companySubtitle ? 50 : 46, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(rs.companyName, 14, 20)
  if (rs.companySubtitle) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(190, 190, 190)
    doc.text(rs.companySubtitle, 14, 28)
  }
  const titleY = rs.companySubtitle ? 40 : 34
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Sanctions Screening', 14, titleY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(190, 190, 190)
  doc.text(s.contextLabel || '', 14, titleY + 8)

  let y = rs.companySubtitle ? 62 : 58
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(9.5)
  const meta: [string, string][] = [
    [
      'For',
      `${SCREENING_TRIGGER_LABELS[s.trigger]}${s.contextLabel ? ` - ${s.contextLabel}` : ''}`
    ],
    ['Checked by', s.createdBy || '-'],
    ['Date', formatDateTime(s.createdAt)],
    ['Lists', 'OFAC, EU, UK, UN, ISF (Lebanon), SIC (Lebanon)']
  ]
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${k}:`, 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(v), 44, y)
    y += 6
  }

  // Overall result
  y += 2
  const overridden = s.outcome !== 'CLEAR' && !!s.overrideAt
  const resultText = overridden
    ? `RESULT: ${SCREENING_STATUS_LABELS[s.outcome].toUpperCase()} - OVERRIDDEN`
    : `RESULT: ${SCREENING_STATUS_LABELS[s.outcome].toUpperCase()}`
  doc.setFillColor(...STATUS_RGB[s.outcome])
  doc.roundedRect(14, y - 4, overridden ? 100 : 70, 9, 1.5, 1.5, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(resultText, 18, y + 2)
  y += 12
  if (overridden) {
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(
      `Overridden by ${s.overrideBy || '-'} on ${formatDateTime(s.overrideAt)}: ${s.overrideReason || ''}`,
      182
    )
    doc.text(lines, 14, y)
    y += lines.length * 5 + 3
  }

  autoTable(doc, {
    startY: y,
    margin: { top: 14, right: 14, bottom: 42, left: 14 },
    head: [['Party', 'Role', 'Result', 'Checked']],
    body: s.parties.map((p) => [
      p.name,
      p.role,
      {
        content:
          SCREENING_STATUS_LABELS[p.status] +
          (p.bestScore ? ` (${p.bestScore}%)` : '') +
          (p.reused && p.status === 'CLEAR' ? ' - earlier check' : ''),
        styles: { fontStyle: 'bold' as const, textColor: STATUS_RGB[p.status] }
      },
      p.checkedAt ? formatDateTime(p.checkedAt) : '-'
    ]),
    theme: 'grid',
    headStyles: {
      fillColor: rs.primaryColor,
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold'
    },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 40 }, 2: { cellWidth: 40 } },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      overflow: 'linebreak',
      lineColor: [210, 215, 220] as [number, number, number],
      lineWidth: 0.3
    }
  })

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.line(14, 270, 196, 270)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(
      'A clear result means no listed person or entity scored above the match threshold.',
      14,
      274
    )
    doc.text(rs.footerText, 14, 278)
    doc.text(`Page ${i} of ${pageCount}`, 196, 278, { align: 'right' })
  }
  return doc.output('blob')
}
