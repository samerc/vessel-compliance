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
    version: '6.4.3',
    date: 'March 2026',
    items: [
      { tag: 'Fixed', text: 'Hull conditions export now filtered by selected clause — no more conditions from other clauses' },
      { tag: 'Fixed', text: 'Additional clauses in both P&I alternatives correctly appear in "Applicable to both" section' },
      { tag: 'Fixed', text: 'DDQ countries sorted alphabetically, non-refundable text stripped of HTML tags' },
      { tag: 'Fixed', text: 'Hull premium spacing — removed extra empty lines between Technical and Payable' },
      { tag: 'Improved', text: 'NCB/UPCC editors larger (120px), template selector always visible with helpful empty state' },
      { tag: 'New', text: 'Document status left borders — expired (red), expiring soon (amber), missing (red) in both table and card views' },
      { tag: 'Improved', text: 'RichTextEditor sharper rendering — fixed font stack, antialiased smoothing, consistent borders' },
      { tag: 'New', text: 'Tab instructions added to Exclusions, Deductibles, Subjectivities, Survey Warranties, Information' },
    ],
  },
  {
    version: '6.3.1',
    date: 'March 2026',
    items: [
      { tag: 'Fixed', text: 'RBAC enforcement across 14 components — write actions now properly gated by permissions' },
      { tag: 'Improved', text: 'Activity log — 18 additional handlers, name resolution instead of UUIDs, retention setting' },
      { tag: 'Improved', text: 'Activity log table — distinct module/action pill colors, professional design' },
      { tag: 'Improved', text: 'Quotation Settings — section descriptions, consistent styling, glass-card Standard Texts' },
      { tag: 'Fixed', text: 'P&I date resolution for annual documents with multi-policy picker' },
      { tag: 'New', text: 'NumberInput component with automatic thousand separator formatting' },
      { tag: 'Fixed', text: '19 hardcoded danger colors replaced with var(--danger) across 7 components' },
      { tag: 'Fixed', text: 'Removed 8 debug console.log statements' },
    ],
  },
  {
    version: '6.3.0',
    date: 'March 2026',
    items: [
      { tag: 'New', text: 'Activity Log — centralized audit trail for all system actions with filters, colored badges, and pagination' },
      { tag: 'New', text: 'Email Template System — create templates with 16 placeholders, category tabs, and copy to clipboard' },
      { tag: 'New', text: 'Database Backup & Restore — one-click backup to JSON and restore from Admin Panel' },
      { tag: 'New', text: 'Customer Portfolio PDF — per-customer summary with vessels, policy coverage, compliance, and open warranties' },
      { tag: 'New', text: 'Renewal Pipeline Report — upcoming renewals with premium amounts, KPI cards, sortable table, and Excel export' },
      { tag: 'New', text: 'Dashboard Data Quality Alerts — flags vessels without customers, entities missing contact info' },
      { tag: 'New', text: 'Selective Vessel Export — choose which vessels to include in ZIP exports' },
      { tag: 'Improved', text: 'Performance — 10 heavy components lazy-loaded for faster startup' },
      { tag: 'Improved', text: 'RBAC — new permissions for email templates, backup/restore, activity log, and analytics presets' },
      { tag: 'Improved', text: 'Activity logging across 18 operations with entity names and change details' },
    ],
  },
  {
    version: '6.2.0',
    date: 'March 2026',
    items: [
      { tag: 'New', text: 'Role-Based Access Control (RBAC) — create custom user groups with granular permissions across all modules' },
      { tag: 'New', text: 'User Groups — assign users to multiple groups with per-user permission overrides' },
      { tag: 'New', text: 'UI enforces permissions — sidebar items, buttons, and pages hidden based on user access' },
      { tag: 'New', text: 'Fleet Analytics redesign — professional dashboard with advanced filters, KPI cards, distribution tables, and bracket analysis' },
      { tag: 'New', text: 'Analytics filter presets — save and load your favorite filter combinations' },
      { tag: 'New', text: 'Analytics export — PDF report with branded header and Excel workbook with 8 sheets' },
      { tag: 'Improved', text: 'User Management redesigned with card layout showing groups, permissions count, and version indicators' },
    ],
  },
  {
    version: '6.0.0',
    date: 'March 2026',
    items: [
      { tag: 'New', text: 'Quotation Builder — create P&I, Hull, War Risk, FD&D, Loss of Hire, and Cargo quotations with a full tabbed editor' },
      { tag: 'New', text: 'P&I Conditions: clause presets (Full Cover, Restricted, etc.), warranties with sets and bulk import, deductibles, exclusions, and limits of liability' },
      { tag: 'New', text: 'Hull Conditions: agreed value, hull clause selection, configurable conditions, and Increased Value (IV) support' },
      { tag: 'New', text: 'Alternatives: create multiple coverage options per quotation — each with its own conditions, warranties, deductibles, exclusions, and premium' },
      { tag: 'New', text: 'Premium Management: per-vessel and per-alternative premiums, NCB/UPCC discounts, instalment schedules, and non-refundable options' },
      { tag: 'New', text: 'Revisions & Duplication: revise sent quotations with version tracking, or duplicate to quickly create similar quotations' },
      { tag: 'New', text: 'Export quotations to PDF and Word (DOCX) with professional formatting and configurable section ordering' },
      { tag: 'New', text: 'Quotation Settings: manage clause presets, warranty sets, deductible templates, trading warranty templates, section text defaults, and more' },
      { tag: 'New', text: 'Entity addresses: add multiple addresses per entity and assign per vessel role directly from the vessel page' },
      { tag: 'New', text: 'Premium theme: a sophisticated burgundy-accented dark theme alongside Dark and Light' },
      { tag: 'Improved', text: 'All dates unified to dd/mm/yyyy format across the entire app' },
      { tag: 'Improved', text: 'Dynamic Address Book: searchable flag state dropdown and new "All" export option' },
      { tag: 'Improved', text: 'Search added to policy renewals page' },
    ],
  },
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
