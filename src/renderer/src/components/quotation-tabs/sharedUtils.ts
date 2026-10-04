// Helpers shared by the quotation tabs (the shared components are in shared.tsx)

export const ALT_COLORS = ['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']

/** Format a number with thousand separators */
export function fmtMoney(val: number | undefined | null): string {
  if (val == null || val === 0) return ''
  return val.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** Parse a formatted number string back to a number */
export function parseMoney(str: string): number | undefined {
  const cleaned = str.replace(/,/g, '')
  if (!cleaned) return undefined
  const n = parseFloat(cleaned)
  return isNaN(n) ? undefined : n
}

export function fmtNiceDate(iso: string): string {
  if (!iso) return iso
  const [y, m, d] = iso.split('-').map(Number)
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ]
  return `${months[m - 1]} ${d}, ${y}`
}
