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

/** 16 March 2026 — long display with full month name */
export function formatDateLong(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** YYYY-MM-DD — ISO format for filenames and storage */
export function formatDateISO(date?: Date): string {
  const d = date || new Date()
  return d.toISOString().split('T')[0]
}
