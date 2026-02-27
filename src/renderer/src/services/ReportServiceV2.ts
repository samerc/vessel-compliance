import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Vessel, DocumentType, VesselDocument } from '../../../shared/types'
import { resolveEffectivePolicyExpiry } from '../utils/policyUtils'

// ── Palette ───────────────────────────────────────────────────────────────────
type RGB = [number, number, number]
const C: Record<string, RGB> = {
  navy:       [10,  22,  40],
  navyMid:    [22,  46,  80],
  accent:     [0,   170, 200],
  white:      [255, 255, 255],
  textPri:    [20,  30,  48],
  textSec:    [100, 115, 135],
  bgLight:    [246, 248, 251],
  bgMid:      [220, 227, 238],
  green:      [0,   148, 74],
  greenBg:    [230, 247, 238],
  amber:      [176, 88,  0],
  amberBg:    [255, 246, 224],
  orange:     [200, 55,  0],
  orangeBg:   [255, 237, 229],
  red:        [186, 0,   0],
  redBg:      [255, 230, 230],
  purple:     [110, 50,  220],
}

type DocStatus = 'Compliant' | 'Expiring Soon' | 'Expired' | 'Missing'

const statusColors: Record<DocStatus, { text: RGB; bg: RGB }> = {
  'Compliant':     { text: C.green,  bg: C.greenBg },
  'Expiring Soon': { text: C.amber,  bg: C.amberBg },
  'Expired':       { text: C.orange, bg: C.orangeBg },
  'Missing':       { text: C.red,    bg: C.redBg },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const dateOnly = (s: string | null | undefined) => (s ? s.split('T')[0] : '')

const fmt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const isExpired = (d: string | null | undefined) =>
  !!d && new Date(d) < new Date(new Date().setHours(0, 0, 0, 0))

const isExpiringSoon = (d: string | null | undefined) => {
  if (!d) return false
  const today = new Date(new Date().setHours(0, 0, 0, 0))
  const threshold = new Date(today)
  threshold.setDate(today.getDate() + 60)
  const exp = new Date(d)
  return exp >= today && exp <= threshold
}

const annualShortCycle = (expiry: string | null | undefined, received: string | null | undefined) => {
  if (!expiry || !received) return false
  return (new Date(expiry).getTime() - new Date(received).getTime()) / 86400000 < 60
}

function getStatus(
  hasFile: boolean,
  expiry: string | null | undefined,
  annualRenewal = false,
  receivedDate?: string,
): DocStatus {
  if (!hasFile) return 'Missing'
  if (isExpired(expiry)) return 'Expired'
  if (isExpiringSoon(expiry)) {
    if (annualRenewal && annualShortCycle(expiry, receivedDate)) return 'Compliant'
    return 'Expiring Soon'
  }
  return 'Compliant'
}

const W = 210
const MARGIN = 10

// ── Page chrome ───────────────────────────────────────────────────────────────
function drawPageHeader(doc: jsPDF) {
  doc.setFillColor(...C.navy)
  doc.rect(0, 0, W, 13, 'F')

  // Accent left stripe
  doc.setFillColor(...C.accent)
  doc.rect(0, 0, 3, 13, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.white)
  doc.text('Al Bahriah Insurance & Reinsurance SAL', MARGIN + 2, 8.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('VESSEL COMPLIANCE REPORT', W / 2, 8.5, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.accent)
  doc.text('CONFIDENTIAL', W - MARGIN, 8.5, { align: 'right' })
}

function drawPageFooter(doc: jsPDF, pageNum: number, total: number) {
  const H = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...C.bgMid)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, H - 11, W - MARGIN, H - 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.textSec)
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    MARGIN, H - 6.5,
  )
  doc.text('Al Bahriah Insurance & Reinsurance SAL', W / 2, H - 6.5, { align: 'center' })
  doc.text(`Page ${pageNum} / ${total}`, W - MARGIN, H - 6.5, { align: 'right' })
}

// ── Main export ───────────────────────────────────────────────────────────────
export const ReportServiceV2 = {
  exportVesselToPDF: async (
    vessel: Vessel,
    docTypes: DocumentType[],
    docs: VesselDocument[],
  ) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageH = doc.internal.pageSize.getHeight()

    // ── Load data ──────────────────────────────────────────────────────────────
    const [dynamicPolicies, vesselAssureds, allEntities, allEntityUBOs, assuredRoles, customDocTypes] =
      await Promise.all([
        window.api.getVesselDynamicPolicies(vessel.id),
        window.api.getVesselAssureds(vessel.id),
        window.api.getEntities(),
        window.api.getEntityUBOs(),
        window.api.getAssuredRoles(),
        window.api.getVesselCustomDocTypes(vessel.id),
      ])

    const effectiveExpiry = resolveEffectivePolicyExpiry(dynamicPolicies)
    const roleOrderMap = new Map((assuredRoles as any[]).map((r, i) => [r.name, i]))
    ;(vesselAssureds as any[]).sort(
      (a: any, b: any) => (roleOrderMap.get(a.role) ?? 999) - (roleOrderMap.get(b.role) ?? 999),
    )

    // ── Build document rows ────────────────────────────────────────────────────
    type DocRow = {
      name: string; desc: string; received: string; expires: string
      status: DocStatus; annual: boolean; optional: boolean
    }
    const docRows: DocRow[] = []
    let compliant = 0, expiringSoon = 0, expired = 0, missing = 0

    for (const type of docTypes) {
      const vDoc = docs.find(d => d.documentTypeId === type.id)
      const isRequired = vDoc ? vDoc.required : type.required
      if (!isRequired && !vDoc?.filePath) continue

      const resolvedExpiry = type.annualRenewal ? (effectiveExpiry || vDoc?.expiryDate) : vDoc?.expiryDate
      const status = getStatus(!!vDoc?.filePath, resolvedExpiry, type.annualRenewal, vDoc?.receivedDate)

      if (status === 'Compliant') compliant++
      else if (status === 'Expiring Soon') expiringSoon++
      else if (status === 'Expired') expired++
      else missing++

      docRows.push({
        name: type.name,
        desc: type.description || '',
        received: vDoc?.receivedDate ? fmt(vDoc.receivedDate) : '—',
        expires: type.annualRenewal
          ? (vessel.policyExpiryDate
              ? `P&I · ${fmt(vessel.policyExpiryDate)}`
              : resolvedExpiry ? dateOnly(resolvedExpiry) : '—')
          : (resolvedExpiry ? dateOnly(resolvedExpiry) : '—'),
        status,
        annual: !!type.annualRenewal,
        optional: !isRequired,
      })
    }

    for (const ct of customDocTypes as any[]) {
      const vDoc = docs.find(d => d.documentTypeId === ct.id)
      const status = getStatus(!!vDoc?.filePath, vDoc?.expiryDate)
      if (status === 'Compliant') compliant++
      else if (status === 'Expiring Soon') expiringSoon++
      else if (status === 'Expired') expired++
      else missing++
      docRows.push({
        name: ct.name,
        desc: ct.description || '',
        received: vDoc?.receivedDate ? fmt(vDoc.receivedDate) : '—',
        expires: vDoc?.expiryDate ? dateOnly(vDoc.expiryDate) : '—',
        status,
        annual: false,
        optional: false,
      })
    }

    const total = compliant + expiringSoon + expired + missing
    const rate = total > 0 ? Math.round((compliant / total) * 100) : 100
    const rateColor: RGB = rate === 100 ? C.green : rate >= 70 ? C.amber : C.red

    // ── Page 1 header chrome ───────────────────────────────────────────────────
    drawPageHeader(doc)

    let y = 19

    // Vessel name + IMO
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(19)
    doc.setTextColor(...C.textPri)
    doc.text(vessel.name, MARGIN, y + 7)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...C.textSec)
    doc.text(`IMO  ${vessel.imoNumber}`, MARGIN, y + 14)

    doc.setFontSize(8)
    doc.text(
      `Report date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      MARGIN, y + 20,
    )

    // ── Compliance score card (top-right) ─────────────────────────────────────
    const scoreX = W - MARGIN - 52, scoreY = y - 1, scoreW = 52, scoreH = 30
    doc.setFillColor(...C.bgLight)
    doc.setDrawColor(...C.bgMid)
    doc.setLineWidth(0.4)
    doc.roundedRect(scoreX, scoreY, scoreW, scoreH, 4, 4, 'FD')

    // Rate bar background
    const barW = scoreW - 14, barH = 3.5
    const barX = scoreX + 7, barY = scoreY + scoreH - 9
    doc.setFillColor(...C.bgMid)
    doc.roundedRect(barX, barY, barW, barH, 1.5, 1.5, 'F')
    doc.setFillColor(...rateColor)
    doc.roundedRect(barX, barY, barW * (rate / 100), barH, 1.5, 1.5, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(24)
    doc.setTextColor(...rateColor)
    doc.text(`${rate}%`, scoreX + scoreW / 2, scoreY + 15, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...C.textSec)
    doc.text('COMPLIANCE RATE', scoreX + scoreW / 2, scoreY + 20, { align: 'center' })
    doc.text(`${compliant} compliant  ·  ${total} total`, scoreX + scoreW / 2, scoreY + scoreH - 4, { align: 'center' })

    y += 26

    // ── Status summary strip ───────────────────────────────────────────────────
    const statsData: { label: string; value: number; key: DocStatus }[] = [
      { label: 'COMPLIANT',     value: compliant,    key: 'Compliant' },
      { label: 'EXPIRING SOON', value: expiringSoon, key: 'Expiring Soon' },
      { label: 'EXPIRED',       value: expired,      key: 'Expired' },
      { label: 'MISSING',       value: missing,      key: 'Missing' },
    ]
    const statW = (W - MARGIN * 2 - 9) / 4
    statsData.forEach((s, i) => {
      const sx = MARGIN + i * (statW + 3)
      const col = statusColors[s.key]
      doc.setFillColor(...col.bg)
      doc.setDrawColor(...col.bg)
      doc.roundedRect(sx, y, statW, 17, 3, 3, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(...col.text)
      doc.text(String(s.value), sx + statW / 2, y + 11, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.text(s.label, sx + statW / 2, y + 15.5, { align: 'center' })
    })

    y += 23

    // ── Document section label ─────────────────────────────────────────────────
    doc.setFillColor(...C.navy)
    doc.rect(MARGIN, y, W - MARGIN * 2, 7, 'F')
    doc.setTextColor(...C.white)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('VESSEL DOCUMENTS', MARGIN + 3, y + 4.8)
    const hasOptional = docRows.some(r => r.optional)
    if (hasOptional) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...C.accent)
      doc.text('* Optional', W - MARGIN - 2, y + 4.8, { align: 'right' })
    }
    y += 7

    // ── Document table ─────────────────────────────────────────────────────────
    const tableBody = docRows.map(r => [
      r.name + (r.optional ? ' *' : ''),
      r.desc,
      r.received,
      r.expires,
      r.status,
    ])

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Document', 'Description', 'Received', 'Expires', 'Status']],
      body: tableBody,
      theme: 'plain',
      headStyles: {
        fillColor: C.navyMid,
        textColor: C.white,
        fontSize: 7.5,
        fontStyle: 'bold',
        cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      },
      columnStyles: {
        0: { cellWidth: 62 },
        1: { cellWidth: 43, textColor: C.textSec as any, fontSize: 7 },
        2: { cellWidth: 26, halign: 'center', fontSize: 7.5 },
        3: { cellWidth: 30, halign: 'center', fontSize: 7.5 },
        4: { cellWidth: 29, halign: 'center', fontSize: 7.5, fontStyle: 'bold' },
      },
      styles: {
        fontSize: 8,
        cellPadding: { top: 4.5, bottom: 4.5, left: 3, right: 3 },
        lineColor: C.bgMid as any,
        lineWidth: 0.25,
        overflow: 'linebreak',
      },
      alternateRowStyles: { fillColor: C.bgLight as any },
      didParseCell: (data) => {
        if (data.section !== 'body') return
        if (data.column.index === 4) {
          const s = data.cell.raw as DocStatus
          const col = statusColors[s]
          if (col) {
            data.cell.styles.textColor = col.text as any
            data.cell.styles.fillColor = col.bg as any
          }
        }
        if (data.column.index === 0) {
          // Extra height for annual badge
          if (docRows[data.row.index]?.annual) {
            data.cell.styles.cellPadding = { top: 4.5, bottom: 8, left: 3, right: 3 }
          }
        }
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 0) return
        const row = docRows[data.row.index]
        if (!row?.annual) return
        // Draw purple "Annual" pill inside the cell
        const px = data.cell.x + 3
        const py = data.cell.y + data.cell.height - 5.5
        doc.setFontSize(5.5)
        const label = 'Annual'
        const tw = doc.getTextWidth(label) + 4
        doc.setFillColor(...C.purple)
        doc.roundedRect(px, py, tw, 3.8, 1, 1, 'F')
        doc.setTextColor(...C.white)
        doc.setFont('helvetica', 'bold')
        doc.text(label, px + 2, py + 2.8)
      },
      didDrawPage: () => {
        drawPageHeader(doc)
        const pn = (doc.internal as any).getCurrentPageInfo().pageNumber
        drawPageFooter(doc, pn, 999)
      },
    })

    // ── Assured entities section ───────────────────────────────────────────────
    if ((vesselAssureds as any[]).length > 0) {
      let ay: number = (doc as any).lastAutoTable.finalY + 10

      if (ay > pageH - 45) {
        doc.addPage()
        drawPageHeader(doc)
        ay = 19
      }

      // Section label
      doc.setFillColor(...C.navy)
      doc.rect(MARGIN, ay, W - MARGIN * 2, 7, 'F')
      doc.setTextColor(...C.white)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('ASSURED ENTITIES & DOCUMENTS', MARGIN + 3, ay + 4.8)
      ay += 11

      const drawDocLine = (label: string, onFile: boolean) => {
        if (ay > pageH - 18) {
          doc.addPage()
          drawPageHeader(doc)
          ay = 19
        }
        const col: RGB = onFile ? C.green : C.red
        const badge = onFile ? 'ON FILE' : 'MISSING'
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(...C.textSec)
        doc.text(`  ${label}`, MARGIN + 5, ay)
        // Status badge
        doc.setFontSize(6.5)
        const bw = doc.getTextWidth(badge) + 5
        const bx = W - MARGIN - bw - 2
        doc.setFillColor(...(onFile ? C.greenBg : C.redBg))
        doc.roundedRect(bx, ay - 3.2, bw, 4.5, 1, 1, 'F')
        doc.setTextColor(...col)
        doc.setFont('helvetica', 'bold')
        doc.text(badge, bx + 2.5, ay + 0.5)
        ay += 5.5
      }

      for (const va of vesselAssureds as any[]) {
        const entity = (allEntities as any[]).find(e => e.id === va.entityId)
        if (!entity) continue

        if (ay > pageH - 40) {
          doc.addPage()
          drawPageHeader(doc)
          ay = 19
        }

        // Entity header card
        doc.setFillColor(...C.bgLight)
        doc.setDrawColor(...C.bgMid)
        doc.setLineWidth(0.3)
        doc.roundedRect(MARGIN, ay, W - MARGIN * 2, 11, 2, 2, 'FD')
        // Accent left stripe on card
        doc.setFillColor(...C.accent)
        doc.roundedRect(MARGIN, ay, 2.5, 11, 1, 1, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(...C.textPri)
        doc.text(entity.name, MARGIN + 6, ay + 7)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...C.textSec)
        doc.text(`${va.role}  ·  ${entity.type.toUpperCase()}`, W - MARGIN - 2, ay + 7, { align: 'right' })
        ay += 14

        if (entity.type === 'company') {
          drawDocLine('Certificate of Incorporation', !!entity.certificateOfIncorporationPath)
          drawDocLine('Articles of Association',      !!entity.articlesOfAssociationPath)
          drawDocLine('KYC',                          !!entity.kycFilePath)
        }
        if (entity.type === 'person') {
          drawDocLine('ID / Passport', !!entity.passportFilePath)
        }

        // UBOs
        const ubos = (allEntityUBOs as any[])
          .filter(u => u.assuredEntityId === entity.id)
          .map(u => (allEntities as any[]).find(e => e.id === u.uboEntityId))
          .filter(Boolean)

        if (ubos.length > 0) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7.5)
          doc.setTextColor(...C.textSec)
          doc.text('  Ultimate Beneficial Owners', MARGIN + 5, ay)
          ay += 5

          for (const ubo of ubos) {
            if (!ubo) continue
            if (ay > pageH - 30) {
              doc.addPage()
              drawPageHeader(doc)
              ay = 19
            }
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(...C.textPri)
            doc.text(`  ${ubo.name}`, MARGIN + 8, ay)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7)
            doc.setTextColor(...C.textSec)
            doc.text(ubo.type.toUpperCase(), W - MARGIN - 2, ay, { align: 'right' })
            ay += 5.5

            if (ubo.type === 'company') {
              drawDocLine('Certificate of Incorporation', !!ubo.certificateOfIncorporationPath)
              drawDocLine('Articles of Association',      !!ubo.articlesOfAssociationPath)
              drawDocLine('KYC',                          !!ubo.kycFilePath)
            }
            if (ubo.type === 'person') {
              drawDocLine('ID / Passport', !!ubo.passportFilePath)
            }
          }
        }

        ay += 6
      }
    }

    // ── Fix page footers with correct total ────────────────────────────────────
    const totalPages = (doc.internal as any).getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      drawPageFooter(doc, i, totalPages)
    }

    doc.save(`${vessel.name}_Compliance_Report_Pro.pdf`)
  },
}
