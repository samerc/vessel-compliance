# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Supplementary References

Two additional reference files live in `.claude/` and should be consulted when working on UI or architecture:

- **`.claude/design-guide.md`** — Canonical UI design standards: CSS variables, button variants, input styles, modals, tables, cards, typography, spacing, status badges, empty states. Consult before writing any new component or UI change.
- **`.claude/lessons-learned.md`** — Hard-won patterns and anti-patterns: MySQL pitfalls, React component traps, audit log conventions, IPC rules, git gotchas, release workflow. Consult when debugging or adding new features.

## Build and Development Commands

```bash
npm install          # Install dependencies (runs electron-builder install-app-deps)
npm run dev          # Start development server with hot reload
npm run build        # Full production build (typecheck + electron-vite build)
npm run build:win    # Build Windows executable
npm run build:mac    # Build macOS dmg
npm run build:linux  # Build Linux packages
npm run deploy       # Build + upload code-update.zip to GitHub as hot-update (see Hot-Update System)
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
- **Bootstrap** (`src/main/bootstrap.ts`) - Entry point (`package.json` main = `./out/main/bootstrap.js`); checks for hot-updates before loading main process
- **Main Process** (`src/main/`) - Handles MySQL database operations, file I/O, authentication, and OFAC screening
- **Preload Script** (`src/preload/`) - Bridges main and renderer via IPC, exposing `window.api`
- **Renderer Process** (`src/renderer/src/`) - React UI with Context API for state management

### Tech Stack
- Electron + electron-vite + React 19 + TypeScript
- MySQL via mysql2/promise (externalized from Vite bundling)
- bcryptjs for password hashing, UUID for ID generation
- Vanilla CSS with glassmorphic design system and light/dark theme support
- jsPDF + xlsx for report exports
- Built-in sanctions screening via local SQLite (better-sqlite3) + Fuse.js fuzzy search

### Key Patterns
- **Database**: Auto-migrating schema in `src/main/mysql/adapter.ts` with schema defined in `schema.sql`
- **State**: React Context for auth (`AuthContext.tsx`), theme (`ThemeContext.tsx`), and notifications (`ToastContext.tsx`)
- **IPC**: All database operations exposed through preload's `window.api` interface
- **Types**: Shared interfaces in `src/shared/types.ts`

### Adding a New Feature (IPC Chain)
Every new backend-connected feature must touch all 5 layers in order:
1. `src/shared/types.ts` — add interfaces/types
2. `src/main/mysql/adapter.ts` — add DB method
3. `src/main/index.ts` — add `ipcMain.handle` / `safeHandle` IPC handler
4. `src/preload/index.ts` — expose via `ipcRenderer.invoke`
5. `src/preload/index.d.ts` — add TypeScript declaration for `window.api`
6. Component — call via `window.api.methodName()`

Missing any layer causes silent runtime failures.

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

### Sanctions Screening (Built-in)
Sanctions screening runs entirely within the Electron app — no external API dependency:
- **Module**: `src/main/sanctions/` — self-contained sanctions engine
- **SanctionsService** (`SanctionsService.ts`): Singleton — initialize, search, refresh, getStatus, SIC CRUD
- **SanctionsDatabase** (`SanctionsDatabase.ts`): SQLite wrapper via `better-sqlite3` (externalized in electron-vite config like mysql2)
- **Database file**: `sanctions.db` stored alongside `db-config.json` in app data directory
- **Entity columns**: source, source_id, entity_type, name, name_normalized, aliases (JSON), date_of_birth, nationality, addresses (JSON), identifications (JSON), programs (JSON), vessel_imo, remarks, listed_date, mother_name, father_name
- **Search**: Fuse.js fuzzy matching (weighted: name 0.5, normalized name 0.5, IMO 0.8, aliases 0.3, mother_name 0.3, father_name 0.3) + SQL LIKE exact search (also queries mother_name, father_name), combined and deduplicated
- **Data sources**: OFAC SDN (XML), EU OpenSanctions (CSV), UK FCDO via OpenSanctions (CSV — `gb_fcdo_sanctions`, reuses the EU simple-CSV parser), UN Consolidated (XML), ISF Lebanon (Excel), SIC (manual + Excel import)
- **Parsers**: `parsers/ofacParser.ts`, `parsers/euParser.ts`, `parsers/unParser.ts`, `parsers/isfParser.ts`, `parsers/sicParser.ts`
- **Normalize**: `normalize.ts` — lowercase, NFD unicode, strip diacritics, strip special chars
- **Startup**: `sanctionsService.initialize(dbDir)` called in `app.whenReady()`, loads all entities into Fuse.js in-memory index
- **Shutdown**: `sanctionsService.close()` in `window-all-closed` handler
- **IPC**: `ofac:checkSanctions` uses `SanctionsService.search()` locally (no HTTP calls)
- **OfacService** (`src/renderer/src/services/OfacService.ts`) - thin wrapper calling IPC (unchanged)
- **SanctionsModal** (`src/renderer/src/components/SanctionsModal.tsx`) - displays potential matches (unchanged)
- **Status flow**: `PENDING` → `POTENTIAL_MATCH` (yellow, needs review) → `CLEARED` or `MATCH` (user decision)
- Each component with sanctions badges (VesselManager, AssuredManager, EntityDirectory) has its own `OfacBadge` component that must handle all statuses
- **Loading States**: OfacBadge shows "CHECKING..." spinner during searches
- **Theme-Aware Colors**: Badge colors adapt for light/dark mode (darker colors in light mode for readability)
- **Auto-clean toggle**: `ComplianceScheduleSettings.autoMarkCleanOnCheck` — when false, a CLEARED result is not auto-saved (toast only)
- **Data refresh IPC**: `sanctions:getStatus`, `sanctions:refresh`, `sanctions:refreshSource` — admin-only, downloads and parses lists into SQLite, rebuilds Fuse.js index
- **Admin UI**: "Sanctions Data" section in Admin Panel with per-source status cards (entity count, last update, release date) and Refresh buttons. SIC card shows "Manual" instead of Refresh.

### SIC Sanctions List (Manual)
Local sanctions list managed manually within the app (source: Special Investigation Commission, Lebanon):
- **Source**: `source = 'SIC'` in SQLite `entities` table — no online refresh URL
- **Excel import**: `parsers/sicParser.ts` reads BDL Black List format (2 sheets: "Regist. of risks under cover" + yearly entries). Sheet 1: Last Name + First Name combined, father/mother extracted. Sheet 2: full name with "or" alias extraction, SIC reference from Subject text (prefix "SIC Ref" stripped, keeps only number e.g. `1798/26/G26.143`)
- **Manual CRUD**: Add/edit/delete individual entries via SanctionsSearch SIC List tab
- **Fields**: name, father_name, mother_name, nationality, date_of_birth, listed_date, source_id (SIC reference), entity_type, aliases, remarks
- **Remark templates**: Stored in `app_settings` key `sic_remark_templates` (JSON array of `{label, text}`). 3 defaults seeded on first load. Managed via Templates modal in SIC List tab. Shown as clickable chips in entry add/edit modal.
- **SanctionsDatabase CRUD**: `getSicEntities()`, `getSicEntity(id)`, `insertSicEntity()`, `updateSicEntity()`, `deleteSicEntity()`
- **IPC**: `sic:getEntities`, `sic:getEntity`, `sic:addEntity`, `sic:updateEntity`, `sic:deleteEntity`, `sic:import`, `sic:getRemarkTemplates`, `sic:setRemarkTemplates`
- **UI**: SanctionsSearch page has two tabs — "Search" (existing) + "SIC List" (table with search, Import Excel, Templates, Add Entry). SIC source button (yellow `#ffd43b`) added to search source filters.
- **Entry modal**: Does not close on outside click. Remark templates as chips above textarea with "Manage Templates" link.

### Scheduled Compliance Checks
Automated weekly sanctions screening for all entities and vessels:
- **Scheduler** (`src/main/services/ComplianceScheduler.ts`): Background timer runs compliance checks on configured schedule
- **Local search**: Uses `sanctionsService.search()` directly (no HTTP calls, no rate limiting needed)
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
- **Survey List**: Cross-vessel survey overview (`ConditionSurveyList.tsx`) with search, navigates directly to vessel's survey section. Sortable columns (vessel, date, type, surveyor, location, defects); default sort: date desc.
- **Defects**: Each survey can have multiple defects (`DefectManager.tsx`) with severity (optional), status (OPEN/CLOSED), due dates. Due date can be cleared (passes `null` to adapter, not `undefined` which skips the update).
- **Defect Notes**: Notes button visible for all defects with notes (not just closed), shows both general notes and closure notes
- **Attachments**: Multiple file attachments per survey (reports, photos, certificates)
- **Survey Status**: Automatically shows "SURVEY CLOSED" when all defects are closed
- **Closure Tracking**: Defects track who closed them, when, and optional closure notes

### Survey Warranties & Follow-Up

Cross-vessel warranty and endorsement tracking system:

- **WarrantyManager** (`src/renderer/src/components/WarrantyManager.tsx`): Per-survey warranty management embedded in `ConditionSurveyManager`. Tracks warranty items with deadline type (date/voyage/voyage+date), reference number, status (OPEN/CLOSED), notes, and sent reminders.
- **SurveyFollowUp** (`src/renderer/src/components/SurveyFollowUp.tsx`): Fleet-wide survey follow-up page reachable from the sidebar. Two tabs: Warranties + Endorsements (with badge counts). Warranties tab has search, pagination (25/page), sortable columns, and resizable columns. Sort + column widths persisted in localStorage. Compact table styling.
- **Tables**: `survey_warranties` (id, survey_id, vessel_id, description, deadline_type, deadline_date, deadline_voyage, reference_number, status, notes), `warranty_reminders` (id, warranty_id, sent_at, next_reminder_date, notes)
- **Endorsements Due**: Computed from surveys with open defects past their due date; displayed in a dedicated tab
- **IPC Handlers**: `survey_warranty:getByVessel`, `survey_warranty:getAll`, `survey_warranty:create`, `survey_warranty:update`, `survey_warranty:delete`, `survey_warranty:getReminders`, `survey_warranty:addReminder`, `survey_warranty:getEndorsementsDue`
- **SQL alias rule**: All `sw.*` / `swr.*` wildcard selects must use explicit `column AS camelCaseName` aliases — MySQL returns raw snake_case, but TypeScript interfaces expect camelCase

### Customer Assignment (Policy-Level)

Customer/broker is tracked at the **policy level**, not the vessel level. A vessel can have different customers per policy type (e.g., Hull via Broker A, P&I via Broker B).

- **Fields**: `customer_entity_id` (FK to entities) and `customer_type` ('broker' or 'direct') on `vessel_dynamic_policies`
- **Legacy**: `customer_id`/`customer_type` columns still exist on `vessels` table but are deprecated — all views read from policies
- **Auto-sync**: When `broker_entity_id` is updated on a policy without explicit `customer_entity_id`, the adapter auto-syncs customer fields
- **Multi-broker vessels**: A vessel appears under every customer that has an active policy on it. FleetManager "By Customer" view, CustomerComplianceReport, DAB, and analytics all derive customer from active policies
- **Policy edit UI**: "Customer / Broker" field with broker/direct toggle buttons + entity search combobox in VesselDetail policy edit form
- **Quotation customer**: `customer_entity_id` + `customer_type` on `quotations` table, set in InsuredTab with entity search and broker/direct toggle. Auto-copied from vessel's existing policy when adding a vessel. Synced to vessel dynamic policy on quotation-to-policy conversion.
- **Document filtering**: Customer compliance reports only show document types tagged for the policy types the customer covers (e.g., Hull broker sees only Hull-tagged docs)
- **Vessel list**: Customer column hidden by default (labeled "Legacy" in column selector)

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

### Fleet Analytics

Analytics dashboard for the fleet (`src/renderer/src/components/FleetAnalytics.tsx`):

- **KPI row**: Horizontal layout — 48px gradient icon circle left, label (small-caps) → number (bold 1.75rem) → subtitle stacked right
- **Histograms**: Vertical column bars for vessel age and gross tonnage distributions. Each bar shows count + percentage above, x-axis label below. Bars sized proportionally to the tallest bucket.
- **Bar charts**: 8px-tall horizontal bars for flag states and vessel types; percentage annotation at right (`pctOfTotal% · count`)
- **OFAC status row**: Status pill badge (colored per status) + horizontal bar + percentage
- **Layout**: Flag states get 3fr, vessel types get 2fr in the first row (asymmetric)
- **ChartCard**: accent-colored icon + small-caps title + count badge pill on right, `borderBottom` divider separating header from content

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
- **Find Duplicates**: Button scans all entities for similar names using Jaro-Winkler similarity with an adjustable threshold slider. Pairs can be merged directly from the results via `mergeEntities` adapter method.

### Entity Documents (Configurable)

Entity document types are configurable via Admin Panel → Entity Document Types:

- **Tables**: `entity_document_types` (admin-managed types with scope/required/order/active) + `entity_documents` (per-entity records with file_path, expiry, received date; UNIQUE entity_id + document_type_id)
- **Scope**: Each type has `entity_scope` ('company', 'person', 'both') — only matching types shown for each entity
- **Seed**: 4 default types on first run (CoI, AoA, KYC for companies; ID/Passport for persons) + migration copies legacy entity column paths
- **Legacy columns**: `passport_file_path`, `certificate_of_incorporation_path`, `articles_of_association_path`, `kyc_file_path` kept on entities table but no longer used for reads
- **IPC**: `entityDocTypes:*` for admin CRUD, `entityDocs:*` for per-entity document management
- **UI**: EntityDirectory slide-in panel + AssuredManager slide-in panel show dynamic document list with upload/replace/delete
- **Compliance**: Dashboard, Reports (v1+v2), CustomerComplianceReport, VesselDetail copy-missing, SubjectivitiesTab all use dynamic entity_document_types
- **Remap**: `getEntityFilePaths` / `remapEntityFilePaths` read from entity_documents table
- **Merge**: `mergeEntities` copies entity_documents from source to target (skip duplicates)

### AssuredManager (Vessel Assureds Page)

Redesigned to table + slide-in panel layout:

- **Left**: Compact assured table with Name, Role, Documents score (e.g. "3/4"), UBO count, action buttons
- **Right**: Slide-in panel (440px) when a row is clicked showing:
  - Entity header (icon + name + role + type)
  - Sanctions badge
  - Contact info (email/phone)
  - Role editing
  - Address selector with add-new
  - Dynamic document list with upload/replace/delete per doc type
  - UBOs section — each UBO as a card with doc score, sanctions, documents, delete button
  - Add UBO form at the bottom

### Annual Document Compliance Rule

For `annualRenewal = true` document types, the effective expiry is inherited from the active P&I policy via `resolveEffectivePolicyExpiry()` (`src/renderer/src/utils/policyUtils.ts`) instead of the document's own expiry date.

- **Priority**: P&I policy end date → Hull & Machinery end date → document's own stored expiry date
- **`resolveEffectivePolicyExpiry(policies)`**: filters `status === 'active'`, matches policy name containing "p&i" or "protection" first, then "hull" or "h&m". Looks for a characteristic whose name contains "end date" and returns its `valueDate`.
- **Short-cycle rule**: if `(expiryDate − receivedDate) < 60 days`, the document is treated as **Compliant** even when it would otherwise be flagged "Expiring Soon". Rationale: a document placed today against a P&I policy expiring in 30 days was intentionally uploaded knowing its short remaining life.
- **Helper**: `annualShortCycle(expiry, received)` — returns `true` if span < 60 days
- **Applied in**: `VesselDocumentsView.tsx` (`getDocStatus`), `ReportService.ts` (`getDocStatus` / `getExcelDocStatus`), `ReportServiceV2.ts` (`getStatus`), `Dashboard.tsx` (`allAlerts` memo)
- **CRITICAL — loading order**: `dynamicPolicies` must be loaded inside `VesselDetail.loadData()` (not just on Policies/Surveys tab switch), otherwise `effectivePolicyExpiry` is always `undefined` when the Documents tab opens. The fix: add `getVesselDynamicPolicies(vessel.id)` to the supplementary try/catch blocks in `loadData()`.
- **Editable date**: Annual doc expiry row in `VesselDocumentsView` shows a P&I reference badge (cyan, read-only) above an always-editable date input. The stored doc date is the fallback when no P&I policy end date exists; editing it does NOT override the P&I date for compliance (P&I still takes priority in `effectiveExpiry` calculation).

### Window Preferences
- **Per-User Storage**: Window size and position stored in database per user (`users.window_width`, `window_height`, `window_x`, `window_y`)
- **Auto-Save**: Window bounds saved on resize/move when user is logged in
- **Auto-Restore**: User's window preferences applied on login via `setBounds`

### Compliance Center

Centralized compliance monitoring with four tabs:

- **Document Alerts Tab**: Missing required files, expired documents, expiring soon (30 days). Includes entity documents (CoI, AoA, KYC, passport) per vessel's assureds with purple "Entity" badge. Endorsement reminders included. Three view modes: Vessel (grouped, collapsed by default), Document (grouped by doc type), Flat. Search input filters by vessel name or document name.
- **Policy Alerts Tab**: Expired + Expiring Soon (90 days) sub-filters, status dropdown to change policy status directly. View button navigates to vessel's policies section. New IPC: `policies:getExpiringSoon` with `getExpiringSoonPolicies(daysAhead)` adapter method.
- **Sanctions Screening Tab**:
  - Pending reviews table with expandable match details
  - Batch select with checkboxes, select-all, "Clear All" / "Sanction All" bulk action buttons
  - Mark as reviewed action updates result status
  - Check history sidebar showing all compliance runs with status/counts
- **Data Quality Tab**: Auto-refreshes after rule save/delete/toggle
- **Tab persistence**: Active sub-tab remembered when navigating away and back (`complianceSubTab` state in `App.tsx`)

### Document Reminders (REMOVED)

The standalone Document Reminders page (ReminderCenter) and its per-vessel snooze system were removed — document expiry is covered by the Compliance Center, Dashboard alerts, and the vessel Documents tab. The `vessel_reminder_snoozes` table is dropped on migration. The old Admin "Vessel Reminders" section was repurposed to **Annual Doc Grace** (still section id `reminders`), which configures only `annual_grace_days`.

### Dashboard

Aggregate health overview (`src/renderer/src/components/Dashboard.tsx`):

- **Layout** (top to bottom):
  1. KPI row (5 cards): Active Vessels | Entities | Doc Compliance % | Critical Issues | Sanctions Pending
  2. 2-col main row (60/40 split): Upcoming Expirations card (merged docs + policies, max 12, sorted by urgency) + Operational Status card (6 status rows)
  3. 3-col activity row (equal width): Recently Added Vessels | Recently Added Entities | Recent Changes (audit)
- **`dashboardGetActivity` IPC**: returns `{ recentVessels, recentEntities, recentAuditEntries }`. Vessels include `created_at`; entities include `created_at`; audit entries include `changedAt`.
- **`loadData` wrapped in `useCallback([], [])`**: prevents infinite re-render loop; called once on mount and on refresh button click
- **`allAlerts` memo**: filters to active vessels only (via `activeVesselIds`) to avoid inactive vessel alerts inflating Missing/Expired counts
- **`fullyCompliantCount`**: filters `allAlerts` by `activeVesselIds` to avoid negative compliance numbers
- **Upcoming Expirations**: merges document alerts (type expired/expiring, active vessels only) + policy expiry (within 90 days). Sorted: expired first → missing → expiring soonest. Rows are clickable — navigates to vessel's Documents or Policies tab via `onNavigateToVessel` prop
- **Operational Status — Entity Docs Missing**: `entityDocMissingCount` memo counts entities with missing required documents (CoI/AoA/KYC for companies, passport for persons); shown as a status row with amber/green color

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
- **War Breach Calculator** (`src/renderer/src/components/WarBreachCalculator.tsx`):
  - Calculates net due on war breach scenarios
  - **Persistent history**: Saves each calculation to DB with date, cover note, breach details, net due
  - **View modal**: Click any saved record to see full calculation breakdown
  - **Export/Copy**: Export saved records to Excel; copy individual records formatted for email
  - **Save + clear**: Saving a record automatically clears all fields for the next entry
  - **Clear button**: Resets all fields without saving
  - **IPC prefix**: `warBreach:`; tables: `war_breach_records`

### Sanctions Search

Ad-hoc sanctions lookup page (`src/renderer/src/components/SanctionsSearch.tsx`):

- **Per-User Threshold**: Minimum match threshold (10-95%) persisted to `users.sanctions_threshold` column
- **IPC Handler**: `users:updateSanctionsThreshold` saves to DB and updates session cache
- **Source Filters**: Toggle OFAC, UN, EU, UK, ISF sanctions lists independently
- **Results**: Expandable cards with match score, aliases, remarks, source IDs
- **Local search**: All searches run against local SQLite database via `SanctionsService.search()`
- **Tabs**: Search · SIC List · Check Report (see below)

### Sanctions Check Report

Named screening report generated from the Sanctions Search page ("Check Report" tab, `src/renderer/src/components/SanctionsCheckReport.tsx`):

- **Subject**: free-text name OR a linked entity (searchable picker over `getEntities()`). Linking an entity lets the decision update that entity's stored status.
- **Per-list table**: screens all 5 lists (OFAC, EU, UN, ISF, SIC) via `checkSanctions(name, threshold/100, sources)`, groups matches by `source`, and shows each list as **Clear** or **Potential Match** with match count and date. Threshold filter mirrors the Search tab (`score*100 >= threshold`).
- **Clear/Sanction gate**: if any list has potential matches, the user must choose **Clear Subject** or **Sanction Subject** before export unlocks; all-clear auto-resolves to Cleared.
- **Export PDF**: mirrors other report exports (`getReportSettings` header band/accent/footer, jsPDF + autoTable). Shows subject meta, an overall RESULT: CLEARED/SANCTIONED badge, and the per-list status table.
- **On export**: saves an audit record (`sanctions_report_checks`: subject, entity, threshold, decision, per-list results JSON, checked-by, date) and — if an entity was linked — updates its `ofac_status` (CLEARED/MATCH) + check date via `updateEntity`.
- **IPC**: `sanctionsReport:save`, `sanctionsReport:list`. Adapter: `createSanctionsReportCheck`, `getSanctionsReportChecks`.

### Admin Panel

System configuration page (`src/renderer/src/components/AdminPanel.tsx`) with collapsible sections (all collapsed by default):

1. **Document Types**: CRUD with reorder and active/inactive toggle
2. **Assured Roles**: CRUD for entity role types
3. **Survey Types**: CRUD for condition survey types
4. **Policy Types**: CRUD with reorder for vessel policy classifications
5. **Scheduled Compliance Check**: Enable/disable, schedule, threshold, include vessels, skip cleared
6. **Annual Doc Grace**: Annual document grace-window (days) for renewal compliance
7. **File Upload Security**: Allowed/blocked file extensions for uploads
8. **Report Settings**: Company name, logo, accent color used in PDF reports
9. **Sanctions Data**: Per-source status cards (OFAC, EU, UK, UN, ISF) with entity count, last update, release date; per-source and bulk refresh buttons
10. **Database Configuration**: View/change MySQL connection settings

- **Collapsible Pattern**: Uses `collapsedSections` state (`Set<string>`) with `toggleSection` function; each section header has ChevronRight/ChevronDown toggle
- **All sections collapsed by default**: Initial state includes all section IDs
- **Report Settings**: stored in `app_settings` table under key `reportSettings` (JSON blob). IPC: `reportSettings:get` / `reportSettings:set`. Section id: `reportSettings`. Service: `ReportSettingsService` at `src/renderer/src/services/ReportSettingsService.ts` — `getReportSettings()` (cached), `saveReportSettings()`, `invalidateReportSettingsCache()`, `rgbToHex()`, `hexToRgb()`, `tintColor()`.

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
- **Broker field**: `broker_entity_id` on `vessel_dynamic_policies`; custom combobox (text input + dropdown) with `onBlur+setTimeout(150)` for click-outside handling

### Policy Renewals

Monthly view of expiring policies (`src/renderer/src/components/PolicyRenewals.tsx`):

- **Month Selector**: Navigate months with arrows, "Today" button to jump to current month
- **3-Month View**: Toggle button switches between single-month and 3-consecutive-months view; multi-month fetches 3 parallel IPC calls tagged with `_monthLabel`, renders with month group headers in the table
- **Table Columns**: Vessel, IMO, Customer, Fleet, Policy Type, Policy Number, End Date, Actions (View)
- **Query**: Joins `vessel_dynamic_policies` → `vessel_policy_values` where characteristic name contains "end" and field_type is date
- **Filters**: Only active vessels (`v.is_active = TRUE`) and active policies (`vdp.status = 'active'`)
- **Export**: Excel export via `xlsx` library
- **IPC Handler**: `policies:getRenewalsByMonth`
- **Renewal States**: `renewal_status_types` table, `renewal_status_id` FK on `vessel_dynamic_policies`. IPC prefix: `renewalStates:`. Status badge in table: text always black, background `statusColor + "22"` (hex opacity), border `2px solid statusColor`.
- **Sort persistence**: Sort field + direction persisted in localStorage

### Vessel Active Status

Vessel lifecycle management with cascade behavior:

- **Field**: `vessels.is_active` (BOOLEAN, default TRUE)
- **Deactivation Cascade**: Setting `is_active = false` automatically sets all vessel's active policies to `'inactive'`
- **Filtered Views**: Renewals, survey list, and open defects queries all filter by `v.is_active = TRUE`
- **Audit Logged**: Status changes recorded in vessel audit history

### Dynamic Address Book (DAB)

Query builder for finding entity contacts across the fleet (`src/renderer/src/components/DynamicAddressBook.tsx`):

- **Layout**: Two-panel — sticky filter sidebar (270px left) + results card (flex-1 right)
- **Filter sidebar**: Compact chip-based sections with labels: Match Logic | Contact Scope | Policy Types (collapsible) | Flag States (collapsible, default collapsed) | Vessel Status | Customer Type | Export Fields
- **Logic**: AND/OR toggle for combining filter criteria
- **Export**: Email only (default), phone only, or both; Copy to Clipboard + Copy for Outlook (semicolon-separated)
- **Results**: Professional table with icon-prefixed entity name, type badge, email/phone with icon prefix, associated vessels. Alternating row shading. Count badge in header.
- **Empty states**: "No query run yet" (before first search), "No contacts found" (after search with 0 results)
- **Chip component**: Selected = accent border + tinted bg; unselected = subtle border + transparent

### Vessel Excel Import

Bulk vessel import from Excel files (`src/main/vesselExcelImport.ts`):

- **Date Handling**: Excel serial dates converted to ISO `YYYY-MM-DD` via `excelDateToISO()` with Lotus 123 leap year bug correction
- **Fallback Parsing**: Text dates parsed via `new Date()` constructor
- **Migration**: Startup migration in `initSchema()` normalizes existing non-ISO dates in `vessel_policy_values`

### Vessel Filter

Advanced vessel search page (`src/renderer/src/components/VesselFilter.tsx`):

- **Filters**: Multiple criteria for filtering the vessel list
- **Navigation**: View button navigates to vessel detail
- **Searchable MultiSelect**: `MultiSelectDropdown` component auto-shows an inline search input when `options.length > 6` (e.g. flag states list). Auto-focuses on open via `useEffect([open, showSearch])`. Filters by both `label` and `sublabel`. Clears search on close.
- **Portal dropdowns**: Dropdowns rendered via `createPortal` to avoid clipping inside scrollable containers; positioned with `getBoundingClientRect` + flip-upward logic.

### Reports

Tab-based reports page (`src/renderer/src/components/Reports.tsx`) with sub-navigation:

- **LossRecordReport** (`src/renderer/src/components/LossRecordReport.tsx`): Imports Book1.xlsx (UWY in col 6), outputs a PDF grouped by Underwriting Year → vessel → claim
- **AssuredReport** (`src/renderer/src/components/AssuredReport.tsx`): Assured listing by vessel/fleet. Filter: all active vessels, by fleet (searchable), or select vessels (search + chips). Table with vessel name, IMO, fleet, assured name, role, type, email, phone. Grouped by vessel with rowSpan. Sorted by role order from settings. Export: Excel + PDF (per-vessel sections with navy header bars).

### Customer Compliance Report

Per-customer document compliance overview (`src/renderer/src/components/CustomerComplianceReport.tsx`), accessible via the Reports page "Customer Compliance" tab:

- **On-screen view**: Select customer (or all), click "Generate Report" to load grouped vessels with per-vessel compliance stats (Compliant / Missing / Expiring Soon / Expired / %)
- **Compliance %**: `compliant / totalRequired * 100` — only fully-compliant docs count. Expired and expiring-soon docs do NOT inflate the percentage.
- **Scope**: active vessels only; includes both global `document_types` and per-vessel `vessel_custom_doc_types`
- **Expiry window**: "Expiring Soon" = within 60 days (intentionally wider than the 30-day Dashboard threshold)
- **Export PDF**: per-customer via `exportCustomerCompliancePDF()` (exported function, also called from EntityDirectory); full-fleet via "Export PDF" button in the component. Uses `ReportSettingsService` for company name, colors, footer
- **Export Excel**: flat rows with customer header rows interspersed
- **N+1 prevention**: custom doc types for all vessels in scope are batch-fetched with `Promise.all` before the vessel loop — never one IPC call per vessel
- **`buildVesselRow(vessel, docTypes, allVesselDocs, allAssureds, allCustomDocTypes)`**: pure synchronous helper, takes pre-fetched data only

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

### Unified Policy / Quotation Types

Single `policy_types` table serves both vessel policies and quotations. The `code` column (P, H, W, F, L, C) drives quotation behavior (tab visibility, export format, warranty scoping).

- **Table**: `policy_types` (id, name, code, order_index) — seeded with P&I (P), Hull (H), War Risk (W), FDD (F), Loss of Hire (L), Cargo (C)
- **Unified**: `quotation_types` table is legacy — all CRUD methods (`getQuotationTypes`, `addQuotationType`, etc.) now read/write `policy_types` WHERE code IS NOT NULL
- **`quotation_type_id`** on `quotations` table — now references `policy_types` rows (migrated from old `quotation_types` IDs)
- **Auto-reference**: `Q/{code}/{YY}/{serial}` for DB-based (e.g. `Q/P/26/1`); `Q/{R|N}/{branch}/{YY}/{serial}` for registry-based
- **Starting serial**: Configurable per type in Quotation Settings → Quotation Types
- **Admin Panel**: Policy Types section manages both policy and quotation types with name + code fields
- **Renaming**: Renaming a type auto-reflects everywhere since all references are by UUID. The `code` field should NOT be renamed (drives application logic).
- **IPC**: `db:getQuotationTypes`, `db:addQuotationType`, etc. delegate to `policy_types` table

### Document Type Policy Tags

Document types can be tagged with applicable policy types to control which documents appear in broker-specific compliance reports.

- **Junction table**: `document_type_policy_types` (document_type_id, policy_type_id)
- **Empty = all types**: A document with no tags is relevant to all policy types
- **Admin Panel**: Policy type checkboxes (with "All" chip) in document type add/edit forms. Read-only display shows type badges or green "All Types" badge.
- **Compliance filtering**: `buildVesselRow`, ZIP export, and Copy Missing all filter documents by the customer's active policy types for each vessel. Vessel-level exports (no customer filter) show all documents.
- **`policyTypeIds`**: Optional `string[]` on `DocumentType` interface
- **Lightweight list query**: `getQuotations()` returns only display fields (no MEDIUMTEXT blobs); `getQuotation(id)` loads full record for editor
- **Vessel name in list**: Subquery on `quotation_vessels` with `COALESCE(v.name, qv.name)` to resolve fleet-linked or manually-entered vessel names; shows `+N` for multi-vessel quotations
- **Shared tabs** (all types): insured, vessel, trading, period, premium, warranties, subjectivities. Type-specific tabs: P&I gets conditions/deductibles/exclusions/liability; H&M gets agreed value/hull conditions
- **Tab visibility**: `allTabs` array with optional `types?: string[]` field, filtered by `getTabsForType(typeCode)`

### Quotations

Quotation management system:

- **QuotationManager** (`src/renderer/src/components/QuotationManager.tsx`): Main quotation list and management
- **QuotationEditor** (`src/renderer/src/components/QuotationEditor.tsx`): Create/edit quotation details with tabbed sections (Conditions, Warranties, Deductibles, Exclusions, etc.)
- **QuotationList** (`src/renderer/src/components/QuotationList.tsx`): Quotation listing view
- **QuotationSettings** (`src/renderer/src/components/QuotationSettings.tsx`): Two-tier navigation — category selector (General / P&I / H&M) on top, filtered tab chips below. General: Quotation Types, Warranties, Subjectivities, Trading Countries, Trading Warranty, Sanctions Versions, Standard Texts, Instalment Defaults, Section Order, Logo. P&I: Conditions, Deductibles, Exclusions, Limits of Liability, Addl. Clauses. H&M: Agreed Value, Clauses, Addl. Conditions.
- **RichTextEditor** (`src/renderer/src/components/RichTextEditor.tsx`): Rich text editing for quotation content
- **Export**: `QuotationExportService.ts` with DOCX (`htmlToDocx.ts`) and PDF (`htmlToPdfText.ts`) export

### Quotation Vessel Scope

Per-item vessel scoping for multi-vessel quotations:

- **`vessel_scope TEXT DEFAULT NULL`** on all 8 quotation item tables (warranties, custom warranties, deductibles, text deductibles, subjectivities, clauses, additional clauses, exclusions)
- **NULL scope = all vessels**; array of quotation_vessel IDs = specific vessels
- **VesselScopeChips** (`src/renderer/src/components/VesselScopeChips.tsx`): Compact chip row rendered under each item when 2+ vessels. "All" button + per-vessel toggle buttons
- **Export annotation**: `vesselScopeSuffix()` helper appends `(VESSEL NAME, VESSEL NAME)` to scoped items in PDF/DOCX
- **Bulk set preservation**: SET methods (warranties, clauses, exclusions) that delete-and-reinsert read existing `vessel_scope` into a `scopeMap` before delete, then restore during re-insert
- **Update methods**: `updateQuotationWarrantyVesselScope` / `updateQuotationClauseVesselScope` update by `quotation_id + pi_*_id` pair; `updateQuotationItemVesselScope` is generic with `allowedTables` whitelist

### Quotation Premium System

Premium management with per-vessel amounts, sequential discounts, and non-refundable options:

- **Per-vessel premiums**: `premium_amount DECIMAL(15,2)` on `quotation_vessels` table. Multi-vessel quotations show a premium table in PremiumTab with per-vessel inputs; total auto-syncs to `quotation.premiumAmount`
- **Currency**: Quotation-level `premiumCurrency` field displayed in the header (applies to all sections)
- **Auto-label**: Premium field shows "Technical Premium" when NCB or UPCC is enabled; "Premium" otherwise
- **NCB (No Claims Bonus)**: Checkbox + percentage/amount + rich text. Export renders only the `ncbText` with `{ncb_amount}` and `{ncb_percent}` placeholders replaced. Text is seeded from standard default on first enable.
- **UPCC (Upfront Continuity)**: Checkbox + percentage/amount + rich text. Same placeholder pattern (`{upcc_amount}`, `{upcc_percent}`). DB columns still named `cpc_*` (aliased to `upcc*` in adapter)
- **Sequential discount calculation**: `Payable = Technical × (1 - NCB%) × (1 - UPCC%)` — discounts applied multiplicatively, not additively
- **Non-refundable**: Quotation-level choice via `nonRefundableType` ('first_instalment' | 'percentage' | null) + `nonRefundablePercent`. Replaces old per-instalment non-refundable fields
- **Instalments**: Number + days from inception only (description field removed). Default days: 1→`[0]`, 2→`[0,180]`, 3→`[0,120,240]`, 4→`[0,90,180,270]`, 12→`[0,30,60...330]`; admin `InstalmentDefaults` settings take priority when configured
- **Export premium table**: Premium section rendered as tables in PDF/DOCX for all cases except single plain premium. Multi-vessel, multi-alternative, and discount scenarios all use tabular format with label/amount columns. PDF uses autoTable with `didParseCell` for bold styling; DOCX uses `premCell`/`premRow`/`premTable` helpers for 2-column Table layout.
- **Per-vessel NCB/UPCC exclusion**: `ncb_excluded` and `upcc_excluded` booleans on `quotation_vessels`. Multi-vessel premium table shows inline checkboxes per vessel. Excluded vessels get plain "X per annum" in export; included vessels get Technical/Payable split. NCB/UPCC text sections append "Applicable to M/V ..." when some vessels excluded.

### Quotation Warranties System

Tag-based warranty categorization with sets, custom warranties, type scope, and bulk management:

- **Type Scope**: `type_scope` column on `pi_warranties` (`'pi'` | `'hull'` | `'both'`). Editor filters visible warranties by quotation type code. Admin UI shows scope selector and badge per warranty.
- **Warranty Tags** (`pi_warranty_tags`): Admin-created category labels (e.g. "Cargo", "Navigation"). Managed in QuotationSettings Warranties tab.
- **Warranty Sets** (`pi_warranty_sets`, `pi_warranty_set_items`): Named groups of warranties (e.g. "Default", "Cargo Warranties") with optional `default_selected` flag. Default sets auto-apply to new quotations on first load via `useRef` guard (`defaultsApplied`).
- **Cargo Tag Auto-Linking**: In QuotationEditor, a tag named "Cargo" (case-insensitive) automatically includes warranties with `isCargoRelated = true` in its tab, even if they don't have the tag explicitly assigned via `tagIds`. The "Other" (untagged) tab excludes these to avoid duplication.
- **Bulk Tag Assignment**: QuotationSettings has a "Bulk Tag" mode — checkboxes on each warranty row, Select All/Deselect All, toolbar with tag assign/remove chips, + Cargo/- Cargo, + Default/- Default bulk actions.
- **Custom Warranties** (`quotation_custom_warranties`): Per-quotation ad-hoc warranties added inline in the selected list. Support add, edit, delete, reorder, and bulk import (paste with bullet extraction).
- **Custom Warranty Input**: Auto-growing textarea (`resize: none`, dynamic height via `scrollHeight` on change, max 200px).
- **Import Modal**: Bulk paste warranties with bullet/dash/number stripping, parse preview, then confirm to add as custom warranties.
- **Selected Warranties Order**: `selectedWarrantyIds` array preserves selection order; reorderable via up/down arrows in the selected list.
- **Collapsible sections**: "Additional Text" and "Breach of Warranties" are separate collapsible sections in WarrantiesTab (not nested under Standard Texts)

### Quotation Standard Texts

Section text templates stored in `pi_section_texts` (global defaults) with per-quotation overrides in `quotations.section_texts_override` (MEDIUMTEXT JSON):

- **`PISectionTexts` interface** (`src/shared/types.ts`): All optional string fields for each section
- **`DEFAULT_SECTION_TEXTS`** (`QuotationSettings.tsx`): Hardcoded fallback defaults
- **`SECTION_TEXT_FIELDS`** (`QuotationSettings.tsx`): Defines which fields appear in the Standard Texts settings tab with labels, sections, and row counts
- **Per-quotation override**: `getEffectiveText(key)` checks `quotation.sectionTextsOverride?.[key]` → global texts → `DEFAULT_SECTION_TEXTS[key]`
- **Warranty texts order in export**: warranties list → `warrantiesAdditionalText` → `warrantiesBreach` (warrantiesNote removed from settings UI)
- **CRITICAL — double stringify bug**: When passing `sectionTextsOverride` to `updateField()`, pass the **object** directly, NOT `JSON.stringify(object)`. The adapter's `updateQuotation` already calls `JSON.stringify()` on the value. Double-stringifying causes exponential growth and "Data too long" errors.
- **Column type**: `section_texts_override` must be `MEDIUMTEXT` (16MB), not `TEXT` (64KB). Migration always runs `MODIFY COLUMN` to ensure this.

### Hull Quotation System

H&M quotation type with agreed value, hull clauses, hull alternatives, and additional conditions:

- **Agreed Value Tab** (`AgreedValueTab` in QuotationEditor): Amount + currency, template texts from `hull_agreed_value_texts`, custom texts, reorder, vessel scope. Stored in `quotation_agreed_value_items`.
- **Hull Conditions Tab** (`HullConditionsTab` in QuotationEditor): Hull clause selector (from `hull_clauses`), clause conditions checkboxes (from `hull_clause_conditions`) with defaults auto-applied, text overrides, additional conditions (from `hull_additional_conditions`), vessel scope. Supports multiple alternatives.
- **Hull tables**: `hull_clauses` (name, code), `hull_clause_conditions` (condition_number, text, default_selected), `hull_additional_conditions` (title, text, default_selected), `hull_agreed_value_texts` (text)
- **Per-quotation tables**: `quotation_hull_conditions`, `quotation_hull_additional_conditions`, `quotation_agreed_value_items` — all FK to `quotations(id)` with vessel_scope support
- **Export**: PDF and DOCX include agreed value section (amount + text items) and hull conditions section (clause + conditions + additional conditions)
- **Additional condition/clause titles**: `title VARCHAR(255) NULL` on both `pi_additional_clauses` and `hull_additional_conditions`. Shown bold before code/text in settings and editor only — NOT rendered in exports (PDF/DOCX). Custom hull additional conditions (`quotation_hull_custom_conditions`) DO show their title in exports.

### Hull Alternatives

Multiple clause alternatives per hull quotation, each with its own conditions and premium:

- **Table**: `quotation_hull_alternatives` (id, quotation_id, hull_clause_id, label, premium_amount, order_index)
- **Per-alternative conditions**: `alternative_id VARCHAR(36) DEFAULT NULL` on `quotation_hull_conditions` and `quotation_hull_additional_conditions`. NULL = applies to all alternatives.
- **Condition helpers**: `getAltConditions(altId)`, `getAltSelectedIds(altId)`, `getAltOverrides(altId)`, `getAltAmounts(altId)`, `getAltScopes(altId)` — filter conditions by `alternativeId` match
- **`toggleCondition(condId, alternativeId)`**: Checks by `condId + alternativeId` pair, not flat global set
- **Visual separation**: Each alternative gets a colored left accent border (3px). Colors cycle: `['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']`. IV gets amber `#ffb020` accent. Horizontal dividers between alternatives.
- **Single alternative**: UI identical to current (no "Alternative 1" label). When 2+: show labeled sections per alternative.
- **IV unchanged**: IV clause remains separate, shared across all alternatives
- **Premium per alternative**: Multi-alt hull shows per-alternative premium inputs in PremiumTab with colored card rows. Payable premium calculated per alternative with `computePayable(alt.premiumAmount)`.
- **Export (conditions)**: Each alternative rendered as "Alternative N — [clause wording]" with its scoped conditions. "Applicable to all alternatives" section for `alternativeId = null` conditions. IV section separate.
- **Export (premium)**: Per-alternative premium lines in table format: "Alternative N (code): amount per annum"
- **IPC**: `hull:getQuotationAlternatives`, `hull:addQuotationAlternative`, `hull:updateQuotationAlternative`, `hull:deleteQuotationAlternative`, `hull:reorderQuotationAlternatives`
- **Backward compat**: `hull_clause_id` on quotations kept; synced from `alternatives[0].hullClauseId` when single alternative

### Quotation Type Scope

Warranty and subjectivity filtering by quotation type:

- **`QuotationTypeScope`** (`src/shared/types.ts`): `'pi' | 'hull' | 'both'`
- **`type_scope`** column on `pi_warranties` and `pi_subjectivities` — default `'both'` for backward compatibility
- **Admin UI**: Scope selector (P&I / Hull / Both) in QuotationSettings Warranties and Subjectivities tabs, with colored badge per item
- **Editor filtering**: `visibleWarranties` / `visibleSubjectivities` filtered by `typeScope === 'both' || typeScope === typeCode`

### Trading Warranty Templates

Admin-managed reusable text templates for the trading warranty intro section:

- **Table**: `trading_warranty_templates` (id, name, text, order_index, created_at)
- **Settings UI**: `TradingWarrantyTemplatesTab` in QuotationSettings (General category) with add/edit/delete/reorder, RichTextEditor for template text, name input
- **Editor**: Template selector dropdown above the trading warranty RichTextEditor. Selecting a template populates the text; users can modify or write new text freely.
- **Custom wording hides default text**: When `tradingCustomMode` is enabled ("Use custom wording" checkbox), the standard "Trading Warranty Text" section is hidden. The `!quotation.tradingCustomMode` guard wraps the default text block in TradingTab.
- **IPC**: `pi:getTradingWarrantyTemplates`, `pi:addTradingWarrantyTemplate`, `pi:updateTradingWarrantyTemplate`, `pi:deleteTradingWarrantyTemplate`, `pi:reorderTradingWarrantyTemplates`
- **Per-vessel intro**: `quotation_trading_intros` table stores per-vessel intro text overrides. Multi-vessel quotations show vessel selector bar in TradingTab. "All Vessels" edits `tradingWarrantyIntro` on quotation; specific vessel creates/edits override row. Export renders per-vessel intros with "M/V VESSEL:" headers, shared content (countries, DDQ, Israel) rendered once after all intros. IPC: `trading:getIntros`, `trading:addIntro`, `trading:updateIntro`, `trading:deleteIntro`.

### Quotation Section Order

Type-specific section ordering for quotation exports:

- **Per-type defaults**: Stored in `app_settings` with key `section_order_defaults_{typeCode}` (e.g. `section_order_defaults_P`)
- **Hardcoded fallbacks**: `PI_SECTION_ORDER` and `HULL_SECTION_ORDER` in `QuotationSettings.tsx`, accessed via `getDefaultSectionOrder(typeCode)`
- **Per-quotation override**: `quotations.sectionOrder` field overrides the type default
- **Fallback chain**: per-quotation → type-specific default → hardcoded default
- **Settings UI**: `SectionOrderTab` with P&I/Hull toggle to configure defaults per type
- **Editor modal**: `SectionOrderModal` loads type-specific defaults, filters sections by type-relevant keys

### Quotation Settings Organization

Two-tier navigation in `QuotationSettings.tsx`:

- **Top tier**: Segmented control — General (teal), P&I (blue `#6464ff`), H&M (pink `#ff64c8`)
- **Bottom tier**: Tab chips filtered by active category, colored to match category accent
- **Category mapping**: `CATEGORIES` array + `CATEGORY_TABS` record. Switching category auto-selects first tab.
- **Scalability**: Adding a new quotation type only requires a new entry in `CATEGORIES` and `CATEGORY_TABS`

### Quotation Collation Workaround

MariaDB collation mismatch (`utf8mb4_uca1400_ai_ci` vs `utf8mb4_unicode_ci`) causes FK constraint errors (errno 150) on quotation-related tables:

- **Affected tables**: `pi_warranty_set_items`, `quotation_custom_warranties`, `quotation_agreed_value_items`, `quotation_hull_conditions`, `quotation_hull_additional_conditions`
- **Defense layers**: (1) `schema.sql` execution wrapped with `SET FOREIGN_KEY_CHECKS=0/1`, (2) migration CREATE TABLE blocks wrapped, (3) CRUD methods (`addPIWarrantySet`, `updatePIWarrantySet`, `addQuotationCustomWarranty`, `setQuotationHullConditions`, `setQuotationHullAdditionalConditions`, `setQuotationAgreedValueItems`) wrapped with FK_CHECKS=0/1 in try/finally
- **`safeHandle` error pattern**: IPC handlers using `safeHandle` return `{ error: true, message }` on failure instead of throwing. Components must guard with `Array.isArray()` checks on all IPC results used in setState, and check `result.error` on single-object returns.

### Vessel Detail Navigation

- **Sections**: Toggle between Documents, Assured, Surveys, Policies, and Activity views via `detailView` state
- **External Navigation**: `initialSection` prop allows navigating directly to any tab
- **Navigation Chain**: App.tsx → VesselManager (initialVesselSection) → VesselDetail (initialSection)
- **Section Values**: `'documents'`, `'assureds'`, `'surveys'`, `'policies'`, `'activity'`
- **Auto-edit on add**: `VesselDetail` accepts `initialEditing?: boolean` prop → `useState(initialEditing)` opens in edit mode immediately. `VesselManager` sets `openInEditMode = true` after successful vessel creation; back handler resets it to `false`. Also requires `useEffect(() => { if (initialEditing) setIsEditing(true) }, [initialEditing])` to handle prop changes after mount.
- **Searchable edit dropdowns**: Classification society and flag state fields use custom searchable dropdowns (`classSearch`, `flagDropdownOpen`, `flagSearch` states). Classification shows search input when `classSocieties.length > 6`; flag filters by name AND iso3Code. The flag `+` (add new) button is retained alongside the dropdown.
- **Stale classification IDs**: The seeding `useEffect` checks `validIds.length === 0` (IDs that match current `classSocieties` list), not just `vesselClassificationIds.size === 0`. This handles the case where the junction table has IDs for societies that were deleted and re-added with new UUIDs.

### Vessel Activity Tab (Merged History + Timeline)

Unified activity view inside `VesselDetail.tsx` (rendered when `detailView === 'activity'`). Replaces the old separate History and Timeline tabs (VesselHistoryView component removed):

- **Merged data**: Aggregates audit log entries + timeline events (documents, policies, surveys, warranties, sanctions) into a single chronological view
- **Audit entries**: Show old→new values with strikethrough styling + "by username"
- **Search**: Single search input filters across all event types (field names, values, descriptions)
- **Filters**: Type chips + date range for timeline events
- **Layout**: Vertical timeline with month+year headers, colored icons per type
- **Assured changes**: Assured Added/Removed/Role changes logged in vessel_audit_log with purple icon, clean titles without "changed" suffix

### Vessel Document Expiry (`VesselDocumentsView`)

- **Expiry clear button**: explicit `×` (`X` icon, 18px circle) button renders next to the expiry date input when a date is set; calls `updateVesselDocumentExpiry(..., null)` directly. Chromium date input native clear is unreliable for controlled React inputs.
- **No expiry inheritance**: `uploadDoc` sets `expiryDate: undefined` (not `existing?.expiryDate || undefined`) so a newly uploaded file never inherits the previous file's expiry date.
- **Annual doc expiry row**: shows P&I date as a read-only cyan badge if found, plus an always-editable `<input type="date">` for the document's own stored expiry (with clear button). The doc's stored date is the fallback for compliance when no P&I policy end date is configured.

### Vessel Audit Log (`adapter.ts` — `updateVessel`)

The audit loop in `updateVessel` has two special normalizations:

- **Numeric fields** (`builtYear`, `grossTonnage`): MySQL `DECIMAL` columns return `"4737.00"` as a string from raw SELECT queries, but TypeScript sends `4737` as a number. Normalize both sides with `String(parseFloat(val))` before comparing to avoid false audit entries on every edit.
- **Customer field** (`customerId`): Before writing the audit entry, both old and new UUIDs are resolved to entity names via `SELECT id, name FROM entities WHERE id IN (?)`. Stores readable names instead of UUIDs in the log.
- **Assured changes**: Assured Added/Removed/Role changes logged as audit entries with field names like "Assured Added", "Assured Removed", "Assured Role". Purple icon in Activity tab, clean titles without "changed" suffix.

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

### What's New Modal & Release Notes Workflow

Auto-shown modal after each update displaying the changelog:

- **Component**: `WhatsNewModal.tsx` — shown automatically after login when `package.json` version > last-seen version stored per user in DB
- **Data source (priority)**:
  1. GitHub Releases API (`update:getChangelogs` IPC → `UpdateService.getChangelogs()`) — fetches live release notes for the installed version
  2. Fallback: `src/renderer/src/whatsNew.ts` `WHATS_NEW` array — used when GitHub is unreachable or the release has no body text
- **Version matching**: GitHub tag_name is `v5.x.x`; modal strips the leading `v` with `.replace(/^v/, '')` to match `package.json` version
- **Parsing**: `parseNotes(body)` extracts bullet lines (`- Tag: Text`); falls back to `WHATS_NEW` when parsed items array is empty

**Release workflow for each new version:**
1. Bump version in `package.json`
2. Replace `RELEASE_NOTES.md` content with the new version's changes (this file is used as the GitHub release body)
3. Add a new entry at the **top** of `WHATS_NEW` in `src/renderer/src/whatsNew.ts` (same version, same items as RELEASE_NOTES)
4. Create GitHub release tagged `vX.Y.Z`, paste `RELEASE_NOTES.md` as the release body
5. `RELEASE_NOTES.md` has a `!RELEASE_NOTES.md` exception in `.gitignore` (the file itself uses `*.md` exclusion)

### UpdateService

Electron-updater configuration (`src/main/services/UpdateService.ts`):

- **`allowPrerelease = false`**: Full installer updates only check stable releases, ignoring `code-latest` prerelease
- **Error handler**: Silently ignores errors related to `code-latest` tag (prevents false error notifications)
- **Changelog API**: Filters out `code-latest` releases when fetching changelogs for What's New modal

### Hot-Update System

Bootstrap + overlay architecture for code-only deployments without full installer rebuilds:

- **Entry point**: `src/main/bootstrap.ts` is the app entry (`package.json` main = `./out/main/bootstrap.js`)
- **Startup check**: On launch, checks `%APPDATA%/vessel-compliance/hot-update/out/` for cached code; if found, loads that instead of bundled code
- **Extract path**: Zip extracts into `out/` subdirectory (fixes path mismatch between zip structure and expected load path)
- **HotUpdateService** (`src/main/services/HotUpdateService.ts`): Checks GitHub `code-latest` prerelease tag for newer builds
- **Auto-apply**: Downloads and applies updates on startup (before window shows), restarts automatically
- **Window safety**: All `mainWindow` calls guarded against `isDestroyed()` during restart to prevent crashes
- **Background check**: Every 30 min while running; shows notification bar in renderer if update found
- **Deploy command**: `npm run deploy` builds + uploads `code-update.zip` to GitHub via `gh` CLI
- **Deploy script**: `scripts/deploy-update.js` — uses temp `.ps1` files, `--prerelease` flag, `--notes-file` for GitHub release
- **Build numbers**: Auto-incrementing, version shown as `v7.6.7b3` format in sidebar
- **Admin visibility**: Admin Panel → File Paths → Hot Updates section shows source/build/status
- **Worker threads**: Worker thread loads parser from ASAR (not hot-update cache) to ensure `node_modules` access
- **Isolation**: `electron-updater` configured with `allowPrerelease = false` + error handler ignores `code-latest`, so hot-updates and full updates do not interfere

### Code Style
- Prettier: Single quotes, no semicolons, 100 char width, no trailing commas
- Path alias: `@renderer/*` maps to `src/renderer/src/*`
- **Vessel Names**: Always uppercase (enforced via `toUpperCase()` on input and `textTransform: uppercase` CSS)
- **Danger color**: always `color: 'var(--danger)'` — never hardcode `#ff4d4d`, `#c00`, or `red`
- **Modal background**: `isLight ? '#ffffff' : '#1a1d28'` — never use `glass-card` class or `var(--bg-sidebar)` for modals
- **Input borders**: use `var(--input-border)` (color-only token), NOT `var(--glass-border)` (full border shorthand) for form controls
- **No native dialogs**: NEVER use `window.confirm`/`alert`/`prompt` — in Electron they steal keyboard focus and leave inputs "stuck". Use the promise-based in-app replacements from `src/renderer/src/components/DialogHost.tsx`: `confirmDialog(msg)`, `alertDialog(msg)`, `promptDialog(msg)`. `<DialogHost />` is mounted once in `main.tsx`.

## Database Setup

On first launch, admin enters MySQL credentials which are saved to `db-config.json`. Default admin credentials are `admin/admin123`. The schema auto-migrates on startup.

### Schema Migration Pattern

- Migration function: `initSchema()` in `adapter.ts` (around line 84)
- Pattern: `SHOW COLUMNS FROM table` → check if column exists → `ALTER TABLE ADD COLUMN` if missing
- All new columns must be **nullable** or have a **DEFAULT** value — never add `NOT NULL` without a default, as older versions may INSERT without the new column
- Add new table migrations before the `} catch (error)` block at the end of `initSchema()`
- Use unique variable names per migration block (block-scoped `const [cols]` repeated = TS2451 error)

### Role-Based Access Control (RBAC)

User groups and granular permissions:

- **User Groups** (`user_groups`): Named groups with descriptions, assignable to multiple users
- **Group Permissions** (`group_permissions`): Permission keys per group from `PERMISSION_CATEGORIES`
- **User-Group Membership** (`user_group_members`): Many-to-many, permissions are union of all groups
- **Per-User Overrides** (`user_permission_overrides`): Grant or deny specific permissions per user
- **Permission Resolution**: `rbacResolveUserPermissions` computes effective permissions (groups + overrides)
- **UI Enforcement**: `hasPermission()` from `useAuth()` gates buttons, tabs, sidebar items
- **Server Enforcement**: `requirePermission(event, 'key')` in IPC handlers
- **System Groups**: "Administrator" (all permissions) seeded on first run

### Policy System

Insurance policy document management:

- **Policy Documents** (`policy_documents`): Created from quotations via 6-step conversion wizard
- **Policy Numbering**: `{type_code}{inverted_year}{4-digit serial}` (e.g., P26200001)
- **Conversion Wizard** (`PolicySetupWizard.tsx`): Step 1: Vessel & Alternative, Step 2: Period & Premium, Step 3: Instalments, Step 4: Details, Step 5: Blue Cards (P&I only), Step 6: Review
- **Policy Detail** (`PolicyDetail.tsx`): Overview, Financial, Addresses, Blue Cards, Revision History, editing mode with 4 tabs
- **Policy List** (`PolicyList.tsx`): Stats, search, filters, sortable table with conversion/export dates
- **Policy Settings** (`PolicySettings.tsx`): Two-tier navigation (General/P&I/Hull/War) for opening clause, closing text, important notice, premium intro, font size, timezones, page numbering, footer, header titles, banks, cancel & replace, blue card texts, signatures, QR verification, T&C templates
- **Exports**: Policy DOCX, Debit Advice, Credit Advice, Blue Cards (individual), PDF+T&C combined
- **Instalment Dates**: Each 30 days = 1 calendar month from inception
- **Premium**: Uses payable amount (after NCB/UPCC discounts)

### Policy Revisions

- **Create Revision**: Clones policy with incremented revision number, old marked "Superseded"
- **Revision Suffix**: Internal `-R1`, `-R2` etc. appended to policy number
- **Blue Cards**: Carried over to new revision
- **Cancel & Replace**: Configurable footer text per document type, shown on revised documents
- **Edit vs Revise**: Edit available before first export, New Revision required after

### Policy Renewals

- **Renew Button**: Creates new quotation pre-filled from expiring policy
- **Period**: New inception = old expiry, new expiry = +1 year (string math, no timezone issues)
- **Change Highlighting**: Renewal quotation DOCX exports show differences in red (added) and red strikethrough (removed)
- **Tracking**: `renewed_from_policy_id` and `renewed_from_policy_number` on quotations

### Blue Cards

P&I insurance certificates:

- **Types**: BBC (Bunker), WRC (Wreck Removal), MLC4.2 (Shipowners' Liability), MLC2.5.2 (Repatriation)
- **Issue/Reissue**: Per-type with auto-incremented numbers (P26200001/BBC, P26200001-2/BBC)
- **Owner Override**: Per-card owner entity selection
- **Port of Registry**: From flag state ports, auto-selected if single
- **Addressed To**: BBC/WRC addressed to flag authority; warns if flag not ratified, offers alternative
- **Cancel & Replace**: Auto-checked if periods overlap, configurable text with placeholders
- **Status**: Active / Superseded (one active per type)
- **Export**: Individual DOCX per card matching real certificate templates

### Digital Signatures

- **User Signatures** (`user_signatures`): LONGBLOB image per user, managed in Policy Settings
- **Permission**: `policies:sign` — only authorized signers
- **Sign Button**: In PolicyDetail header, requires signature uploaded
- **Placement**: Signature image in footer (every page, bottom-right) + closing section (above THE INSURER)
- **Tracking**: `signed_by`, `signed_at` on policy_documents

### Terms & Conditions Automation

- **T&C Templates** (`policy_tc_templates`): One DOCX per policy type, uploaded in Policy Settings
- **DOCX→PDF**: Via Microsoft Word COM (PowerShell) or LibreOffice (headless fallback)
- **Dynamic Page Numbering**: Counts policy PDF pages, injects `w:pgNumType` into T&C DOCX
- **PDF Merging**: `pdf-lib` combines policy + T&C into single document
- **Export**: "Export Policy (PDF + T&C)" button in PolicyDetail

### QR Verification

- **Settings**: Configurable verification URL base in Policy Settings → QR tab
- **Placement**: Verification link on last policy page before closing
- **Format**: `{baseUrl}{policyNumber}`

### QuickBooks Export

- **64-column Excel**: Matches accounting system template
- **Deductible Encoding**: Letter codes + amount/1000 (e.g., C10P5O25)
- **Base Currency**: App setting (default USD) with exchange rate per policy
- **Export Button**: "QB Export" in PolicyDetail

### Notification System

Personal event-driven notifications:

- **Bell Icon**: Sidebar with unread count badge, polls every 30 seconds
- **Notifications Page** (`NotificationsPage.tsx`): Filters (All/Unread/Notes/Policies/System), type icons, relative time
- **Event Triggers**: Note replies, @mentions, workflow transitions, policy conversions, endorsement due
- **Notification Groups** (`notification_groups`): Route notifications to teams with event subscriptions
- **Daily Alert Scheduler** (`DailyAlertScheduler.ts`): Automated checks for expiring documents, policies, blue cards, warranty deadlines, endorsements due
- **Auto-cleanup**: Read notifications deleted after 90 days

### Note Replies & @Mentions

- **Threaded Replies**: `parent_note_id` on note tables, indented view in UI
- **@Mentions**: Type `@` for username autocomplete, creates `note_mention` notification
- **Vessel Notes + Quotation Notes**: Both support replies and mentions

### Activity Log

- **Table**: `activity_log` with indexes on created_at, module, user_id
- **Page** (`ActivityLog.tsx`): Filters by module/action/user/date, pagination (25/page)
- **Colored Badges**: Action (CREATE/UPDATE/DELETE/LOGIN/EXPORT) and module badges
- **Export**: PDF audit report + Excel export
- **Retention**: Configurable (90/180/365 days/never), auto-cleanup on startup

### Document Templates

Unified template system (merged email + document):

- **Templates** (`document_templates`): Rich text body with `{{placeholder}}` markers
- **Categories**: General, Policy, Quotation, Vessel, Entity, Certificate, Email
- **Placeholders**: 20+ fields (vesselName, imoNumber, policyNumber, customerName, today, etc.)
- **Actions**: Generate DOCX (with policy header/footer) or Copy Text (for emails)
- **Template Manager** (`DocumentTemplateManager.tsx`): Two-panel layout, placeholder chips

### Report Builder

Customizable reports with 9 data sources:

- **Data Sources**: Vessels, Policies, Entities, Renewals, Quotations, Policy Documents, Documents, Surveys, Survey Warranties
- **Config**: Column checkboxes, dynamic filters per source, group-by, sort
- **Chart View**: Horizontal bar charts with metrics (Count, Sum Premium, Avg Premium)
- **Save/Share**: Named report configs saved to DB, shareable with team
- **Export**: Excel + PDF with company header
- **Pagination**: 50 rows per page

### Global Search

- **Shortcut**: Ctrl+K / Cmd+K opens search modal
- **Sources**: Vessels (name/IMO), Entities (name), Quotations (reference), Policies (number)
- **UI**: Grouped results, keyboard navigation (arrows/Enter/Esc), debounced input

### Customizable Dashboard

Widget-based dashboard with per-user layout:

- **12 Widgets**: Key Metrics, Expirations, Operational Status, Recent Vessels/Entities/Changes, Data Quality, Week Renewals, Renewal Calendar, Quotation Pipeline, Quick Actions, Fleet Overview
- **Edit Mode**: Toggle widgets on/off, reorder, category filter
- **Calendar Widget**: Monthly grid with colored dots for policy/document/survey/warranty events
- **Onboarding**: First-time overlay explaining customization
- **Layout**: CSS Grid (full/half/third column spans), saved per user with debounce

### Recent Items

- **Table**: `user_recent_items` with UPSERT, max 20 per user
- **Sidebar**: Collapsible RECENT section, last 8 items with type-specific icons
- **Tracked**: Vessel, quotation, policy, entity views

### Vessel Timeline

**Merged into Activity tab** — Timeline and History are now a single "Activity" tab in VesselDetail. See "Vessel Activity Tab" section above.

- **Data sources**: Aggregates 6 sources (audit, documents, policies, surveys, warranties, sanctions)
- **Merged Events**: Same-day same-type events grouped with count + expand
- **Filters**: Type chips + date range (default last 12 months)
- **Layout**: Vertical timeline with month+year headers, colored icons per type

### Data Validation Rules

- **Built-in Rules**: 8 predefined (vessels without customer, entities without email, etc.)
- **Custom Rules** (`custom_validation_rules`): Admin-created with entity type, field, operator, value, severity
- **Compliance Center Tab**: "Data Quality" with toggle on/off per rule
- **Operators**: is_null, is_empty, equals, not_equals, less_than, greater_than, contains, not_contains

### Entity Addresses

- **Table**: `entity_addresses` (id, entity_id, label, address_text)
- **Per-Vessel-Role**: `vessel_assureds.address_id` links to specific address
- **Add from Policy**: Addresses entered in policy editing sync back to entity
- **Remap**: File path remap extended to entity documents

### Flag State Enhancements

- **Ratification**: `ratified_bunker`, `ratified_wreck` boolean flags
- **Maritime Authority**: `authority_name`, `authority_address` for blue card addressing
- **Ports of Registry** (`flag_state_ports`): Multiple per flag with default selection
- **Display Name**: Formal name for documents (e.g., "Union of Comoros")
- **Redesigned**: Table + slide-in panel layout with stats strip

### P&I Alternatives

Per-quotation P&I alternatives (similar to hull):

- **Table**: `quotation_pi_alternatives` with label, premium_amount
- **Alternative Selector Bar**: Below tab row, colored chips per alternative
- **Per-Alternative Scoping**: Conditions, warranties, deductibles, exclusions can be scoped to specific alternatives
- **Export**: Alternative-specific content with "Additional applicable to Alternative N" sections

### Per-Vessel Hull Clauses

- **`vessel_scope_id`** on `quotation_hull_alternatives`: Links alternative to a specific vessel
- **Vessel Selector**: In HullConditionsTab when 2+ vessels
- **Export**: Per-vessel sections with vessel names instead of "Alternative 1/2"
- **`include_in_shared` toggle**: `include_in_shared TINYINT(1) DEFAULT 1` on `quotation_hull_alternatives`. When a vessel has an override, HullConditionsTab shows "Also include in shared conditions" toggle. When enabled (default), that vessel also appears in the shared section of the export. Toggle updates ALL alternatives for that `vesselScopeId` at once.
- **`includeInShared` in export**: `sharedSectionVesselIds` = non-override vessels PLUS override vessels where `includeInShared !== false`. Override vessels with `includeInShared = false` appear only in their dedicated per-vessel section.

### Survey Warranty Templates for Quotations

- **Templates** (`survey_warranty_templates`): Text with {deadline}, {days}, {event}, {surveyor}, {dateofsurvey} placeholders. Title field for easy reference.
- **Placeholders**: {deadline} (blue), {days} (purple), {event} (red), {surveyor} (green), {dateofsurvey} (amber)
- **Sets** (`survey_warranty_template_sets`): Named groups for batch-apply
- **Editor Tab**: "Survey Warranties" in all quotation types. Templates and selected items visually separated.
- **Placeholder Inputs**: Dropdown presets for deadline, number input for days, text for event/surveyor/dateofsurvey
- **Editable text**: Pencil icon on each selected survey warranty opens inline text editing for the resolved text
- **Vessel scope**: VesselScopeChips shown on each survey warranty when 2+ vessels; per-vessel scoping stored in `vessel_scope`
- **Days=0 handling**: When `{days}` is 0, "within 0 days of inception" renders as "prior inception" in exports

### Bulk Operations

- **Vessel Table**: Multi-select with toolbar (Assign Fleet, Change Status, Export, Clear)
- **Entity Table**: Multi-select with toolbar (Export, Delete, Clear)
- **Hidden by Default**: "Select" toggle button shows/hides checkboxes

### Column Preferences

- **Table**: `user_column_prefs` (user_id, page_key, visible_columns JSON)
- **ColumnSelector Component**: Gear icon with checkbox dropdown, hidden count badge
- **Applied To**: VesselManager, QuotationList, PolicyList, PolicyRenewals, EntityDirectory, ConditionSurveyList, FleetManager, FleetDetail, SurveyorDirectory, ActivityLog, UserManager

### Vessel Comparison

- **Location**: VesselFilter results page
- **Select**: Checkboxes on 2 vessels → "Compare" button
- **Modal**: Side-by-side: General info, Policies, Documents, Sanctions

### Rebuilt Year

- **Field**: `vessels.rebuilt_year` (nullable)
- **Edit**: Hidden "+ Rebuilt Year" button, expandable
- **Display**: "1972/1992" in quotations/reports, "Built: 1972 - Rebuilt: 1992" in policies

### Table Row Density

- **Toggle**: Compact/Normal/Spacious in user profile dropdown
- **CSS Classes**: `density-compact`, `density-normal`, `density-spacious` on body
- **Persisted**: localStorage per user

### UI Polish

- **Animations**: Page fade+slide (0.25s), card hover shadow, button scale on click
- **Scrollbars**: Thin 6px, theme-aware
- **Input Focus**: Accent border + glow ring
- **Print CSS**: @media print styles for paper output
- **Right-Click**: Context menu with Cut/Copy/Paste/Select All

### Vessel Type (FK-based)

Vessel type stored as FK reference, not text. Renaming a type in settings auto-reflects on all vessels.

- **Field**: `vessel_type_id` (FK to `vessel_types`) on `vessels` table. Legacy `vessel_type` text column kept as fallback.
- **Queries**: `getVessels`/`getVesselsPaginated` use `COALESCE(vt.name, v.vessel_type)` via LEFT JOIN
- **Migration**: Auto-matches existing text values to `vessel_types` by name (case-insensitive), creates missing types
- **VesselDetail**: Dropdown uses `vt.id` as value, not name
- **Audit log**: Resolves vessel type IDs to names for readable history
- **Excel import**: Resolves type names to IDs, auto-creates missing types

### Quotation List View

Redesigned quotation list with view tabs, month navigation, and chip filters:

- **View tabs**: Active (default, excludes converted), Converted, All, plus saved custom views as tabs
- **Month navigator**: Arrow-based navigation centering on M. Default range shows M-1, M, M+1 (3-month window). Label shows the range e.g. "Apr – Jun 2026"; handles year boundaries ("Dec 2025 – Feb 2026"). "Today" button resets to current month.
- **Search**: Bypasses all date/view filters to search ALL quotations. Shows "ALL" indicator when active.
- **Chip filters**: Status and type as toggle chips with counts (not dropdowns)
- **Compact stats**: Inline total count instead of large glass cards
- **Backend**: `viewFilter` supports `'active'` (excludes converted) and `'converted'` in addition to all/registry/drafts

### Fleet Dropdown (Vessel List)

Per-vessel fleet assignment uses a searchable combobox:

- **Search**: Type to filter fleets by name
- **Sorted**: Fleets listed alphabetically
- **Create inline**: "Create Fleet" button at bottom of dropdown, Enter to confirm
- **Filter dropdown**: Fleet filter in toolbar also sorted alphabetically

### War P&I Excess (Section 2)

Two-section war quotations: Section 1 (Hull War) + Section 2 (P&I in excess of Hull):

- **Toggle**: `warExcessEnabled` boolean on `quotations` — enables Section 2 fields in SumInsuredTab
- **Quotation fields**: `war_excess_amount`, `war_excess_rate`, `war_section1_text`, `war_section2_text`, `war_combined_limit_text`
- **Per-vessel fields**: `war_excess_amount`, `war_section1_premium`, `war_section2_premium` on `quotation_vessels`
- **Section 2 formula**: `(section2Amount - section1Amount) × rate` — the excess over Hull value
- **Default rates**: Section 1 = 0.03%, Section 2 = 0.0075% (configurable in war settings)
- **SumInsuredTab**: Per-vessel hull values (Section 1), Section 2 amount/rate, configurable section descriptions and combined limit text. Premium hidden when excess enabled (shown in PremiumTab instead).
- **PremiumTab**: Per-vessel cards with Section 1 + Section 2 premium inputs (both single and multi-vessel)
- **Export Interest section**: Section 1 + Section 2 descriptions
- **Export Sum Insured/Limits**: Per-vessel Section 1 amounts as table + Section 2 amount + combined limit text
- **Export Premium**: Per-vessel Section 1 + Section 2 premium lines
- **War settings** (`war_settings` JSON): `defaultExcessRate`, `section1Text`, `section2Text`, `combinedLimitText`
- **Section order**: `interest` added before `sumInsured` in WAR_SECTION_ORDER

### LOL Alternatives (P&I)

Multiple Limit of Liability options without full P&I alternatives:

- **Table**: `quotation_lol_options` (id, quotation_id, label, amount, currency, premium_amount, order_index)
- **UI**: Click "Add LOL Alternative" → primary LOL becomes Alternative 1, empty Alternative 2 created. Add more with "Add Alternative". Delete down to 1 reverts to primary.
- **PremiumTab**: Per-alternative premium inputs when LOL options exist
- **Export**: Alternatives listed at top of LOL section, shared text below. Per-alternative premium lines.
- **Clone/duplicate**: LOL options copied to new quotation

### Warranty & Subjectivity Multi-Type Scope

Warranties and subjectivities can apply to multiple quotation types:

- **`type_scope` column**: VARCHAR(50), stores comma-separated values (e.g., `'pi,war'`, `'hull,war'`)
- **UI**: Toggle chips (All / P&I / Hull / War / Cargo) in QuotationSettings — multiple selectable
- **Filtering**: `typeScope.split(',').includes(typeCode)` throughout WarrantiesTab, SubjectivitiesTab, exports
- **Display**: Separate colored pills per type (P&I=blue, Hull=pink, War=amber, Cargo=teal)

### Draft Reference Numbers

Draft quotation references include the policy type code:

- **Format**: `DRAFT-{code}-{sequential}` (e.g., `DRAFT-P-0001`, `DRAFT-H-0002`, `DRAFT-W-0003`)
- **Applied to**: new quotations, duplicates, revisions, renewals
- **Revision suffix**: `/RN` appended (e.g. `Q/N/P/26/1552/R1`)
- **Backward compatible**: `startsWith('DRAFT-')` checks work for both old and new formats

### Number Input Behavior

- **Spinners hidden**: CSS removes up/down arrow buttons from all `<input type="number">`
- **Keyboard arrows blocked**: Global `keydown` handler prevents ArrowUp/ArrowDown on number inputs
- **Rich text paste**: RichTextEditor strips formatting on paste (plain text only)

### Key Tables

- `users` - User accounts with auth, theme, window preferences, sidebar state, sanctions threshold, full_name
- `vessels`, `fleets` - Vessel registry and fleet grouping
- `entities`, `vessel_assureds`, `entity_ubos` - Assured parties and beneficial owners
- `document_types`, `vessel_documents` - Document requirements and uploads
- `document_type_policy_types` - Junction table tagging doc types with applicable policy types
- `vessel_custom_doc_types` - Per-vessel custom document types
- `flag_states` - Vessel flag state registries
- `policy_types`, `policy_type_characteristics` - Insurance policy type classifications and configurable fields
- `vessel_dynamic_policies`, `vessel_policy_values` - Dynamic policy instances and their field values
- `surveyors`, `condition_surveys`, `survey_defects`, `survey_attachments` - Survey management
- `survey_warranties`, `warranty_reminders` - Warranty tracking and reminder log
- `compliance_check_logs` - History of scheduled/manual compliance runs
- `compliance_check_results` - Individual sanctions matches pending review
- `vessel_name_history`, `vessel_audit_log` - Vessel change tracking
- `war_breach_records` - Saved War Breach Calculator results
- `quotation_types` - Quotation type definitions (P&I, H&M, War Risk, FDD, Loss of Hire) with code and order
- `quotations` - Insurance quotation records (section_texts_override is MEDIUMTEXT, quotation_type_id FK, workflow_step_id, pro_rata_enabled, outstanding_premium_enabled, full_premium_loss_enabled, deleted_at, deleted_by, subjectivity_days)
- `pi_warranties`, `pi_warranty_tags`, `pi_warranty_tag_map` - P&I warranty definitions with tag categorization
- `pi_warranty_sets`, `pi_warranty_set_items` - Named warranty groups with default_selected flag
- `quotation_warranties` - Per-quotation warranty selections with order_index
- `quotation_custom_warranties` - Per-quotation ad-hoc custom warranties
- `pi_clauses`, `pi_clause_sets`, `pi_deductibles`, `pi_exclusions` - Other quotation config tables
- `pi_additional_clauses`, `pi_additional_clause_sets` - Additional clauses with title, code, text, and preset groups
- `pi_subjectivities` - Subjectivity definitions with type_scope (pi/hull/both)
- `pi_section_texts` - Global default section text templates
- `hull_clauses`, `hull_clause_conditions` - Hull clause definitions and their conditions
- `hull_additional_conditions` - Hull additional conditions with title field
- `hull_agreed_value_texts` - Hull agreed value template texts
- `quotation_hull_alternatives` - Per-quotation hull clause alternatives with premium
- `quotation_agreed_value_items`, `quotation_hull_conditions`, `quotation_hull_additional_conditions` - Per-quotation hull item selections (conditions support alternative_id)
- `quotation_lol_options` - LOL alternative options for P&I quotations
- `trading_warranty_templates` - Reusable trading warranty intro text templates
- `renewal_status_types` - Custom renewal status labels for policies
- `app_settings` / `settings` - Key-value store for app settings (report settings, file types, compliance schedule, section_order_defaults_{typeCode}, etc.)
- `policy_documents` - Insurance policy records with dates, premium, commission, bank, signature, subjectivity_days
- `policy_doc_instalments` - Policy instalment schedule
- `policy_doc_addresses` - Per-policy insured addresses
- `policy_blue_cards` - Blue card certificates with status, owner, port, addressed-to
- `policy_tc_templates` - T&C Word templates per policy type
- `banks` - Bank details for debit advice
- `user_groups`, `group_permissions`, `user_group_members` - RBAC groups and permissions
- `user_permission_overrides` - Per-user permission grants/denies
- `notifications` - Personal event-driven notifications
- `notification_groups`, `notification_group_members`, `notification_group_subscriptions` - Notification routing
- `activity_log` - System-wide audit trail
- `document_templates` - Rich text templates with placeholders
- `saved_reports` - Report Builder saved configurations
- `user_recent_items` - Recently viewed items per user
- `user_signatures` - Digital signature images per user
- `user_column_prefs` - Per-user table column visibility
- `custom_validation_rules` - Admin-created data quality rules
- `entity_document_types` - Configurable entity document type definitions (scope, required, order, active)
- `entity_documents` - Per-entity document records (file_path, expiry, received; UNIQUE entity_id+document_type_id)
- `entity_addresses` - Multiple addresses per entity
- `flag_state_ports` - Ports of registry per flag state
- `quotation_pi_alternatives` - P&I alternatives per quotation
- `survey_warranty_templates`, `survey_warranty_template_sets` - Survey warranty templates (title, {surveyor}/{dateofsurvey} placeholders)
- `quotation_survey_warranties` - Per-quotation survey warranty selections (surveyor_value, date_of_survey_value columns)
- `quotation_workflow_steps` - Workflow step definitions with can_edit/is_initial flags (can_export removed)
- `quotation_workflow_log` - Workflow transition history per quotation
- `premium_text_templates` - NCB/UPCC text templates
- `trading_custom_texts` - Custom trading warranty replacement texts
- `email_templates` - Legacy email templates (migrated to document_templates)
- `analytics_presets` - Fleet analytics saved filter presets
- `policy_type_commissions` - Default commission % per policy type
- `entity_commission_overrides` - Per-customer per-type commission overrides
- `quotation_hull_custom_conditions` - Per-quotation custom hull additional conditions (free text)
- `quotation_trading_intros` - Per-vessel trading warranty intro text overrides (vessel_scope JSON)
- `defect_attachments` - Per-defect photo/evidence attachments (file_path, file_name)
- `sanctions_report_checks` - Saved ad-hoc sanctions screening reports (subject_name, entity_id, entity_type, threshold, decision, results_json, checked_by, checked_at)

**SQLite tables** (in `sanctions.db`, separate from MySQL):
- `entities` - Sanctions list entities (OFAC, EU, UN, ISF, SIC) with name, name_normalized, aliases, identifications, programs, vessel_imo, mother_name, father_name
- `data_updates` - Per-source refresh metadata (last update, record count, release date)

### Commission Defaults

3-tier commission hierarchy for policies:
- **Policy type default**: `policy_type_commissions` table, managed in Policy Settings → Commissions tab
- **Customer override**: `entity_commission_overrides` table, per entity + policy type. Managed in Policy Settings + Entity Directory slide-in panel
- **Per-policy**: `commissionPercent` on `policy_documents`, editable in wizard and PolicyDetail
- **Resolution**: `commissionResolve(entityId, policyTypeId)` — customer override → type default → null
- **Wizard auto-fill**: PolicySetupWizard resolves commission on load using `quotationTypeId || policyTypeId`

### War Declaration Export

Reinsurance declaration document for War policies:
- **Export button**: "Export Declaration" in PolicyDetail actions menu (War policies only)
- **Editable modal**: All fields pre-filled from policy/quotation, fully editable before export
- **Fields**: Year of Account, UMR, Reinsured, Assured, Vessel (with IV split), Period, Wording (from war conditions), Warranties, Annual Rate, Our Share, Trading, Risk Code, Amlin Ref
- **Settings**: Policy Settings → Declaration tab with per-year UMR, Amlin Ref, Risk Code stored in `declaration_settings` app_settings key
- **Schema**: `our_share DECIMAL(5,2)` on `policy_documents`
- **No headers/footers**, filename: `{policyNumber} - {vesselName} (Declaration).docx`

### Custom Hull Additional Conditions

Per-quotation free-text hull conditions (not from master settings list):
- **Table**: `quotation_hull_custom_conditions` (id, quotation_id, text, title, order_index, vessel_scope, alternative_id)
- **UI**: Custom conditions are merged into the **Additional Conditions** sub-tab in HullConditionsTab (the separate "Custom" tab was removed). One "Conditions Order" list shows additional + custom together with up/down reorder buttons (drag also works).
- **Shared order namespace**: additional and custom conditions share ONE gap-free `order_index` sequence so they interleave. `mapAddForSave` always carries `order`; the reorder renumbers the FULL set (including hidden/orphaned additional) to avoid collisions; `addQuotationHullCustomCondition`/toggle assign order = max(additional+custom)+1; a normalize-on-load fixes legacy overlapping namespaces once.
- **Export**: custom rendered as interleaved bullets with additional (by shared order) in BOTH quotation and policy exports — NOT appended as a separate trailing block. `getAddlBelonging` returns `'none'` (excluded) for additional conditions linked only to clauses no active alternative/IV uses (orphan hiding); the policy export mirrors this with an `activeClauseIds` filter.
- **Bullet/list rendering**: `mpBullet`/`polMpBullet` bullet a leading intro `<p>` that precedes an embedded `<ul>/<ol>` (e.g. GA clause), and nest the list + closing paragraph under it via the `indentOffset` option on `parseHtmlToParagraphs`.
- **Cloned**: On quotation duplicate/renewal via `cloneQuotationJunctions`

### Quotation Editing Lock

Prevents concurrent editing of the same quotation:
- **Schema**: `locked_by VARCHAR(36)`, `locked_at DATETIME` on `quotations`
- **Auto-lock**: QuotationEditor locks on mount, unlocks on unmount
- **Blocked opening**: Locked quotations cannot be opened by other users (not read-only — fully blocked)
- **Heartbeat**: Every 2 min refreshes `locked_at` to keep lock alive
- **Inactivity detection**: After 10 min idle (no mouse/keyboard), heartbeat stops
- **5-min expiry**: Safety net for crashes (reduced from 30 min)
- **Admin force-unlock**: `quotationForceUnlock` IPC; force-unlock button (X) in QuotationList
- **List indicator**: Lock icon next to reference number in QuotationList
- **No updated_at change**: Lock/unlock uses `updated_at = updated_at` to prevent list reordering

### Policy Export Improvements

- **Single instalment**: "Premium of {currency} {amount} shall be payable on {date}..." (configurable in Settings)
- **Debit Advice**: Compact header (company only), title size 10 bold underline, 2-column instalment table, premium on one line with words + "Only", period as 3-column table, bank details without title
- **Credit Advice**: Broker from quotation customerEntityId at top, broker excluded from Insured + c/o line, commission wording configurable in Settings (placeholders: `{instalments}`, `{date}`), reduced cell margins
- **Blue Cards (BBC/WRC)**: NOT TRANSFERABLE left / REF right, 3-column vessel table (label|:|value bold) with FIXED layout, 3-column period table, owner section without border, port includes country
- **MLC Blue Cards**: Same vessel table design, provider address bold uppercase zero spacing, contact details in 2-column table
- **Footer**: Strips HTML tags, splits by `<br>`, Arial 9pt left-aligned not italic
- **Header spacing**: `spacingAfter: 0` on all document headers (policy, DA, CA, blue cards)
- **QR Code**: Actual QR image via `qrcode` package, URL uses IMO number not policy number
- **Draft policy numbers**: `POL-DRAFT-{code}-XXXX` format (includes type code)

### HullConditionsTab Compact Redesign

- **Single card**: Merged 3 separate glass-cards into one with 16px padding
- **Compact HullConditionPicker**: Single-line rows with accordion expand (one at a time) for override/amount/scope
- **Collapsible sections**: Conditions (expanded), Additional Conditions (collapsed), Custom Conditions (collapsed) — each with chevron + count badge
- **Section dividers**: Thin 1px borders between sections

### SumInsuredTab MoneyInput

- **MoneyInput component**: Shows thousand separators when not focused, raw number while editing
- **Applied to**: Sum insured amount, per-vessel amounts, Section 2 amount, premium, deductible amounts

### Quotation Registry (Excel-Based Numbering)

Excel registry file for quotation numbering and logging:
- **Path**: Configurable in Admin Panel → File Paths → Quotation Registry
- **Format**: `Q/{R|N}/{branch}/{YY}/{serial}` — R=Renewal, N=New, branch=P/H/W/C/F
- **Serial**: Read from last row column D of current year sheet, incremented
- **Row data**: Date, Quotation Type, Branch, Serial, Reference, Managers, Vessel, IMO, Type, Broker, Remarks
- **Cancelled**: Moving away from Approved marks row as CANCELLED in Remarks column (K)
- **Year sheets**: Auto-created when year changes
- **Fallback**: DB counter used if no registry path configured
- **File locked**: Approval fails with error if Excel is open
- **Write method**: Uses Excel COM via PowerShell to preserve tables/formulas/formatting. Falls back to `xlsx-js-style` if Excel is not installed. Reads still use `xlsx-js-style`.
- **IPC**: `quotationRegistry:getPath`, `quotationRegistry:setPath`, `quotationRegistry:browse`
- **Service**: `src/main/services/QuotationRegistryService.ts`

### Quotation Workflow Enforcement

- **Initial step**: New quotations auto-assigned the `isInitial` workflow step
- **canEdit**: Step constraint enforced — `canEdit=false` disables editing with blue banner
- **Approve & Export**: Gated by `hasPermission('quotations:approve')`, not by workflow step's `canExport` (dead column removed from workflow settings)
- **Create Revision**: Visible for approved quotations, gated by `hasPermission('quotations:edit')` not `canEdit`
- **isDraft**: Checks `q.status === 'draft'` — not reference number prefix. Draft quotations with real references (revisions) get registry numbers correctly.
- **isApproved**: Checks `status` field only — no longer checks reference number format
- **Step deletion**: Blocked when quotations exist on the step
- **Single initial**: Setting a step as initial unsets all others
- **Transaction**: Workflow move (update + log insert) wrapped in transaction, validates transition exists
- **Workflow log**: History button in editor shows transition log dropdown
- **Approved = read-only**: Green banner + pointer-events overlay blocks all interaction. "Create a new revision from the Actions menu"
- **Status flow**: `draft` → `approved` (on approval) → `exported` (on export) → `converted` (on policy conversion)
- **Status badges**: Colored badges in QuotationList (draft=gray, approved=green, exported=teal, converted=purple)
- **Locked quotations**: Blocked from opening entirely (not read-only, error toast)

### Quotation Lock Heartbeat

- **Heartbeat**: Pings every 2 min to refresh `locked_at` while editor is open
- **Inactivity**: After 10 min idle (no mouse/keyboard), heartbeat stops
- **Lock expiry**: 5 min (reduced from 30 min)
- **Re-lock**: When user returns from idle, attempts to re-acquire lock
- **Admin force-unlock**: Unlock button in QuotationList actions column (admin only), lock badge with username next to reference
- **IPC**: `quotation:heartbeat`

### Quotation Export Enhancements

- **Revision display**: Centered "Rev.N" below title (not in title text)
- **Reference**: Includes `/RN` suffix for revisions
- **Export date**: Always today (not quotation creation date)
- **Filename**: `{subject} - {type} Quote {year} - {broker}` — 1 vessel=name, 2=Name1 & Name2, 2+ same fleet=fleet, 3+ same manager=manager, else first and others
- **Draft export**: Users without `quotations:approve` get toast "Exporting as draft"; users with permission get Approve & Export modal
- **TBA**: When no assureds defined, shows "TBA" as Registered Owners
- **IACS first**: Dual-classed vessels show IACS classification first in all displays/exports
- **Previous premium in red**: UPCC discount table shows "(previously USD X)" in red in DOCX

### Pro-Rata Premium

Sub-annual quotation premium with auto-detection:
- **Detection**: Parses `periodText` for "X months" / "X year(s) Y months" patterns
- **Fields**: `is_pro_rata`, `annual_premium_amount`, `pro_rata_months` on quotations
- **UI**: Annual Premium input (p.a.) + Pro-Rata Premium (calculated) + editable months + enable/disable toggle
- **Calculation**: `annualPremium / 12 × months`
- **Export**: Annual amount "per annum" line + "Pro-rata premium: {currency} {amount}" line
- **Not for cargo**: Cargo has its own rate-based premium

### Outstanding Premium & Full Loss Notices

Two checkbox-based notices in PremiumTab (non-cargo):
- **Outstanding Premium**: Configurable text + bold/underline toggles. Default: "All outstanding premium to be settled prior inception". Enabled by default on new quotations.
- **Full Premium Loss**: Configurable text (no formatting). Default: "Full annual premium payable in case of loss."
- **Non-refundable default**: New quotations default to `nonRefundableType = 'first_instalment'`
- **Default texts**: `outstandingPremiumDefaultText` and `fullPremiumLossDefaultText` configurable in Quotation Settings → Standard Texts → Premium section of `PISectionTexts`
- **Settings**: Defaults in Policy Settings → Premium Intro
- **Export**: Rendered after instalments in quotation (PDF/DOCX) and policy exports

### Entity Classification (IACS Priority)

- **IACS first**: When a vessel has dual classification societies, IACS member is always displayed first
- **Applied to**: VesselDetail display, quotation exports, policy exports

### Cargo Quotation Specifics

- **Rate-based premium**: Rate % input → calculated premium amount (no "p.a." suffix, no previous premium display)
- **TBA vessel**: "Any other vessel(s) to be agreed" checkbox (cargo-only, updates local state via `setQ`)
- **Cargo clause**: Cargo warranties and exclusions only visible when cargo quotation type OR cargo clause selected in P&I conditions

### User Management Enhancements

- **Editable username**: Username can be changed (uniqueness enforced server-side)
- **Full name**: Optional `full_name` field on `users` table
- **Version comparison**: Build numbers parsed numerically (not string comparison) for correct ordering

### Vessel Classification Change

- **Confirmation modal**: When selecting a new class and one exists, asks "Replace" or "Add Alongside"
- **Prevents accidental dual-class**: Users who meant to change class won't accidentally add a second one

### File Path Resolution (Remote/VPN Users)

Configurable local↔network path mapping for users connecting via VPN:

- **Admin Settings**: File Paths section with Local Path (server, e.g. `C:\folder1`) and Network Path (UNC, e.g. `\\192.168.10.1\folder1`)
- **Auto-detection**: Reads `db-config.json` host — `localhost`/`127.0.0.1` = server user, other = remote user
- **`resolveFilePath(dbPath)`**: Replaces local prefix with network prefix for remote users (used in `fs:open`, `shell:showItemInFolder`)
- **`canonicalizeFilePath(userPath)`**: Replaces network prefix with local prefix before saving to DB (used in `dialog:openFileAny`)
- **Upload blocking**: Remote users blocked from uploading files not on the shared folder (`isSharedPath` check)
- **`fileTypesValidateFile`**: Returns `canonicalPath` alongside validation for drag-drop uploads
- **Settings stored in**: `app_settings` key `filePathSettings` (JSON: `{ localPath, networkPath }`)
- **IPC**: `filePath:getSettings`, `filePath:setSettings`, `filePath:canonicalize`, `filePath:resolve`

### Abandoned Draft Quotation Cleanup

- **QuotationEditor**: Tracks edits via `hasEdited` ref, set `true` on any `updateField` call
- **Back navigation**: If draft + no edits + created <60s ago + no vessels → auto-deleted
- **Applies to**: Renewal quotations from PolicyRenewals, new quotations — prevents orphaned empty drafts

### Quotation Recycle Bin

Soft-delete system for quotations with restore capability:

- **Schema**: `deleted_at DATETIME` + `deleted_by VARCHAR(36)` columns on `quotations` table
- **Soft delete**: `deleteQuotation` sets `deleted_at` timestamp instead of hard DELETE. Delete messages say "moved to recycle bin".
- **Restore**: `restoreQuotation` clears `deleted_at` and `deleted_by`
- **Permanent delete**: `permanentlyDeleteQuotation` requires `quotations:bulkDelete` permission
- **Filtered queries**: `getQuotations` filters `WHERE deleted_at IS NULL` — soft-deleted items hidden from normal views
- **Recycle Bin tab**: Right-aligned tab in QuotationList with trash icon. Shows soft-deleted quotations with Restore + Permanently Delete actions.
- **Error display**: Delete shows actual error from `safeHandle` instead of silent success
- **IPC**: `db:getDeletedQuotations`, `db:restoreQuotation`, `db:permanentlyDeleteQuotation`

### Subjectivity Days

Configurable subjectivity compliance period per quotation and policy:

- **Fields**: `subjectivity_days INT DEFAULT 0` on `quotations`, `subjectivity_days INT DEFAULT 7` on `policy_documents`
- **UI**: Number input in SubjectivitiesTab
- **Export**: Uses `{subjectivity_days}` placeholder in standard text intro. Handles both placeholder and old hardcoded text.
- **Rendering**: 0 = "prior inception", N = "within N days"
- **Select All**: Button in master subjectivity list picker for bulk selection — skips subjectivities that are "optional". A subjectivity is optional when it has ≥1 linked doc types AND all of those doc types have `required = false` in Document Types settings. Subjectivities with no linked doc types are always included.
- **Sort order**: Items sorted by master list order from settings (`resortByMasterOrder`)

### Quotation Assured per Vessel

- **Multi-vessel**: Same entity can appear as assured on multiple vessels in a quotation
- **Dedup scope**: Only skips duplicates within the same vessel label (not across all vessels)
- **Fleet renewal dedup** (`renewFleetPolicies` in adapter.ts): Uses `entityId:vesselLabel` composite keys — NOT plain `entityId`. A plain-entityId global set would cause shared entities (e.g. same ship owner on all fleet vessels) to be added only for the first vessel and skipped for the rest.

### Conditions Sub-Tabs

- **P&I Conditions**: Split into "Clauses" and "Additional Clauses" sub-tabs with count badges
- **Hull Conditions**: Split into "Conditions", "Additional Conditions", and "Custom" sub-tabs with count badges

### Deductible MoneyInput

- **MoneyInput**: Shared component in `shared.tsx` — shows thousand separators when not focused, raw number while editing
- **Applied to**: All deductible amount fields (primary, secondary, previous, per-vessel)
- **Layout**: Previous amounts on dedicated second row below main amounts

### Theme System

- **Light themes**: `light`, `aurora` — use light backgrounds, dark text, visible borders
- **Dark themes**: `dark`, `premium` (Frost) — use dark backgrounds, light text
- **`isLight` check**: `theme === 'light' || theme === 'aurora'` — used across all 48+ components for conditional styling
- **Cargo warranties/exclusions**: Only visible when cargo quotation type OR cargo clause selected in P&I conditions
