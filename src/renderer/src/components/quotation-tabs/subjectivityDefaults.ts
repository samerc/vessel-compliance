// Default subjectivities of a quotation: filled from the master list and the vessels' / assureds'
// missing documents. Used by the Subjectivities tab (first open) and by the export (a quotation
// exported without opening the tab).

import {
  PISubjectivity,
  QuotationSubjectivity,
  QuotationVessel,
  DocumentType,
  Entity,
  EntityDocumentType,
  EntityDocument,
  VesselDocument,
  VesselAssured
} from '../../../../shared/types'
import { resolveEffectivePolicyExpiry } from '../../utils/policyUtils'
import { ok } from '../../utils/ipc'
import { inTypeScope } from '../../../../shared/quotationTypes'
import { masterData } from './masterDataCache'

/** Where the subjectivity loaders put what they load */
export interface SubjectivitySink {
  setItems: (v: QuotationSubjectivity[]) => void
  setMasterList: (v: PISubjectivity[]) => void
  setDocTypes: (v: DocumentType[]) => void
  setQVessels: (v: QuotationVessel[]) => void
  setScopeAutoDetected: (v: boolean) => void
}

/** Rows from older adapters may still carry the snake_case column */
type VesselDocumentRow = VesselDocument & { document_type_id?: string }

export async function loadSubjectivities(
  quotationId: string,
  quotationTypeCode: string | undefined,
  sink: SubjectivitySink,
  autoPopulateRan: { current: boolean },
  alreadyFilled: boolean
): Promise<void> {
  const [subjs, masters, dts, qv] = await Promise.all([
    window.api.getQuotationSubjectivities(quotationId),
    masterData('getPISubjectivities'),
    masterData('getDocumentTypes'),
    window.api.getQuotationVessels(quotationId)
  ])
  const safeSubjs = Array.isArray(subjs) ? subjs : []
  const safeMasters = Array.isArray(masters) ? masters : []
  const safeDts = Array.isArray(dts) ? dts : []
  // Filter masters by quotation type scope
  const filteredMasters = safeMasters.filter((m) =>
    inTypeScope(m.typeScope, quotationTypeCode?.toUpperCase())
  )
  sink.setItems(safeSubjs)
  sink.setMasterList(filteredMasters)
  sink.setDocTypes(safeDts)
  sink.setQVessels(Array.isArray(qv) ? qv : [])

  // Auto-populate only the very first time the quotation has none (skip for War and Cargo -
  // subjectivities not included by default). Once it had any, an empty list is the user's
  // choice: deleting the last one must not bring the defaults back
  const firstLoad = !autoPopulateRan.current
  autoPopulateRan.current = true
  if (
    firstLoad &&
    !alreadyFilled &&
    safeSubjs.length === 0 &&
    filteredMasters.length > 0 &&
    quotationTypeCode !== 'W' &&
    quotationTypeCode !== 'C'
  ) {
    // The editor's quotation can be older than this tab (the tab remounts on every switch):
    // read the mark fresh before filling
    const fresh = await window.api.getQuotation(quotationId)
    if (fresh && !('error' in fresh) && fresh.subjectivitiesFilled) return
    await autoPopulate(quotationId, filteredMasters, safeDts, sink)
  }
}

export async function autoPopulate(
  quotationId: string,
  masters: PISubjectivity[],
  dts: DocumentType[],
  sink: SubjectivitySink
): Promise<void> {
  if (masters.length === 0) return
  try {
    const qVessels: QuotationVessel[] = await window.api.getQuotationVessels(quotationId)
    const linkedVessels = qVessels.filter((qv) => qv.vesselId)
    const hasRealVessel = linkedVessels.length > 0

    const toAdd: PISubjectivity[] = []

    if (!hasRealVessel) {
      // No vessel in DB — add all master subjectivities
      toAdd.push(...masters)
    } else {
      // Check each vessel's doc status
      const missingDocTypeIds = new Set<string>()

      for (const qv of linkedVessels) {
        const vesselDocs = await window.api.getVesselDocuments(qv.vesselId!)
        const vesselDocMap = new Map(
          vesselDocs.map((d: VesselDocumentRow) => [d.documentTypeId || d.document_type_id, d])
        )

        // Check required doc types only — optional docs are excluded from auto-populate
        for (const dt of dts) {
          if (!dt.required) continue
          const doc = vesselDocMap.get(dt.id)
          if (!doc || !doc.filePath) {
            missingDocTypeIds.add(dt.id)
            continue
          }
          // For annual types — check if expiring soon (P&I policy logic)
          if (dt.annualRenewal) {
            try {
              const policies = await window.api.getVesselDynamicPolicies(qv.vesselId!)
              const effectiveExpiry = resolveEffectivePolicyExpiry(policies) || doc.expiryDate
              if (effectiveExpiry) {
                const daysLeft = Math.ceil(
                  (new Date(effectiveExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                )
                if (daysLeft <= 60) missingDocTypeIds.add(dt.id)
              }
            } catch {
              /* skip policy check errors */
            }
          }
        }
      }

      // Also check assured entity documents
      try {
        const qAssureds = await window.api.getQuotationAssureds(quotationId)
        const allEntities = await window.api.getEntities()
        const edTypesRaw = await masterData('getEntityDocumentTypes')
        const edDocsRaw = await window.api.getEntityDocuments()
        const activeEdTypes = (Array.isArray(edTypesRaw) ? edTypesRaw : []).filter(
          (t) => t.isActive && t.isRequired
        )
        const allEdDocs = Array.isArray(edDocsRaw) ? edDocsRaw : []
        for (const qa of Array.isArray(qAssureds) ? qAssureds : []) {
          if (!qa.entityId) continue
          const entity = allEntities.find((e) => e.id === qa.entityId)
          if (!entity) continue
          for (const edt of activeEdTypes.filter(
            (t) => t.entityScope === 'both' || t.entityScope === entity.type
          )) {
            if (
              !allEdDocs.some(
                (d) => d.entityId === entity.id && d.documentTypeId === edt.id && d.filePath
              )
            ) {
              missingDocTypeIds.add(`entity:${edt.id}`)
            }
          }
        }
      } catch {
        /* ignore entity doc check errors */
      }

      // Add master subjectivities whose linked doc types overlap with missing/expiring
      for (const m of masters) {
        const shouldAdd =
          !m.docTypeIds ||
          m.docTypeIds.length === 0 ||
          m.docTypeIds.some((dtId) => missingDocTypeIds.has(dtId))
        if (shouldAdd) toAdd.push(m)
      }
    }

    // Insert the items
    let order = 0
    for (const m of toAdd) {
      await window.api.addQuotationSubjectivity({
        quotationId: quotationId,
        piSubjectivityId: m.id,
        text: m.text,
        isAutoPopulated: true,
        order: order++
      })
    }

    // Reload after auto-populate
    const refreshed = await window.api.getQuotationSubjectivities(quotationId)
    const safeRefreshed = Array.isArray(refreshed) ? refreshed : []
    sink.setItems(safeRefreshed)

    // Auto-detect vessel scopes when 2+ vessels
    if (qVessels.length >= 2 && safeRefreshed.length > 0) {
      try {
        const scopes = await autoSetSubjectivityScopes(safeRefreshed, qVessels, masters)
        const withScopes = safeRefreshed.map((s) => ({
          ...s,
          vesselScope: scopes[s.id] !== undefined ? scopes[s.id] : s.vesselScope
        }))
        sink.setItems(withScopes)
        for (const s of withScopes) {
          if (scopes[s.id] !== undefined) {
            ok(await window.api.updateQuotationSubjectivity(s.id, { vesselScope: scopes[s.id] }))
          }
        }
        sink.setScopeAutoDetected(true)
      } catch {
        /* scope detection is best-effort */
      }
    }
  } catch (err) {
    console.error('Auto-populate subjectivities error:', err)
  }
}

export async function autoSetSubjectivityScopes(
  subjs: QuotationSubjectivity[],
  vessels: QuotationVessel[],
  allSubjDefs: PISubjectivity[]
): Promise<Record<string, string[] | null>> {
  const scopes: Record<string, string[] | null> = {}

  // Pre-fetch all entities once for entity doc checks
  let allEntities: Entity[] = []
  try {
    const ents = await window.api.getEntities()
    allEntities = Array.isArray(ents) ? ents : []
  } catch {
    /* ignore */
  }

  // Load entity document data
  let scopeEdTypes: EntityDocumentType[] = []
  let scopeEdDocs: EntityDocument[] = []
  try {
    const [edtRaw, eddRaw] = await Promise.all([
      masterData('getEntityDocumentTypes'),
      window.api.getEntityDocuments()
    ])
    scopeEdTypes = (Array.isArray(edtRaw) ? edtRaw : []).filter((t) => t.isActive && t.isRequired)
    scopeEdDocs = Array.isArray(eddRaw) ? eddRaw : []
  } catch {
    /* ignore */
  }

  // Pre-fetch vessel docs and assureds per vessel
  const vesselDocsMap = new Map<string, VesselDocumentRow[]>()
  const vesselAssuredsMap = new Map<string, VesselAssured[]>()
  for (const qv of vessels) {
    if (!qv.vesselId) continue
    try {
      const [docs, assureds] = await Promise.all([
        window.api.getVesselDocuments(qv.vesselId),
        window.api.getVesselAssureds(qv.vesselId)
      ])
      vesselDocsMap.set(qv.vesselId, Array.isArray(docs) ? docs : [])
      vesselAssuredsMap.set(qv.vesselId, Array.isArray(assureds) ? assureds : [])
    } catch {
      /* ignore */
    }
  }

  for (const subj of subjs) {
    const def = allSubjDefs.find((s) => s.id === subj.piSubjectivityId)
    if (!def || !def.docTypeIds || def.docTypeIds.length === 0) {
      scopes[subj.id] = null // no doc mapping — applies to all
      continue
    }

    const entityDocTypeIds = def.docTypeIds.filter((id) => id.startsWith('entity:'))
    const vesselDocTypeIds = def.docTypeIds.filter((id) => !id.startsWith('entity:'))
    const needsVessels: string[] = []

    for (const qv of vessels) {
      if (!qv.vesselId) {
        // Manual vessel — always needs the subjectivity
        needsVessels.push(qv.id)
        continue
      }

      const vesselDocs = vesselDocsMap.get(qv.vesselId) || []
      let vesselHasAll = true

      // Check vessel document types
      for (const dtId of vesselDocTypeIds) {
        const hasDoc = vesselDocs.some(
          (d) => (d.documentTypeId || d.document_type_id) === dtId && d.filePath
        )
        if (!hasDoc) {
          vesselHasAll = false
          break
        }
      }

      // Check entity documents dynamically
      if (vesselHasAll && entityDocTypeIds.length > 0) {
        const assureds = vesselAssuredsMap.get(qv.vesselId) || []
        for (const assured of assureds) {
          if (!assured.entityId) continue
          const entity = allEntities.find((e) => e.id === assured.entityId)
          if (!entity) continue
          for (const eid of entityDocTypeIds) {
            const edtId = eid.startsWith('entity:') ? eid.slice(7) : null
            if (edtId) {
              const edt = scopeEdTypes.find((t) => t.id === edtId)
              if (edt && (edt.entityScope === 'both' || edt.entityScope === entity.type)) {
                if (
                  !scopeEdDocs.some(
                    (d) => d.entityId === entity.id && d.documentTypeId === edtId && d.filePath
                  )
                ) {
                  vesselHasAll = false
                  break
                }
              }
            }
          }
          if (!vesselHasAll) break
        }
      }

      if (!vesselHasAll) needsVessels.push(qv.id)
    }

    // If all vessels need it → null (all). If none need it → null (keep for all, user can remove).
    if (needsVessels.length === vessels.length || needsVessels.length === 0) {
      scopes[subj.id] = null
    } else {
      scopes[subj.id] = needsVessels
    }
  }

  return scopes
}

/**
 * Fills the default subjectivities the way the Subjectivities tab does on its first open, for a
 * quotation exported without opening it. Does nothing once the quotation had subjectivities.
 */
export async function fillDefaultSubjectivities(
  quotationId: string,
  quotationTypeCode: string | undefined
): Promise<void> {
  const fresh = await window.api.getQuotation(quotationId)
  if (!fresh || 'error' in fresh || fresh.subjectivitiesFilled) return
  const noop = (): void => {}
  const sink: SubjectivitySink = {
    setItems: noop,
    setMasterList: noop,
    setDocTypes: noop,
    setQVessels: noop,
    setScopeAutoDetected: noop
  }
  await loadSubjectivities(quotationId, quotationTypeCode, sink, { current: false }, false)
}
