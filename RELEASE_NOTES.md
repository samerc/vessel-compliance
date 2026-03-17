## Security & Permissions

- Fixed: **RBAC enforcement across 14 components** — Quotation Settings, Renewal status editing, Admin Panel, User Manager, Quotation Editor, Fleet Manager, Assured Manager, Surveyor Directory, Survey Manager, Defect Manager, Warranty Manager, Compliance Center, Reminder Center now properly gate write actions by permission
- Fixed: **Quotation Settings** hidden from users without `quotations:settings` permission
- Fixed: **Renewal status** dropdown disabled for users without `renewals:manage` permission

## Activity Log

- Improved: **18 additional IPC handlers** now log activity (fleets, surveyors, defects, quotation duplication/revision, compliance decisions, email templates, RBAC groups)
- Improved: **Activity log resolves names** instead of showing UUIDs for vessels, documents, and entities
- New: **Log retention setting** in Admin Panel — auto-cleanup after 90/180/365 days with manual "Clean Now" button
- Improved: **Professional table design** — distinct module pill colors (Documents, Auth, Email, RBAC, Surveyors), distinct action pill colors (Upload, Duplicate, Close Defect, Decide), consistent entity column text, monospace timestamps

## Quotation Settings UX

- Improved: **Section descriptions** added to Warranty Tags, Warranty Sets, Clause Sets, Exclusions, Sub-Limits, Additional Clauses explaining how each feature works
- Fixed: **Import button** now uses Upload icon (was Download)
- Fixed: **Standard Texts** section styled as glass-card to match other sections
- Fixed: **UI consistency** — all headings use h3/1rem, glass-card padding normalized to 20px, description text standardized to 0.8rem

## Bug Fixes

- Fixed: **P&I date resolution** for annual documents — multi-policy picker when 2+ P&I policies exist
- Fixed: **Number inputs** show thousand separators automatically when typing (NumberInput component)
- Fixed: **19 hardcoded danger colors** replaced with `var(--danger)` CSS variable across 7 components
- Fixed: **8 debug console.log statements** removed from ComplianceCenter and VesselDetail
