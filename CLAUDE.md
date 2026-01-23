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
- **State**: React Context for auth (`AuthContext.tsx`) and theme (`ThemeContext.tsx`)
- **IPC**: All database operations exposed through preload's `window.api` interface
- **Types**: Shared interfaces in `src/shared/types.ts`

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

### Code Style
- Prettier: Single quotes, no semicolons, 100 char width, no trailing commas
- Path alias: `@renderer/*` maps to `src/renderer/src/*`

## Database Setup

On first launch, admin enters MySQL credentials which are saved to `db-config.json`. Default admin credentials are `admin/admin123`. The schema auto-migrates on startup.
