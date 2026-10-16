import type {
  DocumentType,
  Vessel,
  VesselAssured,
  VesselCustomDocType,
  VesselDocument
} from '../../../shared/types'

// vessels:getAssureds returns no names today, so the assured column reads '—' (see report)
type AssuredWithName = VesselAssured & { entityName?: string; name?: string }

// Customer compliance rows (no PDF code, so pages can build rows without loading jspdf).
// The per-customer PDF lives in CustomerComplianceExport, which re-exports these.

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
