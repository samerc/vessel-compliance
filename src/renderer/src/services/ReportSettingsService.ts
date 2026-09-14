import type { ReportSettings } from '../../../shared/types'

export const REPORT_SETTINGS_DEFAULTS: ReportSettings = {
  companyName: 'Al Bahriah Insurance & Reinsurance SAL',
  companySubtitle: '',
  footerText: 'Al Bahriah Insurance & Reinsurance SAL — Confidential',
  primaryColor: [28, 52, 95],
}

/** Reports that support custom intro/end text (shown in Admin → Report Settings → Report Texts).
 *  Add a report here and read its text via getReportText() in that report's exporter. */
export interface CustomizableReport {
  key: string
  label: string
  /** Seeded default for the End text — shown when the user hasn't configured one. */
  defaultEnd?: string
}

export const CUSTOMIZABLE_REPORTS: CustomizableReport[] = [
  {
    key: 'conditionSurveyDefects',
    label: 'Condition Survey — Defects Report',
    defaultEnd: 'Subject to the terms, conditions and warranties of the policy.'
  }
]

/** Resolve the effective intro/end text for a report. End falls back to the catalog default
 *  only when it was never configured (undefined); an explicit empty string suppresses it. */
export function getReportText(
  settings: ReportSettings,
  key: string
): { intro: string; end: string } {
  const stored = settings.reportTexts?.[key]
  const def = CUSTOMIZABLE_REPORTS.find((r) => r.key === key)
  return {
    intro: stored?.intro ?? '',
    end: stored?.end ?? def?.defaultEnd ?? ''
  }
}

/** Split a configured text block into paragraphs (blank lines separate paragraphs). */
export function reportTextParagraphs(text: string): string[] {
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
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
