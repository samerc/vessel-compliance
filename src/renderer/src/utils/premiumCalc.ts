/**
 * Shared pro-rata premium calculation utilities.
 * Used by: PremiumCalculator, EndorsementManager (pro-rata prefill), PolicyDetail (cancellation modal)
 */

/** DST-safe day counting between two date strings */
export function countDays(startStr: string, endStr: string): { days: number; calendarDays: number; addedDay: boolean } {
  if (!startStr || !endStr) return { days: 0, calendarDays: 0, addedDay: false }
  const start = new Date(startStr)
  const end = new Date(endStr)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return { days: 0, calendarDays: 0, addedDay: false }
  if (end <= start) return { days: 0, calendarDays: 0, addedDay: false }

  // Use date-only comparison to avoid DST issues
  const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const calendarDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000)

  // Compare time-of-day: if calendarDays > 0 and end time > start time, add 1
  if (calendarDays > 0) {
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = end.getHours() * 60 + end.getMinutes()
    if (endMinutes > startMinutes) {
      return { days: calendarDays + 1, calendarDays, addedDay: true }
    }
  }

  return { days: calendarDays, calendarDays, addedDay: false }
}

/** Round to 2 decimal places */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface InstalmentRow {
  number: number
  premium: number
  commission: number
}

export interface ProRataResult {
  proRataPremium: number
  annualInstalment: number
  fullInstalments: number
  firstPremiumInstalment: number
  commissionTotal: number
  annualCommission: number
  annualCommissionInstalment: number
  firstCommissionInstalment: number
  rows: InstalmentRow[]
}

/**
 * Calculate pro-rata premium and distribute across instalments.
 *
 * @param days - Number of days in the pro-rata period
 * @param annualPremium - Annual premium amount
 * @param standardPeriod - Standard period in days (typically 365)
 * @param numInstalments - Number of instalments
 * @param commissionPct - Commission percentage
 * @returns Full calculation result with instalment rows
 */
export function calcProRataPremium(
  days: number,
  annualPremium: number,
  standardPeriod: number,
  numInstalments: number,
  commissionPct: number
): ProRataResult {
  const proRataPremium = round2((days * annualPremium) / standardPeriod)
  const annualInstalment = round2(annualPremium / numInstalments)
  const fullInstalments = annualInstalment > 0 ? Math.floor(proRataPremium / annualInstalment) : 0
  const firstPremiumInstalment = round2(proRataPremium - annualInstalment * fullInstalments)

  const commissionTotal = round2(proRataPremium * commissionPct / 100)
  const annualCommission = round2(annualPremium * commissionPct / 100)
  const annualCommissionInstalment = round2(annualCommission / numInstalments)
  const firstCommissionInstalment = round2(commissionTotal - annualCommissionInstalment * fullInstalments)

  // Build rows: first instalment (remainder) + full instalments from bottom
  const rows: InstalmentRow[] = []
  let rowNum = 1
  if (firstPremiumInstalment > 0) {
    rows.push({ number: rowNum++, premium: firstPremiumInstalment, commission: firstCommissionInstalment })
  }
  for (let i = 0; i < fullInstalments; i++) {
    rows.push({ number: rowNum++, premium: annualInstalment, commission: annualCommissionInstalment })
  }

  return {
    proRataPremium,
    annualInstalment,
    fullInstalments,
    firstPremiumInstalment,
    commissionTotal,
    annualCommission,
    annualCommissionInstalment,
    firstCommissionInstalment,
    rows
  }
}

/**
 * Distribute a pro-rata amount across policy instalment dates using bottom-fill logic.
 * Returns only non-zero instalments.
 *
 * @param proRataAmount - The pro-rata premium to distribute
 * @param annualAmount - The annual premium (used to calculate base instalment)
 * @param policyInstalments - Policy instalment dates
 * @param commissionPct - Commission percentage
 * @returns Array of instalment objects with dates and amounts (zero-amount removed)
 */
export function distributeInstalments(
  proRataAmount: number,
  annualAmount: number,
  policyInstalments: Array<{ instalmentNumber: number; dueDate: string }>,
  commissionPct: number
): Array<{ instalmentNumber: number; dueDate: string; premiumAmount: number; commissionAmount: number }> {
  const numInst = policyInstalments.length
  if (numInst === 0 || proRataAmount <= 0 || annualAmount <= 0) return []

  const baseInstalment = round2(annualAmount / numInst)
  const fullCount = baseInstalment > 0 ? Math.floor(proRataAmount / baseInstalment) : 0
  const remainder = round2(proRataAmount - fullCount * baseInstalment)

  const startIdx = numInst - fullCount - (remainder > 0 ? 1 : 0)
  const result: Array<{ instalmentNumber: number; dueDate: string; premiumAmount: number; commissionAmount: number }> = []

  for (let i = Math.max(0, startIdx); i < numInst; i++) {
    const pi = policyInstalments[i]
    const isFirst = i === startIdx && remainder > 0
    const prem = isFirst ? remainder : baseInstalment
    const comm = round2(prem * commissionPct / 100)
    result.push({
      instalmentNumber: result.length + 1,
      dueDate: pi.dueDate?.slice(0, 10) || '',
      premiumAmount: prem,
      commissionAmount: comm
    })
  }
  return result
}
