// Hull conditions whose wording needs an amount (Additional Machinery Deductible {amount}). With
// no amount the placeholder would be printed as it is, so the quotation is not exported.

interface AmountDefinition {
  id: string
  text: string
  hasAmount?: boolean
  amountPlaceholder?: string
}

interface SelectedAmount {
  textOverride?: string
  amount?: number | null
  vesselAmounts?: Record<string, number> | null
}

/** True when the wording still holds the placeholder and no row has an amount for it. */
export function amountIsMissing(def: AmountDefinition, rows: SelectedAmount[]): boolean {
  if (!def.hasAmount || !def.amountPlaceholder || rows.length === 0) return false
  if (!rows.some((r) => (r.textOverride || def.text).includes(def.amountPlaceholder!))) return false
  return !rows.some(
    (r) => r.amount != null || (r.vesselAmounts && Object.keys(r.vesselAmounts).length > 0)
  )
}

/** The conditions of a hull quotation to fill in before it is exported, as named on the tab. */
export async function hullConditionsMissingAmount(quotation: {
  id: string
  hullClauseId?: string | null
  ivEnabled?: boolean | null
  ivClauseId?: string | null
}): Promise<string[]> {
  const [rows, addlRows, alts, defs, addlDefs] = await Promise.all([
    window.api.hullGetQuotationHullConditions(quotation.id),
    window.api.hullGetQuotationHullAdditionalConditions(quotation.id),
    window.api.hullGetQuotationAlternatives(quotation.id),
    window.api.hullGetClauseConditions(),
    window.api.hullGetAdditionalConditions()
  ])
  if (!Array.isArray(rows) || !Array.isArray(defs)) return []

  // A condition left over from a clause no longer in use is not printed
  const clauses = new Set<string>()
  for (const a of Array.isArray(alts) ? alts : []) clauses.add(a.hullClauseId)
  if (quotation.hullClauseId) clauses.add(quotation.hullClauseId)
  if (quotation.ivEnabled && quotation.ivClauseId) clauses.add(quotation.ivClauseId)

  const missing: string[] = []
  for (const def of defs) {
    if (!clauses.has(def.hullClauseId)) continue
    const own = rows.filter((r) => r.hullConditionId === def.id)
    if (amountIsMissing(def, own)) missing.push(`Cl. ${def.conditionNumber}`)
  }
  if (Array.isArray(addlRows) && Array.isArray(addlDefs)) {
    for (const def of addlDefs) {
      const own = addlRows
        .filter((r) => r.hullAdditionalConditionId === def.id)
        .map((r) => ({ textOverride: r.textOverride, amount: r.amount }))
      if (amountIsMissing(def, own)) missing.push(def.text.replace(/<[^>]*>/g, '').slice(0, 60))
    }
  }
  return missing
}
