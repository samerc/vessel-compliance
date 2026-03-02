# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
npm install          # Install dependencies (runs electron-builder install-app-deps)
npm run dev          # Start development server with hot reload
npm run build        # Full production build (typecheck + electron-vite build)
npm run build:win    # Build Windows executable
npm run build:mac    # Build macOS dmg
npm run build:linux  # Build Linux packages
```

## Code Quality Commands

```bash
npm run typecheck       # Full TypeScript check (node + web)
npm run typecheck:node  # Check main process only
npm run typecheck:web   # Check renderer process only
npm run lint            # ESLint with caching
npm run format          # Prettier formatting
```

## Architecture

This is an Electron desktop application for maritime vessel compliance management using IPC-based architecture:

### Process Structure
- **Main Process** (`src/main/`) - Handles MySQL database operations, file I/O, authentication, and OFAC screening
- **Preload Script** (`src/preload/`) - Bridges main and renderer via IPC, exposing `window.api`
- **Renderer Process** (`src/renderer/src/`) - React UI with Context API for state management

### Tech Stack
- Electron + electron-vite + React 19 + TypeScript
- MySQL via mysql2/promise (externalized from Vite bundling)
- bcryptjs for password hashing, UUID for ID generation
- Vanilla CSS with glassmorphic design system and light/dark theme support
- jsPDF + xlsx for report exports
- sanctions.network API for OFAC/sanctions screening

### Key Patterns
- **Database**: Auto-migrating schema in `src/main/mysql/adapter.ts` with schema defined in `schema.sql`
- **State**: React Context for auth (`AuthContext.tsx`), theme (`ThemeContext.tsx`), and notifications (`ToastContext.tsx`)
- **IPC**: All database operations exposed through preload's `window.api` interface
- **Types**: Shared interfaces in `src/shared/types.ts`

### Toast Notifications
Global notification system for user feedback:
- **ToastContext** (`src/renderer/src/contexts/ToastContext.tsx`): Provides `showToast`, `showError`, `showSuccess` functions
- **Usage**: `const { showError, showSuccess } = useToast()` in any component
- **Types**: `success` (green), `error` (red), `warning` (yellow), `info` (blue)
- **Auto-dismiss**: Toasts disappear after 5 seconds, can also be manually dismissed
- **Styling**: Theme-aware colors, slide-in animation (`.toast-enter` CSS class)
- **Position**: Fixed bottom-right corner with stacking support

### Authentication & Security
- **Session Management**: Window-based sessions in main process with 2-hour timeout and activity refresh
- **Rate Limiting**: 5 login attempts per 15-minute window before 15-minute account lockout
- **Admin Protection**: Setup and configuration IPC handlers require admin session validation
- **File Validation**: Backend validation of file extensions against admin-configured allowlists/blocklists
- **Password Security**: bcrypt hashing with salt rounds, no plaintext storage

### Theme System
- **User-Specific Themes**: Each user's theme preference (light/dark) is stored in the database (`users.theme_preference`)
- **Context Integration**: `ThemeContext` watches for user changes via `AuthContext` to reload themes on login/logout
- **CSS Variables**: Theme styles use CSS custom properties (`var(--text-primary)`, `var(--bg-primary)`, etc.) that adapt to current theme
- **Light Mode**: Activated by adding `.light` class to document.body, all components use theme-aware variables

### Sanctions Screening
The app integrates with sanctions.network API for OFAC/UN/EU sanctions checking:
- **API calls in main process** (`src/main/index.ts` - `ofac:checkSanctions` handler) to avoid CORS
- **OfacService** (`src/renderer/src/services/OfacService.ts`) - thin wrapper calling IPC
- **SanctionsModal** (`src/renderer/src/components/SanctionsModal.tsx`) - displays potential matches
- **Status flow**: `PENDING` → `POTENTIAL_MATCH` (yellow, needs review) → `CLEARED` or `MATCH` (user decision)
- Each component with sanctions badges (VesselManager, AssuredManager, EntityDirectory) has its own `OfacBadge` component that must handle all statuses
- **Loading States**: OfacBadge shows "CHECKING..." spinner during API calls
- **Theme-Aware Colors**: Badge colors adapt for light/dark mode (darker colors in light mode for readability)

### Scheduled Compliance Checks
Automated weekly sanctions screening for all entities and vessels:
- **Scheduler** (`src/main/index.ts`): Background timer runs compliance checks on configured schedule
- **Settings** (Admin Panel): Enable/disable, day of week, time, match threshold (50-100%), include vessels, skip cleared
- **Match Threshold**: Only matches above configured score (default 85%) are flagged as `POTENTIAL_MATCH`
- **Results Storage**: `compliance_check_logs` table stores run history, `compliance_check_results` stores individual matches
- **Review Workflow**: Pending results shown in Compliance Center → Sanctions Screening tab
- **Desktop Notifications**: System notification when matches are found (if supported)
- **Manual Trigger**: "Run Now" button in Admin Panel for immediate check
- **IPC Handlers**: `compliance:getScheduleSettings`, `compliance:setScheduleSettings`, `compliance:runManualCheck`, `compliance:getCheckLogs`, `compliance:getCheckResults`, `compliance:getPendingResults`, `compliance:markResultReviewed`

### Condition Surveys
Vessel inspection tracking with defects management:
- **Surveyors**: Directory of surveyor companies (`SurveyorDirectory.tsx`) — table + slide-in panel layout (see UI Pattern below). Stats strip: Total Surveyors / Total Surveys / Open Surveys. Slide-in panel shows per-surveyor survey history with OPEN / CLOSED / NO DEFECTS status computed from defects (open=0 → CLOSED, no defects → NO DEFECTS). Add/Edit via modal.
- **Surveys**: Condition surveys attached to vessels (`ConditionSurveyManager.tsx`) with date, surveyor, type, location
- **Survey List**: Cross-vessel survey overview (`ConditionSurveyList.tsx`) with search, navigates directly to vessel's survey section
- **Defects**: Each survey can have multiple defects (`DefectManager.tsx`) with severity (optional), status (OPEN/CLOSED), due dates
- **Defect Notes**: Notes button visible for all defects with notes (not just closed), shows both general notes and closure notes
- **Attachments**: Multiple file attachments per survey (reports, photos, certificates)
- **Survey Status**: Automatically shows "SURVEY CLOSED" when all defects are closed
- **Closure Tracking**: Defects track who closed them, when, and optional closure notes

### Survey Warranties & Follow-Up

Cross-vessel warranty and endorsement tracking system:

- **WarrantyManager** (`src/renderer/src/components/WarrantyManager.tsx`): Per-survey warranty management embedded in `ConditionSurveyManager`. Tracks warranty items with deadline type (date/voyage/voyage+date), reference number, status (OPEN/CLOSED), notes, and sent reminders.
- **SurveyFollowUp** (`src/renderer/src/components/SurveyFollowUp.tsx`): Fleet-wide survey follow-up page reachable from the sidebar. Shows all open warranties grouped by vessel, endorsements due, and reminder log.
- **Tables**: `survey_warranties` (id, survey_id, vessel_id, description, deadline_type, deadline_date, deadline_voyage, reference_number, status, notes), `warranty_reminders` (id, warranty_id, sent_at, next_reminder_date, notes)
- **Endorsements Due**: Computed from surveys with open defects past their due date; displayed in a dedicated tab
- **IPC Handlers**: `survey_warranty:getByVessel`, `survey_warranty:getAll`, `survey_warranty:create`, `survey_warranty:update`, `survey_warranty:delete`, `survey_warranty:getReminders`, `survey_warranty:addReminder`, `survey_warranty:getEndorsementsDue`
- **SQL alias rule**: All `sw.*` / `swr.*` wildcard selects must use explicit `column AS camelCaseName` aliases — MySQL returns raw snake_case, but TypeScript interfaces expect camelCase

### Customer Assignment

Vessels can be assigned to a customer entity with a customer type:

- **Fields**: `customer_id` (FK to entities, soft reference) and `customer_type` ('broker' or 'direct') on the `vessels` table
- **Per-Vessel**: The same entity can be a broker for one vessel and a direct client for another
- **Indexed**: `idx_vessels_customer` index on `customer_id`
- **Orphan Cleanup**: Deleting an entity clears `customer_id`/`customer_type` on its vessels (no CASCADE)

### Fleet Management

Dual-view fleet management page (`src/renderer/src/components/FleetManager.tsx`):

- **Default view**: By Fleet (tab order: By Fleet → By Customer)
- **Stats strip**: Total Fleets / Assigned Vessels / Unassigned (amber if > 0)
- **By Fleet view**: toolbar with search + "Add Fleet" button; "Add Fleet" expands an inline form (not a permanent card). Fleet table with slide-in panel (380px):
  - **Panel — Vessels in Fleet**: compact list of assigned vessels with immediate remove button (`UserMinus`) per row and external-link to vessel detail
  - **Panel — Add Vessels**: collapsible section below; shows only vessels NOT in this fleet with checkboxes + search filter. "Add N Vessels" confirm button appears once ≥ 1 is checked; batch API save on confirm
  - Remove is immediate (single API call); add is multi-select then batch-confirmed
- **By Customer view**: Vessels grouped under customer entities, split into Brokers / Direct Clients / Unassigned sections; collapsible with glass-card styling; customer type filter and text search
- **Flag Column**: Fleet and customer vessel tables show flag icons

### Entity Directory

Entity management page (`src/renderer/src/components/EntityDirectory.tsx`) — table + slide-in panel layout (see UI Pattern below):

- **Stats Row**: Total entities, companies, persons counts (derived from `allEntities` — full unfiltered list)
- **Table columns**: Name | Type | Sanctions (OfacBadge) | Documents (compliance score) | Vessels (count)
- **Slide-in panel (400px)**: profile header (shows "UBO of: [Company]" with Link2 icon for persons), document status section, associated vessels as compact list rows
- **`allEntities` state**: full unfiltered entity list loaded alongside paginated data; used for all lookups (`getAssociatedVessels`, `getParentCompanies`, counts). Using paginated `entities` for lookups caused "undefined (role)" in vessel cards when parent was on a different page.
- **`getParentCompanies(entityId)`**: finds parent companies for UBO persons via `entityUBOs.filter(eu => eu.uboEntityId === entityId).map(eu => allEntities.find(...))`
- **`getDocScore(entity)`**: returns `{ have, total }` for document compliance indicator column
- **Edit Modal**: Modify entity name, type, identifier, email(s), phone
- **Create Entity**: Modal with auto-sanctions check after creation (shows spinner)
- **Delete**: With confirmation warning about linked vessels; clears customer references
- **Vessel Navigation**: Clicking vessel names navigates to VesselDetail

### Entity Documents
Required documents vary by entity type:
- **Companies**: Certificate of Incorporation, Articles of Association, KYC
- **Persons**: ID/Passport only (no KYC required)
- **UBOs**: Same document requirements based on their type (company or person)

### Annual Document Compliance Rule

For `annualRenewal = true` document types, the effective expiry is inherited from the active P&I policy via `resolveEffectivePolicyExpiry()` (`src/renderer/src/utils/policyUtils.ts`) instead of the document's own expiry date.

- **Short-cycle rule**: if `(expiryDate − receivedDate) < 60 days`, the document is treated as **Compliant** even when it would otherwise be flagged "Expiring Soon". Rationale: a document placed today against a P&I policy expiring in 30 days was intentionally uploaded knowing its short remaining life.
- **Helper**: `annualShortCycle(expiry, received)` — returns `true` if span < 60 days
- **Applied in**: `VesselDocumentsView.tsx` (`getDocStatus`), `ReportService.ts` (`getDocStatus` / `getExcelDocStatus`), `ReportServiceV2.ts` (`getStatus`), `Dashboard.tsx` (`allAlerts` memo)

### Window Preferences
- **Per-User Storage**: Window size and position stored in database per user (`users.window_width`, `window_height`, `window_x`, `window_y`)
- **Auto-Save**: Window bounds saved on resize/move when user is logged in
- **Auto-Restore**: User's window preferences applied on login via `setBounds`

### Compliance Center
Centralized compliance monitoring with two tabs:
- **Document Alerts Tab**: Missing required files, expired documents, expiring soon (30 days)
- **Policy Alerts Tab**: View button navigates to vessel's policies section
- **Sanctions Screening Tab**:
  - Pending reviews table with expandable match details
  - Mark as reviewed action updates result status
  - Check history sidebar showing all compliance runs with status/counts

### Document Reminders

Vessel document expiry monitoring and notification system:

- **ReminderCenter** (`src/renderer/src/components/ReminderCenter.tsx`): Main reminders page with vessel-level grouping
- **Data**: Aggregates missing/expired vessel documents and assured entity documents per vessel
- **Filters**: Search by vessel name/IMO, filter by fleet, toggle snoozed vessels
- **Snooze**: Per-vessel snooze with configurable period (admin-set default in System Setup)
- **Copy to Clipboard**: Generates formatted text per vessel or per fleet using admin-configured template
- **Template Variables**: `{vesselName}`, `{imoNumber}`, `{vesselDocuments}`, `{assuredDocuments}`
- **Settings** (Admin Panel → Vessel Reminder Settings): Snooze period (days) and clipboard template
- **IPC Handlers**: `reminders:getSettings`, `reminders:setSettings`, `reminders:getVesselReminders`, `reminders:snoozeVessel`, `reminders:unsnoozeVessel`

### Calculators

Extensible calculator section with sub-navigation for insurance calculation tools:

- **Calculators wrapper** (`src/renderer/src/components/Calculators.tsx`): Tab-based container for multiple calculators
- **Pro-Rata Premium Calculator** (`src/renderer/src/components/PremiumCalculator.tsx`):
  - Computes pro-rata premiums based on actual policy duration vs standard period
  - **Day counting**: DST-safe using calendar-day objects (not raw millisecond division); adds 1 day if end time-of-day > start time-of-day
  - **Instalment logic**: Based on annual premium / number of instalments as the base instalment amount; checks how many full annual instalments the pro-rata covers; remainder goes in first instalment
  - **Commission**: Same instalment pattern applied to commission (annual commission / instalments as base)
  - **Calculation Steps**: All 10 intermediate steps displayed in the results section for transparency
  - **Pure calculator**: No database persistence, instant reactive computation via `useMemo`
- **TLO Rate Calculator** (`src/renderer/src/components/TLORateCalculator.tsx`):
  - Calculates adjusted Total Loss Only premium when vessel value changes
  - **6-step calculation**: Current rate, rate/3, value difference, additional premium, new premium, new rate
  - **Pure calculator**: No database persistence, instant reactive computation via `useMemo`

### Sanctions Search

Ad-hoc sanctions lookup page (`src/renderer/src/components/SanctionsSearch.tsx`):

- **Per-User Threshold**: Minimum match threshold (10-95%) persisted to `users.sanctions_threshold` column
- **IPC Handler**: `users:updateSanctionsThreshold` saves to DB and updates session cache
- **Source Filters**: Toggle OFAC, UN, EU sanctions lists independently
- **Results**: Expandable cards with match score, aliases, remarks, source IDs

### Admin Panel

System configuration page (`src/renderer/src/components/AdminPanel.tsx`) with collapsible sections (all collapsed by default):

1. **Document Types**: CRUD with drag-to-reorder and active/inactive toggle
2. **Assured Roles**: CRUD for entity role types
3. **Survey Types**: CRUD for condition survey types
4. **Policy Types**: CRUD with reorder for vessel policy classifications
5. **Scheduled Compliance Check**: Enable/disable, schedule, threshold, include vessels, skip cleared
6. **Vessel Reminder Settings**: Snooze period and clipboard template
7. **File Upload Security**: Allowed/blocked file extensions for uploads
8. **Database Configuration**: View/change MySQL connection settings
9. **Danger Zone**: Purge all vessels and entities (double confirmation required, admin-only)

- **Collapsible Pattern**: Uses `collapsedSections` state (`Set<string>`) with `toggleSection` function; each section header has ChevronRight/ChevronDown toggle
- **All sections collapsed by default**: Initial state includes all section IDs

### IPC Session Cache Pattern

When updating user-specific settings (theme, sanctions threshold, window preferences), the IPC handler must:

1. Save to database via adapter method
2. Update the in-memory session cache (`auth.getSessionData(sessionId).user.field = value`)

Without step 2, `auth:getSession` returns stale data until next login.

### Custom Vessel Document Types

Per-vessel custom document types beyond the global admin-defined ones:

- **Table**: `vessel_custom_doc_types` (id, vessel_id, name, description, order_index)
- **UI**: "Custom" button in VesselDetail document table header opens inline add form
- **Behavior**: Custom docs appear in same table after global types with "(Custom)" label
- **Reports**: Custom doc types included in PDF/Excel exports

### Policy Types & Vessel Policies

Classification system for vessel insurance policies:

- **Policy Types**: Admin-managed list with CRUD and reorder (`policy_types` table)
- **Vessel Policies**: Many-to-many assignment via `vessel_policies` table
- **VesselDetail**: Modal with checkbox list to assign/remove policy types per vessel
- **Dynamic Policies**: `vessel_dynamic_policies` with configurable characteristics per policy type (`policy_type_characteristics`)
- **Policy Values**: `vessel_policy_values` stores field values (text, date, number) per policy
- **Date Storage**: All policy dates stored in ISO `YYYY-MM-DD` format for MySQL comparison compatibility

### Policy Renewals

Monthly view of expiring policies (`src/renderer/src/components/PolicyRenewals.tsx`):

- **Month Selector**: Navigate months with arrows, "Today" button to jump to current month
- **Table Columns**: Vessel, IMO, Customer, Fleet, Policy Type, Policy Number, End Date, Actions (View)
- **Query**: Joins `vessel_dynamic_policies` → `vessel_policy_values` where characteristic name contains "end" and field_type is date
- **Filters**: Only active vessels (`v.is_active = TRUE`) and active policies (`vdp.status = 'active'`)
- **Export**: Excel export via `xlsx` library
- **IPC Handler**: `policies:getRenewalsByMonth`

### Vessel Active Status

Vessel lifecycle management with cascade behavior:

- **Field**: `vessels.is_active` (BOOLEAN, default TRUE)
- **Deactivation Cascade**: Setting `is_active = false` automatically sets all vessel's active policies to `'inactive'`
- **Filtered Views**: Renewals, survey list, and open defects queries all filter by `v.is_active = TRUE`
- **Audit Logged**: Status changes recorded in vessel audit history

### Dynamic Address Book (DAB)

Query builder for finding entity contacts across the fleet:

- **Component**: `DynamicAddressBook.tsx` within Directory page
- **Filters**: Policy types, flag states (with All/Unassigned), customer type, vessel status
- **Logic**: AND/OR toggle for combining filter criteria
- **Export**: Email only (default), phone only, or both; copy to clipboard
- **Results**: Table with entity name, type, contacts, associated vessels

### Vessel Excel Import

Bulk vessel import from Excel files (`src/main/vesselExcelImport.ts`):

- **Date Handling**: Excel serial dates converted to ISO `YYYY-MM-DD` via `excelDateToISO()` with Lotus 123 leap year bug correction
- **Fallback Parsing**: Text dates parsed via `new Date()` constructor
- **Migration**: Startup migration in `initializeSchema()` normalizes existing non-ISO dates in `vessel_policy_values`

### Vessel Filter

Advanced vessel search page (`src/renderer/src/components/VesselFilter.tsx`):

- **Filters**: Multiple criteria for filtering the vessel list
- **Navigation**: View button navigates to vessel detail
- **Searchable MultiSelect**: `MultiSelectDropdown` component auto-shows an inline search input when `options.length > 6` (e.g. flag states list). Auto-focuses on open via `useEffect([open, showSearch])`. Filters by both `label` and `sublabel`. Clears search on close.
- **Portal dropdowns**: Dropdowns rendered via `createPortal` to avoid clipping inside scrollable containers; positioned with `getBoundingClientRect` + flip-upward logic.

### Reports

Tab-based reports page (`src/renderer/src/components/Reports.tsx`) with sub-navigation:

- **LossRecordReport** (`src/renderer/src/components/LossRecordReport.tsx`): Imports Book1.xlsx (UWY in col 6), outputs a PDF grouped by Underwriting Year → vessel → claim

### Professional PDF Report (ReportServiceV2)

Vessel compliance PDF (`src/renderer/src/services/ReportServiceV2.ts`), exported via "PDF Report (Pro)" button in VesselDetail:

- **Color palette**: navy `[10,22,40]`, navyMid `[22,46,80]`, accent teal `[0,170,200]`, status greens/ambers/reds
- **Page chrome**: `drawPageHeader()` — navy bar + teal left stripe, company name, title, CONFIDENTIAL; `drawPageFooter()` — thin rule, generated date / company / page N/M; `drawSectionLabel()` — reusable navy 8mm section bar helper
- **Header rule**: page 1 header drawn manually; `didDrawPage` callback only redraws for `data.pageNumber > 1`; footers written entirely by post-processing loop for correct total
- **Score card** (top-right): rounded rect, 26pt rate% in rate color, "COMPLIANCE RATE" label, progress bar, compliant·total text. Height 36mm; positioned to clear stats strip via `Math.max(y + 28, scoreY + scoreH + 4)`
- **Stats strip**: 4 boxes — COMPLIANT / EXPIRING SOON / EXPIRED / MISSING. Counts include **both** vessel documents and all assured entity/UBO documents
- **Vessel docs table**: `autoTable`, 5 columns (Document, Description, Received, Expires, Status). Status column color-coded via `didParseCell`
- **Entity/UBO table**: single `autoTable` call, 3 columns (Entity/Document, Role/Type, Status). Row types tracked in parallel `entityRowMeta: EntityRowMeta[]` array, styled in `didParseCell` + `didDrawCell`:
  - `'entityHeader'`: navy bg, teal left stripe (2.5mm, drawn in `didDrawCell`), white name (9.5pt bold), accent role·type
  - `'uboBar'`: navyMid bg, "ULTIMATE BENEFICIAL OWNERS" indented at left: 12mm
  - `'uboEntityHeader'`: bgMid bg, navyMid left stripe (2mm), indented name (8.5pt bold)
  - `'doc'`: alternating white/bgLight (by `row.index % 2`), left padding 12mm, ON FILE (green) / MISSING (red) status pill
- **`resolveEffectivePolicyExpiry`**: utility at `src/renderer/src/utils/policyUtils.ts` — extracts P&I end date from dynamic policies for annual doc expiry resolution

### Quotations

Quotation management system:

- **QuotationManager** (`src/renderer/src/components/QuotationManager.tsx`): Main quotation list and management
- **QuotationEditor** (`src/renderer/src/components/QuotationEditor.tsx`): Create/edit quotation details
- **QuotationList** (`src/renderer/src/components/QuotationList.tsx`): Quotation listing view
- **QuotationSettings** (`src/renderer/src/components/QuotationSettings.tsx`): Quotation configuration
- **RichTextEditor** (`src/renderer/src/components/RichTextEditor.tsx`): Rich text editing for quotation content
- **Export**: `QuotationExportService.ts` with DOCX (`htmlToDocx.ts`) and PDF (`htmlToPdfText.ts`) export

### Vessel Detail Navigation

- **Sections**: Toggle between Documents, Assured, Surveys, Policies, and History views via `detailView` state
- **External Navigation**: `initialSection` prop allows navigating directly to any tab
- **Navigation Chain**: App.tsx → VesselManager (initialVesselSection) → VesselDetail (initialSection)
- **Section Values**: `'documents'`, `'assureds'`, `'surveys'`, `'policies'`, `'history'`
- **Auto-edit on add**: `VesselDetail` accepts `initialEditing?: boolean` prop → `useState(initialEditing)` opens in edit mode immediately. `VesselManager` sets `openInEditMode = true` after successful vessel creation; back handler resets it to `false`.
- **Searchable edit dropdowns**: Classification society and flag state fields use custom searchable dropdowns (`classSearch`, `flagDropdownOpen`, `flagSearch` states). Classification shows search input when `classSocieties.length > 6`; flag filters by name AND iso3Code. The flag `+` (add new) button is retained alongside the dropdown.

### Vessel History Tab (`VesselHistoryView`)

Redesigned history view inside `VesselDetail.tsx` (rendered when `detailView === 'history'`):

- **Stats strip**: 3 KPI cards — Total Changes / Contributors / Since (earliest entry date)
- **Search + field filter**: text search across field names and values; dropdown to filter by specific field
- **Date-grouped timeline**: entries grouped into Today / Yesterday / specific date labels; each group has a bold header + entry count badge
- **`getFieldMeta(fieldName)`**: returns `{ icon, color, bg }` by keyword category (name=blue, flag=purple, status=amber, imo=cyan, class=green, type=pink)
- **Entry row**: colored 3px left border + icon in rounded square, field name, old value (strikethrough) → new value (bold), Clock icon + time, "by username"

### Vessel Document Expiry Fixes (`VesselDocumentsView`)

- **Expiry clear button**: explicit `×` (`X` icon, 18px circle) button renders next to the expiry date input when a date is set; calls `updateVesselDocumentExpiry(..., null)` directly. Chromium date input native clear is unreliable for controlled React inputs.
- **No expiry inheritance**: `uploadDoc` sets `expiryDate: undefined` (not `existing?.expiryDate || undefined`) so a newly uploaded file never inherits the previous file's expiry date.

### Vessel List

- **Sanctions Column**: OfacBadge displayed in separate column (not inline with vessel name)
- **Flag Icons**: Flag state shown as icon next to vessel name using `flag-icons` CSS package

### Table + Slide-in Panel UI Pattern

Used across EntityDirectory, SurveyorDirectory, FleetManager (fleet view), and VesselHistoryView. Canonical pattern for list-detail pages:

- **Full-width table** on the left (`flex: 1`), selected row highlighted with `rgba(0,210,255,0.06)` background
- **Slide-in panel** on the right (fixed width, e.g. 380–400px): `background: isLight ? '#f4f6fb' : '#14172a'`, `border: '1px solid var(--glass-border)'`, `borderRadius: 12px`, `maxHeight: 'calc(100vh - 280px)'`, `overflowY: auto`
- Panel header: gradient icon circle (40–44px, borderRadius 10), bold title, secondary subtitle, close X button
- Clicking a table row opens the panel; clicking another row switches the panel content
- Panel content is always derived from already-loaded data (no extra API calls on row click)
- Stats strip above the table: 3–5 glass-card KPI cards with colored gradient icon circles

### Code Style
- Prettier: Single quotes, no semicolons, 100 char width, no trailing commas
- Path alias: `@renderer/*` maps to `src/renderer/src/*`
- **Vessel Names**: Always uppercase (enforced via `toUpperCase()` on input and `textTransform: uppercase` CSS)

## Database Setup

On first launch, admin enters MySQL credentials which are saved to `db-config.json`. Default admin credentials are `admin/admin123`. The schema auto-migrates on startup.

### Key Tables

- `users` - User accounts with auth, theme, window preferences
- `vessels`, `fleets` - Vessel registry and fleet grouping
- `entities`, `vessel_assureds`, `entity_ubos` - Assured parties and beneficial owners
- `document_types`, `vessel_documents` - Document requirements and uploads
- `vessel_custom_doc_types` - Per-vessel custom document types
- `flag_states` - Vessel flag state registries
- `policy_types`, `policy_type_characteristics` - Insurance policy type classifications and configurable fields
- `vessel_dynamic_policies`, `vessel_policy_values` - Dynamic policy instances and their field values
- `surveyors`, `condition_surveys`, `survey_defects`, `survey_attachments` - Survey management
- `compliance_check_logs` - History of scheduled/manual compliance runs
- `compliance_check_results` - Individual sanctions matches pending review
- `vessel_name_history`, `vessel_audit_log` - Vessel change tracking
- `quotations` - Insurance quotation records
- `settings` - Key-value store for app settings (file types, compliance schedule, etc.)
