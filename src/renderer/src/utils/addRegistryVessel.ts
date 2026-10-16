import { ok } from './ipc'
import type { ClassificationSociety, FlagState, Quotation, Vessel } from '../../../shared/types'

/**
 * Adds a registry vessel to a quotation the same way everywhere (quotation Vessel tab and the
 * vessel page's "New quotation"): copies the vessel's particulars, loads its assureds (sorted by
 * role order; a c/o role becomes the broker; not for cargo) and, when the quotation has no
 * customer yet, copies the customer of the vessel's active policy of the same type.
 * Returns how many assureds were loaded.
 */
export async function addRegistryVessel(
  quotation: Pick<
    Quotation,
    'id' | 'quotationTypeId' | 'quotationTypeCode' | 'coName' | 'customerEntityId'
  >,
  vessel: Vessel,
  vesselLabel: string,
  order: number,
  societies: ClassificationSociety[] = []
): Promise<number> {
  const flagStates: FlagState[] = await window.api.getFlagStates().catch(() => [])
  const flagName = vessel.flagStateId
    ? flagStates.find((f) => f.id === vessel.flagStateId)?.name || ''
    : ''

  let classifName = ''
  try {
    const vcs = await window.api.getVesselClassifications(vessel.id)
    classifName = (Array.isArray(vcs) ? vcs : [])
      .map(
        (vc) =>
          vc.classificationSocietyName ||
          societies.find((c) => c.id === vc.classificationSocietyId)?.name
      )
      .filter(Boolean)
      .join(', ')
  } catch {
    /* fallback to the text field */
  }

  await window.api.addQuotationVessel({
    quotationId: quotation.id,
    vesselId: vessel.id,
    vesselLabel,
    order,
    name: vessel.name,
    imoNumber: vessel.imoNumber,
    builtYear: vessel.builtYear,
    rebuiltYear: vessel.rebuiltYear,
    grossTonnage: vessel.grossTonnage,
    flag: flagName,
    vesselType: vessel.vesselType,
    classification: classifName || vessel.classificationSociety,
    callSign: vessel.callSign
  })

  // Vessel assureds, sorted by role order from settings. Cargo does not use vessel assureds
  let assuredsAdded = 0
  let coName = quotation.coName
  if (quotation.quotationTypeCode !== 'C') {
    const [vassureds, allEntities, existingQAssureds, assuredRoles] = await Promise.all([
      window.api.getVesselAssureds(vessel.id),
      window.api.getEntities(),
      window.api.getQuotationAssureds(quotation.id),
      window.api.getAssuredRoles()
    ])
    const roleOrder = new Map(
      (Array.isArray(assuredRoles) ? assuredRoles : []).map((r, idx): [string, number] => [
        r.name?.toLowerCase(),
        r.order ?? idx
      ])
    )
    // Skip entities already added for THIS vessel label (the same entity may be on other vessels)
    const existingForThisVessel = new Set(
      existingQAssureds
        .filter((a) => a.vesselLabel === vesselLabel)
        .map((a) => a.entityId)
        .filter(Boolean)
    )
    const toAdd = vassureds
      .filter((va) => !existingForThisVessel.has(va.entityId))
      .sort(
        (a, b) =>
          (roleOrder.get(a.role?.toLowerCase()) ?? 999) -
          (roleOrder.get(b.role?.toLowerCase()) ?? 999)
      )
    for (const va of toAdd) {
      const entity = allEntities.find((e) => e.id === va.entityId)
      if (!entity) continue
      // c/o role → the broker, not an assured
      if (va.role && va.role.toLowerCase().replace(/[^a-z]/g, '') === 'co') {
        if (!coName) {
          ok(await window.api.updateQuotation(quotation.id, { coName: entity.name }))
          coName = entity.name
        }
        continue
      }
      await window.api.addQuotationAssured({
        quotationId: quotation.id,
        entityId: va.entityId,
        name: entity.name,
        role: va.role || undefined,
        vesselLabel,
        order: existingQAssureds.length + assuredsAdded
      })
      assuredsAdded++
    }
  }

  // Customer from the vessel's active policy of the same type
  if (!quotation.customerEntityId) {
    try {
      const dynPolicies = await window.api.getVesselDynamicPolicies(vessel.id)
      const matching = (Array.isArray(dynPolicies) ? dynPolicies : []).find(
        (p) =>
          p.status === 'active' &&
          p.policyTypeId === quotation.quotationTypeId &&
          p.customerEntityId
      )
      if (matching) {
        ok(
          await window.api.updateQuotation(quotation.id, {
            customerEntityId: matching.customerEntityId,
            customerType: matching.customerType,
            coName: matching.customerName
          })
        )
      }
    } catch {
      /* non-critical */
    }
  }
  return assuredsAdded
}
