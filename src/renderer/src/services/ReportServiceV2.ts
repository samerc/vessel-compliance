import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Vessel, DocumentType, VesselDocument } from '../../../shared/types'
import { resolveEffectivePolicyExpiry } from '../utils/policyUtils'

// ── Palette ───────────────────────────────────────────────────────────────────
type RGB = [number, number, number]
const C: Record<string, RGB> = {
  navy:     [10,  22,  40],
  navyMid:  [22,  46,  80],
  accent:   [0,   170, 200],
  white:    [255, 255, 255],
  textPri:  [20,  30,  48],
  textSec:  [100, 115, 135],
  bgLight:  [246, 248, 251],
  bgMid:    [220, 227, 238],
  green:    [0,   148, 74],
  greenBg:  [230, 247, 238],
  amber:    [176, 88,  0],
  amberBg:  [255, 246, 224],
  orange:   [200, 55,  0],
  orangeBg: [255, 237, 229],
  red:      [186, 0,   0],
  redBg:    [255, 230, 230],
}

type DocStatus = 'Compliant' | 'Expiring Soon' | 'Expired' | 'Missing'

const statusColors: Record<DocStatus, { text: RGB; bg: RGB }> = {
  'Compliant':     { text: C.green,  bg: C.greenBg },
  'Expiring Soon': { text: C.amber,  bg: C.amberBg },
  'Expired':       { text: C.orange, bg: C.orangeBg },
  'Missing':       { text: C.red,    bg: C.redBg },
}

const W = 210
const MARGIN = 10

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

// Returns [onFile, onFile, ...] booleans for each required document of an entity
function entityDocPresence(entity: any): boolean[] {
  if (entity.type === 'company') return [
    !!entity.certificateOfIncorporationPath,
    !!entity.articlesOfAssociationPath,
    !!entity.kycFilePath,
  ]
  if (entity.type === 'person') return [!!entity.passportFilePath]
  return []
}

// ── Page chrome ───────────────────────────────────────────────────────────────
function drawPageHeader(doc: jsPDF) {
  doc.setFillColor(...C.navy)
  doc.rect(0, 0, W, 14, 'F')
  doc.setFillColor(...C.accent)
  doc.rect(0, 0, 3, 14, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.white)
  doc.text('Al Bahriah Insurance & Reinsurance SAL', MARGIN + 2, 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('VESSEL COMPLIANCE REPORT', W / 2, 9, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.accent)
  doc.text('CONFIDENTIAL', W - MARGIN, 9, { align: 'right' })
}

function drawPageFooter(doc: jsPDF, pageNum: number, total: number) {
  const H = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...C.bgMid)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, H - 12, W - MARGIN, H - 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.textSec)
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    MARGIN, H - 7,
  )
  doc.text('Al Bahriah Insurance & Reinsurance SAL', W / 2, H - 7, { align: 'center' })
  doc.text(`Page ${pageNum} / ${total}`, W - MARGIN, H - 7, { align: 'right' })
}

function drawSectionLabel(doc: jsPDF, y: number, text: string) {
  doc.setFillColor(...C.navy)
  doc.rect(MARGIN, y, W - MARGIN * 2, 8, 'F')
  doc.setTextColor(...C.white)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(text, MARGIN + 4, y + 5.5)
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

    // ── Build vessel document rows ─────────────────────────────────────────────
    type DocRow = {
      name: string; desc: string; received: string; expires: string
      status: DocStatus; optional: boolean
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
        name: type.name + (type.required === false ? ' *' : ''),
        desc: type.description || '',
        received: vDoc?.receivedDate ? fmt(vDoc.receivedDate) : '—',
        expires: resolvedExpiry ? dateOnly(resolvedExpiry) : '—',
        status,
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
        optional: false,
      })
    }

    // ── Count assured + UBO entity documents in stats ──────────────────────────
    for (const va of vesselAssureds as any[]) {
      const entity = (allEntities as any[]).find(e => e.id === va.entityId)
      if (!entity) continue
      for (const onFile of entityDocPresence(entity)) {
        if (onFile) compliant++; else missing++
      }
      const ubos = (allEntityUBOs as any[])
        .filter(u => u.assuredEntityId === entity.id)
        .map(u => (allEntities as any[]).find(e => e.id === u.uboEntityId))
        .filter(Boolean)
      for (const ubo of ubos) {
        for (const onFile of entityDocPresence(ubo)) {
          if (onFile) compliant++; else missing++
        }
      }
    }

    const total = compliant + expiringSoon + expired + missing
    const rate = total > 0 ? Math.round((compliant / total) * 100) : 100
    const rateColor: RGB = rate === 100 ? C.green : rate >= 70 ? C.amber : C.red

    // ── Page 1 header chrome ───────────────────────────────────────────────────
    drawPageHeader(doc)

    let y = 20

    // Vessel name + IMO + report date
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(...C.textPri)
    doc.text(vessel.name, MARGIN, y + 8)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...C.textSec)
    doc.text(`IMO  ${vessel.imoNumber}`, MARGIN, y + 15)

    doc.setFontSize(8.5)
    doc.text(
      `Report date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      MARGIN, y + 22,
    )

    // ── Compliance score card (top-right) ─────────────────────────────────────
    const scoreW = 52, scoreH = 36
    const scoreX = W - MARGIN - scoreW, scoreY = y - 1
    doc.setFillColor(...C.bgLight)
    doc.setDrawColor(...C.bgMid)
    doc.setLineWidth(0.4)
    doc.roundedRect(scoreX, scoreY, scoreW, scoreH, 4, 4, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(26)
    doc.setTextColor(...rateColor)
    doc.text(`${rate}%`, scoreX + scoreW / 2, scoreY + 13, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.textSec)
    doc.text('COMPLIANCE RATE', scoreX + scoreW / 2, scoreY + 19, { align: 'center' })

    // Rate progress bar
    const barW = scoreW - 12, barH = 3.5
    const barX = scoreX + 6, barY = scoreY + 23
    doc.setFillColor(...C.bgMid)
    doc.roundedRect(barX, barY, barW, barH, 1.5, 1.5, 'F')
    doc.setFillColor(...rateColor)
    doc.roundedRect(barX, barY, barW * (rate / 100), barH, 1.5, 1.5, 'F')

    doc.setFontSize(7)
    doc.setTextColor(...C.textSec)
    doc.text(`${compliant} compliant  ·  ${total} total`, scoreX + scoreW / 2, scoreY + 32, { align: 'center' })

    // Ensure stats strip clears the score card bottom
    y = Math.max(y + 28, scoreY + scoreH + 4)

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
      doc.roundedRect(sx, y, statW, 18, 3, 3, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.setTextColor(...col.text)
      doc.text(String(s.value), sx + statW / 2, y + 12, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.text(s.label, sx + statW / 2, y + 16.5, { align: 'center' })
    })

    y += 24

    // ── Vessel documents section ───────────────────────────────────────────────
    drawSectionLabel(doc, y, 'VESSEL DOCUMENTS')
    if (docRows.some(r => r.optional)) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...C.accent)
      doc.text('* Optional', W - MARGIN - 3, y + 5.5, { align: 'right' })
    }
    y += 8

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Document', 'Description', 'Received', 'Expires', 'Status']],
      body: docRows.map(r => [r.name, r.desc, r.received, r.expires, r.status]),
      theme: 'plain',
      headStyles: {
        fillColor: C.navyMid,
        textColor: C.white,
        fontSize: 8,
        fontStyle: 'bold',
        cellPadding: { top: 4, bottom: 4, left: 4, right: 3 },
      },
      columnStyles: {
        0: { cellWidth: 62 },
        1: { cellWidth: 43, textColor: C.textSec as any, fontSize: 7.5 },
        2: { cellWidth: 26, halign: 'center', fontSize: 8 },
        3: { cellWidth: 30, halign: 'center', fontSize: 8 },
        4: { cellWidth: 29, halign: 'center', fontSize: 8, fontStyle: 'bold' },
      },
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 5, bottom: 5, left: 4, right: 3 },
        lineColor: C.bgMid as any,
        lineWidth: 0.25,
        overflow: 'linebreak',
      },
      alternateRowStyles: { fillColor: C.bgLight as any },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 4) return
        const col = statusColors[data.cell.raw as DocStatus]
        if (col) {
          data.cell.styles.textColor = col.text as any
          data.cell.styles.fillColor = col.bg as any
        }
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) drawPageHeader(doc)
      },
    })

    // ── Assured entities & UBOs section ───────────────────────────────────────
    if ((vesselAssureds as any[]).length > 0) {
      // Build entity table rows
      type EntityRowMeta = 'entityHeader' | 'uboBar' | 'uboEntityHeader' | 'doc'
      const entityRows: [string, string, string][] = []
      const entityRowMeta: EntityRowMeta[] = []

      for (const va of vesselAssureds as any[]) {
        const entity = (allEntities as any[]).find(e => e.id === va.entityId)
        if (!entity) continue

        entityRows.push([entity.name, `${va.role}  ·  ${entity.type.toUpperCase()}`, ''])
        entityRowMeta.push('entityHeader')

        if (entity.type === 'company') {
          entityRows.push(['Certificate of Incorporation', '', entity.certificateOfIncorporationPath ? 'ON FILE' : 'MISSING'])
          entityRowMeta.push('doc')
          entityRows.push(['Articles of Association', '', entity.articlesOfAssociationPath ? 'ON FILE' : 'MISSING'])
          entityRowMeta.push('doc')
          entityRows.push(['KYC', '', entity.kycFilePath ? 'ON FILE' : 'MISSING'])
          entityRowMeta.push('doc')
        }
        if (entity.type === 'person') {
          entityRows.push(['ID / Passport', '', entity.passportFilePath ? 'ON FILE' : 'MISSING'])
          entityRowMeta.push('doc')
        }

        const ubos = (allEntityUBOs as any[])
          .filter(u => u.assuredEntityId === entity.id)
          .map(u => (allEntities as any[]).find(e => e.id === u.uboEntityId))
          .filter(Boolean)

        if (ubos.length > 0) {
          entityRows.push(['ULTIMATE BENEFICIAL OWNERS', '', ''])
          entityRowMeta.push('uboBar')

          for (const ubo of ubos) {
            if (!ubo) continue
            entityRows.push([ubo.name, ubo.type.toUpperCase(), ''])
            entityRowMeta.push('uboEntityHeader')

            if (ubo.type === 'company') {
              entityRows.push(['Certificate of Incorporation', '', ubo.certificateOfIncorporationPath ? 'ON FILE' : 'MISSING'])
              entityRowMeta.push('doc')
              entityRows.push(['Articles of Association', '', ubo.articlesOfAssociationPath ? 'ON FILE' : 'MISSING'])
              entityRowMeta.push('doc')
              entityRows.push(['KYC', '', ubo.kycFilePath ? 'ON FILE' : 'MISSING'])
              entityRowMeta.push('doc')
            }
            if (ubo.type === 'person') {
              entityRows.push(['ID / Passport', '', ubo.passportFilePath ? 'ON FILE' : 'MISSING'])
              entityRowMeta.push('doc')
            }
          }
        }
      }

      let ey = (doc as any).lastAutoTable.finalY + 10
      if (ey > pageH - 45) {
        doc.addPage()
        drawPageHeader(doc)
        ey = 20
      }

      drawSectionLabel(doc, ey, 'ASSURED ENTITIES & DOCUMENTS')
      ey += 8

      autoTable(doc, {
        startY: ey,
        margin: { left: MARGIN, right: MARGIN },
        head: [['Entity / Document', 'Role / Type', 'Status']],
        body: entityRows,
        theme: 'plain',
        headStyles: {
          fillColor: C.navyMid,
          textColor: C.white,
          fontSize: 8,
          fontStyle: 'bold',
          cellPadding: { top: 4, bottom: 4, left: 4, right: 3 },
        },
        columnStyles: {
          0: { cellWidth: 120 },
          1: { cellWidth: 39, fontSize: 7.5 },
          2: { cellWidth: 31, halign: 'center', fontSize: 8, fontStyle: 'bold' },
        },
        styles: {
          fontSize: 8.5,
          cellPadding: { top: 5, bottom: 5, left: 4, right: 3 },
          lineColor: C.bgMid as any,
          lineWidth: 0.25,
          overflow: 'linebreak',
        },
        didParseCell: (data) => {
          if (data.section !== 'body') return
          const meta = entityRowMeta[data.row.index]

          // Entity header row — navy, teal right-side meta, left-padded for stripe
          if (meta === 'entityHeader') {
            data.cell.styles.fillColor = C.navy as any
            data.cell.styles.fontStyle = data.column.index === 0 ? 'bold' : 'normal'
            data.cell.styles.fontSize = data.column.index === 0 ? 9.5 : 8
            if (data.column.index === 0) {
              data.cell.styles.textColor = C.white as any
              data.cell.styles.cellPadding = { top: 5, bottom: 5, left: 7, right: 3 }
            } else if (data.column.index === 1) {
              data.cell.styles.textColor = C.accent as any
            } else {
              data.cell.styles.textColor = C.navy as any // hide status col
            }
          }

          // UBO label bar — navyMid background, text only in col 0
          if (meta === 'uboBar') {
            data.cell.styles.fillColor = C.navyMid as any
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.fontSize = 7.5
            if (data.column.index === 0) {
              data.cell.styles.textColor = C.white as any
              data.cell.styles.cellPadding = { top: 4, bottom: 4, left: 12, right: 3 }
            } else {
              data.cell.styles.textColor = C.navyMid as any // hide other cols
            }
          }

          // UBO entity header — bgMid background, indented, smaller than entity header
          if (meta === 'uboEntityHeader') {
            data.cell.styles.fillColor = C.bgMid as any
            data.cell.styles.fontStyle = data.column.index === 0 ? 'bold' : 'normal'
            data.cell.styles.fontSize = data.column.index === 0 ? 8.5 : 7.5
            if (data.column.index === 0) {
              data.cell.styles.textColor = C.textPri as any
              data.cell.styles.cellPadding = { top: 4.5, bottom: 4.5, left: 12, right: 3 }
            } else if (data.column.index === 1) {
              data.cell.styles.textColor = C.textSec as any
            } else {
              data.cell.styles.textColor = C.bgMid as any // hide status col
            }
          }

          // Doc rows — alternating fills, indented, color-coded status
          if (meta === 'doc') {
            data.cell.styles.fillColor = (data.row.index % 2 === 0 ? C.white : C.bgLight) as any
            if (data.column.index === 0) {
              data.cell.styles.textColor = C.textPri as any
              data.cell.styles.cellPadding = { top: 5, bottom: 5, left: 12, right: 3 }
            }
            if (data.column.index === 2) {
              const s = data.cell.raw as string
              if (s === 'ON FILE') {
                data.cell.styles.textColor = C.green as any
                data.cell.styles.fillColor = C.greenBg as any
              } else if (s === 'MISSING') {
                data.cell.styles.textColor = C.red as any
                data.cell.styles.fillColor = C.redBg as any
              }
            }
          }
        },
        didDrawCell: (data) => {
          if (data.section !== 'body' || data.column.index !== 0) return
          const meta = entityRowMeta[data.row.index]
          // Teal left stripe for entity headers
          if (meta === 'entityHeader') {
            doc.setFillColor(...C.accent)
            doc.rect(data.cell.x, data.cell.y, 2.5, data.cell.height, 'F')
          }
          // navyMid left stripe for UBO entity headers
          if (meta === 'uboEntityHeader') {
            doc.setFillColor(...C.navyMid)
            doc.rect(data.cell.x, data.cell.y, 2, data.cell.height, 'F')
          }
        },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) drawPageHeader(doc)
        },
      })
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
