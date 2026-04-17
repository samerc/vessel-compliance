## 7.3.0

### Customer & Broker Management
- Customer/broker is now set on each policy individually — a vessel can have different brokers for Hull and P&I
- New Customer/Broker field with Broker/Direct toggle on policies and quotations
- Adding a vessel to a quotation automatically fills the customer from the vessel's existing policy
- Converting a quotation to a policy carries the customer through
- Compliance reports now only show documents relevant to the broker's coverage (e.g., Hull broker sees only Hull documents)

### Policy Types
- Policy types and quotation types are now managed in one place (Admin Panel → Policy Types)
- Each type has a code letter (P, H, W, etc.) shown as a badge
- Quotation Types tab removed from Quotation Settings

### Document Types
- Document types can now be tagged with the policy types they apply to (e.g., "P&I Application" → P&I only)
- Documents tagged as "All" appear in every report regardless of broker
- Compliance PDF, ZIP export, and Copy Missing all respect these tags

### Vessel Types
- Renaming a vessel type now immediately updates all vessels using it
- No more stale names after a rename

### Quotation List
- New view tabs: Active (default), Converted, All — plus saved custom views
- Month navigator to quickly filter by month
- Search finds quotations across all months and statuses
- Status and type filters shown as clickable chips with counts
- Active view hides converted and rejected quotations
- Draft numbers now include the type letter (e.g., DRAFT-P-0001)
- Quotation editor shows the type name as a title (e.g., "P&I Quotation")

### LOL Alternatives
- P&I quotations can now offer multiple Limit of Liability options without creating full alternatives
- Each LOL option has its own amount and premium
- Click "Add LOL Alternative" to convert the primary LOL into Alternative 1 + 2
- LOL alternatives appear in the export with per-alternative premium lines

### Fleet & Vessel
- Fleet dropdown in vessel list is now searchable with option to create a new fleet inline
- Survey defect due dates can now be cleared
- Warranty ordering respects the configured master list order

### Fixes
- Classification now always reflects the current class, not a previous one
- Subjectivities skip optional documents when working with existing vessels
- War quotation premium correctly auto-calculates from insured value and rate
- Export date always appears in quotation documents
- Exclusions show actual vessel type names instead of generic "Vessel Type" label

### Dependencies
- Electron 39 → 41
- lucide-react 0.562 → 1.8
- uuid 9 → 13
- React 19.2.3 → 19.2.5
- mysql2 3.16 → 3.22
- tiptap 3.19-3.21 → 3.22
- docx 9.5 → 9.6
