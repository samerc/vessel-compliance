## New Features

- New: **Activity Log** — centralized audit trail showing all system actions (create, update, delete, login, export) with colored badges, filters by module/action/user/date, and pagination
- New: **Email Template System** — create and manage email templates with 16 placeholders ({vesselName}, {customerName}, {policyEndDate}, etc.), category tabs, clickable placeholder chips, and copy to clipboard
- New: **Database Backup & Restore** — one-click backup to JSON file and restore from backup in Admin Panel settings
- New: **Customer Portfolio PDF** — per-customer summary report with vessels table, policy coverage matrix, compliance breakdown, and open warranties
- New: **Renewal Pipeline Report** — new Reports tab showing upcoming renewals with premium amounts, renewal status tracking, KPI cards, sortable table, and Excel export
- New: **Dashboard Data Quality Alerts** — new card showing vessels without customers, entities without email/phone, and policies without end dates
- New: **Selective Vessel Export** — checkbox modal to select which vessels to include when generating individual PDF ZIP exports

## Improvements

- Improved: **Performance** — 10 heavy components lazy-loaded (QuotationManager, FleetAnalytics, Reports, etc.) reducing initial bundle size
- Improved: **RBAC Permissions** — new granular permissions for email templates, backup/restore, activity log, and analytics presets
- Improved: **Activity Logging** — 18 IPC handlers now log actions with entity names and change details (not UUIDs)
- Improved: **Analytics KPI Cards** — dynamic font scaling for long numbers to prevent overflow
- Improved: **Analytics Presets** — inline name input replaces browser prompt (which was blocked in Electron)
