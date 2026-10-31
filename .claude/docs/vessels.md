# Vessels, Fleet & Directory

Vessel detail, documents and the annual rule, document history, audit log, vessel list and filters, surveys and warranties, fleets, analytics, Directory / entities, flag states, address book. Read with the root CLAUDE.md (architecture, IPC chain, migrations, code style).

### Vessel Detail Navigation

- **Header card** (redesign 2026-10): name, flag, Active/Inactive pill, labelled key facts, actions; below it `VesselSummaryTiles` (Documents, Policies, Quotations, Sanctions, Surveys), each opening its tab
- **Notes & activity panel** (`VesselSidePanel`): beside the tabs, latest 3 notes + quick add (vessels:edit, Ctrl+Enter), last 5 audit entries, reloaded after every save in the app (`vc-save-end`, 400 ms debounce) so a change shows at once; "All notes" opens the notes window, "See all" the Activity tab; hidden/shown per computer (localStorage `vessel_side_panel`)
- **New quotation** (header, quotations:create): type menu → draft quotation with the vessel already added via `addRegistryVessel` (`utils/addRegistryVessel.ts`, shared with the quotation Vessel tab: particulars, assureds by role order, c/o as broker, customer from the vessel's active policy of the same type)

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

From the former Vessel Timeline notes:
- **Data sources**: Aggregates 6 sources (audit, documents, policies, surveys, warranties, sanctions)
- **Merged Events**: Same-day same-type events grouped with count + expand
- **Filters**: Type chips + date range (default last 12 months)
- **Layout**: Vertical timeline with month+year headers, colored icons per type

### Renaming linked files (2026-10-31)

A file linked to a vessel / entity document is renamed IN PLACE first (`nameLinkedDocument` in main/index.ts, helpers in `src/main/documentNaming.ts`), in `db:upsertVesselDocument` and `entityDocs:upsert`, so every upload screen gets it:
- Name: `OWNER - CODE - YYYY-MM-DD` + the original extension. OWNER = vessel name (upper case) or the entity name without company status words (Ltd, Co, SA, SAL, SARL, LLC, DMCC, FZE... `cleanCompanyName`); CODE = the type's **file code** (`document_types.short_code` / `entity_document_types.short_code`, edited in Settings > Document Types / Entity Document Types, column "File code", `DocTypeCodeInput`), else the type name (custom vessel types always use the name); date = the UPLOAD date. Name taken -> ` (2)`, ` (3)`...; never overwrites
- Not renamed: a file the app already links anywhere (vessel_documents, entity_documents, document_history: e.g. one letter linked to two types), so no other link breaks; a missing file; a file already carrying the name. Only NEW uploads (existing files were not renamed, user choice)
- A failed rename (file open in another program, read-only folder) links the file under its own name; the handler returns `renameError` and the upload screens show it as a warning toast
- Because names now differ per upload, a newer file no longer replaces the old one on disk, so Document History keeps real earlier files
- Point 6 of the roadmap: built so far = renaming + filing several files (below); next = one drop area anywhere (vessel / entity guessed too)

### Filing several documents at once (2026-10-31)

`DocumentFiling.tsx`, a drop bar on the vessel Documents tab (both views, `documents:upload`), + "Choose files" (multi-select):
- Dropped files with a path are used where they are; a file without one (a dragged Outlook attachment) is saved to `%TEMP%/vc-filing/<uuid>/` first (`docFiling:stage`). NOT yet tested with a real Outlook drag: the user will try it after the deploy
- `docFiling:analyze(vesselId, paths)`: file type rules (`validateFileExtension`, blocked = red row); type guessed by `guessDocumentType` (`src/main/documentMatching.ts`): file name first (short code, type name, built-in synonyms: registry/COR/REG, class, SMC, DOC, dry dock, UTM, P&I / Hull application, crew list / contract, salaries / wages, KYC, incorporation...); only when the name says nothing, the text of a PDF (first 3 pages) / DOCX via the file reader utility process (`runFileReader`, mode `text`; scanned PDFs have no text). One-word phrases count only in file names; in the text the earliest phrase (the title) wins; a tie = no guess
- Review Modal: per file the type (prefilled, "Skip"), how it was recognised, "Replaces X (kept in History)", an optional expiry. File is blocked until every row has a type or Skip, one file per type, and a folder
- Folder: `vessels.documents_folder` (chosen once, remembered). None yet -> suggested from the folder most of its linked documents are in, else its policy folder; the user must confirm it with Choose (picker opens there, `dialogOpenFolder(defaultPath)`)
- `docFiling:file(vesselId, folder, items)`: each file is MOVED into the folder (rename; other drive / undeletable source = copy then try to delete; a file already in the folder stays; name taken -> " (2)"), then linked through `linkVesselDocument` (same as one upload: renamed VESSEL - CODE - date, earlier file to History, activity + audit). Per-file results; failed rows stay in the Modal

### Document History (earlier files)

Vessel and entity documents keep their earlier files as LINKS (never copies; a file saved over on disk is gone):
- **Table**: `document_history` (owner_type 'vessel' | 'entity', owner_id, document_type_id, file_path, expiry/received dates, uploaded_at/by, action 'replaced' | 'removed', replaced_at DATETIME(3), replaced_by)
- **Archived in the adapter**: `upsertVesselDocument` / `upsertEntityDocument` when the path changes (a new file or '' = unlink), `deleteVesselDocumentById`, `deleteEntityDocument` (`archiveDocument`). Same-path upserts (required toggle) archive nothing
- **Restore** (`restoreDocumentVersion`): the earlier file + its dates become current, the current file goes into the history; vessel = `documents:upload`, entity = `entities:edit`
- **UI**: `DocumentHistoryModal` from "History (N)" on the vessel document cards, the clock button in the table view (VesselDetail) and the entity document rows (EntityEditPanel); open / show in folder / make current
- **Activity**: a vessel file change is audited as `{doc type} file` old name -> new name ('unlinked')
- Merging entities moves the source's history to the target (and keeps the source's file there when the target has its own); `remapAllFilePaths` remaps history paths (and `entity_documents`, which it missed before)
- IPC `docHistory:list(ownerType, ownerIds[])`, `docHistory:restore(historyId)`

### Vessel Document Expiry (`VesselDocumentsView`)

- **Expiry clear button**: explicit `×` (`X` icon, 18px circle) button renders next to the expiry date input when a date is set; calls `updateVesselDocumentExpiry(..., null)` directly. Chromium date input native clear is unreliable for controlled React inputs.
- **No dates popup for annual documents**: after linking a file of an `annualRenewal` type the dates popup (`DocumentDatesModal`) is skipped when the vessel has a P&I / H&M end date (received = today is set by the upload; a toast names the policy end date). Without a policy end date it still asks (the document's own date is then the fallback). Both the card view (VesselDocumentsView) and the table view (VesselDetail `askDocDates`)
- **No expiry inheritance**: `uploadDoc` sets `expiryDate: undefined` (not `existing?.expiryDate || undefined`) so a newly uploaded file never inherits the previous file's expiry date.
- **Annual doc expiry row**: shows P&I date as a read-only cyan badge if found, plus an always-editable `<input type="date">` for the document's own stored expiry (with clear button). The doc's stored date is the fallback for compliance when no P&I policy end date is configured.

### Vessel Audit Log (`adapter.ts` — `updateVessel`)

The audit loop in `updateVessel` has two special normalizations:

- **Numeric fields** (`builtYear`, `grossTonnage`): MySQL `DECIMAL` columns return `"4737.00"` as a string from raw SELECT queries, but TypeScript sends `4737` as a number. Normalize both sides with `String(parseFloat(val))` before comparing to avoid false audit entries on every edit.
- **Customer field** (`customerId`): Before writing the audit entry, both old and new UUIDs are resolved to entity names via `SELECT id, name FROM entities WHERE id IN (?)`. Stores readable names instead of UUIDs in the log.
- **Assured changes**: Assured Added/Removed/Role changes logged as audit entries with field names like "Assured Added", "Assured Removed", "Assured Role". Purple icon in Activity tab, clean titles without "changed" suffix.

### Vessel List

- **Sanctions Column**: OfacBadge displayed in separate column (not inline with vessel name)
- **Flag Icons**: Flag state shown as icon next to vessel name using `flag-icons` CSS package. Hover tooltip shows `Name (ISO3)` e.g. "Panama (PAN)" (also on the VesselDetail header flag).
- **Customer (Legacy) column removed**: customer is policy-level now; the column, its inline editor, and the customer-type modal were deleted from VesselManager.
- **Quick Register (Add Vessel)**: customer field removed; Cancel sits next to Register inside the form (header button is open-only); fleet field is a searchable + sorted combobox with inline "Create Fleet", rendered via `createPortal` to avoid clipping by the card.
- **VesselDetail "Copy details" button**: copies `M/V <name>, Type <type>, Flag <flag>, Built <year>, GT <gt>, IMO <imo>`.

### Custom Vessel Document Types

Per-vessel custom document types beyond the global admin-defined ones:

- **Table**: `vessel_custom_doc_types` (id, vessel_id, name, description, order_index)
- **UI**: "Custom" button in VesselDetail document table header opens inline add form
- **Behavior**: Custom docs appear in same table after global types with "(Custom)" label
- **Reports**: Custom doc types included in PDF/Excel exports

### Annual Document Compliance Rule

For `annualRenewal = true` document types, the effective expiry is inherited from the active P&I policy via `resolveEffectivePolicyExpiry()` (`src/renderer/src/utils/policyUtils.ts`) instead of the document's own expiry date.

- **Priority**: P&I policy end date → Hull & Machinery end date → document's own stored expiry date
- **`resolveEffectivePolicyExpiry(policies)`**: filters `status === 'active'`, matches policy name containing "p&i" or "protection" first, then "hull" or "h&m". Looks for a characteristic whose name contains "end date" and returns its `valueDate`.
- **Short-cycle rule**: if `(expiryDate − receivedDate) < 60 days`, the document is treated as **Compliant** even when it would otherwise be flagged "Expiring Soon". Rationale: a document placed today against a P&I policy expiring in 30 days was intentionally uploaded knowing its short remaining life.
- **Helper**: `annualShortCycle(expiry, received)` — returns `true` if span < 60 days
- **Applied in**: one shared rule in `utils/docStatus.ts` (`effectiveDocExpiry`, `getDocStatus`, `isDocExpired`) used by `VesselDocumentsView.tsx`, Home and the Compliance Center (they now count the same expired documents; "expiring soon" is 60 days on the vessel page, 30 in the Compliance Center). Home and the Compliance Center get each vessel's P&I / H&M end date from IPC `policies:getVesselPolicyExpiries`. `ReportService.ts` still has its own copy (exports unchanged)
- **CRITICAL — loading order**: `dynamicPolicies` must be loaded inside `VesselDetail.loadData()` (not just on Policies/Surveys tab switch), otherwise `effectivePolicyExpiry` is always `undefined` when the Documents tab opens. The fix: add `getVesselDynamicPolicies(vessel.id)` to the supplementary try/catch blocks in `loadData()`.
- **Editable date**: Annual doc expiry row in `VesselDocumentsView` shows a P&I reference badge (cyan, read-only) above an always-editable date input. The stored doc date is the fallback when no P&I policy end date exists; editing it does NOT override the P&I date for compliance (P&I still takes priority in `effectiveExpiry` calculation).

### Vessel Active Status

Vessel lifecycle management with cascade behavior:

- **Field**: `vessels.is_active` (BOOLEAN, default TRUE)
- **Deactivation Cascade**: Setting `is_active = false` automatically sets all vessel's active policies to `'inactive'`
- **Filtered Views**: Renewals, survey list, and open defects queries all filter by `v.is_active = TRUE`
- **Audit Logged**: Status changes recorded in vessel audit history

### Vessel Type (FK-based)

Vessel type stored as FK reference, not text. Renaming a type in settings auto-reflects on all vessels.

- **Field**: `vessel_type_id` (FK to `vessel_types`) on `vessels` table. Legacy `vessel_type` text column kept as fallback.
- **Queries**: `getVessels`/`getVesselsPaginated` use `COALESCE(vt.name, v.vessel_type)` via LEFT JOIN
- **Migration**: Auto-matches existing text values to `vessel_types` by name (case-insensitive), creates missing types
- **VesselDetail**: Dropdown uses `vt.id` as value, not name
- **Audit log**: Resolves vessel type IDs to names for readable history

### Rebuilt Year

- **Field**: `vessels.rebuilt_year` (nullable)
- **Edit**: Hidden "+ Rebuilt Year" button, expandable
- **Display**: "1972/1992" in quotations/reports, "Built: 1972 - Rebuilt: 1992" in policies

### Vessel Classification Change

- **Confirmation modal**: When selecting a new class and one exists, asks "Replace" or "Add Alongside"
- **Prevents accidental dual-class**: Users who meant to change class won't accidentally add a second one

### Entity Classification (IACS Priority)

- **IACS first**: When a vessel has dual classification societies, IACS member is always displayed first
- **Applied to**: VesselDetail display, quotation exports, policy exports

### Vessel Filter ("More filters" on the Vessels page)

No longer a page of its own (2026-10-17, it overlapped the Report Builder): `VesselFilter.tsx` is the "More filters" panel of the Vessels page. VesselManager shows it instead of the plain list (`showFilters`; stays on when coming back from a vessel it opened); `navigateTo({ tab: 'vessels', sub: 'filter' })` opens it (feature `vessel-filter`). Printable / shareable output belongs in the Report Builder, whose Vessels source has the same criteria.

- **Criteria**: policy types (+ active / expired), vessel type, flag (incl. unassigned), class, year built, GT, customer + broker/direct, vessel status; AND / OR
- **Customer**: from the vessel's ACTIVE policies (`getAllVesselDynamicPolicies`, loaded once), never the legacy `vessels.customer_id`
- **Saved views**: per computer (localStorage `vessel_filter_views`); Excel export; tick two results to Compare
- **Navigation**: clicking a result opens the vessel; "Vessel list" goes back to the plain list
- **Searchable MultiSelect**: `MultiSelectDropdown` component auto-shows an inline search input when `options.length > 6` (e.g. flag states list). Auto-focuses on open via `useEffect([open, showSearch])`. Filters by both `label` and `sublabel`. Clears search on close.
- **Portal dropdowns**: Dropdowns rendered via `createPortal` to avoid clipping inside scrollable containers; positioned with `getBoundingClientRect` + flip-upward logic.

### Vessel Comparison

- **Component**: `VesselCompareModal.tsx` (loads everything itself from two vessel ids)
- **Where**: Vessels page Bulk select with exactly 2 vessels ticked -> "Compare"; or tick 2 results in More filters
- **Modal**: Side-by-side: General info, Policies, Documents, Sanctions

### Bulk Operations

- **Vessel Table**: Multi-select with toolbar (Assign Fleet, Change Status, Export, Clear)
- **Entity Table**: Multi-select with toolbar (Export, Delete, Clear)
- **Hidden by Default**: "Select" toggle button shows/hides checkboxes

### Fleet Dropdown (Vessel List)

Per-vessel fleet assignment uses a searchable combobox:

- **Search**: Type to filter fleets by name
- **Sorted**: Fleets listed alphabetically
- **Create inline**: "Create Fleet" button at bottom of dropdown, Enter to confirm
- **Filter dropdown**: Fleet filter in toolbar also sorted alphabetically

### Condition Surveys
Vessel inspection tracking with defects management:
- **Surveyors**: Directory of surveyor companies (`SurveyorDirectory.tsx`) — table + slide-in panel layout (see UI Pattern below). Stats strip: Total Surveyors / Total Surveys / Open Surveys. Slide-in panel shows per-surveyor survey history with OPEN / CLOSED / NO DEFECTS status computed from defects (open=0 → CLOSED, no defects → NO DEFECTS). Add/Edit via modal.
- **Surveys**: Condition surveys attached to vessels (`ConditionSurveyManager.tsx`) with date, surveyor, type, location. Master-detail (redesign 2026-10): survey cards on the left (type, date, surveyor, status pill), the selected survey (default the first, `expandedSurveyId`) with its notes, attachments and defects on the right
- **Survey List**: Cross-vessel survey overview (`ConditionSurveyList.tsx`) with search, navigates directly to vessel's survey section. Sortable columns (vessel, date, type, surveyor, location, defects); default sort: date desc.
- **Defect import** (Word/PDF of the report's "Deficiencies & Recommendations" pages): parsing rules in `src/main/workers/defectParser.ts` (pure, testable); `parser.ts` is the entry. Word files are read from their TABLE rows (exact); PDFs from text, where a defect starts at a reference line (`7.6`, `13`, `8.4 / 27.2`, `N/I 3`, `01`) and runs to the next one (multi-line text and numbered sub-items stay together; page headers, NOTE and signature lines are skipped). Items in "This section is for the observations and the outstanding tests" get severity `Observation`. A "time scale" / "time for rectification" line becomes the due date counted from the report's survey date (`10 day`, `3 month`, `on week`; `immediately`/`ASAP` = survey date); an event time scale (`at next dry dock`, `before next sailing`, `upon completion of job`) is stored as `survey_defects.due_event` instead. Wrapped reference cells (`10.1`/`0/1`/`0.1`/`1` = `10.10/10.11`) are rejoined; an item after a time scale with no reference is imported with number `-`. A trailing date only counts as due when worded so (`due`, `by`, `before`...). Re-importing skips defects already on the survey (same ref + text).
- **Defect import process**: the parser runs in an Electron `utilityProcess`, NOT a worker thread - pdf.js in a main-process worker thread caused native crashes of the whole app on repeated PDF imports. pdf.js treats non-'browser' Electron processes as web pages, so `parser.ts` hides `process.type` before requiring pdf-parse. The parser loads from the installed ASAR, so parser changes only reach users with a FULL installer.
- **Due event**: `survey_defects.due_event` (VARCHAR, nullable) holds an event deadline instead of a date ("At next dry dock"). Editable in DefectManager next to the due date (datalist suggestions), shown as "Due: ..." and never counted as overdue.
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
- **Convert to Survey vs Link to Survey** (WarrantyManager, on a `pending` warranty): "Convert to Survey" creates a NEW condition survey and links it (status → `survey_done`); "Link to Survey" opens a searchable picker of the vessel's EXISTING condition surveys (date/type/surveyor/reference) and links the chosen one (sets `condition_survey_id` + status `survey_done`). Both reuse `getConditionSurveys`/`getSurveyors`/`surveyWarrantyUpdate`.

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

- **Needs attention cards** (redesign 2026-10, replace the count cards): Missing documents, No UBOs (assured companies), No address (companies), Screening out of date (6 months), Not linked to anything, Possible duplicate pairs. Each card filters the list (`EntityQueryParams.gap`, SQL in `MySQLAdapter.ENTITY_GAP_SQL`, counts from IPC `entities:getStats`); the Unused filter offers "Delete N without documents" (IPC `entities:deleteUnused`: unused entities WITH documents are kept). Emails and phones are deliberately not counted (most entities come through brokers)
- **Table columns** (prefs key `entities_v2`): Name | Type (hidden by default) | Profile (completeness `getProfile`: required documents, address for companies, UBOs for assured companies, screened in 6 months) | Sanctions | Screened | Documents | Vessels
- **Slide-in panel (460px)**: header with "UBO of", profile meter + what is missing, quick facts; tabs Profile (shared `EntityEditPanel` with `hideBusiness`) | Business (vessels as assured / UBO + `EntityBusinessSection alwaysOpen`, renewals due within 90 days first) | Notes & history (`EntityNotesHistory`: `entity_notes` table, @username notifies, IPC `entityNotes:*`; history = activity_log rows with this `entity_id`, IPC `entities:getHistory`)
- **Names** are stored trimmed with single spaces (`MySQLAdapter.tidyName` on add/update)
- **`allEntities` state**: full unfiltered entity list loaded alongside paginated data; used for all lookups (`getAssociatedVessels`, `getParentCompanies`, counts). Using paginated `entities` for lookups caused "undefined (role)" in vessel cards when parent was on a different page.
- **`getParentCompanies(entityId)`**: finds parent companies for UBO persons via `entityUBOs.filter(eu => eu.uboEntityId === entityId).map(eu => allEntities.find(...))`
- **`getDocScore(entity)`**: returns `{ have, total }` for document compliance indicator column
- **Edit Modal**: Modify entity name, type, identifier, email(s), phone
- **Create Entity**: Modal with auto-sanctions check after creation (shows spinner)
- **Delete**: With confirmation warning about linked vessels; clears customer references
- **Vessel Navigation**: Clicking vessel names navigates to VesselDetail
- **Find Duplicates**: compares entities of the SAME type by Jaro-Winkler on `dupKey(name)` (lower case, no accents / punctuation / company words like Shipping, Ltd, Co.), default 95%, adjustable slider; plain Jaro-Winkler on full names matched every "X Shipping Ltd." pair. Pairs can be merged directly via `mergeEntities`. The card count is worked out in small slices after load.

### Entity Documents (Configurable)

Entity document types are configurable via Admin Panel → Entity Document Types:

- **Tables**: `entity_document_types` (admin-managed types with scope/required/order/active) + `entity_documents` (per-entity records with file_path, expiry, received date; UNIQUE entity_id + document_type_id)
- **Scope**: Each type has `entity_scope` ('company', 'person', 'both') — only matching types shown for each entity
- **Seed**: 4 default types on first run (CoI, AoA, KYC for companies; ID/Passport for persons) + migration copies legacy entity column paths
- **Legacy columns**: `passport_file_path`, `certificate_of_incorporation_path`, `articles_of_association_path`, `kyc_file_path` kept on entities table but no longer used for reads
- **IPC**: `entityDocTypes:*` for admin CRUD, `entityDocs:*` for per-entity document management
- **UI**: EntityDirectory slide-in panel + AssuredManager slide-in panel show dynamic document list with upload/replace/delete
- **Compliance**: Reports (v1+v2), CustomerComplianceReport, VesselDetail copy-missing, SubjectivitiesTab all use dynamic entity_document_types
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
  - UBOs section — each UBO as a card with doc score, identifier / contacts, sanctions, documents, edit (pencil: name, type, identifier, email, phone in the card; the UBO is an entity, so the change shows everywhere it is used) and delete buttons. Shared `EntityEditPanel`, so the Directory panel has the same
  - Add UBO form at the bottom

### Entity Addresses

- **Table**: `entity_addresses` (id, entity_id, label, address_text)
- **Per-Vessel-Role**: `vessel_assureds.address_id` links to specific address
- **Add from Policy**: Addresses entered in policy editing sync back to entity
- **Remap**: File path remap extended to entity documents
- **Remap file paths dialog** (`RemapFilePathsModal`, vessel or entity): swaps the old folder prefix (auto-detected = common start of all paths) for the new one, joined with exactly one separator; a file still not found there is then looked up BY NAME in the new folder and its subfolders (IPC `fs:findFilesByName`, 5 levels, 20,000 entries, nearest first) and marked "Found by file name in another subfolder". Locate picks one by hand

### Flag State Enhancements

- **Ratification**: `ratified_bunker`, `ratified_wreck` boolean flags
- **Maritime Authority**: `authority_name`, `authority_address` for blue card addressing
- **Ports of Registry** (`flag_state_ports`): Multiple per flag with default selection
- **Display Name**: Formal name for documents (e.g., "Union of Comoros")
- **Redesigned**: Table + slide-in panel layout with stats strip

### Dynamic Address Book (DAB)

Query builder for finding entity contacts across the fleet (`src/renderer/src/components/DynamicAddressBook.tsx`):

- **Layout**: Two-panel — sticky filter sidebar (270px left) + results card (flex-1 right)
- **Filter sidebar**: Compact chip-based sections with labels: Match Logic | Contact Scope | Policy Types (collapsible) | Flag States (collapsible, default collapsed) | Vessel Status | Customer Type | Export Fields
- **Logic**: AND/OR toggle for combining filter criteria
- **Export**: Email only (default), phone only, or both; Copy to Clipboard + Copy for Outlook (semicolon-separated)
- **Results**: Professional table with icon-prefixed entity name, type badge, email/phone with icon prefix, associated vessels. Alternating row shading. Count badge in header.
- **Empty states**: "No query run yet" (before first search), "No contacts found" (after search with 0 results)
- **Chip component**: Selected = accent border + tinted bg; unselected = subtle border + transparent
