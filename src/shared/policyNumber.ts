/**
 * The code after the type letter in a policy number (P 2620 0001): a pattern in Policy
 * Settings (app_settings `policy_number_code`) where {YY} is the year's last two digits.
 * Always 4 digits: the serial is read from the 6th character on (adapter) and the survey
 * warranty reference strips letter + 4 digits (WarrantyManager).
 */
export const POLICY_NUMBER_CODE_KEY = 'policy_number_code'
export const DEFAULT_POLICY_NUMBER_CODE = '{YY}20'

export function policyNumberCode(
  pattern: string | null | undefined,
  year: number | string
): string {
  const p = (pattern || '').trim()
  const yy = String(year).slice(-2)
  const code = (p || DEFAULT_POLICY_NUMBER_CODE).replace(/\{YY\}/gi, yy)
  return /^\d{4}$/.test(code) ? code : DEFAULT_POLICY_NUMBER_CODE.replace('{YY}', yy)
}

/** Why a pattern cannot be used ('' = fine) */
export function policyNumberCodeError(pattern: string): string {
  const code = pattern.trim().replace(/\{YY\}/gi, '26')
  if (!pattern.trim()) return 'Enter a code'
  if (!/^\d{4}$/.test(code)) return 'The code must be 4 digits ({YY} counts as 2)'
  return ''
}
