// Statement of Account settings (app_settings key `statement_settings`). Kept apart from the
// Word export so the Statement page can load them without loading the docx library.

export interface StatementTitleOption {
  title: string
  /** Text above the table. Placeholders: {to} {date} {reference} {total} */
  intro: string
  /** Text below the table. Same placeholders */
  closing: string
}

export interface StatementSettings {
  titles: StatementTitleOption[]
  /** Printed column names, keyed by the Excel header ("Num" -> "Debit Note No.") */
  columnLabels: Record<string, string>
  /** Text put in the Reference box of a new statement (e.g. "SOA/26/") */
  referencePrefix: string
  /** Table font size in points */
  fontSize: number
}

export const STATEMENT_SETTINGS_KEY = 'statement_settings'

export const STATEMENT_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: '{to}', label: 'Addressed to' },
  { key: '{date}', label: 'Statement date' },
  { key: '{reference}', label: 'Reference number' },
  { key: '{total}', label: 'Total due (per currency)' }
]

export const DEFAULT_STATEMENT_SETTINGS: StatementSettings = {
  titles: [
    {
      title: 'Statement of Account',
      intro: 'Please find below the statement of your outstanding premiums as at {date}.',
      closing: 'Kindly arrange settlement of the above at your earliest convenience.'
    },
    { title: 'Invoice', intro: '', closing: '' }
  ],
  columnLabels: {},
  referencePrefix: '',
  fontSize: 9
}

export async function loadStatementSettings(): Promise<StatementSettings> {
  try {
    const raw = await window.api.getSetting(STATEMENT_SETTINGS_KEY)
    if (raw && typeof raw === 'string') {
      const p = JSON.parse(raw) as Partial<StatementSettings>
      return {
        ...DEFAULT_STATEMENT_SETTINGS,
        ...p,
        titles:
          Array.isArray(p.titles) && p.titles.length > 0
            ? p.titles
            : DEFAULT_STATEMENT_SETTINGS.titles,
        columnLabels: p.columnLabels || {}
      }
    }
  } catch {
    /* defaults */
  }
  return DEFAULT_STATEMENT_SETTINGS
}

export async function saveStatementSettings(s: StatementSettings): Promise<void> {
  await window.api.setSetting(STATEMENT_SETTINGS_KEY, JSON.stringify(s))
}
