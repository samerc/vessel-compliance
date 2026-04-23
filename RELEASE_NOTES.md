## 7.6.0

### Entity Documents (Configurable)
- Entity document types are now configurable in Admin Panel → Entity Document Types
- Add/edit/reorder/toggle document types with Company/Person/Both scope
- Existing 4 hardcoded types (CoI, AoA, KYC, ID/Passport) auto-migrated on upgrade
- All compliance reports, dashboard, and vessel detail use dynamic types

### AssuredManager Redesign
- New: Compact table + slide-in panel layout (replaces expanded row pattern)
- Panel shows entity details, documents, address, role editing, UBOs with doc scores
- Entity name editable inline from the panel

### Quotation Registry
- New: Excel-based quotation numbering system
- Reference format: Q/{R|N}/{branch}/{YY}/{serial}
- Configurable path in Admin Panel → File Paths
- Reads last serial from Excel, respects manually-added rows
- Cancelled numbers marked as CANCELLED in Remarks column

### Quotation Workflow
- New quotations auto-assigned initial workflow step
- canEdit/canExport step constraints enforced in editor
- Approved quotations are read-only with green banner
- Status flow: draft → approved → exported → converted
- Workflow log visible via History button in editor
- Step deletion blocked when quotations exist on the step

### Quotation Lock System
- New: Heartbeat every 2 min keeps lock alive while editing
- Inactivity detection: after 10 min idle, heartbeat stops
- Lock expiry reduced from 30 min to 5 min
- Admin force-unlock button in quotation list actions column
- Locked quotations fully blocked from opening (not read-only)

### Quotation Export
- Date always shows today (not creation date)
- Revision shown as centered "Rev.N" below title
- Reference includes /RN suffix for revisions
- Filename: {subject} - {type} Quote {year} - {broker}
- TBA shown as Registered Owners when no assureds defined
- Previous premium shown in red with UPCC discount
- Draft export for users without approve permission

### Premium Features
- New: Pro-rata premium with auto-detection from period text
- New: Outstanding premium notice (checkbox + configurable text + bold/underline)
- New: Full premium in case of loss notice (checkbox + configurable text)
- Cargo: Rate-based premium with auto-calculation
- Deductible amounts show thousand separators (MoneyInput)
- Previous premium and deductible values are now editable

### Credit Advice
- Broker name + address shown at top from quotation customer
- Broker excluded from Insured section
- Commission wording configurable in Policy Settings

### Survey Warranty Templates
- New: Title field for easy reference
- New: {surveyor} and {dateofsurvey} placeholders
- Templates and selected warranties visually separated in editor

### UI/UX Improvements
- P&I Conditions split into Clauses + Additional Clauses sub-tabs
- Hull Conditions split into 3 sub-tabs (Conditions, Additional, Custom)
- Exclusions tab: Select All / Deselect All buttons
- Deductible row density reduced (previous amounts on second row)
- Classification change confirmation: Replace or Add Alongside
- IACS classification always displayed first when dual-classed
- Sidebar reorganized: Renewals → Business, Calculators → Operations, File Manager → Admin, Fleet Analytics → Reports
- Theme fixes: isLight check includes aurora theme across all components
- Dashboard widget grid fixed (no more empty space)
- Dashboard cards have visible borders in light mode

### File Path Resolution
- New: Configurable local↔network path mapping for VPN users
- Auto-detects server vs remote from db-config host
- Upload blocking for files not on the shared folder

### Other
- Editable username and full name for users
- TBA vessel checkbox for cargo quotations
- Quotation reference numbers include year (Q/P/26/1)
- Starting serial configurable in Quotation Settings
- Cargo warranties only visible when cargo clause selected
- War excess export fixes (interest, sum insured, premiums)
- Abandoned draft auto-cleanup (created <60s ago + no vessels)
- Renewal quotations get quotationDate set (visible in list)
- Period table: fixed double space between time and timezone
