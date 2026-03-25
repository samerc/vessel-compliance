import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getReportSettings } from './ReportSettingsService'
import { formatDateLong } from '../utils/dateUtils'

// ── Palette (matches ReportServiceV2) ────────────────────────────────────────
type RGB = [number, number, number]
const C: Record<string, RGB> = {
  navy: [10, 22, 40],
  navyMid: [22, 46, 80],
  accent: [0, 170, 200],
  white: [255, 255, 255],
  textPri: [20, 30, 48],
  textSec: [100, 115, 135],
  bgLight: [246, 248, 251],
  bgMid: [220, 227, 238],
  green: [0, 148, 74],
  greenBg: [230, 247, 238],
  amber: [176, 88, 0],
  amberBg: [255, 246, 224],
  orange: [200, 55, 0],
  red: [186, 0, 0],
  redBg: [255, 230, 230],
}

const W = 210
const MARGIN = 12

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function docStatus(hasFile: boolean, expiry: string | null | undefined): string {
  if (!hasFile) return 'MISSING'
  if (isExpired(expiry)) return 'EXPIRED'
  if (isExpiringSoon(expiry)) return 'EXPIRING SOON'
  return 'COMPLIANT'
}

// ── Page chrome ──────────────────────────────────────────────────────────────
function drawPageHeader(
  doc: jsPDF,
  companyName: string,
  primary: RGB,
) {
  doc.setFillColor(...C.navy)
  doc.rect(0, 0, W, 14, 'F')
  doc.setFillColor(...C.accent)
  doc.rect(0, 0, 3, 14, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.white)
  doc.text(companyName, MARGIN + 2, 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('CUSTOMER PORTFOLIO SUMMARY', W / 2, 9, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...primary)
  doc.text('CONFIDENTIAL', W - MARGIN, 9, { align: 'right' })
}

function drawPageFooter(
  doc: jsPDF,
  pageNum: number,
  total: number,
  companyName: string,
) {
  const H = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...C.bgMid)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, H - 12, W - MARGIN, H - 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.textSec)
  doc.text(`Generated ${formatDateLong(new Date())}`, MARGIN, H - 7)
  doc.text(companyName, W / 2, H - 7, { align: 'center' })
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

// ── Main export ──────────────────────────────────────────────────────────────
export async function exportCustomerPortfolioPDF(
  customerId: string,
  customerName: string,
  customerType: string | null,
): Promise<void> {
  // Gather all data up front
  const [
    vesselsRaw,
    docTypesRaw,
    allVesselDocsRaw,
    flagStatesRaw,
    entitiesRaw,
  ] = await Promise.all([
    window.api.getVessels(),
    window.api.getDocumentTypes(),
    window.api.getVesselDocuments(),
    window.api.getFlagStates(),
    window.api.getEntities(),
  ])

  const vessels = Array.isArray(vesselsRaw) ? vesselsRaw : []
  const docTypes = Array.isArray(docTypesRaw) ? docTypesRaw : []
  const allVesselDocs = Array.isArray(allVesselDocsRaw) ? allVesselDocsRaw : []
  const flagStates = Array.isArray(flagStatesRaw) ? flagStatesRaw : []
  const entities = Array.isArray(entitiesRaw) ? entitiesRaw : []

  const customerVessels = vessels.filter(
    (v: any) => v.isActive && v.customerId === customerId,
  )
  if (customerVessels.length === 0) return

  // Batch-fetch custom doc types, policies, and warranties per vessel
  const [customDocResults, policyResults, warrantyResults] = await Promise.all([
    Promise.all(customerVessels.map((v: any) => window.api.getVesselCustomDocTypes(v.id))),
    Promise.all(customerVessels.map((v: any) => window.api.getVesselDynamicPolicies(v.id))),
    Promise.all(customerVessels.map((v: any) => window.api.surveyWarrantyGetByVessel(v.id))),
  ])

  const allCustomDocTypes = customDocResults.filter(Array.isArray).flat()
  const flagMap = new Map(flagStates.map((f: any) => [f.id, f]))

  // Build per-vessel compliance data
  interface VesselPortfolioRow {
    name: string
    imo: string
    flag: string
    type: string
    built: string
    grt: string
    policyTypeNames: string[]
    compliant: number
    missing: number
    expiringSoon: number
    expired: number
    totalRequired: number
    pct: number
  }

  const vesselRows: VesselPortfolioRow[] = []
  const policyCoverage: Map<string, number> = new Map()

  let totalCompliant = 0
  let totalMissing = 0
  let totalExpiringSoon = 0
  let totalExpired = 0
  let totalRequired = 0

  for (let i = 0; i < customerVessels.length; i++) {
    const vessel = customerVessels[i]
    const vesselDocs = allVesselDocs.filter((d: any) => d.vesselId === vessel.id)
    const customTypes = allCustomDocTypes.filter((t: any) => t.vesselId === vessel.id)
    const policies = Array.isArray(policyResults[i]) ? policyResults[i] : []

    // Compliance counts
    const allTypes = [
      ...docTypes.map((t: any) => {
        const d = vesselDocs.find((v: any) => v.documentTypeId === t.id)
        return { required: d ? d.required : t.required, doc: d }
      }),
      ...(customTypes as any[]).map((t: any) => {
        const d = vesselDocs.find((v: any) => v.documentTypeId === t.id)
        return { required: true, doc: d }
      }),
    ].filter((t) => t.required)

    let compliant = 0
    let missing = 0
    let expiringSoonCount = 0
    let expiredCount = 0
    for (const t of allTypes) {
      const status = docStatus(!!t.doc?.filePath, t.doc?.expiryDate || null)
      if (status === 'COMPLIANT') compliant++
      else if (status === 'MISSING') missing++
      else if (status === 'EXPIRING SOON') expiringSoonCount++
      else if (status === 'EXPIRED') expiredCount++
    }
    const reqCount = allTypes.length
    const pct = reqCount > 0 ? Math.round((compliant / reqCount) * 100) : 100

    totalCompliant += compliant
    totalMissing += missing
    totalExpiringSoon += expiringSoonCount
    totalExpired += expiredCount
    totalRequired += reqCount

    // Policy types for this vessel
    const activePolicies = (policies as any[]).filter((p: any) => p.status === 'active')
    const ptNames: string[] = []
    for (const p of activePolicies) {
      const ptName = p.policyTypeName || ''
      if (ptName && !ptNames.includes(ptName)) ptNames.push(ptName)
      policyCoverage.set(ptName, (policyCoverage.get(ptName) || 0) + 1)
    }

    const fs = vessel.flagStateId ? flagMap.get(vessel.flagStateId) : null

    vesselRows.push({
      name: vessel.name,
      imo: vessel.imoNumber || '',
      flag: fs ? `${(fs as any).name}` : '—',
      type: vessel.vesselType || '—',
      built: vessel.builtYear ? (vessel.rebuiltYear ? `${vessel.builtYear}/${vessel.rebuiltYear}` : String(vessel.builtYear)) : '—',
      grt: vessel.grossTonnage ? String(vessel.grossTonnage) : '—',
      policyTypeNames: ptNames,
      compliant,
      missing,
      expiringSoon: expiringSoonCount,
      expired: expiredCount,
      totalRequired: reqCount,
      pct,
    })
  }

  // Gather open warranties across all customer vessels
  interface OpenWarrantyRow {
    vesselName: string
    description: string
    deadlineInfo: string
    status: string
    policyType: string
  }
  const openWarranties: OpenWarrantyRow[] = []
  for (let i = 0; i < customerVessels.length; i++) {
    const wArr = Array.isArray(warrantyResults[i]) ? warrantyResults[i] : []
    for (const w of wArr as any[]) {
      if (w.status === 'completed' || w.status === 'waived') continue
      let deadline = ''
      if (w.deadlineType === 'days' && w.deadlineDays != null) {
        deadline = `${w.deadlineDays} days from inception`
      } else if (w.deadlineType === 'event' && w.deadlineEvent) {
        deadline = w.deadlineEvent
      }
      openWarranties.push({
        vesselName: customerVessels[i].name,
        description: w.description,
        deadlineInfo: deadline || '—',
        status: w.status === 'survey_done' ? 'Survey Done' : 'Pending',
        policyType: w.policyTypeName || '—',
      })
    }
  }

  // Customer entity info
  const customerEntity = entities.find((e: any) => e.id === customerId) as any

  // ── Build PDF ────────────────────────────────────────────────────────────────
  const s = await getReportSettings()
  const primary = s.primaryColor
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Page 1 header
  drawPageHeader(doc, s.companyName, primary)

  let y = 20

  // Customer name + type
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...C.textPri)
  doc.text(customerName, MARGIN, y + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...C.textSec)
  const typeLabel = customerType ? customerType.charAt(0).toUpperCase() + customerType.slice(1) : ''
  doc.text(
    `${typeLabel ? typeLabel + ' Client' : 'Customer'}  ·  ${customerVessels.length} vessel${customerVessels.length !== 1 ? 's' : ''}`,
    MARGIN,
    y + 15,
  )

  doc.setFontSize(8.5)
  doc.text(`Report date: ${formatDateLong(new Date())}`, MARGIN, y + 22)

  // Customer contact info (right side)
  if (customerEntity) {
    const contactLines: string[] = []
    if (customerEntity.email) contactLines.push(customerEntity.email)
    if (customerEntity.phone) contactLines.push(customerEntity.phone)
    if (contactLines.length > 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...C.textSec)
      let cy = y + 8
      for (const line of contactLines) {
        doc.text(line, W - MARGIN, cy, { align: 'right' })
        cy += 5
      }
    }
  }

  y += 28

  // ── Compliance overview cards ──────────────────────────────────────────────
  const overallPct =
    totalRequired > 0 ? Math.round((totalCompliant / totalRequired) * 100) : 100
  const rateColor: RGB =
    overallPct === 100 ? C.green : overallPct >= 70 ? C.amber : C.red

  const statCards: { label: string; value: string; color: RGB; bg: RGB }[] = [
    { label: 'COMPLIANT', value: String(totalCompliant), color: C.green, bg: C.greenBg },
    {
      label: 'EXPIRING SOON',
      value: String(totalExpiringSoon),
      color: C.amber,
      bg: C.amberBg,
    },
    { label: 'EXPIRED', value: String(totalExpired), color: C.orange, bg: [255, 237, 229] },
    { label: 'MISSING', value: String(totalMissing), color: C.red, bg: C.redBg },
    { label: 'COMPLIANCE', value: `${overallPct}%`, color: rateColor, bg: C.bgLight },
  ]

  const cardW = (W - MARGIN * 2 - 12) / 5
  for (let i = 0; i < statCards.length; i++) {
    const cx = MARGIN + i * (cardW + 3)
    const card = statCards[i]
    doc.setFillColor(...card.bg)
    doc.roundedRect(cx, y, cardW, 16, 2.5, 2.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...card.color)
    doc.text(card.value, cx + cardW / 2, y + 10, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.5)
    doc.text(card.label, cx + cardW / 2, y + 14.5, { align: 'center' })
  }
  y += 22

  // ── Vessel table ───────────────────────────────────────────────────────────
  drawSectionLabel(doc, y, 'VESSELS')
  y += 8

  const vesselBody = vesselRows.map((v) => {
    const pctColor: RGB =
      v.pct === 100 ? C.green : v.missing > 0 ? C.red : C.amber
    return [
      v.name,
      v.imo,
      v.flag,
      v.type,
      v.built,
      v.grt,
      v.policyTypeNames.join(', ') || '—',
      { content: `${v.pct}%`, styles: { textColor: pctColor, fontStyle: 'bold' as const } },
    ]
  })

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: 20 },
    head: [['Vessel', 'IMO', 'Flag', 'Type', 'Built', 'GRT', 'Policies', '%']],
    body: vesselBody,
    theme: 'plain',
    headStyles: {
      fillColor: C.navyMid,
      textColor: C.white,
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 2 },
    },
    columnStyles: {
      0: { cellWidth: 36, fontStyle: 'bold' },
      1: { cellWidth: 20, fontSize: 7.5 },
      2: { cellWidth: 24 },
      3: { cellWidth: 22 },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 40 },
      7: { cellWidth: 12, halign: 'center' },
    },
    styles: {
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 2 },
      lineColor: C.bgMid as any,
      lineWidth: 0.25,
      overflow: 'linebreak',
      textColor: C.textPri,
    },
    alternateRowStyles: { fillColor: C.bgLight as any },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawPageHeader(doc, s.companyName, primary)
    },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // ── Policy coverage summary ────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight()
  if (y > pageH - 50) {
    doc.addPage()
    drawPageHeader(doc, s.companyName, primary)
    y = 20
  }

  drawSectionLabel(doc, y, 'POLICY COVERAGE SUMMARY')
  y += 8

  // Sort by count descending
  const coverageEntries = [...policyCoverage.entries()].sort((a, b) => b[1] - a[1])

  if (coverageEntries.length > 0) {
    const coverageBody = coverageEntries.map(([name, count]) => [
      name,
      `${count} / ${customerVessels.length}`,
      `${Math.round((count / customerVessels.length) * 100)}%`,
    ])

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 20 },
      head: [['Policy Type', 'Vessels Covered', 'Coverage %']],
      body: coverageBody,
      theme: 'plain',
      headStyles: {
        fillColor: C.navyMid,
        textColor: C.white,
        fontSize: 7.5,
        fontStyle: 'bold',
        cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 3 },
      },
      columnStyles: {
        0: { cellWidth: 80, fontStyle: 'bold' },
        1: { cellWidth: 50, halign: 'center' },
        2: { cellWidth: 50, halign: 'center' },
      },
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 4, bottom: 4, left: 4, right: 3 },
        lineColor: C.bgMid as any,
        lineWidth: 0.25,
        textColor: C.textPri,
      },
      alternateRowStyles: { fillColor: C.bgLight as any },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) drawPageHeader(doc, s.companyName, primary)
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor(...C.textSec)
    doc.text('No active policies found.', MARGIN + 4, y + 6)
    y += 14
  }

  // ── Compliance overview table ──────────────────────────────────────────────
  if (y > pageH - 50) {
    doc.addPage()
    drawPageHeader(doc, s.companyName, primary)
    y = 20
  }

  drawSectionLabel(doc, y, 'DOCUMENT COMPLIANCE BY VESSEL')
  y += 8

  const complianceBody = vesselRows.map((v) => {
    const pctColor: RGB =
      v.pct === 100 ? C.green : v.missing > 0 ? C.red : C.amber
    return [
      v.name,
      String(v.totalRequired),
      { content: String(v.compliant), styles: { textColor: C.green } },
      {
        content: String(v.missing),
        styles: { textColor: v.missing > 0 ? C.red : C.textSec, fontStyle: v.missing > 0 ? 'bold' as const : 'normal' as const },
      },
      {
        content: String(v.expired),
        styles: { textColor: v.expired > 0 ? C.orange : C.textSec },
      },
      {
        content: String(v.expiringSoon),
        styles: { textColor: v.expiringSoon > 0 ? C.amber : C.textSec },
      },
      { content: `${v.pct}%`, styles: { textColor: pctColor, fontStyle: 'bold' as const } },
    ]
  })

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: 20 },
    head: [['Vessel', 'Required', 'Compliant', 'Missing', 'Expired', 'Expiring', '%']],
    body: complianceBody,
    theme: 'plain',
    headStyles: {
      fillColor: C.navyMid,
      textColor: C.white,
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 3 },
    },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' },
      6: { cellWidth: 22, halign: 'center' },
    },
    styles: {
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 3 },
      lineColor: C.bgMid as any,
      lineWidth: 0.25,
      textColor: C.textPri,
    },
    alternateRowStyles: { fillColor: C.bgLight as any },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawPageHeader(doc, s.companyName, primary)
    },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // ── Open warranties ────────────────────────────────────────────────────────
  if (openWarranties.length > 0) {
    if (y > pageH - 50) {
      doc.addPage()
      drawPageHeader(doc, s.companyName, primary)
      y = 20
    }

    drawSectionLabel(doc, y, `OPEN WARRANTIES (${openWarranties.length})`)
    y += 8

    const warrantyBody = openWarranties.map((w) => [
      w.vesselName,
      w.description,
      w.policyType,
      w.deadlineInfo,
      {
        content: w.status,
        styles: {
          textColor: w.status === 'Pending' ? C.amber : C.accent,
          fontStyle: 'bold' as const,
        },
      },
    ])

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 20 },
      head: [['Vessel', 'Description', 'Policy Type', 'Deadline', 'Status']],
      body: warrantyBody,
      theme: 'plain',
      headStyles: {
        fillColor: C.navyMid,
        textColor: C.white,
        fontSize: 7.5,
        fontStyle: 'bold',
        cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 3 },
      },
      columnStyles: {
        0: { cellWidth: 34, fontStyle: 'bold' },
        1: { cellWidth: 60 },
        2: { cellWidth: 30 },
        3: { cellWidth: 36 },
        4: { cellWidth: 22, halign: 'center' },
      },
      styles: {
        fontSize: 8,
        cellPadding: { top: 4, bottom: 4, left: 4, right: 3 },
        lineColor: C.bgMid as any,
        lineWidth: 0.25,
        overflow: 'linebreak',
        textColor: C.textPri,
      },
      alternateRowStyles: { fillColor: C.bgLight as any },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) drawPageHeader(doc, s.companyName, primary)
      },
    })
  }

  // ── Page footers ───────────────────────────────────────────────────────────
  const totalPages = (doc.internal as any).getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawPageFooter(doc, i, totalPages, s.companyName)
  }

  const safeName = customerName.replace(/[^a-z0-9]/gi, '_')
  doc.save(`Portfolio_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`)
}
