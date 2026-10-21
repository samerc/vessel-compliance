# App Shell & Infrastructure

Auth, RBAC, theme, Home, search and navigation, Settings hub, notifications, activity log, templates, wiki, reports and calculators, shared UI patterns, file paths, release / hot-update system. Read with the root CLAUDE.md (architecture, IPC chain, migrations, code style).

### Authentication & Security
- **Session Management**: Window-based sessions in main process with 2-hour timeout and activity refresh
- **Rate Limiting**: 5 login attempts per 15-minute window before 15-minute account lockout
- **Admin Protection**: Setup and configuration IPC handlers require admin session validation
- **File Validation**: Backend validation of file extensions against admin-configured allowlists/blocklists
- **Password Security**: bcrypt hashing with salt rounds, no plaintext storage
- **Passwords**: users change their own from the user menu (name at the top of the sidebar → Change Password, `UserProfileModal`). Admins reset another user's in User Management (`ResetPasswordModal`): type a password or generate one (shown once), optionally "choose their own password at next login" (`force_password_reset`); a reset ends that user's remembered logins. IPC `auth:resetPassword({ username, password?, mustChange? })`
- **Remembered login** (30 days): checked against `user_sessions` before it is honoured; `auth:getSession` waits for the startup DB connection (max 30 s) so network PCs are not sent to the login screen

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

### Theme System
- **User-Specific Themes**: Each user's theme preference (light/dark) is stored in the database (`users.theme_preference`)
- **Accent colour (per user)**: `users.accent_color` ('#RRGGBB', NULL = default blue `#1F4E9C`), picked from 6 swatches in the user menu under Light/Dark. IPC `accent:get` / `accent:set` (session cache updated). `ThemeProvider` calls `applyAccent` (`utils/accent.ts`) on theme or accent change: it sets `--accent-primary` / `-rgb` / `--accent-secondary` / `--accent-contrast` inline on `<body>`, lightened for dark mode
- **Design tokens / font**: see `.claude/design-guide.md` section 1 (redesign 2026-10: solid surfaces, IBM Plex Sans + Mono bundled via @fontsource)
- **Context Integration**: `ThemeContext` watches for user changes via `AuthContext` to reload themes on login/logout
- **CSS Variables**: Theme styles use CSS custom properties (`var(--text-primary)`, `var(--bg-primary)`, etc.) that adapt to current theme
- **Light Mode**: Activated by adding `.light` class to document.body, all components use theme-aware variables
- **Two themes**: `light` and `dark`. Frost (`premium`) and Aurora (`aurora`) were retired in the redesign: still accepted as stored values, they render as dark and light (the user menu offers only Light / Dark)
- **`isLight` check**: `theme === 'light' || theme === 'aurora'` — used across all 48+ components for conditional styling

### Home (redesign 2026-10)

The first page (tab id still `dashboard`, menu label "Home"; `src/renderer/src/components/HomePage.tsx`). It replaced the customizable widget Dashboard (removed 2026-10-16 with its `dashboard:*` IPC; the `users.dashboard_onboarded` column is left unused):

- Greeting + date and "needs your attention" cards: Renewals in 30 days (`getRenewalPipeline`), Draft quotations, Expired documents (active vessels, filed documents, annual documents follow the vessel's policy end date), Sanctions to review. Each card shows only with its permission and opens its page
- My quotations (`createdBy` = user, not converted), Renewals this month (`getPolicyRenewalsByMonth`)
- Alerts: up to 3 expired documents, 2 policies ending within 14 days, 2 overdue defects, filled to 6; each opens the vessel on the matching tab ("Back to Home")
- Recent: shares `openRecentItem` (App.tsx) with the sidebar Recent list

### Global Search / Command Palette

- **Shortcut**: Ctrl+K / Cmd+K, or the "Search or jump to..." box at the top of the sidebar
- **Pages & actions**: matches from the feature registry (below) appear first, instantly; with an empty box it shows suggestions
- **Records**: Vessels (name/IMO), Entities (name), Quotations (reference), Policies (number), from 2 letters (debounced IPC)
- **UI**: Grouped results, keyboard navigation (arrows/Enter/Esc)

### Feature Registry & Navigation

- **Registry**: `src/renderer/src/features.ts` (`FEATURES`) lists every page, sub-tab and notable action with title, description, area, keywords, permission and a `NavTarget` (`{ tab, sub?, action? }`). It feeds the command palette, the **Features** page (`FeaturesPage.tsx`, bottom of the sidebar) and What's New "Try it" links. **Add an entry when you add a page, a sub-tab or a notable action.**
- **`navigateTo(target)`** in App.tsx is the one way to go anywhere: sets the tab, a requested sub-tab (`pageRequest`), or runs an `AppAction` (new vessel/quotation/entity, what's new, release history, profile, check updates, theme, density)
- **Sub-tabs**: pages with tabs take `subTab`/`subTabNonce` (`SubTabProps`) and apply them with `useRequestedSubTab` (`utils/useRequestedSubTab.ts`): Vessels (list/filter), Directory, Compliance, Sanctions Search, Fleets, Survey Follow-Up, Calculators, Reports, Quotations (list/settings), Settings sections. Policies list/settings uses `policyView`. Sidebar clicks clear the request
- **What's New "Try it"**: `featureId` on a `WHATS_NEW` item, or `[try:feature-id]` at the end of a release-note line
- **Sidebar menu** (redesign 2026-10, App.tsx): Home, Recent, then job-based groups **Underwriting** (Renewals, Quotations, Policies, Receipts), **Fleet** (Vessels, Fleets, Surveys, Survey Follow-Up), **Compliance** (Compliance Center, Sanctions Search, Directory), **Insights** (Reports, Fleet Analytics, Activity Log), **Tools** (Calculators, Templates); Features and Settings pinned at the bottom. `FEATURE_AREAS` in features.ts uses the same areas and order
- **Settings hub** (AdminPanel = the Settings page): one place for every setting. The left list is grouped (`SETTINGS_GROUPS`: Quotations & policies, Vessels & documents, Compliance, Users & access, Files, System) with a search box (section names + `SECTION_KEYWORDS`). Quotation Settings, Policy Settings & Banks and User Management open INSIDE it (`HUB_PAGES`, outside the read-only fieldset, each with its own permission); a dot marks sections shared with regular users. The sidebar shows Settings when the user has admin:settings, fileManager:view, quotations:settings or admin:users. `navigateTo({ tab: 'users' })` redirects to `{ tab: 'admin', sub: 'users' }`; the Quotations and Policies pages keep their own Settings toggle too. Banks are managed only in Policy Settings
- **First-run tip**: one-time Home banner about Ctrl+K and Features (`localStorage tip_discover_u{userId}`)

### Recent Items

- **Table**: `user_recent_items` with UPSERT, max 20 per user
- **Sidebar**: Collapsible RECENT section, last 8 items with type-specific icons
- **Tracked**: Vessel, quotation, policy, entity views

### Admin Panel

System configuration page (`src/renderer/src/components/AdminPanel.tsx`), now the Settings hub (see Feature Registry & Navigation): a grouped, searchable section list on the left, the chosen section on the right. Sections:

1. **Document Types**: CRUD with reorder and active/inactive toggle
2. **Assured Roles**: CRUD for entity role types
3. **Survey Types**: CRUD for condition survey types
4. **Policy Types**: CRUD with reorder for vessel policy classifications
5. **Scheduled Compliance Check**: Enable/disable, schedule, threshold, include vessels, skip cleared
6. **Annual Doc Grace**: Annual document grace-window (days) for renewal compliance
7. **File Upload Security**: Allowed/blocked file extensions for uploads
8. **Report Settings**: Company name, logo, accent color used in PDF reports
9. **Sanctions Data**: Per-source status cards (OFAC, EU, UK, UN, ISF) with entity count, last update, release date; per-source and bulk refresh buttons
10. **File Manager**: Moved here from the top-level sidebar (section id `fileManager`, gated by `fileManager:view`, lazy-loaded). Not a menu item anymore.
11. **Database Configuration**: View/change MySQL connection settings

- **Collapsible Pattern**: Uses `collapsedSections` state (`Set<string>`) with `toggleSection` function; each section header has ChevronRight/ChevronDown toggle
- **All sections collapsed by default**: Initial state includes all section IDs
- **Report Settings**: stored in `app_settings` table under key `reportSettings` (JSON blob). IPC: `reportSettings:get` / `reportSettings:set`. Section id: `reportSettings`. Service: `ReportSettingsService` at `src/renderer/src/services/ReportSettingsService.ts` — `getReportSettings()` (cached), `saveReportSettings()`, `invalidateReportSettingsCache()`, `rgbToHex()`, `hexToRgb()`, `tintColor()`.

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
- **Vessel Notes + Quotation Notes**: Both support replies and mentions (both notify: reply to the parent author, @mention to the user; vessel note notifications open the vessel)

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

### Wiki

Knowledge base anyone can write (`components/wiki/`, Tools > Wiki, feature ids `wiki` / `wiki-new`): procedures, insurance terms, how the app works.
- **Tables**: `wiki_topics` (title, category free text, tags JSON, body_html, body_text + folded `search_text`, `feature_id`, `revision`, soft delete `deleted_at`), `wiki_topic_versions` (every save; saves by the same person within 10 minutes update their last version), `wiki_attachments` (LINKS to files where they are, never copied; remapped by `remapAllFilePaths`), `wiki_comments` (one reply level). A starter topic "How to use the wiki" is seeded when the table is created
- **Search** (`shared/wikiSearch.ts`, pure): `foldSearch` = lower case, accents and Arabic harakat / tatweel removed, hamza seats joined (أ إ آ ٱ -> ا, ؤ -> و, ئ -> ي), ى -> ي, ة -> ه, Arabic-Indic digits -> 0-9. Every searched word must be in the folded title / tags / text (`search_text LIKE`), ranked by `rankTopic` (title first), with `snippetText` around the first word; `highlightParts` marks hits in the list, the open topic uses the CSS Custom Highlight API (`::highlight(wiki-hit)`, the HTML is not changed). Ctrl+K shows wiki topics (`globalSearch` returns `wiki`)
- **Arabic**: the editor's `autoDirection` gives every block `dir="auto"` (a paragraph starting in Arabic runs right to left); the read view adds it to HTML that lacks it (`wiki/autoDir.ts`, Word imports). IBM Plex Sans Arabic is bundled (arabic subset) and in `--font-family`, so Arabic anywhere in the app uses it
- **RichTextEditor options** (all off by default, quotations unchanged): `showTables` (@tiptap/extension-table TableKit + row / column buttons), `keepPasteFormatting`, `autoDirection`, `toolbarExtra` (the wiki's "link to another topic" button: href `#wiki/{id}`, opened in place by the read view; http links open in the browser)
- **Saving**: `wiki:saveTopic` with `baseRevision`; if someone saved since, it returns `{ conflict: true }` and the editor asks before saving over it (`force`); theirs stays in the history. History modal: any version can be made current (saved as a new version). Deleted topics are listed under "Deleted topics" and can be restored
- **Page help**: `PageHeader` has a ? button (and F1 anywhere) that fires `vc-page-help` (`utils/pageHelp.ts`); App opens the wiki with `page:{activeTab}`: the topics whose `feature_id` is one of that page's features (one = opened directly, none = "Write the first topic" linked to the page). Wiki requests: `topic:{id}`, `feature:{id}`, `page:{tab}`, `new`
- **Comments**: off until an admin switches them on in the Wiki header (`app_settings.wiki_settings.commentsEnabled`); a reply notifies the comment's author, @username that user (link type `wiki`)
- **Import**: Word (.docx via mammoth, in `main/wikiImport.ts` loaded on demand: mammoth takes ~0.2 s to load) or .txt, one topic per file; a heading at the top becomes the title; pictures are dropped; .doc is refused
- Recent items and notifications open topics (item / link type `wiki`)

### Report Builder

Customizable reports with 9 data sources:

- **Data Sources**: Vessels, Policies, Entities, Renewals, Quotations, Policy Documents, Documents, Surveys, Survey Warranties
- **Vessels source**: customer / customer type come from the vessel's active policies (all of them, comma-separated); filters for vessel type, active policy type, customer, customer type, built from/to, GT from/to (filter `type: 'number'`)
- **Config**: Column checkboxes, dynamic filters per source, group-by, sort
- **Chart View**: Horizontal bar charts with metrics (Count, Sum Premium, Avg Premium)
- **Save/Share**: Named report configs saved to DB, shareable with team
- **Filters**: appended to the source's own top-level WHERE only (a WHERE inside a sub-query / join does not count). Renewals leave out inactive vessels and, unless filtered on status, cancelled policies
- **Export**: Excel + PDF with company header
- **Pagination**: 50 rows per page

### Reports

Tab-based reports page (`src/renderer/src/components/Reports.tsx`) with sub-navigation:

- **LossRecordReport** (`src/renderer/src/components/LossRecordReport.tsx`): Imports Book1.xlsx (UWY in col 6), outputs a PDF grouped by Underwriting Year → vessel → claim
- **AssuredReport** (`src/renderer/src/components/AssuredReport.tsx`): Assured listing by vessel/fleet. Filter: all active vessels, by fleet (searchable), or select vessels (search + chips). Table with vessel name, IMO, fleet, assured name, role, type, email, phone. Grouped by vessel with rowSpan. Sorted by role order from settings. Export: Excel + PDF (per-vessel sections with navy header bars).
- **ConditionSurveyReport** (`src/renderer/src/components/ConditionSurveyReport.tsx`): "Condition Surveys" tab. Driven by **survey warranties** (vessels with none are omitted). Per row: warranty due date (inception + deadline days), the carried-out survey date, surveyor, and status. **Sorted/grouped by month** of the due date; event-based (no calculable date) warranties grouped under "No Due Date" at the end. Status is derived from the survey's **open-defect count**, not the raw warranty status: a recorded survey with open defects reads **Carried Out**, all-defects-closed reads **Survey Done** (also Pending / Waived). `getAllSurveyWarranties` was extended to LEFT JOIN `condition_surveys`/`surveyors` and, when a warranty has no explicit `condition_survey_id`, falls back (COALESCE) to the vessel's **latest** condition survey + its open-defect count. On-screen table + PDF (landscape, month header bars) + Excel.

### Statement of Account (Reports tab)

Formats an uploaded accounting Excel (QuickBooks "open invoices" export) as a letter on the company letterhead (`src/renderer/src/components/StatementReport.tsx`, Reports → "Statement of Account"):
- **Parsing** (`utils/statementParser.ts`, pure): finds the header row (Type/Date/Num...), drops the empty spacer columns, treats a lone name row as a group (customer), drops QuickBooks `Total ...` rows, detects date/money columns (dates printed dd/mm/yyyy). Uses the sheet with most rows (skips the "Export Tips" sheet). Empty columns and a running `Foreign Balance` next to an open balance are hidden by default; the report computes its own total per currency of the chosen money column
- **Letter**: title picked from settings (each title has its own text above/below the table, placeholders `{to}` `{date}` `{reference}` `{total}`), To (defaults to the single customer), reference, date. Columns can be hidden, renamed and reordered (choice remembered per user in localStorage)
- **Export** (`services/StatementExportService.ts`): Word document with the Debit Advice letterhead (`pi_section_texts.docHeader`) and footer (`policyExportSettings.footerText`) + page numbers; PDF via `convertDocxBufferToPdf`. Column widths always add up to the page width (fixed layout), so the table never runs off the page; long statements continue on the next page with the column header repeated. Widths come from the real Arial text widths (canvas `measureText`): codes, numbers, dates and short text never wrap or break inside a word; only multi-word text (names) wraps; if that still does not fit the font steps down from the settings size to 7pt. Portrait is the default (remembered per user); "Automatic" = portrait if it fits, else landscape
- **Settings**: `app_settings` key `statement_settings` (`titles`, `columnLabels`, `referencePrefix`, `fontSize`), edited from the page's Settings button (needs `admin:settings`)

### Customer Compliance Report

Per-customer document compliance overview (`src/renderer/src/components/CustomerComplianceReport.tsx`), accessible via the Reports page "Customer Compliance" tab:

- **On-screen view**: Select customer (or all), click "Generate Report" to load grouped vessels with per-vessel compliance stats (Compliant / Missing / Expiring Soon / Expired / %)
- **Compliance %**: `compliant / totalRequired * 100` — only fully-compliant docs count. Expired and expiring-soon docs do NOT inflate the percentage.
- **Scope**: active vessels only; includes both global `document_types` and per-vessel `vessel_custom_doc_types`
- **Expiry window**: "Expiring Soon" = within 60 days (intentionally wider than the usual 30-day threshold)
- **Export PDF**: per-customer via `exportCustomerCompliancePDF()` (exported function, also called from EntityDirectory); full-fleet via "Export PDF" button in the component. Uses `ReportSettingsService` for company name, colors, footer
- **Export Excel**: flat rows with customer header rows interspersed
- **N+1 prevention**: custom doc types for all vessels in scope are batch-fetched with `Promise.all` before the vessel loop — never one IPC call per vessel
- **`buildVesselRow(vessel, docTypes, allVesselDocs, allAssureds, allCustomDocTypes)`**: pure synchronous helper, takes pre-fetched data only

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

### Table + Slide-in Panel UI Pattern

Used across EntityDirectory, SurveyorDirectory, FleetManager (fleet view), and VesselHistoryView. Canonical pattern for list-detail pages:

- **Full-width table** on the left (`flex: 1`): `.table-wrap` > `table.data-table`, rows `className="clickable"` + `selected` for the open row
- **Slide-in panel** on the right (fixed width, e.g. 380–400px): `background: 'var(--bg-card)'`, `border: '1px solid var(--glass-border-color)'`, `borderRadius: 12px`, `maxHeight: 'calc(100vh - 280px)'`, `overflowY: auto`
- Panel header: gradient icon circle (40–44px, borderRadius 10), bold title, secondary subtitle, close X button
- Clicking a table row opens the panel; clicking another row switches the panel content
- Panel content is always derived from already-loaded data (no extra API calls on row click)
- Stats strip above the table: 3–5 glass-card KPI cards with colored gradient icon circles

### Column Preferences

- **Table**: `user_column_prefs` (user_id, page_key, visible_columns JSON)
- **ColumnSelector Component**: Gear icon with checkbox dropdown, hidden count badge
- **Applied To**: VesselManager, QuotationList, PolicyList, PolicyRenewals, EntityDirectory, ConditionSurveyList, FleetManager, FleetDetail, SurveyorDirectory, ActivityLog, UserManager

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

### Number Input Behavior

- **Spinners hidden**: CSS removes up/down arrow buttons from all `<input type="number">`
- **Keyboard arrows blocked**: Global `keydown` handler prevents ArrowUp/ArrowDown on number inputs
- **Rich text paste**: RichTextEditor strips formatting on paste (plain text only)

### Window Preferences
- **Per-User Storage**: Window size and position stored in database per user (`users.window_width`, `window_height`, `window_x`, `window_y`)
- **Auto-Save**: Window bounds saved on resize/move when user is logged in
- **Auto-Restore**: User's window preferences applied on login via `setBounds`

### User Management Enhancements

- **Editable username**: Username can be changed (uniqueness enforced server-side)
- **Full name**: Optional `full_name` field on `users` table
- **Version comparison**: Build numbers parsed numerically (not string comparison) for correct ordering

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
- **Auto-apply**: Downloads and applies updates on startup (the window already shows its loading state), restarts automatically. Each update request gives up after 15 s without data
- **Window safety**: All `mainWindow` calls guarded against `isDestroyed()` during restart to prevent crashes
- **Background check**: Every 30 min while running; shows notification bar in renderer if update found
- **Deploy command**: `npm run deploy` builds + uploads `code-update.zip` to GitHub via `gh` CLI
- **Deploy script**: `scripts/deploy-update.js` — uses temp `.ps1` files, `--prerelease` flag, `--notes-file` for GitHub release
- **Build numbers**: Auto-incrementing, version shown as `v7.6.7b3` format in sidebar
- **Admin visibility**: Admin Panel → File Paths → Hot Updates section shows source/build/status
- **Worker threads**: Worker thread loads parser from ASAR (not hot-update cache) to ensure `node_modules` access
- **Isolation**: `electron-updater` configured with `allowPrerelease = false` + error handler ignores `code-latest`, so hot-updates and full updates do not interfere
