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
    version: '5.3.28',
    date: 'March 2026',
    items: [
      { tag: 'New', text: 'War Breach Calculator: save records to history with full calculation detail view' },
      { tag: 'New', text: 'Export to Excel and Copy for Email from saved War Breach records' },
      { tag: 'New', text: 'Entity Directory: Find Duplicates button detects near-matching entity names' },
      { tag: 'New', text: 'Open file location button on all vessel documents and entity files' },
      { tag: 'Improved', text: 'Fleet view redesigned with sortable columns and enhanced slide-in panel' },
    ],
  },
]
