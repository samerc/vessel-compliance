# Project Context - Vessel Compliance

## Current Status
The application is a vessel compliance management system built with Electron, React, and MySQL/MariaDB. It allows managing fleets, vessels, document types, and entity relationships (owners, managers, etc.).

## Recently Implemented Features (Session Jan 18, 2026)

### 1. Enhanced Editing Capabilities
- **Document Types**: Support for inline editing of names and descriptions. Toggling of "Required by default" status directly from the table.
- **Assured Roles**: Support for inline editing of role names.
- **Vessel Details**: "Edit Mode" in the vessel detail page to modify Vessel Name and IMO Number.

### 2. Document Descriptions
- Added a `description` field to `document_types` (Database schema, TypeScript types, and UI).
- Descriptions are now included as a separate column in both **Excel** and **PDF** reports (Individual and Fleet).
- **Migration**: A check is performed on startup to ensure the `description` column exists.

### 3. Navigation & UI
- **Clickable Vessels**: Vessel names in the Registry table are now links to their detail pages.
- **Window Size**: Increased default window resolution to **1200x850**.
- **Responsive Layout**: Adjusted the Admin Panel grid (80/20 split) and increased table padding for better readability on larger screens.

## Technical Details
- **Backend**: `src/main/mysql/adapter.ts` handles all DB operations.
- **Preload**: `src/preload/index.ts` and `index.d.ts` expose the database API to the renderer.
- **Frontend**: Components in `src/renderer/src/components/` use the exposed `window.api`.
- **Reports**: `src/renderer/src/services/ReportService.ts` handles Excel (xlsx) and PDF (jspdf) generation.

## Pending / Next Steps
- Monitor and resolve potential InnoDB corruption issues (MariaDB service level).
- Expand user management capabilities if needed.
