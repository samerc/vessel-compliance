/**
 * The return premium of a policy cancelled on a date and time: the Pro-Rata calculator's maths
 * (countDays: one more day when the cancellation time is later in the day than the expiry time)
 * over the policy's own period, less the NCB/UPCC reclaimed when the user chooses to.
 * Used by the policy's Cancel Policy and by Vessel sold.
 */
import {
  calcProRataPremium,
  countDays,
  discountGivenFromPayable,
  distributeInstalments,
  type DiscountGiven,
  type GivenDiscount
} from './premiumCalc'

export interface CancellationInput {
  /** Annual payable premium */
  annualPremium: number
  inceptionDate: string
  inceptionTime?: string | null
  expiryDate: string
  expiryTime?: string | null
  cancelDate: string
  cancelTime?: string | null
  commissionPct?: number
  /** null = nothing reclaimed */
  reclaim?: { ncb: GivenDiscount | null; upcc: GivenDiscount | null } | null
  /** The policy's instalment dates: the return is spread over them (bottom-fill) */
  instalments?: { instalmentNumber: number; dueDate: string }[]
}

export interface CancellationResult {
  totalDays: number
  remainingDays: number
  /** Pro-rata return before any reclaim */
  grossReturn: number
  given: DiscountGiven | null
  returnPremium: number
  returnCommission: number
  instalments: {
    instalmentNumber: number
    dueDate: string
    premiumAmount: number
    commissionAmount: number
  }[]
}

/** "2026-02-15" + "14:30" -> "2026-02-15T14:30" (no time = 12:00) */
export const atTime = (date: string, time?: string | null): string =>
  `${(date || '').slice(0, 10)}T${(time || '12:00').slice(0, 5)}`

export function calcCancellation(i: CancellationInput): CancellationResult | null {
  if (!i.inceptionDate || !i.expiryDate || !i.cancelDate || !(i.annualPremium > 0)) return null
  const start = atTime(i.inceptionDate, i.inceptionTime)
  const end = atTime(i.expiryDate, i.expiryTime)
  const total = countDays(start, end).days
  if (total <= 0) return null
  const at = atTime(i.cancelDate, i.cancelTime)
  // Cancelled before inception: the whole premium; after expiry: nothing
  const remaining = at <= start ? total : Math.min(countDays(at, end).days, total)
  let given: DiscountGiven | null = null
  if (i.reclaim) {
    given = discountGivenFromPayable(i.annualPremium, i.reclaim.ncb, i.reclaim.upcc)
    if (given.total <= 0) given = null
  }
  const commissionPct = i.commissionPct || 0
  const calc = calcProRataPremium(
    remaining,
    i.annualPremium,
    total,
    1,
    commissionPct,
    given?.total || 0
  )
  const returnPremium = calc.proRataPremium
  const instalments =
    i.instalments && i.instalments.length > 0 && returnPremium > 0
      ? distributeInstalments(returnPremium, i.annualPremium, i.instalments, commissionPct)
      : []
  return {
    totalDays: total,
    remainingDays: remaining,
    grossReturn: calc.grossProRataPremium,
    given,
    returnPremium,
    returnCommission: calc.commissionTotal,
    instalments
  }
}

/**
 * NCB / UPCC as written in a vessel's policy: "10%", "12.5", "0.05" (= 5%), or an amount
 * ("2000"). Nothing / 0 = none.
 */
export function parseGivenText(text: string | null | undefined): GivenDiscount | null {
  const t = (text || '').trim()
  if (!t) return null
  const pct = t.match(/^(\d+(?:[.,]\d+)?)\s*%$/)
  if (pct) {
    const v = Number(pct[1].replace(',', '.'))
    return v > 0 ? { type: 'pct', value: v } : null
  }
  const n = Number(t.replace(/[\s,]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1) return { type: 'pct', value: Math.round(n * 100000) / 1000 }
  if (n <= 100) return { type: 'pct', value: n }
  return { type: 'amount', value: n }
}

/** "January 5, 2026 at 14:30" for the cancellation endorsement */
export function cancellationWhen(date: string, time?: string | null): string {
  if (!date) return 'the date hereof'
  const d = new Date(`${date.slice(0, 10)}T12:00`)
  const day = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return time ? `${day} at ${time.slice(0, 5)} hours` : day
}
