# Lessons Learned — Vessel Compliance Project

Patterns, traps, and hard-won knowledge from working on this codebase.

---

## MySQL / Database

### DECIMAL columns return strings from raw queries
`SELECT gross_tonnage FROM vessels` returns `"4737.00"` (string), not `4737` (number).
Processed queries that call `Number(r.grossTonnage)` in the result mapper return a proper number.
Raw queries used for audit log comparison do not — causing `String("4737.00") !== String(4737)` false positives.
**Fix**: normalize with `String(parseFloat(val))` before comparing numeric fields in audit loops.

### MySQL wildcard selects return snake_case — TypeScript expects camelCase
`SELECT sw.* FROM survey_warranties sw` returns raw column names (`survey_id`, `deadline_type`).
TypeScript interfaces use camelCase (`surveyId`, `deadlineType`).
**Rule**: never use wildcard selects for tables whose columns are referenced in typed interfaces. Always write explicit `col AS camelCaseName` aliases.

### initSchema() — unique variable names per migration block
Block-scoped `const [arCols]` repeated across multiple migration blocks causes TS2451 (duplicate identifier).
**Rule**: use unique names per block, e.g. `const [wbCols]`, `const [sfCols]`.

### New columns must be nullable or have a DEFAULT
If a `NOT NULL` column is added and an older client version inserts without it, the insert fails.
All schema migrations in this project add columns as `NULL` or with a `DEFAULT` — maintain this invariant.

### Schema migrations are additive and safe across versions
Old client + new schema: extra columns silently ignored.
New client + old schema: `SHOW COLUMNS` guards prevent double-ALTER errors.
Collations are set at table creation and never changed by the app. No version rollback risk.

---

## React / Component Patterns

### `const` arrow functions inside a component are NOT hoisted
If `loadData` is defined before `loadDynamicPolicies` as `const` arrow functions, `loadData` cannot call `loadDynamicPolicies` by name at definition time — but it CAN at call time (closure captures the variable after both are initialized).
However, calling an inline `window.api.X()` directly inside `loadData` (without referencing the later-defined function) is safer and avoids confusion.

### Data loaded in one tab is not available in another unless loaded in `loadData`
`dynamicPolicies` was only loaded when the user switched to the Policies tab.
This caused `resolveEffectivePolicyExpiry([])` to always return `undefined` on the Documents tab.
**Rule**: any data needed across multiple tabs must be loaded in the main `loadData()` call, not lazily in a tab-switch handler.

### `useCallback([], [])` to prevent infinite `useEffect` loops
If `loadData` is defined as a plain `async function` inside a component and used as a `useEffect` dependency, it re-creates on every render → infinite loop.
**Fix**: wrap `loadData` in `useCallback([], [])` so its reference is stable.

### `useState(prop)` doesn't update when the prop changes after mount
`const [isEditing, setIsEditing] = useState(initialEditing)` only reads `initialEditing` on the first render.
If the parent changes `initialEditing` after mount, the state doesn't update.
**Fix**: add `useEffect(() => { if (initialEditing) setIsEditing(true) }, [initialEditing])`.

### Classification society stale IDs
The junction table (`vessel_classifications`) stores UUIDs. If a society is deleted and re-added, it gets a new UUID. The old UUID remains in the junction table but no longer matches any entry in `classification_societies`.
**Fix**: seed logic should check `validIds.length === 0` (IDs that match current societies), not just `vesselClassificationIds.size === 0`.

---

## Audit Log Patterns

### Store resolved names, not raw IDs, in audit entries
Storing UUIDs in `vessel_audit_log` for relation fields (like `customer_id`) makes the history unreadable.
At write time: resolve IDs to names before calling `addVesselAuditEntry`.
For legacy entries already stored as UUIDs: resolve at render time with a lazy lookup (e.g. `getEntities()` in `VesselHistoryView`).

### UUID detection for legacy resolution
Pattern for detecting raw UUIDs at render time:
```typescript
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```
Collect all matching values from relevant audit entries, fetch entity names once, build a Map.

---

## IPC / Preload

### All 5 layers must be touched for a new feature
adapter.ts → index.ts (ipcMain.handle) → preload/index.ts (ipcRenderer.invoke) → preload/index.d.ts (type) → component.
Missing any layer causes a silent runtime failure (method is undefined on `window.api`).

### IPC session cache must be updated alongside DB
When saving user-specific settings (theme, window size, sanctions threshold), the in-memory session cache must also be updated:
```typescript
auth.getSessionData(sessionId).user.fieldName = newValue
```
Without this, `auth:getSession` returns stale data until the user logs out and back in.

---

## Git / Version Control

### `.gitignore` `*.md` rule silently excludes RELEASE_NOTES.md
If `.gitignore` has `*.md`, `RELEASE_NOTES.md` is excluded and never tracked.
`git status` doesn't show it as untracked (ignored files are hidden).
`git status RELEASE_NOTES.md` shows "nothing to commit" (misleading — it's ignored, not clean).
**Fix**: add `!RELEASE_NOTES.md` exception line after the `*.md` rule in `.gitignore`.

### `git add -u` does not work for untracked/ignored files
`-u` only stages changes to files already tracked by git. For a newly unignored file, use plain `git add filename`.

### `git status` hides ignored files
To see if a specific file is being ignored: `git check-ignore -v RELEASE_NOTES.md`.

---

## Release Notes / What's New Modal

### GitHub tag_name includes the `v` prefix
GitHub release `tag_name` is `"v5.4.0"`, not `"5.4.0"`.
The modal must strip it: `latest.version.replace(/^v/, '')` before comparing with `package.json` version.

### Fall back on empty parsed items, not empty raw notes
The GitHub release body may exist but parse to zero items (e.g. wrong format, whitespace only).
Check `parsed.length === 0`, not `data.length === 0`, before falling back to `whatsNew.ts`.

### Two-file release workflow
- `RELEASE_NOTES.md`: the current release's notes, used as the GitHub release body (content replaced each version)
- `src/renderer/src/whatsNew.ts`: cumulative array with newest entry at top (never replaced, only prepended)
- Both must have matching version strings and content for each release

---

## UI / Design Patterns

### P&I expiry badge + editable date for annual docs
For `annualRenewal = true` documents:
- Show a small cyan read-only badge "P&I · [date]" when the P&I policy end date is found
- Always show an editable `<input type="date">` for the document's own stored expiry (fallback when no P&I)
- The P&I date takes priority in the `effectiveExpiry` calculation; the document's stored date is the fallback

### Chromium date input clear is unreliable
The native browser "×" button on `<input type="date">` does not reliably fire `onChange` for controlled React inputs.
**Fix**: render an explicit clear button (18px circle, `<X size={12} />`) next to the input, calling the update API directly.

### Sticky sidebar layout for filter + results pages
For query/filter pages (like DynamicAddressBook):
- Left aside: fixed width (270px), `position: sticky; top: 20px` — stays in view while results scroll
- Right div: `flex: 1; min-width: 0` — takes remaining space
- Filter sections separated by `borderBottom: '1px solid var(--table-border)'`
- Collapsible sections for long lists (e.g. flag states) default to collapsed to reduce initial visual noise

### Two-state empty panel for query pages
Always show two distinct empty states:
1. "No query run yet" — before the user has searched (different icon/message from "no results")
2. "No contacts found" — after search with 0 results
Never conflate these into a single "no data" state.

### Histogram (vertical column chart) vs horizontal bar chart
Use vertical column bars (histogram) for ordered distributions (vessel age buckets, tonnage ranges).
Use horizontal bar rows for categorical comparisons (flag states, vessel types).
Column bars: height proportional to `count / maxCount * 100%`; show count + percentage above each bar.

---

## Component Architecture Decisions

### VesselHistoryView is a sub-function inside VesselDetail.tsx
Not a separate file — defined as `function VesselHistoryView(...)` inside `VesselDetail.tsx`.
This is intentional (shares the same module scope for types and utilities).
Access `useEffect`, `useState`, etc. from the top-level import; they work the same inside sub-functions.

### DynamicAddressBook is self-contained
Loads its own filter data (`getPolicyTypes`, `getFlagStates`) on mount.
Does not receive vessel/entity data from parent — queries via `queryDAB` IPC on user action.

### `allEntities` in EntityDirectory must be the full unfiltered list
Using the paginated `entities` state for parent-company lookups causes "undefined (role)" when the parent entity is on a different page.
`allEntities` state is loaded separately via `getEntities()` (no pagination) and used only for lookups.

---

## Patterns to Avoid

- **Never call `loadDynamicPolicies()` only on tab switch** if the data is needed on other tabs (e.g. Documents tab needs P&I date from dynamicPolicies)
- **Never store foreign-key UUIDs directly in audit log text fields** — always resolve to human-readable names at write time
- **Never use `SELECT *` for tables with snake_case columns** in code that feeds TypeScript interfaces expecting camelCase
- **Never add `NOT NULL` columns without a DEFAULT** in schema migrations (breaks older client versions)
- **Never hardcode hex colors** for danger/warning/success UI — always use `var(--danger)`, `var(--warning)`, `var(--success)`
- **Never use `glass-card` or `var(--bg-sidebar)` as modal background** — modals use `isLight ? '#ffffff' : '#1a1d28'`
- **Never use native `window.confirm`/`alert`/`prompt`** — in Electron they steal keyboard focus and leave inputs unresponsive ("stuck"). Use `confirmDialog`/`alertDialog`/`promptDialog` from `components/DialogHost.tsx`
- **MySQL pool uses `dateStrings: true`** — DATETIME values come back as `"YYYY-MM-DD HH:MM:SS"` (space, NOT ISO `T`). To get the date part use `String(d).slice(0, 10)`, never `.split('T')[0]` (which returns the whole string and breaks date-range comparisons). Compute date-filter bounds in LOCAL time, not `toISOString()` (UTC), to match server-local timestamps
- **Watch for temporal-dead-zone in large builders** — a helper that references a `const` declared later in the same function throws "Cannot access 'x' before initialization" only when actually called (e.g. PolicyExportService `filterByAlt` using `vessel` before its declaration). Declare shared vars before the helpers that close over them
- **Quotation export features must be mirrored in PolicyExportService** — policies are converted from quotations; hull condition ordering, custom-condition interleaving, and orphan-clause hiding all have parallel implementations that must be kept in sync
- **Never use a runtime `require('./relative/path')` in main-process handlers** — it resolves in `npm run dev` (files on disk) but FAILS in the bundled production main process ("Cannot find module"). Use top-level ESM `import` so it's bundled at build time. (Caused SIC add/update to silently fail in production.)
- **`safeHandle` returns `{ error: true, message }` on failure — it does NOT throw.** Renderer code must check `if (res?.error)` on the IPC result; a try/catch will not catch it, so naive `await api.x(); showSuccess()` shows false success while nothing saved.
- **Pushing to GitHub ≠ deploying.** Production only updates via `npm run deploy` (hot-update). Bundle-only bugs (see runtime-require lesson) and any fix won't appear on production until deployed — suspect this first when a pushed fix "doesn't work" on prod.
- **A `radio` input's `onChange` only fires when it becomes CHECKED** — clicking an already-checked radio does nothing. Never pair a toggle-style radio with UI that hides the alternative when it's on (blue-card "None" radio hid the card list → couldn't un-None and couldn't pick a card → locked). Keep the alternatives visible/clickable, or use a checkbox.
- **Never key React lists on `Date.now()`** — several items created in the same millisecond collide on the same id → duplicate keys → reconciliation can't remove nodes (toasts got stuck on screen when exporting multiple blue cards). Use a monotonic counter (`toast-${Date.now()}-${counter++}`).
- **`convertQuotationToPolicy` must populate every blue-card field itself** — the INSERT originally set only type/dates, so port_of_registry, owner_entity_id/name/address (and addressed-to for BBC/WRC) came out blank. The issue-modal in PolicyDetail resolves these; the conversion has to replicate it server-side (flag_state_ports default/single port; registered-owner assured + entity_addresses).
- **Quotation and Policy exports must order sections identically** — they diverged on deductibles: the quotation put the aggregate "When one incident…" clause right after the deductibles table, the policy put it after the text deductibles. When touching one export's section order, check the other (deductibles, exclusions, LOL, hull conditions all have parallel builders).
- **Entity/insured addresses are stored entirely in `address_line1`** — the entry UI is a single "Full address" textarea; `address_line2`/`city`/`country`/`postal_code` columns exist but are never populated. Newlines ARE preserved, so reading only `address_line1` gives the whole (possibly multi-line) address. Don't "fix" a reader to compose the structured columns — they're empty.
- **The policy setup wizard defaults inception from the vessel's EXISTING policy expiry** (`resolveEffectivePolicyExpiry`), NOT the quotation's `periodText` (free text like "12 months from July 3, 2026"). If a vessel already has a policy running to next year, a fresh conversion pre-fills next year's inception — expected, and editable on Step 2.
- **Empty-paragraph spacers stack in DOCX exports** — `mp()` turns blank source lines into empty paragraphs, and explicit `emptyP()` spacers add more, so sections doubled up blank lines (LOL section). Tag empties in a WeakSet and run the section content through a collapse pass (drop leading/duplicate/trailing empties).
