export type WhatsNewTag = 'New' | 'Improved' | 'Fixed'

export interface WhatsNewItem {
  tag: WhatsNewTag
  text: string
}

export interface WhatsNewEntry {
  version: string
  date: string
  items: WhatsNewItem[]
}

/**
 * Add a new entry at the TOP whenever you ship a new version.
 * The version string must match package.json exactly.
 */
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '5.4.1',
    date: 'March 2026',
    items: [
      { tag: 'Fixed', text: 'Annual documents now correctly read the P&I policy expiry from active dynamic policies instead of showing "No P&I policy expiry set"' },
      { tag: 'Fixed', text: 'Editing vessel details no longer creates false audit log entries for Gross Tonnage (e.g. "4737.00 → 4737")' },
      { tag: 'Fixed', text: 'Classification society combo now correctly pre-selects the saved value when opening a vessel in edit mode' },
      { tag: 'Improved', text: 'Address book redesigned with a two-panel layout — sticky filter sidebar with collapsible sections and a clean results card with icon-prefixed contact cells' },
    ],
  },
  {
    version: '5.4.0',
    date: 'March 2026',
    items: [
      { tag: 'Improved', text: 'Fleet Analytics redesigned: professional KPI cards, column histogram charts for age and tonnage, OFAC status pill badges, and percentage annotations on all charts' },
      { tag: 'New', text: 'War Breach Calculator: save records to history with full calculation detail view' },
      { tag: 'New', text: 'Export to Excel and Copy for Email from saved War Breach records' },
      { tag: 'New', text: 'Entity Directory: Find Duplicates button detects near-matching entity names' },
      { tag: 'New', text: 'Open file location button on all vessel documents and entity files' },
      { tag: 'Improved', text: 'Fleet view redesigned with sortable columns and enhanced slide-in panel' },
    ],
  },
]
