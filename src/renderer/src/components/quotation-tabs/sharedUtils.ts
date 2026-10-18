// Helpers shared by the quotation tabs (the shared components are in shared.tsx)

import { confirmDialog } from '../DialogHost'

/** Asks before deleting a quotation item, quoting the start of its text */
export function confirmDelete(what: string, text?: string | null): Promise<boolean> {
  const plain = (text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const excerpt = plain.length > 140 ? plain.slice(0, 140) + '...' : plain
  return confirmDialog(excerpt ? `Delete this ${what}?\n\n"${excerpt}"` : `Delete this ${what}?`, {
    title: `Delete ${what}`,
    confirmLabel: 'Delete'
  })
}

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

/** A vessel type is a livestock carrier: code MLV, or "livestock" in its name or description */
export function isLivestockType(
  typeName: string | null | undefined,
  types: { name: string; description?: string }[]
): boolean {
  const n = (typeName || '').trim().toLowerCase()
  if (!n) return false
  if (n === 'mlv' || n.includes('livestock')) return true
  const t = types.find((x) => x.name.trim().toLowerCase() === n)
  return !!t && /livestock/i.test(t.description || '')
}

/**
 * Every vessel of the quotation (at least one) is a livestock carrier: FD&D then offers no
 * cargo warranties or exclusions (P&I does the same through its cargo clauses)
 */
export function allLivestockCarriers(
  vessels: { vesselType?: string | null }[],
  types: { name: string; description?: string }[]
): boolean {
  return vessels.length > 0 && vessels.every((v) => isLivestockType(v.vesselType, types))
}
