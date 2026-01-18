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
- **Reporting**: Excel and PDF exports (including document descriptions).
- **Responsive UI**: Premium glassmorphic UI with 1200x850 default resolution and expanded document tables.
- **Inline Editing**: Names and descriptions can be edited directly in Admin Panel and Vessel Details.
- **Document Descriptions**: Each document type now supports an optional description field stored in the DB.

## Technical Architecture
- **Main Process**: Uses `mysql2/promise` for data persistence. Schema management in `src/main/mysql/adapter.ts` with auto-migration support.
- **Authentication**: `bcryptjs` used for password hashing. Auth state managed via `AuthContext` in the renderer.
- **Database Schema**: Managed in `src/main/mysql/schema.sql`.
- **Preload**: Exposes MySQL and Auth IPC handlers to the frontend via a unified `Api` interface.
- **Frontend**: React with Vanilla CSS (Glassmorphism) and Lucide Icons.

## Current Status
- [x] MySQL Database Migration
- [x] Role-Based Access Control (RBAC)
- [x] User Management UI
- [x] Login & Setup Screens
- [x] UI Refactoring & Responsiveness
- [x] Fleet & Vessel Management
- [x] Excel/PDF Reports (with Descriptions)
- [x] GitHub Deployment Scripts
- [x] Hierarchical Document Requirements
- [x] Custom App Icon Implementation
- [x] Inline Editing & Descriptions
- [x] Navigation: Clickable Vessel Names

## Maintenance & Setup Notes
- **Installation**: Requires `mysql` server access. Run `npm install` to get dependencies including `mysql2` and `bcryptjs`.
- **Packaging**: Use `npm run build:win`. Ensure `mysql2` is excluded from bundling in `electron.vite.config.ts`.
- **Database Config**: Saved to `db/db-config.json` in the project root (dev) or user documents (prod).
