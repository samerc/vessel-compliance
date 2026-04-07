/**
 * Centralized date formatting utilities.
 * All date display in the app should use these functions for consistency.
 * Standard format: dd/mm/yyyy (e.g. 16/03/2026)
 */

/** dd/mm/yyyy — primary display format */
export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

/** dd/mm/yyyy HH:mm — date with time */
export function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${mins}`
}

/** 16 Mar 2026 — short display with month name */
export function formatDateShort(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** May 1, 2026 — long display with full month name, no leading zero on day */
export function formatDateLong(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''
  let d: Date
  if (typeof dateStr === 'string') {
    // For date-only strings (YYYY-MM-DD), parse as local date to avoid timezone shift
    const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (parts) {
      d = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    } else {
      d = new Date(dateStr)
    }
  } else {
    d = dateStr
  }
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/** 16 Mar 2026 or '-' — short display with dash fallback for empty values */
export function formatDateOrDash(dateStr: string | Date | null | undefined): string {
  return formatDateShort(dateStr) || '-'
}

/** YYYY-MM-DD — ISO format for filenames and storage */
export function formatDateISO(date?: Date): string {
  const d = date || new Date()
  return d.toISOString().split('T')[0]
}
