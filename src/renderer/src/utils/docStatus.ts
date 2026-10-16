// One rule for a vessel document's status, shared by the vessel Documents tab, Home and the
// Compliance Center so they count the same documents as expired.

export type DocStatus = 'compliant' | 'expiring' | 'expired' | 'missing' | 'optional'

/**
 * Expiry that counts for compliance: annual-renewal documents follow the vessel's policy end
 * date (P&I, else H&M); their own stored date is only the fallback.
 */
export function effectiveDocExpiry(
  annualRenewal: boolean | undefined,
  docExpiry: string | null | undefined,
  policyExpiry: string | null | undefined
): string | null | undefined {
  return annualRenewal ? policyExpiry || docExpiry : docExpiry
}

const startOfToday = (): Date => new Date(new Date().setHours(0, 0, 0, 0))

export function isDocExpired(d: string | null | undefined, today = startOfToday()): boolean {
  if (!d) return false
  return new Date(d) < today
}

export function isDocExpiringSoon(
  d: string | null | undefined,
  soonDays = 60,
  today = startOfToday()
): boolean {
  if (!d) return false
  const exp = new Date(d)
  const threshold = new Date(today)
  threshold.setDate(today.getDate() + soonDays)
  return exp >= today && exp <= threshold
}

/**
 * If the gap between receipt and expiry is < 60 days the document was placed knowing the
 * policy renews soon: treat it as compliant rather than "expiring soon".
 */
export function annualShortCycle(
  expiryDate: string | null | undefined,
  receivedDate: string | null | undefined
): boolean {
  if (!expiryDate || !receivedDate) return false
  const span =
    (new Date(expiryDate).getTime() - new Date(receivedDate).getTime()) / (1000 * 60 * 60 * 24)
  return span < 60
}

/** Status of one document; `expiryDate` is the effective one (see effectiveDocExpiry) */
export function getDocStatus(p: {
  hasFile: boolean
  expiryDate: string | null | undefined
  required: boolean
  annualRenewal?: boolean
  receivedDate?: string | null
  /** "Expiring soon" window: 60 days on the vessel page, 30 in the Compliance Center */
  soonDays?: number
  today?: Date
}): DocStatus {
  const today = p.today || startOfToday()
  if (!p.hasFile) return p.required ? 'missing' : 'optional'
  if (isDocExpired(p.expiryDate, today)) return 'expired'
  if (isDocExpiringSoon(p.expiryDate, p.soonDays ?? 60, today)) {
    if (p.annualRenewal && annualShortCycle(p.expiryDate, p.receivedDate)) return 'compliant'
    return 'expiring'
  }
  return 'compliant'
}
