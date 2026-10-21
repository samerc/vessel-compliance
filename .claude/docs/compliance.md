# Compliance & Sanctions

Built-in sanctions engine, SIC list and letter OCR, weekly checks, Compliance Center, Sanctions Search / Check Report, data validation rules. Read with the root CLAUDE.md (architecture, IPC chain, migrations, code style).

### Sanctions Screening (Built-in)
Sanctions screening runs entirely within the Electron app — no external API dependency:
- **Module**: `src/main/sanctions/` — self-contained sanctions engine
- **SanctionsService** (`SanctionsService.ts`): Singleton — initialize, search, refresh, getStatus, SIC CRUD
- **SanctionsDatabase** (`SanctionsDatabase.ts`): SQLite wrapper via `better-sqlite3` (externalized in electron-vite config like mysql2)
- **Database file**: `sanctions.db` stored alongside `db-config.json` in app data directory
- **SQLite tables**: `entities` (the list entries, columns below) and `data_updates` (per source: last update, record count, release date)
- **Entity columns**: source, source_id, entity_type, name, name_normalized, aliases (JSON), date_of_birth, nationality, addresses (JSON), identifications (JSON), programs (JSON), vessel_imo, remarks, listed_date, mother_name, father_name
- **Search**: candidates from Fuse.js fuzzy matching + a SQL LIKE "contains" search (400 each), then EVERY candidate is scored by `matchScore.ts` (pure): whole words, not letters inside a word ("red" never matches "CREDISA"); close spellings get partial credit (squared word similarity); each word weighted by how rare it is in the lists (`wordWeight`, counts built with the index: "Shipping" / "Mohamad" count little); one common searched word against a longer name is marked down; best of name / aliases; a parent's name counts 0.7; exact IMO = 100%. Each result carries `matched_on` (field + value), shown on the Search page ("Matched on alias: ...", searched words highlighted). The caller's limit applies after scoring. Checked 2026-10-19 on all 2,144 Directory/vessel names at 85%: 56 substring false alarms gone, real matches the old search missed found (Prime Shipping, Zaas Shipping, White Shark)
- **Search page**: 3 letters minimum; results as a compact table per kind (the kind with the strongest match first): name (searched words highlighted) + "Matched on ...", list, born / nationality / IMO, programmes, score with band (90%+ Strong red, 80-89% Possible amber, else Weak grey); a row opens aliases + remarks. The type pills next to the result count scroll to their section. "More details" (date of birth or year, nationality, IMO; `utils/sanctionsDetails.ts`): a result whose listed year / nationality (word stem, two-letter codes read as countries) / IMO differs is left out with a "N left out - Show them" note, a matching one is ticked; the IMO is also searched on its own. The list chips show when each list was last updated (`sanctions:getStatus`, amber after 7 days). Recent searches: last 10 as chips (localStorage `sanctions_recent_u{userId}`). Export adds Matched on, Strength, Born, Nationality
- **Data sources**: OFAC SDN (XML), EU OpenSanctions (CSV), UK FCDO via OpenSanctions (CSV — `gb_fcdo_sanctions`, reuses the EU simple-CSV parser), UN Consolidated (XML), ISF Lebanon (Excel), SIC (manual + Excel import)
- **Parsers**: `parsers/ofacParser.ts`, `parsers/euParser.ts`, `parsers/unParser.ts`, `parsers/isfParser.ts`, `parsers/sicParser.ts`
- **Normalize**: `normalize.ts` — lowercase, NFD unicode, strip diacritics, strip special chars
- **Startup**: `sanctionsService.initialize(dbDir)` called in `app.whenReady()`, loads all entities into Fuse.js in-memory index
- **Shutdown**: `sanctionsService.close()` in `window-all-closed` handler
- **Search process** (2026-10-19): `ofac:checkSanctions` and the weekly check call `searchSanctions` (`sanctions/searchProcess.ts`), which runs `SanctionsService.search` in a utility process (`workers/sanctionsSearch.ts`, own copy of the index from the same sanctions.db). A search takes 0.5-3 s; on the main process it froze the app (the weekly check of ~2,300 names made it stutter for 20+ minutes). Started on the first search (index build a few seconds), closed after 10 idle minutes; `SanctionsService.getDataVersion()` is bumped by every index (re)build / SIC patch and the process reloads when its copy is older. Loaded from `__dirname` (same build, so it ships in hot-updates); on failure (3 in a row = for the session) the search runs in the main process as before
- **IPC**: `ofac:checkSanctions` uses the local lists (no HTTP calls)
- **OfacService** (`src/renderer/src/services/OfacService.ts`) - thin wrapper calling IPC (unchanged)
- **SanctionsModal** (`src/renderer/src/components/SanctionsModal.tsx`) - displays potential matches (unchanged)
- **Status flow**: `PENDING` → `POTENTIAL_MATCH` (yellow, needs review) → `CLEARED` or `MATCH` (user decision)
- Sanctions status pills use the shared `SanctionsBadge` (`components/ui/SanctionsBadge.tsx`); the local `OfacBadge` wrappers in VesselManager, EntityDirectory and EntityEditPanel only pass status, checking state and the review/recheck handlers
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

### SIC Letter Import (scanned letters, OCR)

Imports the names listed in scanned SIC letters (image-only PDFs, or photos) instead of typing them:
- **Entry point**: "Import Letters" in the SIC List tab (same permission as editing SIC entries). Several files can be picked; "Save & next letter" walks through them
- **OCR process** (`src/main/workers/sicOcr.ts`): Electron utility process kept alive between pages (closed after 5 idle minutes), managed by `sicOcrRequest` in index.ts. pdf-parse `getImage()` extracts the page scan (one image per page; JPEG 2000 scans need pdf.js `wasmUrl` = pdfjs-dist/wasm/), `@napi-rs/canvas` rotates it (ID copies are sideways) and makes the JPEG shown on screen, tesseract.js (ara+eng, LSTM) returns lines + words with boxes. Fully offline
- **Language data**: `resources/tessdata/{ara,eng}.traineddata` (tessdata_fast, ~5.5 MB), unpacked via `asarUnpack: resources/**`. electron-builder excludes only the browser builds (*.wasm.js); keep every engine build: the tesseract.js 7 Node loader always loads the full (non-LSTM) build, and a missing one crashes the packaged reader
- **Full installer only**: tesseract.js, @napi-rs/canvas and the language data come from the installer, so this feature never reaches users through a hot-update
- **Parsing** (`utils/sicLetterParser.ts`, pure): reference + date from the SIC file name (`4737_26_22092026.pdf` -> `4737/26`, 2026-09-22, plus `/G26.139` when printed), letter type (freeze / inquiry / ID circulated). Arabic lists start at the first entry-like line after the subject line and end at the signature/footer; names are usually quoted; details give nationality, mother (والدته), register no., passport. English OFAC-style numbered lists are parsed too. One-person letters name them in the paragraph (للسيد "...")
- **Arabic-Indic dates are not read** (OCR unreliable): the user types the date of birth
- **Names** (`utils/arabicNames.ts`): Lebanese naming = first, father, family; the English name is first + family, father separate (like the Excel import). Spelling: learned spellings (`app_settings` key `sic_name_spellings`, learned word by word on save) -> built-in common names -> letter rules
- **Saved**: English name, aliases = Arabic as written + Arabic without the father's name, remark = letter remark + notes, `source_id` = reference, `listed_date` = letter date. IPC `sic:addEntities`, `sic:getNameSpellings`, `sic:learnNameSpellings`, `sicLetter:pick`, `sicLetter:readPage`
- **Screen** (`SicLetterImport.tsx`): page with OCR line boxes (green = used by an entry); click a line or drag over words -> new entry, add to the selected entry, or fill one field. Every field stays editable; saved entries are edited in the SIC List as usual
- **Search**: SIC entries share their letter reference as `source_id`, so search de-duplication and match ids include the name. Fuzzy search folds Arabic spelling variants (أ/إ/آ -> ا, ة -> ه, ى -> ي, harakat) via `foldArabic` (normalize.ts)

### Scheduled Compliance Checks
Automated weekly sanctions screening for all entities and vessels:
- **Scheduler** (`src/main/services/ComplianceScheduler.ts`): Background timer runs compliance checks on configured schedule
- **Local search**: Uses `sanctionsService.search()` directly (no HTTP calls, no rate limiting needed)
- **Settings** (Admin Panel): Enable/disable, day of week, time, match threshold (50-100%), include vessels, skip cleared
- **Match Threshold**: Only matches above configured score (default 85%) are flagged as `POTENTIAL_MATCH`
- **Results Storage**: `compliance_check_logs` table stores run history, `compliance_check_results` stores individual matches
- **Review Workflow**: Pending results shown in Compliance Center → Sanctions Screening tab; each decision (single or bulk) asks an optional reason (`compliance_check_results.decision_note`). The screened name opens the vessel / entity
- **Review panel** (`SanctionsReviewDetail.tsx`): clicking a pending hit (default the first) shows our record (vessel particulars + assureds, or entity type/identifier/vessels) beside every matched list entry (aliases, list reference, kind, IMO, listed on, positions, remarks), with Clear / Sanction; keys J/K move, C clears, S sanctions; the next hit opens after a decision
- **One review path**: the sanctions modal (entity panel, Directory, vessel list) asks a reason and calls `compliance:decideSubject` (`decideSanctionsSubject` in adapter / `utils/sanctionsDecision.ts`): pending results of the subject are decided like in the Compliance Center, otherwise the shown entries are remembered as cleared; the subject's status is set (Confirm = SANCTIONED)
- **Cleared hits are remembered**: clearing a result stores its list entries in `sanctions_cleared_hits` (subject + `MySQLAdapter.sanctionsHitKey` = source:source_id:name); the weekly run flags only NEW hits, never turns MATCH/SANCTIONED or a pending POTENTIAL_MATCH into CLEARED by itself, and refuses to run (failed log) when a downloaded list is not loaded
- **Desktop Notifications**: System notification when matches are found (if supported)
- **Manual Trigger**: "Run Now" button in Admin Panel for immediate check
- **IPC Handlers**: `compliance:getScheduleSettings`, `compliance:setScheduleSettings`, `compliance:runManualCheck`, `compliance:getCheckLogs`, `compliance:getCheckResults`, `compliance:getPendingResults`, `compliance:markResultReviewed`

### Compliance Center

Centralized compliance monitoring with four tabs:

- **Document Alerts Tab** (rework 2026-10-19, `DocumentAlerts.tsx`, rules in `utils/docAlerts.ts`): a to-do list, not a list of every gap. Default view "To do" = expired + expiring within 30 days, most overdue first (vessel, document, date, days overdue / left, customer, open button); entity documents shared by several vessels are one row ("+N vessels"). Missing documents are alerts ONLY for vessels with a policy ending from 30 days ago to 30 days ahead or a quotation in progress (not converted, changed in 90 days), one row per vessel ("8 documents missing", with the reason), plus endorsements not issued; the three chips toggle (expired + expiring on by default). Groupings By vessel / By document / By customer (chase email) are options; the view is remembered per computer (localStorage `doc_alerts_view`). "Completeness" = every vessel's required documents on file and valid (vessel + its assureds' entity documents) as x/y with the missing ones, worst first, "Coming up" badge for renewing / quoted vessels. A document type tagged for policy types counts only for vessels with an active policy of one of them. Tab badge = expired + expiring. IPC `compliance:getVesselBusiness` (`getVesselBusiness`: active policy types, renewal date, quotations in progress per vessel)
- **Policy Alerts Tab**: Expired + Expiring Soon (90 days) sub-filters, status dropdown to change policy status directly. View button navigates to vessel's policies section. New IPC: `policies:getExpiringSoon` with `getExpiringSoonPolicies(daysAhead)` adapter method.
- **Sanctions Screening Tab**:
  - Pending reviews table with expandable match details
  - Batch select with checkboxes, select-all, "Clear All" / "Sanction All" bulk action buttons
  - Mark as reviewed action updates result status
  - Check history sidebar showing all compliance runs with status/counts
- **Data Quality Tab**: Auto-refreshes after rule save/delete/toggle
- **Tab persistence**: Active sub-tab remembered when navigating away and back (`complianceSubTab` state in `App.tsx`)

### Sanctions Search

Ad-hoc sanctions lookup page (`src/renderer/src/components/SanctionsSearch.tsx`):

- **Per-User Threshold**: Minimum match threshold (10-95%) persisted to `users.sanctions_threshold` column
- **IPC Handler**: `users:updateSanctionsThreshold` saves to DB and updates session cache
- **Source Filters**: Toggle OFAC, UN, EU, UK, ISF sanctions lists independently
- **Results**: Expandable cards with match score, aliases, remarks, source IDs
- **Local search**: All searches run against local SQLite database via `SanctionsService.search()`
- **Tabs**: Search · SIC List · Check Report (see below)
- **Update Lists button**: Header button downloads the latest OFAC/EU/UK/UN/ISF lists **one source at a time** with live per-source progress in the button label ("Updating EU (2/5)…") + final toast of total entities loaded. Available to any authenticated user — the `sanctions:refresh` IPC was relaxed from admin-only to `requireSession` (per-source `sanctions:refreshSource` stays admin, used by the Admin Panel).

### Sanctions Check Report

Named screening report generated from the Sanctions Search page ("Check Report" tab, `src/renderer/src/components/SanctionsCheckReport.tsx`):

- **Subject**: free-text name OR a linked entity (searchable picker over `getEntities()`). Linking an entity lets the decision update that entity's stored status.
- **Per-list table**: screens all 5 lists (OFAC, EU, UN, ISF, SIC) via `checkSanctions(name, threshold/100, sources)`, groups matches by `source`, and shows each list as **Clear** or **Potential Match** with match count and date. Threshold filter mirrors the Search tab (`score*100 >= threshold`).
- **Clear/Sanction gate**: if any list has potential matches, the user must choose **Clear Subject** or **Sanction Subject** before export unlocks; all-clear auto-resolves to Cleared.
- **Export PDF**: mirrors other report exports (`getReportSettings` header band/accent/footer, jsPDF + autoTable). Shows subject meta, an overall RESULT: CLEARED/SANCTIONED badge, and the per-list status table.
- **On export**: saves an audit record (`sanctions_report_checks`: subject, entity, threshold, decision, per-list results JSON, checked-by, date) and — if an entity was linked — updates its `ofac_status` (CLEARED/MATCH) + check date via `updateEntity`.
- **IPC**: `sanctionsReport:save`, `sanctionsReport:list`. Adapter: `createSanctionsReportCheck`, `getSanctionsReportChecks`.

### Data Validation Rules

- **Built-in Rules**: 8 predefined (vessels without customer, entities without email, etc.)
- **Custom Rules** (`custom_validation_rules`): Admin-created with entity type, field, operator, value, severity
- **Compliance Center Tab**: "Data Quality" with toggle on/off per rule
- **Operators**: is_null, is_empty, equals, not_equals, less_than, greater_than, contains, not_contains
