import type { DocumentType, Vessel, VesselDocument } from '../../../shared/types'
import { effectiveDocExpiry, getDocStatus } from './docStatus'

export interface VesselDocCounts {
  /** Required documents without a file */
  missing: number
  expired: number
  /** Expiring within 30 days */
  soon: number
}

/**
 * Per-vessel counts of the vessel's own documents, with the Compliance Center's rule (required
 * per vessel override, annual documents follow the policy end date, 30-day window). Entity
 * documents are not included.
 */
export function vesselDocCounts(
  vessels: Pick<Vessel, 'id' | 'policyExpiryDate'>[],
  docs: VesselDocument[],
  docTypes: DocumentType[],
  policyExpiries: Record<string, string>
): Map<string, VesselDocCounts> {
  const today = new Date(new Date().setHours(0, 0, 0, 0))
  const docMap = new Map<string, VesselDocument>()
  for (const d of docs) docMap.set(`${d.vesselId}:${d.documentTypeId}`, d)
  const out = new Map<string, VesselDocCounts>()
  for (const v of vessels) {
    const c: VesselDocCounts = { missing: 0, expired: 0, soon: 0 }
    for (const t of docTypes) {
      const doc = docMap.get(`${v.id}:${t.id}`)
      const required = doc ? doc.required : t.required
      const hasFile = !!doc?.filePath
      if (!hasFile) {
        if (required) c.missing++
        continue
      }
      const status = getDocStatus({
        hasFile,
        expiryDate: effectiveDocExpiry(
          t.annualRenewal,
          doc?.expiryDate,
          policyExpiries[v.id] || v.policyExpiryDate
        ),
        required,
        annualRenewal: t.annualRenewal,
        receivedDate: doc?.receivedDate,
        soonDays: 30,
        today
      })
      if (status === 'expired') c.expired++
      else if (status === 'expiring') c.soon++
    }
    out.set(v.id, c)
  }
  return out
}
