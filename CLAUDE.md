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
- **Surveyors**: Directory of surveyor companies (`SurveyorDirectory.tsx`) with company name, country, contact info
- **Surveys**: Condition surveys attached to vessels (`ConditionSurveyManager.tsx`) with date, surveyor, type, location
- **Defects**: Each survey can have multiple defects (`DefectManager.tsx`) with severity (optional), status (OPEN/CLOSED), due dates
- **Attachments**: Multiple file attachments per survey (reports, photos, certificates)
- **Survey Status**: Automatically shows "SURVEY CLOSED" when all defects are closed
- **Closure Tracking**: Defects track who closed them, when, and optional closure notes

### Customer Assignment

Vessels can be assigned to a customer entity with a customer type:

- **Fields**: `customer_id` (FK to entities, soft reference) and `customer_type` ('broker' or 'direct') on the `vessels` table
- **Per-Vessel**: The same entity can be a broker for one vessel and a direct client for another
- **Indexed**: `idx_vessels_customer` index on `customer_id`
- **Orphan Cleanup**: Deleting an entity clears `customer_id`/`customer_type` on its vessels (no CASCADE)

### Fleet Management

Dual-view fleet management page (`src/renderer/src/components/FleetManager.tsx`):

- **By Customer** view: Vessels grouped under customer entities, split into Brokers / Direct Clients / Unassigned sections
- **By Fleet** view: Original fleet CRUD with vessel assignment
- **Filters**: Customer type filter, text search across customer and vessel names
- **Collapsible**: Customer cards expand/collapse to show vessel tables

### Entity Directory

Entity management page (`src/renderer/src/components/EntityDirectory.tsx`) with master-detail layout:

- **Stats Row**: Total entities, companies, persons counts with gradient icons
- **Left Panel**: Paginated entity list with type-colored avatars, OFAC badges, search/filter
- **Right Panel**: Entity detail with contact info, document status badges, associated vessels grid
- **Edit Modal**: Modify entity name, type, identifier, email, phone
- **Delete**: With confirmation warning about linked vessels; clears customer references
- **Vessel Navigation**: Clicking vessel names navigates to VesselDetail with "Back to Entity" return

### Entity Documents
Required documents vary by entity type:
- **Companies**: Certificate of Incorporation, Articles of Association, KYC
- **Persons**: ID/Passport only (no KYC required)
- **UBOs**: Same document requirements based on their type (company or person)

### Window Preferences
- **Per-User Storage**: Window size and position stored in database per user (`users.window_width`, `window_height`, `window_x`, `window_y`)
- **Auto-Save**: Window bounds saved on resize/move when user is logged in
- **Auto-Restore**: User's window preferences applied on login via `setBounds`

### Compliance Center
Centralized compliance monitoring with two tabs:
- **Document Alerts Tab**: Missing required files, expired documents, expiring soon (30 days)
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

### Excel Import

Bulk vessel import from Excel files (`src/main/excelImporter.ts`):

- **Expected Columns**: `Vessel | Customer Name | Customer Type | IMO# | Registered Owners | Managers`
- **Customer Assignment**: Finds or creates customer entity, assigns to vessel with broker/direct type
- **IMO Generation**: Empty IMO fields get a random 7-digit number starting with `9`
- **Entity Linking**: Registered Owners and Managers are found/created as entities and linked as vessel assureds
- **Customer Type Normalization**: 'broker'/'b' → broker, 'direct'/'client'/'d'/'c' → direct
- **Stats**: Returns counts of vessels created/updated, entities created, customers assigned
- **UI**: Import button in Admin Panel with tooltip showing expected column format

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

### Sanctions Search

Ad-hoc sanctions lookup page (`src/renderer/src/components/SanctionsSearch.tsx`):

- **Per-User Threshold**: Minimum match threshold (10-95%) persisted to `users.sanctions_threshold` column
- **IPC Handler**: `users:updateSanctionsThreshold` saves to DB and updates session cache
- **Source Filters**: Toggle OFAC, UN, EU sanctions lists independently
- **Results**: Expandable cards with match score, aliases, remarks, source IDs

### Admin Panel

System configuration page (`src/renderer/src/components/AdminPanel.tsx`) with 7 collapsible sections (all collapsed by default):

1. **Document Types**: CRUD with drag-to-reorder and active/inactive toggle
2. **Assured Roles**: CRUD for entity role types
3. **Scheduled Compliance Check**: Enable/disable, schedule, threshold, include vessels, skip cleared
4. **Vessel Reminder Settings**: Snooze period and clipboard template
5. **File Upload Security**: Allowed/blocked file extensions for uploads
6. **Database Configuration**: View/change MySQL connection settings
7. **Danger Zone**: Purge all vessels and entities (double confirmation required, admin-only)

- **Collapsible Pattern**: Uses `collapsedSections` state (`Set<string>`) with `toggleSection` function; each section header has ChevronRight/ChevronDown toggle
- **All sections collapsed by default**: Initial state includes all section IDs

### IPC Session Cache Pattern

When updating user-specific settings (theme, sanctions threshold, window preferences), the IPC handler must:

1. Save to database via adapter method
2. Update the in-memory session cache (`auth.getSessionData(sessionId).user.field = value`)

Without step 2, `auth:getSession` returns stale data until next login.

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
- `surveyors`, `condition_surveys`, `survey_defects`, `survey_attachments` - Survey management
- `compliance_check_logs` - History of scheduled/manual compliance runs
- `compliance_check_results` - Individual sanctions matches pending review
- `settings` - Key-value store for app settings (file types, compliance schedule, etc.)
