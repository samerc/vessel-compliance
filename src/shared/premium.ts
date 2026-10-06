import type {
  Quotation,
  QuotationVessel,
  QuotationPIAlternative,
  QuotationHullAlternative,
  QuotationDiscount
} from './types'

// Shared premium maths — the single source of truth for technical → payable conversion.
// Mirrors the quotation PremiumTab: NCB first, then UPCC on the remainder, then each extra
// quotation discount in order. Disabled NCB/UPCC never reduce the premium, even if a stale
// percent/amount is still stored. Fixed-amount discounts apply per vessel / per policy.

export interface PremiumDiscountSource {
  ncbEnabled?: boolean | null
  ncbDiscountType?: 'percentage' | 'amount' | null
  ncbDiscountPercent?: number | null
  ncbDiscountAmount?: number | null
  upccEnabled?: boolean | null
  upccDiscountType?: 'percentage' | 'amount' | null
  upccDiscountPercent?: number | null
  upccDiscountAmount?: number | null
}

export interface ExtraDiscount {
  discountType: 'percentage' | 'amount'
  percent?: number | null
  amount?: number | null
  /** Conditional discount: wording only, never deducted from the payable premium */
  excludeFromPremium?: boolean | null
}

/** The extra discounts that actually reduce the payable premium (skips conditional ones). */
export function deductedDiscounts<T extends ExtraDiscount>(extra: T[] = []): T[] {
  return extra.filter((d) => !d.excludeFromPremium)
}

export interface VesselDiscountFlags {
  ncbExcluded?: boolean | null
  upccExcluded?: boolean | null
}

export const round2 = (n: number): number => Math.round((n || 0) * 100) / 100

/** True when any discount (NCB, UPCC or an extra discount) changes the payable premium. */
export function hasPremiumDiscount(q: PremiumDiscountSource, extra: ExtraDiscount[] = []): boolean {
  return !!q.ncbEnabled || !!q.upccEnabled || deductedDiscounts(extra).length > 0
}

/** Technical premium → payable premium (rounded to cents). */
export function computePayablePremium(
  tech: number,
  q: PremiumDiscountSource,
  extra: ExtraDiscount[] = [],
  vessel?: VesselDiscountFlags | null
): number {
  const t = Number(tech) || 0
  const ncbOn = !!q.ncbEnabled && !vessel?.ncbExcluded
  const upccOn = !!q.upccEnabled && !vessel?.upccExcluded
  const ncbDed = !ncbOn
    ? 0
    : q.ncbDiscountType === 'amount'
      ? Number(q.ncbDiscountAmount) || 0
      : (t * (Number(q.ncbDiscountPercent) || 0)) / 100
  const afterNcb = t - ncbDed
  const upccDed = !upccOn
    ? 0
    : q.upccDiscountType === 'amount'
      ? Number(q.upccDiscountAmount) || 0
      : (afterNcb * (Number(q.upccDiscountPercent) || 0)) / 100
  let r = afterNcb - upccDed
  for (const d of deductedDiscounts(extra)) {
    if (d.discountType === 'amount') r -= Number(d.amount) || 0
    else r -= (r * (Number(d.percent) || 0)) / 100
  }
  return round2(r)
}

/** Split a total into `count` instalments; the rounding remainder goes into the FIRST one. */
export function splitInstalments(total: number, count: number): number[] {
  if (count <= 0) return []
  const per = round2(total / count)
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? round2(total - per * (count - 1)) : per
  )
}

/** Add whole months to an ISO date, clamping to the last day of the target month
 *  (31 Jan + 1 month = 28/29 Feb, never 2/3 Mar). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const target = new Date(y, m - 1 + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  const day = Math.min(d, lastDay)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export type PremiumLolOption = {
  id: string
  label: string | null
  amount: number
  currency: string
  premiumAmount: number | null
  order: number
}

export interface PremiumContext {
  quotation: Quotation
  vessels: QuotationVessel[]
  piAlts: QuotationPIAlternative[]
  hullAlts: QuotationHullAlternative[]
  lolOptions: PremiumLolOption[]
  altVesselPrems: Record<string, number> // `${altId}:${quotationVesselId}` → premium
  discounts: QuotationDiscount[]
  /** War Settings default rates, used when the quotation stored none (as the quotation does) */
  warDefaults?: { rate?: number | null; excessRate?: number | null }
}

// Technical premium of ONE quotation vessel for the chosen alternative / LOL option.
// Fleet-level amounts (an alternative or LOL premium with no per-vessel breakdown, IV) are
// shared across the quotation's vessels in proportion to their own premiums (evenly if none).
export function vesselTechnical(
  ctx: PremiumContext,
  qv: QuotationVessel,
  altId: string,
  lolId: string
): number {
  const { quotation: q, vessels } = ctx
  const n = vessels.length || 1
  const sumVesselPrem = vessels.reduce((s, v) => s + (v.premiumAmount || 0), 0)
  const share = (fleetAmount: number): number =>
    n <= 1
      ? fleetAmount
      : sumVesselPrem > 0
        ? (fleetAmount * (qv.premiumAmount || 0)) / sumVesselPrem
        : fleetAmount / n

  if (q.quotationTypeCode === 'W' && q.warExcessEnabled) {
    const s1Amt = qv.agreedValue ?? q.agreedValue ?? 0
    const s2Amt = qv.warExcessAmount ?? q.warExcessAmount ?? 0
    const s1Rate = q.premiumRate ?? ctx.warDefaults?.rate ?? 0
    const s2Rate = q.warExcessRate ?? ctx.warDefaults?.excessRate ?? 0
    const s1Prem = qv.warSection1Premium ?? round2((s1Amt * s1Rate) / 100)
    const s2Prem = qv.warSection2Premium ?? round2(((s2Amt - s1Amt) * s2Rate) / 100)
    // Section-2-only cover charges the excess layer only (as the quotation premium)
    return round2(q.warSection2Only ? s2Prem : s1Prem + s2Prem)
  }

  const plain =
    n > 1
      ? (qv.premiumAmount ?? share(q.premiumAmount || 0))
      : qv.premiumAmount || q.premiumAmount || 0
  const hullAlt = ctx.hullAlts.find((a) => a.id === altId)
  const piAlt = ctx.piAlts.find((a) => a.id === altId)
  const lol = ctx.lolOptions.find((o) => o.id === lolId)
  let tech: number
  if (hullAlt) {
    const matrix = ctx.altVesselPrems[`${hullAlt.id}:${qv.id}`]
    if (matrix != null) tech = matrix
    else if (hullAlt.vesselScopeId)
      tech = hullAlt.vesselScopeId === qv.id ? (hullAlt.premiumAmount ?? plain) : plain
    else tech = hullAlt.premiumAmount != null ? share(hullAlt.premiumAmount) : plain
  } else if (piAlt && ctx.altVesselPrems[`${piAlt.id}:${qv.id}`] != null) {
    // Fleet P&I / FD&D: the vessel's own premium under this alternative
    tech = ctx.altVesselPrems[`${piAlt.id}:${qv.id}`]
  } else if (piAlt && piAlt.premiumAmount != null) {
    tech = share(piAlt.premiumAmount)
  } else if (lol && lol.premiumAmount != null) {
    tech = share(lol.premiumAmount)
  } else {
    tech = plain
  }
  // Increased Value (Hull) adds on top of the hull premium
  if (q.ivEnabled && q.ivPremiumAmount) tech += share(q.ivPremiumAmount)
  return round2(tech)
}
