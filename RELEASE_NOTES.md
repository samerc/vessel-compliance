## Quotation Export Fixes

- Fixed: **Hull conditions** now filtered by selected clause — no longer showing conditions from all clauses
- Fixed: **Additional clauses** in both P&I alternatives now correctly appear in "Applicable to both alternatives" section
- Fixed: **DDQ countries** displayed in alphabetical order in exports
- Fixed: **Non-refundable text** no longer shows raw HTML `<p>` tags in exports
- Fixed: **Hull premium** removed extra empty lines between Technical and Payable sections
- Fixed: **Premium alternative labels** ("Alternative 1", "Alternative 2") now bold in DOCX, column split adjusted to 25/75

## Quotation Editor

- Improved: **NCB/UPCC text editors** increased to 120px min height with font family selector
- Improved: **NCB/UPCC template selector** always visible — shows helpful "create in Settings" message when empty
- Improved: **Custom placeholder support** for NCB/UPCC templates — admin can add `{date}`, `{name}`, etc. alongside auto-filled placeholders
- New: **Tab instructions** added to Exclusions, Deductibles, Subjectivities, Survey Warranties, and Information tabs

## Document Compliance

- New: **Status-colored left borders** on document rows in both table and card views
  - Expired → red border
  - Expiring soon (30 days) → amber border
  - Missing (mandatory) → red border
  - Compliant/Optional → no border (clean)
- New: **Compliance Center** document alerts table also shows colored left borders

## UI Polish

- Fixed: **RichTextEditor** sharper font rendering — explicit font stack, fixed 13px size, antialiased smoothing
- Fixed: **RichTextEditor** borders now use `var(--input-border)` for consistency with form controls
