import { jsPDF } from 'jspdf'
import autoTable, { type RowInput } from 'jspdf-autotable'
import { getReportSettings } from './ReportSettingsService'
import { formatDate } from '../utils/dateUtils'
import type {
  DocumentType,
  Vessel,
  VesselAssured,
  VesselCustomDocType,
  VesselDocument
} from '../../../shared/types'

// vessels:getAssureds returns no names today, so the assured column reads '—' (see report)
type AssuredWithName = VesselAssured & { entityName?: string; name?: string }

// Customer compliance rows and the per-customer PDF (used by the Reports tab and the Entity Directory)

export interface CustomerVesselRow {
  vesselId: string
  vesselName: string
  imoNumber: string
  customerType: string | null
  assured: string
  totalRequired: number
  compliant: number
  missing: number
  expiringSoon: number
  expired: number
  pct: number
}

export interface CustomerGroup {
  customerId: string | null
  customerName: string
  customerType: string | null
  vessels: CustomerVesselRow[]
}

const isExpired = (d: string | null | undefined): boolean =>
  !!d && new Date(d) < new Date(new Date().setHours(0, 0, 0, 0))
const isExpiringSoon = (d: string | null | undefined): boolean => {
  if (!d) return false
  const today = new Date(new Date().setHours(0, 0, 0, 0))
  const exp = new Date(d)
  const threshold = new Date(today)
  threshold.setDate(today.getDate() + 60)
  return exp >= today && exp <= threshold
}

function docStatus(hasFile: boolean, expiry: string | null | undefined): string {
  if (!hasFile) return 'MISSING'
  if (isExpired(expiry)) return 'EXPIRED'
  if (isExpiringSoon(expiry)) return 'EXPIRING SOON'
  return 'COMPLIANT'
}

export function buildVesselRow(
  vessel: Vessel,
  docTypes: DocumentType[],
  allVesselDocs: VesselDocument[],
  allAssureds: AssuredWithName[],
  allCustomDocTypes: VesselCustomDocType[],
  relevantPolicyTypeIds?: string[]
): CustomerVesselRow {
  const vesselDocs = allVesselDocs.filter((d) => d.vesselId === vessel.id)
  const customTypes = allCustomDocTypes.filter((t) => t.vesselId === vessel.id)

  // Filter doc types by policy type tags if we know which policy types are relevant
  const isDocRelevant = (dt: DocumentType): boolean => {
    if (!relevantPolicyTypeIds || relevantPolicyTypeIds.length === 0) return true
    if (!dt.policyTypeIds || dt.policyTypeIds.length === 0) return true // no tags = all types
    return dt.policyTypeIds.some((ptId: string) => relevantPolicyTypeIds.includes(ptId))
  }

  const allTypes = [
    ...docTypes.filter(isDocRelevant).map((t) => {
      const d = vesselDocs.find((v) => v.documentTypeId === t.id)
      return { name: t.name, required: d ? d.required : t.required, doc: d }
    }),
    ...customTypes.map((t) => {
      const d = vesselDocs.find((v) => v.documentTypeId === t.id)
      return { name: `${t.name} (Custom)`, required: true, doc: d }
    })
  ].filter((t) => t.required)

  let compliant = 0,
    missing = 0,
    expiringSoonCount = 0,
    expiredCount = 0
  for (const t of allTypes) {
    const status = docStatus(!!t.doc?.filePath, t.doc?.expiryDate || null)
    if (status === 'COMPLIANT') compliant++
    else if (status === 'MISSING') missing++
    else if (status === 'EXPIRING SOON') expiringSoonCount++
    else if (status === 'EXPIRED') expiredCount++
  }

  const vesselAssureds = allAssureds.filter((a) => a.vesselId === vessel.id)
  const assured =
    vesselAssureds
      .map((a) => a.entityName || a.name || '')
      .filter(Boolean)
      .join(', ') || '—'

  const totalRequired = allTypes.length
  const pct = totalRequired > 0 ? Math.round((compliant / totalRequired) * 100) : 100

  return {
    vesselId: vessel.id,
    vesselName: vessel.name,
    imoNumber: vessel.imoNumber,
    customerType: vessel.customerType || null,
    assured,
    totalRequired,
    compliant,
    missing,
    expiringSoon: expiringSoonCount,
    expired: expiredCount,
    pct
  }
}

export async function exportCustomerCompliancePDF(
  customerId: string,
  customerName: string,
  customerType: string | null
): Promise<void> {
  const [vesselsRaw, docTypesRaw, allVesselDocsRaw, allAssuredsRaw, policiesRaw] =
    await Promise.all([
      window.api.getVessels(),
      window.api.getDocumentTypes(),
      window.api.getVesselDocuments(),
      window.api.getVesselAssureds(),
      window.api.getAllVesselDynamicPolicies()
    ])
  const vessels = Array.isArray(vesselsRaw) ? vesselsRaw : []
  const docTypes = Array.isArray(docTypesRaw) ? docTypesRaw : []
  const allVesselDocs = Array.isArray(allVesselDocsRaw) ? allVesselDocsRaw : []
  const allAssureds = Array.isArray(allAssuredsRaw) ? allAssuredsRaw : []
  const policies = Array.isArray(policiesRaw) ? policiesRaw : []

  // Find vessels where this customer has active policies
  const vesselPolicyTypes = new Map<string, string[]>() // vesselId → policyTypeIds for this customer
  for (const p of policies) {
    if (p.status === 'active' && p.customerEntityId === customerId) {
      const existing = vesselPolicyTypes.get(p.vesselId) || []
      if (p.policyTypeId && !existing.includes(p.policyTypeId)) existing.push(p.policyTypeId)
      vesselPolicyTypes.set(p.vesselId, existing)
    }
  }

  const customerVessels = vessels.filter((v) => v.isActive && vesselPolicyTypes.has(v.id))
  if (customerVessels.length === 0) return

  const customDocResults = await Promise.all(
    customerVessels.map((v) => window.api.getVesselCustomDocTypes(v.id))
  )
  const allCustomDocTypes = customDocResults.filter(Array.isArray).flat()

  const vesselRows: CustomerVesselRow[] = customerVessels.map((vessel) =>
    buildVesselRow(
      vessel,
      docTypes,
      allVesselDocs,
      allAssureds,
      allCustomDocTypes,
      vesselPolicyTypes.get(vessel.id)
    )
  )

  const s = await getReportSettings()
  const primary = s.primaryColor
  const doc = new jsPDF()

  // Header band
  doc.setFillColor(15, 18, 24)
  doc.rect(0, 5, 210, s.companySubtitle ? 50 : 46, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(s.companyName, 14, 20)
  if (s.companySubtitle) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(190, 190, 190)
    doc.text(s.companySubtitle, 14, 28)
  }
  const titleY = s.companySubtitle ? 40 : 34
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Compliance Report', 14, titleY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(190, 190, 190)
  doc.text(
    `${customerName}${customerType ? ` · ${customerType.toUpperCase()}` : ''}`,
    14,
    titleY + 8
  )
  doc.text(`Date: ${formatDate(new Date())}`, 14, titleY + 16)

  const bodyRows: RowInput[] = vesselRows.map((v) => {
    const pctColor: [number, number, number] =
      v.pct === 100 ? [0, 140, 70] : v.missing > 0 ? [192, 0, 0] : [180, 83, 9]
    return [
      v.vesselName,
      v.imoNumber,
      v.assured,
      { content: `${v.compliant}/${v.totalRequired}`, styles: { halign: 'center' as const } },
      {
        content: v.missing > 0 ? String(v.missing) : '—',
        styles: {
          halign: 'center' as const,
          textColor:
            v.missing > 0
              ? ([192, 0, 0] as [number, number, number])
              : ([100, 100, 100] as [number, number, number])
        }
      },
      {
        content: v.expiringSoon > 0 ? String(v.expiringSoon) : '—',
        styles: {
          halign: 'center' as const,
          textColor:
            v.expiringSoon > 0
              ? ([180, 83, 9] as [number, number, number])
              : ([100, 100, 100] as [number, number, number])
        }
      },
      {
        content: `${v.pct}%`,
        styles: { halign: 'center' as const, fontStyle: 'bold' as const, textColor: pctColor }
      }
    ]
  })

  autoTable(doc, {
    startY: s.companySubtitle ? 72 : 68,
    margin: { top: 14, right: 14, bottom: 42, left: 14 },
    head: [['Vessel', 'IMO', 'Assured', 'Docs', 'Missing', 'Expiring', '%']],
    body: bodyRows,
    theme: 'grid',
    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }
    },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 22 },
      2: { cellWidth: 46 },
      3: { cellWidth: 18, halign: 'center' as const },
      4: { cellWidth: 18, halign: 'center' as const },
      5: { cellWidth: 18, halign: 'center' as const },
      6: { cellWidth: 14, halign: 'center' as const }
    },
    styles: {
      fontSize: 8,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      overflow: 'linebreak',
      lineColor: [210, 215, 220] as [number, number, number],
      lineWidth: 0.3
    },
    alternateRowStyles: { fillColor: [250, 251, 252] as [number, number, number] }
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
    doc.text(s.footerText, 14, 274)
    doc.text(`Page ${i} of ${pageCount}`, 196, 274, { align: 'right' })
  }

  doc.save(
    `Compliance_${customerName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
  )
}
