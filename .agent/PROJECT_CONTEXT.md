# Vessel Compliance Manager - Project Context

This file maintains the current state of the project for AI collaborators across different workstations.

## Project Summary
A desktop application for managing vessel document compliance. Built with **Electron**, **React**, and **TypeScript** using the **electron-vite** framework.

## Implemented Features
- **Global Drag & Drop**: Prevented default browser behavior and implemented custom file drop zones on document rows.
- **Unified Vessel Table**: Searchable, sortable, and filterable view for all vessels.
- **Fleet Management**: CRUD for fleets and vessel reassignment.
- **Expiry & Receipt Tracking**: Native date pickers for document expiry and receipt dates.
- **Reporting**: Excel and PDF exports (filtering for mandatory documents).
- **Responsive UI**: Glassmorphic design with scaling support.

## Technical Architecture
- **Main Process**: Uses `electron-store` for data persistence.
- **Frontend**: Component-based React architecture in `src/renderer/src/components`.
- **Preload**: Exposes `webUtils.getPathForFile` via `window.api.getFilePath` to bridge Electron security.
- **Database**: Managed in `src/main/db.ts`.
- **Reporting**: Handled by `src/renderer/src/services/ReportService.ts`.

## Current Status
- [x] UI Refactoring & Scaling
- [x] Fleet Management
- [x] Expiry Dates
- [x] Receipt Tracking
- [x] Excel/PDF Reports
- [x] GitHub Deployment Scripts

## Next Steps / Ideas
- [ ] Document Expiry Notifications.
- [ ] User Authentication/Roles.
- [ ] Audit Trail / Change History.
