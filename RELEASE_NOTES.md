## Policy System

- New: **Quotation to Policy conversion** — 6-step wizard: vessel & alternative selection, period with dates/times/timezone, instalments, commission & bank, blue cards (P&I), review & confirm
- New: **Policy documents** — full DOCX export matching real templates with opening clause, insured with addresses, vessel details, conditions, trading warranty, warranties, deductibles, exclusions, subjectivities, premium payment section
- New: **Debit Advice & Credit Advice** — DOCX exports with premium/commission in figures and words, instalment schedules, bank details
- New: **Blue Card management** — issue, reissue, edit for BBC/WRC/MLC4.2/MLC2.5.2 certificates with owner override, port of registry selection, flag state ratification checks, cancel & replace logic
- New: **Policy revisions** — create revision with cancel & replace footer, old version superseded
- New: **Policy editing** — unified 4-tab interface (Overview, Insured, Premium, Coverage) with "Edit Coverage in Quotation" link
- New: **Policy list** — searchable, filterable table with conversion and export date tracking
- New: **Policy Settings** — dedicated settings page with General/P&I/Hull/War tabs for opening clause, closing text, important notice, premium intro, font size, timezones, page numbering, footer text, header titles, banks, cancel & replace templates, blue card texts

## Renewals

- New: **Policy renewal** — "Renew" button creates a new quotation pre-filled from the expiring policy with +1 year period and refreshed vessel details
- New: **Change highlighting** — renewal quotation DOCX exports show differences from the original in red text (added items) and red strikethrough (removed items)
- Improved: **Unified Renewals page** — merged Renewals and Renewal Pipeline into one page with KPI cards, policy type filters, premium column, days-until-expiry (color-coded), footer summary

## Notifications & Notes

- New: **Personal notification system** — bell icon with unread badge in sidebar, full notifications page with filters (All/Unread/Notes/Policies/System)
- New: **Notification groups** — route notifications to teams (Compliance, Underwriting, Operations) with configurable event subscriptions
- New: **Daily alert scheduler** — automated checks for expiring documents, policies, blue cards, and warranty deadlines with configurable thresholds
- New: **Threaded note replies** — reply to notes with indented thread view and inline reply input
- New: **@mentions** — type @ to mention users with autocomplete dropdown; mentioned users receive notifications

## Accounting Integration

- New: **QuickBooks Excel export** — 64-column format matching accounting system template with deductible encoding, exchange rates, conditions summary
- New: **Deductible letter codes** — configurable per deductible for compact encoding (e.g., C10P5O25)
- New: **Base currency setting** — with exchange rate per policy when currency differs

## Dashboard & Navigation

- New: **Customizable dashboard** — 12 widgets with per-user layout, edit mode to add/remove/reorder, first-time onboarding overlay
- New: **Deadline calendar widget** — monthly calendar grid with colored dots for policy/document/survey/warranty events
- New: **Global search (Ctrl+K)** — search across vessels, entities, quotations, and policies with keyboard navigation
- New: **Recent items** — sidebar section showing last 8 viewed items with auto-tracking
- New: **Breadcrumbs** — navigation path shown when 2+ levels deep
- New: **Quick Actions widget** — shortcuts to create vessels, quotations, entities

## Reports & Analytics

- New: **Customizable Report Builder** — 9 data sources (Vessels, Policies, Entities, Renewals, Quotations, Policy Documents, Documents, Surveys, Warranties), column/filter/group selection, chart view, save/share templates
- New: **Chart view** — horizontal bar charts with metrics (Count, Sum Premium, Avg Premium, Total Defects)
- New: **Audit report PDF** — export filtered activity log as formal audit trail document

## Compliance

- New: **Data Quality tab** — 8 built-in validation rules (vessels without customer, entities without email, orphaned entities, etc.)
- New: **Custom validation rules** — create rules with entity type, field, operator, value, severity; integrated in Data Quality tab
- New: **Duplicate entity detection** — Jaro-Winkler similarity check when creating entities, warns of similar names

## Templates

- New: **Unified Templates page** — merged email and document templates into one system
- New: **Document templates** — rich text editor with placeholder insertion ({{vesselName}}, {{policyNumber}}, etc.), generate DOCX or copy text
- New: **Placeholder auto-fill** — connect templates to vessel/entity/policy data for automatic filling

## Flag States

- New: **Convention ratification tracking** — Bunker (2001) and Wreck Removal (2007) ratification flags per flag state
- New: **Maritime authority** — name and address per flag state for blue card addressing
- New: **Ports of registry** — multiple ports per flag state with default selection
- New: **Display name** — formal/official name for use in policy documents and blue cards
- Redesigned: **Flag State Directory** — table + slide-in panel layout with stats strip

## Vessel Enhancements

- New: **Rebuilt year** — hidden expandable field on vessel edit, shown as "1972/1992" in exports
- New: **Vessel timeline** — aggregated events from 6 sources with type filters, date range, merged same-day events
- New: **Vessel comparison** — select 2 vessels in filter results for side-by-side comparison
- New: **Per-vessel hull clauses** — each vessel in a multi-vessel quotation can have different conditions
- New: **Export all policies (Excel)** — per-vessel policy data export from vessel detail

## User Experience

- New: **Table row density** — compact/normal/spacious toggle in user profile dropdown
- New: **Column preferences** — per-user show/hide columns on 10+ tables, saved to database
- New: **Bulk operations** — multi-select with toggle on vessel and entity tables (assign fleet, change status, export, delete)
- New: **Right-click context menu** — Cut/Copy/Paste/Select All on all fields
- Improved: **Print-friendly CSS** — @media print styles for clean paper output

## Performance & Stability

- Various bug fixes and performance improvements across quotation export, policy export, blue card generation, and UI rendering
- Extended audit trail logging across more modules
- Improved RBAC enforcement on all recently built features
- UI polish: animations, hover effects, custom scrollbars, input focus glow, toast animations
