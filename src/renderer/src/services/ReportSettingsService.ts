import type { ReportSettings } from '../../../shared/types'

export const REPORT_SETTINGS_DEFAULTS: ReportSettings = {
  companyName: 'Al Bahriah Insurance & Reinsurance SAL',
  companySubtitle: '',
  footerText: 'Al Bahriah Insurance & Reinsurance SAL — Confidential',
  primaryColor: [28, 52, 95],
}

let cache: ReportSettings | null = null

export async function getReportSettings(): Promise<ReportSettings> {
  if (cache) return cache
  const data = await window.api.reportSettingsGet()
  cache = { ...REPORT_SETTINGS_DEFAULTS, ...data }
  return cache
}

export async function saveReportSettings(settings: ReportSettings): Promise<void> {
  await window.api.reportSettingsSet(settings)
  cache = { ...settings }
}

export function invalidateReportSettingsCache(): void {
  cache = null
}

// ── Helpers for PDF consumers ──────────────────────────────────────────────

export function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Derive a lighter tint of the primary color for vessel/sub-header rows */
export function tintColor(
  rgb: [number, number, number],
  factor = 0.8
): [number, number, number] {
  return rgb.map((c) => Math.round(c + (255 - c) * factor)) as [number, number, number]
}
