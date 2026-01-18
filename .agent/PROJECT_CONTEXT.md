# Vessel Compliance Manager - Project Context

This file maintains the current state of the project for AI collaborators across different workstations.

## Project Summary
A desktop application for managing vessel document compliance. Built with **Electron**, **React**, and **TypeScript** using the **electron-vite** framework.

## Implemented Features
- **Multi-User MySQL Backend**: Scalable shared data access with self-hosted MySQL.
- **Role-Based Access Control (RBAC)**: Distinct permissions for 'Admin' and 'User' roles.
- **User Management**: Admins can create and delete users within the application interface.
- **Initial Setup Flow**: Automatic database configuration wizard for IT Admins.
- **Global Drag & Drop**: Prevented default browser behavior and implemented custom file drop zones on document rows.
- **Unified Vessel Table**: Searchable, sortable, and filterable view for all vessels.
- **Fleet Management**: CRUD for fleets and vessel reassignment.
- **Expiry & Receipt Tracking**: Native date pickers for document expiry and receipt dates.
- **Hierarchical Requirements**: Document types have a global "Required" default that can be overridden at the individual vessel level.
- **Reporting**: Excel and PDF exports (filtering for mandatory documents).
- **Responsive UI**: Premium glassmorphic UI that scales to any screen size (sidebar adjusts to screen width).

## Technical Architecture
- **Main Process**: Uses `mysql2/promise` for data persistence. No longer uses `electron-store` for business data.
- **Authentication**: `bcryptjs` used for password hashing. Auth state managed via `AuthContext` in the renderer.
- **Database Schema**: Managed in `src/main/mysql/schema.sql`.
- **Preload**: Exposes MySQL and Auth IPC handlers to the frontend.
- **Frontend**: React with Tailwind CSS and custom glassmorphism styles.

## Current Status
- [x] MySQL Database Migration
- [x] Role-Based Access Control (RBAC)
- [x] User Management UI
- [x] Login & Setup Screens
- [x] UI Refactoring & Responsiveness
- [x] Fleet & Vessel Management
- [x] Excel/PDF Reports
- [x] GitHub Deployment Scripts
- [X] Hierarchical Document Requirements
- [x] Custom App Icon Implementation

## Maintenance & Setup Notes
- **Installation**: Requires `mysql` server access. Run `npm install` to get dependencies including `mysql2` and `bcryptjs`.
- **Packaging**: Use `npm run build:win`. Ensure `mysql2` is excluded from bundling in `electron.vite.config.ts` if using external modules.
- **Database Config**: Saved to `db/db-config.json` in the project root (dev) or user documents (prod).

