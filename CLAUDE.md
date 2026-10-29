# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Supplementary References

Additional reference files live in `.claude/` and should be consulted when working on UI or architecture:

- **`.claude/design-guide.md`** — Canonical UI design standards: CSS variables, button variants, input styles, modals, tables, cards, typography, spacing, status badges, empty states. Consult before writing any new component or UI change.
- **`.claude/lessons-learned.md`** — Hard-won patterns and anti-patterns: MySQL pitfalls, React component traps, audit log conventions, IPC rules, git gotchas, release workflow. Consult when debugging or adding new features.

## Feature Docs (read before working on an area)

The details of each feature live in `.claude/docs/`, not here. Before changing code in an area,
read its file; when you add or change a feature, update the matching file (and this index if a
new area appears).

| Area | File | Covers |
|---|---|---|
| Quotations | `.claude/docs/quotations.md` | types, editor tabs, premium / NCB / UPCC, warranties, subjectivities, hull / P&I / LOL alternatives, FD&D, cargo, war excess, standard texts, section order, exports, workflow, registry numbering, editing lock, recycle bin |
| Policies | `.claude/docs/policies.md` | customer per policy, vessel policies + renewals page, converter wizard, policy / DA / CA exports, freezing and signed files, revisions, blue cards, signatures, T&C, QR, QuickBooks, commissions, war declaration, policy numbers |
| Compliance | `.claude/docs/compliance.md` | sanctions engine + search process, SIC list and letter OCR, weekly checks and review, Compliance Center tabs, Sanctions Search / Check Report, data validation |
| Vessels | `.claude/docs/vessels.md` | vessel detail and tabs, documents and the annual rule, document history, audit log, vessel list / filters / compare, surveys, warranties, fleets, analytics, Directory and entity documents, flag states, address book |
| App | `.claude/docs/app.md` | auth, RBAC, theme, Home, Ctrl+K and the feature registry, Settings hub, notifications, activity log, templates, wiki, reports and calculators, table / panel UI patterns, column prefs, file path mapping, What's New, hot-updates |
| Roadmap | `.claude/docs/roadmap.md` | the cohesion plan (risk case backbone, premium status, claims, tasks, compliance gates, document store, wording library, shared UI, server, test net) - discussed point by point, nothing approved until the user says so |

## Build and Development Commands

```bash
npm install          # Install dependencies (runs electron-builder install-app-deps)
npm run dev          # Start development server with hot reload
npm run build        # Full production build (typecheck + electron-vite build)
npm run build:win    # Build Windows executable
npm run build:mac    # Build macOS dmg
npm run build:linux  # Build Linux packages
npm run deploy       # Build + upload code-update.zip to GitHub as hot-update (see Hot-Update System in `.claude/docs/app.md`)
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
- bcryptjs for password hashing, Node `crypto.randomUUID` for ID generation (the `uuid` package was removed)
- Electron 44 (Node 24). Vite stays on 7 (electron-vite 5 supports up to Vite 7), TypeScript on 5.9 and ESLint on 9 (typescript-eslint / eslint-plugin-react not yet compatible with newer)
- **Dependency placement**: `dependencies` = only what the MAIN process `require`s at runtime from the installed app (mysql2, better-sqlite3, bcryptjs, jszip, xlsx-js-style, docx, pdf-lib, pdf-parse, mammoth, electron-log, electron-updater, @electron-toolkit/utils, tesseract.js, @napi-rs/canvas). electron-vite externalizes these, so they come from the installer's node_modules: upgrading one only reaches users with a FULL installer, never a hot-update. Renderer-only libs and anything bundled into main (react, tiptap, lucide, jspdf, dompurify, qrcode, flag-icons, fuse.js, xml2js, electron-store) belong in `devDependencies` - they ship inside `out/` (and so in hot-updates), and keeping them out of `dependencies` keeps the installer small
- pdf-parse 2.x (pdf.js 5). It runs ONLY inside the defect-import utility process (see Condition Surveys)
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

### IPC Session Cache Pattern

When updating user-specific settings (theme, sanctions threshold, window preferences), the IPC handler must:

1. Save to database via adapter method
2. Update the in-memory session cache (`auth.getSessionData(sessionId).user.field = value`)

Without step 2, `auth:getSession` returns stale data until next login.

### IPC Errors (safeHandle) & MariaDB Collation

MariaDB collation mismatch (`utf8mb4_uca1400_ai_ci` vs `utf8mb4_unicode_ci`) causes FK constraint errors (errno 150) on quotation-related tables:

- **Affected tables**: `pi_warranty_set_items`, `quotation_custom_warranties`, `quotation_agreed_value_items`, `quotation_hull_conditions`, `quotation_hull_additional_conditions`
- **Defense layers**: (1) `schema.sql` execution wrapped with `SET FOREIGN_KEY_CHECKS=0/1`, (2) migration CREATE TABLE blocks wrapped, (3) CRUD methods (`addPIWarrantySet`, `updatePIWarrantySet`, `addQuotationCustomWarranty`, `setQuotationHullConditions`, `setQuotationHullAdditionalConditions`, `setQuotationAgreedValueItems`) wrapped with FK_CHECKS=0/1 in try/finally
- **`safeHandle` error pattern**: IPC handlers using `safeHandle` return `{ error: true, message }` on failure instead of throwing. Components must guard with `Array.isArray()` checks on all IPC results used in setState, and check `result.error` on single-object returns.
- **Failed mutations reject** (`src/preload/ipcErrorPolicy.ts`): the preload turns `{ error: true }` from a MUTATION channel (add/update/delete/set/... verbs) into a rejected promise, so a failed save never reaches the success toast. Reads still resolve with the error value. `LEGACY_ERROR_VALUE_CHANNELS` keep the old contract because some caller branches on `.error`; any other caller of those wraps the result in `ok()` from `utils/ipc.ts`. Use `asArray()` for list loads. Uncaught rejections become an error toast (ToastContext `unhandledrejection` listener). Each page sits in its own `ErrorBoundary` (keyed by tab).

### Code Style
- Prettier: Single quotes, no semicolons, 100 char width, no trailing commas
- Path alias: `@renderer/*` maps to `src/renderer/src/*`
- **Vessel Names**: Always uppercase (enforced via `toUpperCase()` on input and `textTransform: uppercase` CSS)
- **Danger color**: always `color: 'var(--danger)'` — never hardcode `#ff4d4d`, `#c00`, or `red`
- **Dialogs, tables, forms** (redesign 2026-10): every dialog is `<Modal>` from `components/ui` (Escape closes the top one; `closeOnOverlay={false}` when it has inputs), every list table is `.table-wrap` > `table.data-table`, form fields are `<Field>` inside `.form-grid` (see `.claude/design-guide.md` section 0). No hand-built overlays or `isLight` surface colours
- **Input borders**: use `var(--input-border)` (color-only token), NOT `var(--glass-border)` (full border shorthand) for form controls
- **Glass borders**: `var(--glass-border)` is a FULL shorthand (`1px solid rgba(...)`) - use it alone (`border: 'var(--glass-border)'`). For a custom width use the color-only `var(--glass-border-color)` (`'2px solid var(--glass-border-color)'`). `'1px solid var(--glass-border)'` is invalid CSS and the border silently disappears.
- **Solid surfaces**: `var(--bg-primary)` is the solid per-theme surface for dropdowns/popovers/modal bodies. `--danger`/`--success` are darker in light mode - prefer them over hardcoded hex. CSS vars do NOT work in lucide `color=` props or with hex-alpha suffixes (`color + '22'`).
- **Shared UI helpers (UX review 2026-10)**: `ui/KeepAlive` keeps visited tab panes mounted (Reports, Calculators); `ui/SaveStatus` shows Saving... / Saved / Last change not saved from the `vc-save-start/-end/-error` DOM events the preload fires for user saves (`isSaveActivity` in ipcErrorPolicy.ts; heartbeat, recent items and preferences stay quiet); `contexts/ReadOnlyContext` makes RichTextEditor read-only inside a `<fieldset disabled>` (read-only quotations); `confirmDelete` (quotation-tabs/sharedUtils) asks before deleting a quotation item and quotes it; `.inline-combo` = a select-like control shown as text until hover; `utils/vesselDocCompliance` counts a vessel's missing / expired / expiring documents with the Compliance Center rule
- **No native dialogs**: NEVER use `window.confirm`/`alert`/`prompt` — in Electron they steal keyboard focus and leave inputs "stuck". Use the promise-based in-app replacements from `src/renderer/src/components/DialogHost.tsx`: `confirmDialog(msg)`, `alertDialog(msg)`, `promptDialog(msg)`. `<DialogHost />` is mounted once in `main.tsx`.

## Database Setup

On first launch, admin enters MySQL credentials which are saved to `db-config.json`. Default admin credentials are `admin/admin123`. The schema auto-migrates on startup.

### Schema Migration Pattern

- Migration function: `initSchema()` in `adapter.ts` runs `runMigrations()` only when the code changed: a SHA-1 of schema.sql + the MySQLAdapter class source is stored in `app_settings.schema_fingerprint` after a successful run (one PC migrates at a time, named lock `vc_schema_migrate`). Any adapter change re-runs it once per deploy. Never put per-start work (cleanups, caches) in `runMigrations`
- Pattern: `SHOW COLUMNS FROM table` → check if column exists → `ALTER TABLE ADD COLUMN` if missing
- All new columns must be **nullable** or have a **DEFAULT** value — never add `NOT NULL` without a default, as older versions may INSERT without the new column
- Add new table migrations before the `} catch (error)` block at the end of `initSchema()`
- Use unique variable names per migration block (block-scoped `const [cols]` repeated = TS2451 error)
