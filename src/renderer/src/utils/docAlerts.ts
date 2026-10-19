// Compliance Center Document Alerts (pure): the to-do list (expired / expiring documents, and
// missing ones only where business is coming up) and each vessel's documents completeness.
import type {
  DocumentType,
  EndorsementDueRow,
  EntityDocument,
  EntityDocumentType,
  Vessel,
  VesselAssured,
  VesselBusinessMap,
  VesselDocument
} from '../../../shared/types'
import { effectiveDocExpiry, getDocStatus } from './docStatus'

/** One row of the Document Alerts tab */
export interface DocAlert {
  id: string
  vesselId: string
  /** Entity documents: the entity they belong to */
  entityId?: string
  vessel: string
  /** Entity documents shared by several vessels: the other vessels' names */
  otherVessels?: string[]
  document: string
  category: 'vessel' | 'entity' | 'endorsement'
  type: 'missing' | 'expired' | 'soon'
  /** Expiry (expired / soon), renewal date (missing), reminder date (endorsement); '-' = none */
  date: string
  /** Days from today to `date` (negative = overdue); null without a date */
  days: number | null
  /** Missing documents: why they are needed now ("Renews ...", "Quotation ...") */
  reason?: string
}

/** A vessel's documents: required ones on file and valid, out of all required */
export interface VesselCompleteness {
  vesselId: string
  vessel: string
  have: number
  total: number
  /** Required documents without a file (entity documents name their entity) */
  missing: string[]
  expired: number
  /** Renewal within 30 days or a quotation in progress */
  busy: boolean
}

type AssuredRow = VesselAssured & { entityType?: string; entityName?: string }

export interface DocAlertInput {
  vessels: Vessel[]
  docs: VesselDocument[]
  docTypes: DocumentType[]
  entityDocTypes: EntityDocumentType[]
  entityDocs: EntityDocument[]
  assureds: AssuredRow[]
  endorsements: EndorsementDueRow[]
  /** vesselId -> policy end date annual documents follow */
  policyExpiries: Record<string, string>
  business: VesselBusinessMap
  today?: Date
}

const DAY = 86400000

/**
 * A document type tagged for policy types applies only to vessels with an active policy of one
 * of them; an untagged type applies to every vessel.
 */
export function docTypeApplies(
  t: Pick<DocumentType, 'policyTypeIds'>,
  vesselTypes: string[]
): boolean {
  const tags = t.policyTypeIds || []
  return tags.length === 0 || tags.some((id) => vesselTypes.includes(id))
}

/** "Renews 12 Nov (P&I)" / "Quotation Q/P/26/14 in progress"; '' when nothing is coming up */
export function businessReason(
  b: VesselBusinessMap[string] | undefined,
  fmt: (d: string) => string = (d) => d
): string {
  if (!b) return ''
  const parts: string[] = []
  if (b.renewalDate)
    parts.push(`Renews ${fmt(b.renewalDate)}${b.renewalType ? ` (${b.renewalType})` : ''}`)
  if (b.quotations.length > 0) {
    const refs = b.quotations.map((q) => q.reference).filter(Boolean)
    parts.push(
      refs.length === 1
        ? `Quotation ${refs[0]} in progress`
        : `${b.quotations.length} quotations in progress`
    )
  }
  return parts.join(' - ')
}

export function buildDocAlerts(
  input: DocAlertInput,
  fmt: (d: string) => string = (d) => d
): { alerts: DocAlert[]; completeness: VesselCompleteness[] } {
  const today = input.today || new Date(new Date().setHours(0, 0, 0, 0))
  const daysTo = (d: string): number =>
    Math.round((new Date(d + 'T00:00:00').getTime() - today.getTime()) / DAY)
  const soonLimit = new Date(today.getTime() + 30 * DAY)

  const docMap = new Map<string, VesselDocument>()
  for (const d of input.docs) docMap.set(`${d.vesselId}:${d.documentTypeId}`, d)
  const entityDocMap = new Map<string, EntityDocument>()
  for (const d of input.entityDocs) entityDocMap.set(`${d.entityId}:${d.documentTypeId}`, d)
  const assuredsByVessel = new Map<string, AssuredRow[]>()
  for (const a of input.assureds) {
    if (!assuredsByVessel.has(a.vesselId)) assuredsByVessel.set(a.vesselId, [])
    assuredsByVessel.get(a.vesselId)!.push(a)
  }

  const alerts: DocAlert[] = []
  const completeness: VesselCompleteness[] = []
  // Expired / expiring entity documents: one row per entity document, not one per vessel
  const entityRows = new Map<string, DocAlert>()

  for (const v of input.vessels) {
    const biz = input.business[v.id]
    const reason = businessReason(biz, fmt)
    const busy = reason !== ''
    const renewal = biz?.renewalDate || null
    const missingAlert = (a: Omit<DocAlert, 'type' | 'date' | 'days' | 'reason'>): void => {
      if (!busy) return
      alerts.push({
        ...a,
        type: 'missing',
        date: renewal || '-',
        days: renewal ? daysTo(renewal) : null,
        reason
      })
    }
    const c: VesselCompleteness = {
      vesselId: v.id,
      vessel: v.name,
      have: 0,
      total: 0,
      missing: [],
      expired: 0,
      busy
    }

    // The vessel's own documents
    const policyTypes = biz?.policyTypeIds || []
    for (const t of input.docTypes) {
      if (!docTypeApplies(t, policyTypes)) continue
      const doc = docMap.get(`${v.id}:${t.id}`)
      const required = doc ? doc.required : t.required
      const hasFile = !!doc?.filePath
      if (!hasFile) {
        if (!required) continue
        c.total++
        c.missing.push(t.name)
        missingAlert({
          id: `${v.id}-${t.id}-missing`,
          vesselId: v.id,
          vessel: v.name,
          document: t.name,
          category: 'vessel'
        })
        continue
      }
      // Annual documents follow the vessel's policy end date (same rule as the vessel page)
      const expiry = effectiveDocExpiry(
        t.annualRenewal,
        doc?.expiryDate,
        input.policyExpiries[v.id] || v.policyExpiryDate
      )
      const status = getDocStatus({
        hasFile,
        expiryDate: expiry,
        required,
        annualRenewal: t.annualRenewal,
        receivedDate: doc?.receivedDate,
        soonDays: 30,
        today
      })
      if (required) {
        c.total++
        if (status === 'expired') c.expired++
        else c.have++
      }
      if (expiry && (status === 'expired' || status === 'expiring')) {
        alerts.push({
          id: `${v.id}-${t.id}-${status}`,
          vesselId: v.id,
          vessel: v.name,
          document: t.name,
          category: 'vessel',
          type: status === 'expired' ? 'expired' : 'soon',
          date: expiry,
          days: daysTo(expiry)
        })
      }
    }

    // Documents of the vessel's assureds
    const seen = new Set<string>()
    for (const a of assuredsByVessel.get(v.id) || []) {
      if (!a.entityId || seen.has(a.entityId)) continue
      seen.add(a.entityId)
      const scope = a.entityType === 'person' ? 'person' : 'company'
      const name = a.entityName || 'Assured'
      for (const t of input.entityDocTypes) {
        if (!t.isRequired || (t.entityScope !== 'both' && t.entityScope !== scope)) continue
        c.total++
        const ed = entityDocMap.get(`${a.entityId}:${t.id}`)
        const label = `${t.name} (${name})`
        if (!ed?.filePath) {
          c.missing.push(label)
          missingAlert({
            id: `${v.id}-entity-${a.entityId}-${t.id}-missing`,
            entityId: a.entityId,
            vesselId: v.id,
            vessel: v.name,
            document: label,
            category: 'entity'
          })
          continue
        }
        const expiry = ed.expiryDate ? String(ed.expiryDate).slice(0, 10) : ''
        const exp = expiry ? new Date(expiry + 'T00:00:00') : null
        if (exp && exp < today) c.expired++
        else c.have++
        if (!exp || exp >= soonLimit) continue
        const key = `${a.entityId}:${t.id}`
        const row = entityRows.get(key)
        if (row) {
          row.otherVessels = [...(row.otherVessels || []), v.name]
          continue
        }
        entityRows.set(key, {
          id: `entity-${a.entityId}-${t.id}`,
          entityId: a.entityId,
          vesselId: v.id,
          vessel: v.name,
          document: label,
          category: 'entity',
          type: exp < today ? 'expired' : 'soon',
          date: expiry,
          days: daysTo(expiry)
        })
      }
    }
    completeness.push(c)
  }
  alerts.push(...entityRows.values())

  // Endorsements not issued yet
  for (const e of input.endorsements) {
    const date = e.endorsementReminderDate ? String(e.endorsementReminderDate).slice(0, 10) : ''
    alerts.push({
      id: `endorsement-${e.surveyId}`,
      vesselId: e.vesselId,
      vessel: e.vesselName || 'Unknown',
      document: `Endorsement (${e.surveyType || 'Survey'}${e.surveyDate ? ` - ${e.surveyDate}` : ''})`,
      category: 'endorsement',
      type: 'missing',
      date: date || '-',
      days: date ? daysTo(date) : null,
      reason: 'Endorsement not issued'
    })
  }

  // Most urgent first: overdue, then by date; rows without a date last
  alerts.sort((a, b) => {
    if (a.days === null || b.days === null) return a.days === null ? (b.days === null ? 0 : 1) : -1
    return a.days - b.days || a.vessel.localeCompare(b.vessel)
  })
  completeness.sort(
    (a, b) =>
      pct(a) - pct(b) || b.missing.length - a.missing.length || a.vessel.localeCompare(b.vessel)
  )
  return { alerts, completeness }
}

/** Share of required documents on file and valid (100 when nothing is required) */
export const pct = (c: Pick<VesselCompleteness, 'have' | 'total'>): number =>
  c.total === 0 ? 100 : Math.round((c.have / c.total) * 100)

/** "12 days overdue", "today", "in 9 days" */
export function daysText(days: number | null): string {
  if (days === null) return ''
  if (days === 0) return 'today'
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`
  return `in ${days} day${days === 1 ? '' : 's'}`
}
