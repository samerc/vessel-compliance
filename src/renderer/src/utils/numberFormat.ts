/**
 * Formats a number string with thousand separators as the user types.
 * Preserves decimal input. Returns { display, raw } where display is formatted
 * and raw is the clean numeric string for storage.
 */
export function formatNumberWithCommas(value: string): { display: string; raw: string } {
  if (!value) return { display: '', raw: '' }

  // Remove everything except digits, dots, and minus
  const cleaned = value.replace(/[^0-9.\-]/g, '')

  // Handle negative
  const isNegative = cleaned.startsWith('-')
  const abs = isNegative ? cleaned.slice(1) : cleaned

  // Split on decimal point
  const parts = abs.split('.')
  const intPart = parts[0] || ''
  const decPart = parts.length > 1 ? parts.slice(1).join('') : undefined

  // Add thousand separators to integer part
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  const display = (isNegative ? '-' : '') + formatted + (decPart !== undefined ? '.' + decPart : '')
  const raw = (isNegative ? '-' : '') + intPart + (decPart !== undefined ? '.' + decPart : '')

  return { display, raw }
}

/**
 * Parses a formatted number string back to a clean numeric value.
 */
export function parseFormattedNumber(value: string): string {
  return value.replace(/,/g, '')
}

/**
 * Formats a number for display with thousand separators and optional decimal places.
 */
export function displayNumber(value: number | string | null | undefined, decimals?: number): string {
  if (value == null || value === '') return ''
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return ''
  if (decimals !== undefined) {
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }
  return num.toLocaleString('en-US')
}
