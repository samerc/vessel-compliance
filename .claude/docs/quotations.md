# Quotations

Quotation types, editor tabs, premium, warranties, subjectivities, hull / P&I / LOL alternatives, FD&D, cargo, war excess, exports, workflow, registry, lock, recycle bin. Read with the root CLAUDE.md (architecture, IPC chain, migrations, code style).

### Unified Policy / Quotation Types

Single `policy_types` table serves both vessel policies and quotations. The `code` column (P, H, W, F, L, C) drives quotation behavior (tab visibility, export format, warranty scoping).

- **Table**: `policy_types` (id, name, code, order_index) — seeded with P&I (P), Hull (H), War Risk (W), FDD (F), Loss of Hire (L), Cargo (C)
- **Unified**: `quotation_types` table is legacy — all CRUD methods (`getQuotationTypes`, `addQuotationType`, etc.) now read/write `policy_types` WHERE code IS NOT NULL
- **`quotation_type_id`** on `quotations` table — now references `policy_types` rows (migrated from old `quotation_types` IDs)
- **Auto-reference**: `Q/{code}/{YY}/{serial}` for DB-based (e.g. `Q/P/26/1`); `Q/{R|N}/{branch}/{YY}/{serial}` for registry-based
- **Starting serial**: Configurable per type in Quotation Settings → Quotation Types
- **Admin Panel**: Policy Types section manages both policy and quotation types with name + code fields
- **Renaming**: Renaming a type auto-reflects everywhere since all references are by UUID. The `code` field should NOT be renamed (drives application logic).
- **IPC**: `db:getQuotationTypes`, `db:addQuotationType`, etc. delegate to `policy_types` table

### Document Type Policy Tags

Document types can be tagged with applicable policy types to control which documents appear in broker-specific compliance reports.

- **Junction table**: `document_type_policy_types` (document_type_id, policy_type_id)
- **Empty = all types**: A document with no tags is relevant to all policy types
- **Admin Panel**: Policy type checkboxes (with "All" chip) in document type add/edit forms. Read-only display shows type badges or green "All Types" badge.
- **Compliance filtering**: `buildVesselRow`, ZIP export, and Copy Missing all filter documents by the customer's active policy types for each vessel. Vessel-level exports (no customer filter) show all documents.
- **`policyTypeIds`**: Optional `string[]` on `DocumentType` interface
- **Lightweight list query**: `getQuotations()` returns only display fields (no MEDIUMTEXT blobs); `getQuotation(id)` loads full record for editor
- **Vessel name in list**: Subquery on `quotation_vessels` with `COALESCE(v.name, qv.name)` to resolve fleet-linked or manually-entered vessel names; shows `+N` for multi-vessel quotations
- **Shared tabs** (all types): insured, vessel, trading, period, premium, warranties, subjectivities. Type-specific tabs: P&I gets conditions/deductibles/exclusions/liability; H&M gets agreed value/hull conditions
- **Tab visibility**: `allTabs` array with optional `types?: string[]` field, filtered by `getTabsForType(typeCode)`

### Quotations

Quotation management system:

- **QuotationManager** (`src/renderer/src/components/QuotationManager.tsx`): Main quotation list and management
- **QuotationEditor** (`src/renderer/src/components/QuotationEditor.tsx`): Create/edit quotation details with tabbed sections (Conditions, Warranties, Deductibles, Exclusions, etc.)
- **QuotationList** (`src/renderer/src/components/QuotationList.tsx`): Quotation listing view
- **QuotationSettings** (`src/renderer/src/components/QuotationSettings.tsx`): Two-tier navigation — category selector (General / P&I / H&M) on top, filtered tab chips below. General: Quotation Types, Warranties, Subjectivities, Trading Countries, Trading Warranty, Sanctions Versions, Standard Texts, Instalment Defaults, Section Order, Logo. P&I: Conditions, Deductibles, Exclusions, Limits of Liability, Addl. Clauses. H&M: Agreed Value, Clauses, Addl. Conditions.
- **RichTextEditor** (`src/renderer/src/components/RichTextEditor.tsx`): Rich text editing for quotation content
- **Export**: `QuotationExportService.ts` with DOCX (`htmlToDocx.ts`) and PDF (`htmlToPdfText.ts`) export
- **Settings lists cache** (`quotation-tabs/masterDataCache.ts`): the editor tabs read settings lists once per editor session. Every successful save on a settings-list channel (`isSettingsListSave` in index.ts `safeHandle`: pi/hull/war/cargo/premium/survey templates/entity doc types without `Quotation` in the name, db document/vessel/quotation types, classification societies, subjectivities, `settings:set`) bumps `app_settings.quotation_settings_version`; on each tab switch the editor reads it (`checkSettingsVersion`) and, if it changed, clears the cache, remounts the tab and reloads its standard texts / sanctions versions (never the quotation itself). A new settings-list channel is covered when it follows that naming

### Quotation Vessel Scope

Per-item vessel scoping for multi-vessel quotations:

- **`vessel_scope TEXT DEFAULT NULL`** on all 8 quotation item tables (warranties, custom warranties, deductibles, text deductibles, subjectivities, clauses, additional clauses, exclusions)
- **NULL scope = all vessels**; array of quotation_vessel IDs = specific vessels
- **VesselScopeChips** (`src/renderer/src/components/VesselScopeChips.tsx`): Compact chip row rendered under each item when 2+ vessels. "All" button + per-vessel toggle buttons
- **Export annotation**: `vesselScopeSuffix()` helper appends `(VESSEL NAME, VESSEL NAME)` to scoped items in PDF/DOCX
- **Bulk set preservation**: SET methods (warranties, clauses, exclusions) that delete-and-reinsert read existing `vessel_scope` into a `scopeMap` before delete, then restore during re-insert
- **Update methods**: `updateQuotationWarrantyVesselScope` / `updateQuotationClauseVesselScope` update by `quotation_id + pi_*_id` pair; `updateQuotationItemVesselScope` is generic with `allowedTables` whitelist

### Quotation Premium System

Premium management with per-vessel amounts, sequential discounts, and non-refundable options:

- **Per-vessel premiums**: `premium_amount DECIMAL(15,2)` on `quotation_vessels` table. Multi-vessel quotations show a premium table in PremiumTab with per-vessel inputs; total auto-syncs to `quotation.premiumAmount`
- **Currency**: Quotation-level `premiumCurrency` in the editor header. Changing it (`changeQuotationCurrency`, IPC `db:updateQuotationCurrency`) moves every currency of the quotation still on the OLD one to the new one: the quotation's limit / agreed value / IV / insured value currencies, deductibles, sub-limits, LOL options, agreed value options, P&I and hull alternatives, vessels (`QUOTATION_CURRENCY_COLUMNS`). A currency set to something else was chosen on purpose and stays (the toast counts both); empty ones follow anyway. New deductibles take the quotation currency, new sub-limits the limit's currency
- **Auto-label**: Premium field shows "Technical Premium" when NCB or UPCC is enabled; "Premium" otherwise
- **NCB (No Claims Bonus)**: Checkbox + percentage/amount + rich text. Export renders only the `ncbText` with `{ncb_amount}` and `{ncb_percent}` placeholders replaced. Text is seeded from standard default on first enable.
- **UPCC (Upfront Continuity)**: Checkbox + percentage/amount + rich text. Same placeholder pattern (`{upcc_amount}`, `{upcc_percent}`). DB columns still named `cpc_*` (aliased to `upcc*` in adapter)
- **Per-vessel UPCC rate**: `quotation_vessels.upcc_percent` (NULL = the quotation's rate), the small % box beside each vessel's UPCC tick in the fleet premium table (percentage UPCC only). `computePayablePremium` uses it (`upccPercentFor`), so the converter, policy and QuickBooks follow; the quotation's `{upcc_percent}` prints "17.5% (12.5% for SAND WEAVER)" (`upccPercentText`), a policy prints its vessel's own rate. Copied with the quotation
- **Sequential discount calculation**: `Payable = Technical × (1 - NCB%) × (1 - UPCC%)` — discounts applied multiplicatively, not additively
- **Non-refundable**: Quotation-level choice via `nonRefundableType` ('first_instalment' | 'percentage' | null) + `nonRefundablePercent`. Replaces old per-instalment non-refundable fields
- **Instalments**: Number + days from inception only (description field removed). Default days: 1→`[0]`, 2→`[0,180]`, 3→`[0,120,240]`, 4→`[0,90,180,270]`, 12→`[0,30,60...330]`; admin `InstalmentDefaults` settings take priority when configured
- **Export premium table**: Premium section rendered as tables in PDF/DOCX for all cases except single plain premium. Multi-vessel, multi-alternative, and discount scenarios all use tabular format with label/amount columns. PDF uses autoTable with `didParseCell` for bold styling; DOCX uses `premCell`/`premRow`/`premTable` helpers for 2-column Table layout.
- **Per-vessel NCB/UPCC exclusion**: `ncb_excluded` and `upcc_excluded` booleans on `quotation_vessels`. Multi-vessel premium table shows inline checkboxes per vessel. Excluded vessels get plain "X per annum" in export; included vessels get Technical/Payable split. NCB/UPCC text sections append "Applicable to M/V ..." when some vessels excluded.

### Quotation Warranties System

Tag-based warranty categorization with sets, custom warranties, type scope, and bulk management:

- **Type Scope**: `type_scope` column on `pi_warranties` (`'pi'` | `'hull'` | `'both'`). Editor filters visible warranties by quotation type code. Admin UI shows scope selector and badge per warranty.
- **Warranty Tags** (`pi_warranty_tags`): Admin-created category labels (e.g. "Cargo", "Navigation"). Managed in QuotationSettings Warranties tab.
- **Warranty Sets** (`pi_warranty_sets`, `pi_warranty_set_items`): Named groups of warranties (e.g. "Default", "Cargo Warranties") with optional `default_selected` flag. Default sets are applied when the quotation is CREATED, see Quotation Defaults below; the tab still fills an empty older quotation on first open (only once the quotation type is known).
- **Cargo Tag Auto-Linking**: In QuotationEditor, a tag named "Cargo" (case-insensitive) automatically includes warranties with `isCargoRelated = true` in its tab, even if they don't have the tag explicitly assigned via `tagIds`. The "Other" (untagged) tab excludes these to avoid duplication.
- **Bulk Tag Assignment**: QuotationSettings has a "Bulk Tag" mode — checkboxes on each warranty row, Select All/Deselect All, toolbar with tag assign/remove chips, + Cargo/- Cargo, + Default/- Default bulk actions.
- **Custom Warranties** (`quotation_custom_warranties`): Per-quotation ad-hoc warranties added inline in the selected list. Support add, edit, delete, reorder, and bulk import (paste with bullet extraction).
- **Custom Warranty Input**: Auto-growing textarea (`resize: none`, dynamic height via `scrollHeight` on change, max 200px).
- **Import Modal**: Bulk paste warranties with bullet/dash/number stripping, parse preview, then confirm to add as custom warranties.
- **Selected Warranties Order**: `selectedWarrantyIds` array preserves selection order; reorderable via up/down arrows in the selected list.
- **Collapsible sections**: "Additional Text" and "Breach of Warranties" are separate collapsible sections in WarrantiesTab (not nested under Standard Texts)

### Quotation Defaults (at creation)

A new quotation (`addQuotation` -> `applyNewQuotationDefaults` in adapter.ts) starts with what its tabs used to fill in only when first opened, so a quotation exported without visiting a tab is complete:
- **Warranties** (types with a Warranties tab: P, H, W, F, L): the default-selected warranty sets, warranties in the type's scope, settings order
- **Trading countries** (types with a Trading tab: P, F, H): the excluded / DDQ list, `defaultTradingCountries` (shared/quotationTypes.ts, also used by the tab for an empty older quotation): `default_excluded_countries_{code}` setting, else the settings list for the type (Hull: Israel + DDQ only)
- **P&I / FD&D**: all conditions offered for the type (P&I only; FD&D starts with none), default additional-clause sets then individually default clauses, text deductibles marked default (with their default values)
- **Subjectivities filled automatically**: a master subjectivity whose linked document types are missing / expiring on the vessels or assureds, every one with NO linked document, and all of them when no registry vessel is linked; never those marked "Only by hand" (`pi_subjectivities.manual_only`, one-click chip in Quotation Settings > Subjectivities), which Select All skips too
- **Subjectivities** cannot be set at creation (they come from the vessels' / assureds' missing documents): `fillDefaultSubjectivities` (`quotation-tabs/subjectivityDefaults.ts`, shared with the tab) runs before the export checks of a DRAFT quotation that never had them; approved quotations are never changed
- Each tab still fills an EMPTY older quotation on first open
- Duplicates, revisions and renewals copy their source instead (they do not go through `addQuotation`, except a renewal with no earlier policy, which is a blank new quotation)

### Quotation Standard Texts

Section text templates stored in `pi_section_texts` (global defaults) with per-quotation overrides in `quotations.section_texts_override` (MEDIUMTEXT JSON):

- **`PISectionTexts` interface** (`src/shared/types.ts`): All optional string fields for each section
- **`DEFAULT_SECTION_TEXTS`** (`QuotationSettings.tsx`): Hardcoded fallback defaults
- **`SECTION_TEXT_FIELDS`** (`QuotationSettings.tsx`): Defines which fields appear in the Standard Texts settings tab with labels, sections, and row counts
- **Per-quotation override**: `getEffectiveText(key)` checks `quotation.sectionTextsOverride?.[key]` → global texts → `DEFAULT_SECTION_TEXTS[key]`
- **Warranty texts order in export**: warranties list → `warrantiesAdditionalText` → `warrantiesBreach` (warrantiesNote removed from settings UI)
- **CRITICAL — double stringify bug**: When passing `sectionTextsOverride` to `updateField()`, pass the **object** directly, NOT `JSON.stringify(object)`. The adapter's `updateQuotation` already calls `JSON.stringify()` on the value. Double-stringifying causes exponential growth and "Data too long" errors.
- **Column type**: `section_texts_override` must be `MEDIUMTEXT` (16MB), not `TEXT` (64KB). Migration always runs `MODIFY COLUMN` to ensure this.

### Hull Quotation System

H&M quotation type with agreed value, hull clauses, hull alternatives, and additional conditions:

- **Agreed Value Tab** (`AgreedValueTab` in QuotationEditor): Amount + currency, template texts from `hull_agreed_value_texts`, custom texts, reorder, vessel scope. Stored in `quotation_agreed_value_items`.
- **Hull Conditions Tab** (`HullConditionsTab` in QuotationEditor): Hull clause selector (from `hull_clauses`), clause conditions checkboxes (from `hull_clause_conditions`) with defaults auto-applied, text overrides, additional conditions (from `hull_additional_conditions`), vessel scope. Supports multiple alternatives.
- **Hull tables**: `hull_clauses` (name, code), `hull_clause_conditions` (condition_number, text, default_selected), `hull_additional_conditions` (title, text, default_selected), `hull_agreed_value_texts` (text)
- **Per-quotation tables**: `quotation_hull_conditions`, `quotation_hull_additional_conditions`, `quotation_agreed_value_items` — all FK to `quotations(id)` with vessel_scope support
- **Export**: PDF and DOCX include agreed value section (amount + text items) and hull conditions section (clause + conditions + additional conditions)
- **Additional condition/clause titles**: `title VARCHAR(255) NULL` on both `pi_additional_clauses` and `hull_additional_conditions`. Shown bold before code/text in settings and editor only — NOT rendered in exports (PDF/DOCX). Custom hull additional conditions (`quotation_hull_custom_conditions`) DO show their title in exports.

### Hull Alternatives

Multiple clause alternatives per hull quotation, each with its own conditions and premium:

- **Table**: `quotation_hull_alternatives` (id, quotation_id, hull_clause_id, label, premium_amount, order_index)
- **Per-alternative conditions**: `alternative_id VARCHAR(36) DEFAULT NULL` on `quotation_hull_conditions` and `quotation_hull_additional_conditions`. NULL = applies to all alternatives.
- **Condition helpers**: `getAltConditions(altId)`, `getAltSelectedIds(altId)`, `getAltOverrides(altId)`, `getAltAmounts(altId)`, `getAltScopes(altId)` — filter conditions by `alternativeId` match
- **`toggleCondition(condId, alternativeId)`**: Checks by `condId + alternativeId` pair, not flat global set
- **Visual separation**: Each alternative gets a colored left accent border (3px). Colors cycle: `['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']`. IV gets amber `#ffb020` accent. Horizontal dividers between alternatives.
- **Single alternative**: UI identical to current (no "Alternative 1" label). When 2+: show labeled sections per alternative.
- **IV unchanged**: IV clause remains separate, shared across all alternatives
- **Premium per alternative**: Multi-alt hull shows per-alternative premium inputs in PremiumTab with colored card rows. Payable premium calculated per alternative with `computePayable(alt.premiumAmount)`.
- **Export (conditions)**: Each alternative rendered as "Alternative N — [clause wording]" with its scoped conditions. "Applicable to all alternatives" section for `alternativeId = null` conditions. IV section separate.
- **Export (premium)**: Per-alternative premium lines in table format: "Alternative N (code): amount per annum"
- **IPC**: `hull:getQuotationAlternatives`, `hull:addQuotationAlternative`, `hull:updateQuotationAlternative`, `hull:deleteQuotationAlternative`, `hull:reorderQuotationAlternatives`
- **Backward compat**: `hull_clause_id` on quotations kept; synced from `alternatives[0].hullClauseId` when single alternative

### Quotation Type Scope

Warranty and subjectivity filtering by quotation type:

- **`QuotationTypeScope`** (`src/shared/types.ts`): `'pi' | 'hull' | 'both'`
- **`type_scope`** column on `pi_warranties` and `pi_subjectivities` — default `'both'` for backward compatibility
- **Admin UI**: Scope selector (P&I / Hull / Both) in QuotationSettings Warranties and Subjectivities tabs, with colored badge per item
- **Editor filtering**: `visibleWarranties` / `visibleSubjectivities` filtered by `typeScope === 'both' || typeScope === typeCode`

### Trading Warranty Templates

Admin-managed reusable text templates for the trading warranty intro section:

- **Table**: `trading_warranty_templates` (id, name, text, order_index, created_at)
- **Settings UI**: `TradingWarrantyTemplatesTab` in QuotationSettings (General category) with add/edit/delete/reorder, RichTextEditor for template text, name input
- **Editor**: Template selector dropdown above the trading warranty RichTextEditor. Selecting a template populates the text; users can modify or write new text freely.
- **Custom wording hides default text**: When `tradingCustomMode` is enabled ("Use custom wording" checkbox), the standard "Trading Warranty Text" section is hidden. The `!quotation.tradingCustomMode` guard wraps the default text block in TradingTab.
- **IPC**: `pi:getTradingWarrantyTemplates`, `pi:addTradingWarrantyTemplate`, `pi:updateTradingWarrantyTemplate`, `pi:deleteTradingWarrantyTemplate`, `pi:reorderTradingWarrantyTemplates`
- **Per-vessel intro**: `quotation_trading_intros` table stores per-vessel intro text overrides. Multi-vessel quotations show vessel selector bar in TradingTab. "All Vessels" edits `tradingWarrantyIntro` on quotation; specific vessel creates/edits override row. Export renders per-vessel intros with "M/V VESSEL:" headers, shared content (countries, DDQ, Israel) rendered once after all intros. IPC: `trading:getIntros`, `trading:addIntro`, `trading:updateIntro`, `trading:deleteIntro`.

### Quotation Section Order

Type-specific section ordering for quotation exports:

- **Per-type defaults**: Stored in `app_settings` with key `section_order_defaults_{typeCode}` (e.g. `section_order_defaults_P`)
- **Hardcoded fallbacks**: `PI_SECTION_ORDER` and `HULL_SECTION_ORDER` in `QuotationSettings.tsx`, accessed via `getDefaultSectionOrder(typeCode)`
- **Per-quotation override**: `quotations.sectionOrder` field overrides the type default
- **Fallback chain**: per-quotation → type-specific default → hardcoded default
- **Settings UI**: `SectionOrderTab` with P&I/Hull toggle to configure defaults per type
- **Editor modal**: `SectionOrderModal` loads type-specific defaults, filters sections by type-relevant keys

### Quotation Settings Organization

Two-tier navigation in `QuotationSettings.tsx`:

- **Top tier**: Segmented control — General (teal), P&I (blue `#6464ff`), H&M (pink `#ff64c8`)
- **Bottom tier**: Tab chips filtered by active category, colored to match category accent
- **Category mapping**: `CATEGORIES` array + `CATEGORY_TABS` record. Switching category auto-selects first tab.
- **Scalability**: Adding a new quotation type only requires a new entry in `CATEGORIES` and `CATEGORY_TABS`

### P&I Alternatives

Per-quotation P&I alternatives (similar to hull):

- **Table**: `quotation_pi_alternatives` with label, premium_amount
- **Alternative Selector Bar**: Below tab row, colored chips per alternative
- **Per-Alternative Scoping**: Conditions, warranties, deductibles, exclusions can be scoped to specific alternatives
- **Export**: Alternative-specific content with "Additional applicable to Alternative N" sections
- **Fleet premium (2+ vessels)**: a premium per vessel under each alternative (`quotation_pi_alt_vessel_premiums`, no FK: rows are deleted with the alternative / quotation and cloned with it), entered in the same per-alternative cards as fleet hull (`renderAltVesselCard` in PremiumTab); the alternative's `premium_amount` is the sum. The export prints the hull matrix table, `vesselTechnical` takes the vessel's own amount, and converter / policy export / QuickBooks load it into `altVesselPrems`. `syncAltVesselPremiums` (adapter, on adding / removing a quotation vessel) drops a removed vessel's cells and re-sums; going 1 -> 2 vessels makes the alternative's premium the first vessel's cell, back to 1 folds the grid into the alternative. With 2+ vessels an empty cell is 0 (never a share of the others). A renewal takes each vessel's previous premium from the cell of the alternative its policy was issued on
- **Previous premium fields** (PremiumTab) show only on renewal quotations, or when a previous amount is already entered

### Per-Vessel Hull Clauses

- **`vessel_scope_id`** on `quotation_hull_alternatives`: Links alternative to a specific vessel
- **Vessel Selector**: In HullConditionsTab when 2+ vessels
- **Export**: Per-vessel sections with vessel names instead of "Alternative 1/2"
- **Priced per vessel**: when the clauses only give vessels their own wording (at most one shared clause, at most one own clause per vessel: `hullClausesPerVesselOnly` in shared/premium.ts) they are not alternatives: the Premium tab and the export use the vessels' own premiums (Technical / Payable per vessel), not one premium per clause. `vesselTechnical` already falls back to the vessel premium when the clause has none
- **Placed by vessel chips**: an additional / custom condition whose vessel chips are exactly the vessels of one clause section prints inside that section (no "(VESSEL)" suffix); one linked in settings only to the shared clause prints under it, not under "Applicable to all vessels"
- **`include_in_shared` toggle**: `include_in_shared TINYINT(1) DEFAULT 1` on `quotation_hull_alternatives`. When a vessel has an override, HullConditionsTab shows "Also include in shared conditions" toggle. When enabled (default), that vessel also appears in the shared section of the export. Toggle updates ALL alternatives for that `vesselScopeId` at once.
- **`includeInShared` in export**: `sharedSectionVesselIds` = non-override vessels PLUS override vessels where `includeInShared !== false`. Override vessels with `includeInShared = false` appear only in their dedicated per-vessel section.

### Survey Warranty Templates for Quotations

- **Templates** (`survey_warranty_templates`): Text with {deadline}, {days}, {event}, {surveyor}, {dateofsurvey} placeholders. Title field for easy reference.
- **Placeholders**: {deadline} (blue), {days} (purple), {event} (red), {surveyor} (green), {dateofsurvey} (amber)
- **Sets** (`survey_warranty_template_sets`): Named groups for batch-apply
- **Editor Tab**: "Survey Warranties" in all quotation types. Templates and selected items visually separated.
- **Placeholder Inputs**: Dropdown presets for deadline, number input for days, text for event/surveyor/dateofsurvey
- **Editable text**: Pencil icon on each selected survey warranty opens inline text editing for the resolved text
- **Vessel scope**: VesselScopeChips shown on each survey warranty when 2+ vessels; per-vessel scoping stored in `vessel_scope`
- **Days=0 handling**: When `{days}` is 0, "within 0 days of inception" renders as "prior inception" in exports

### Quotation List View

Redesigned quotation list with view tabs, month navigation, and chip filters:

- **View tabs**: Active (default, excludes converted), Converted, All, plus saved custom views as tabs
- **Month navigator**: Arrow-based navigation centering on M. Default range shows M-1, M, M+1 (3-month window). Label shows the range e.g. "Apr – Jun 2026"; handles year boundaries ("Dec 2025 – Feb 2026"). "Today" button resets to current month.
- **Search**: Bypasses all date/view filters to search ALL quotations. Shows "ALL" indicator when active.
- **Chip filters**: Status and type as toggle chips with counts (not dropdowns)
- **Compact stats**: Inline total count instead of large glass cards
- **Backend**: `viewFilter` supports `'active'` (excludes converted) and `'converted'` in addition to all/registry/drafts

### War P&I Excess (Section 2)

Two-section war quotations: Section 1 (Hull War) + Section 2 (P&I in excess of Hull):

- **Toggle**: `warExcessEnabled` boolean on `quotations` — enables Section 2 fields in SumInsuredTab
- **Quotation fields**: `war_excess_amount`, `war_excess_rate`, `war_section1_text`, `war_section2_text`, `war_combined_limit_text`
- **Per-vessel fields**: `war_excess_amount`, `war_section1_premium`, `war_section2_premium` on `quotation_vessels`
- **Section 2 formula**: `(section2Amount - section1Amount) × rate` — the excess over Hull value
- **Default rates**: Section 1 = 0.03%, Section 2 = 0.0075% (configurable in war settings)
- **SumInsuredTab**: Per-vessel hull values (Section 1), Section 2 amount/rate, configurable section descriptions and combined limit text. Premium hidden when excess enabled (shown in PremiumTab instead).
- **PremiumTab**: Per-vessel cards with Section 1 + Section 2 premium inputs (both single and multi-vessel)
- **Export Interest section**: Section 1 + Section 2 descriptions
- **Export Sum Insured/Limits**: Per-vessel Section 1 amounts as table + Section 2 amount + combined limit text
- **Export Premium**: Per-vessel Section 1 + Section 2 premium lines
- **War settings** (`war_settings` JSON): `defaultExcessRate`, `section1Text`, `section2Text`, `combinedLimitText`
- **Section order**: `interest` added before `sumInsured` in WAR_SECTION_ORDER

### LOL Alternatives (P&I)

Multiple Limit of Liability options without full P&I alternatives:

- **Table**: `quotation_lol_options` (id, quotation_id, label, amount, currency, premium_amount, order_index)
- **UI**: Click "Add LOL Alternative" → primary LOL becomes Alternative 1, empty Alternative 2 created. Add more with "Add Alternative". Delete down to 1 reverts to primary.
- **PremiumTab**: Per-alternative premium inputs when LOL options exist (entered only there, not on the Limit of Liability tab)
- **Show premium beside the limits** (`quotations.lol_show_premium`, checkbox on the Limit of Liability tab with 2+ different limits, LOL options or P&I alternatives): the LOL lines read "Alternative 1: USD X - Premium USD Y"; the Premium section always keeps them
- **Export**: Alternatives listed first, a blank line, then the wording ("on all claims...") and the closing sentence. Premium section: bold `Limit : Premium` table (no per annum line)
- **Clone/duplicate**: LOL options copied to new quotation

### Warranty & Subjectivity Multi-Type Scope

Warranties and subjectivities can apply to multiple quotation types:

- **`type_scope` column**: VARCHAR(50), stores comma-separated values (e.g., `'pi,war'`, `'hull,war'`)
- **UI**: Toggle chips (All / P&I / Hull / War / Cargo) in QuotationSettings — multiple selectable
- **Filtering**: `typeScope.split(',').includes(typeCode)` throughout WarrantiesTab, SubjectivitiesTab, exports
- **Display**: Separate colored pills per type (P&I=blue, Hull=pink, War=amber, Cargo=teal)

### Draft Reference Numbers

Draft quotation references include the policy type code:

- **Format**: `DRAFT-{code}-{sequential}` (e.g., `DRAFT-P-0001`, `DRAFT-H-0002`, `DRAFT-W-0003`)
- **Applied to**: new quotations, duplicates, revisions, renewals
- **Revision suffix**: `/RN` appended (e.g. `Q/N/P/26/1552/R1`)
- **Backward compatible**: `startsWith('DRAFT-')` checks work for both old and new formats

### Custom Hull Additional Conditions

Per-quotation free-text hull conditions (not from master settings list):
- **Table**: `quotation_hull_custom_conditions` (id, quotation_id, text, title, order_index, vessel_scope, alternative_id)
- **UI**: Custom conditions are merged into the **Additional Conditions** sub-tab in HullConditionsTab (the separate "Custom" tab was removed). One "Conditions Order" list shows additional + custom together with up/down reorder buttons (drag also works).
- **Shared order namespace**: additional and custom conditions share ONE gap-free `order_index` sequence so they interleave. `mapAddForSave` always carries `order`; the reorder renumbers the FULL set (including hidden/orphaned additional) to avoid collisions; `addQuotationHullCustomCondition`/toggle assign order = max(additional+custom)+1; a normalize-on-load fixes legacy overlapping namespaces once.
- **Export**: custom rendered as interleaved bullets with additional (by shared order) in BOTH quotation and policy exports — NOT appended as a separate trailing block. `getAddlBelonging` returns `'none'` (excluded) for additional conditions linked only to clauses no active alternative/IV uses (orphan hiding); the policy export mirrors this with an `activeClauseIds` filter.
- **Bullet/list rendering**: `mpBullet`/`polMpBullet` bullet a leading intro `<p>` that precedes an embedded `<ul>/<ol>` (e.g. GA clause), and nest the list + closing paragraph under it via the `indentOffset` option on `parseHtmlToParagraphs`.
- **Cloned**: On quotation duplicate/renewal via `cloneQuotationJunctions`

### Quotation Editing Lock

Prevents concurrent editing of the same quotation:
- **Schema**: `locked_by VARCHAR(36)`, `locked_at DATETIME` on `quotations`
- **Auto-lock**: QuotationEditor locks on mount, unlocks on unmount
- **Blocked opening**: Locked quotations cannot be opened by other users (not read-only — fully blocked)
- **Heartbeat**: Every 2 min refreshes `locked_at` to keep lock alive
- **Inactivity detection**: After 10 min idle (no mouse/keyboard), heartbeat stops
- **5-min expiry**: Safety net for crashes (reduced from 30 min)
- **Admin force-unlock**: `quotationForceUnlock` IPC; force-unlock button (X) in QuotationList
- **List indicator**: Lock icon next to reference number in QuotationList
- **No updated_at change**: Lock/unlock uses `updated_at = updated_at` to prevent list reordering

### Quotation Lock Heartbeat

- **Heartbeat**: Pings every 2 min to refresh `locked_at` while editor is open
- **Inactivity**: After 10 min idle (no mouse/keyboard), heartbeat stops
- **Lock expiry**: 5 min (reduced from 30 min)
- **Re-lock**: When user returns from idle, attempts to re-acquire lock
- **Admin force-unlock**: Unlock button in QuotationList actions column (admin only), lock badge with username next to reference
- **IPC**: `quotation:heartbeat`

### HullConditionsTab Compact Redesign

- **Single card**: Merged 3 separate glass-cards into one with 16px padding
- **Compact HullConditionPicker**: Single-line rows with accordion expand (one at a time) for override/amount/scope
- **Collapsible sections**: Conditions (expanded), Additional Conditions (collapsed), Custom Conditions (collapsed) — each with chevron + count badge
- **Section dividers**: Thin 1px borders between sections

### SumInsuredTab MoneyInput

- **MoneyInput component**: Shows thousand separators when not focused, raw number while editing
- **Applied to**: Sum insured amount, per-vessel amounts, Section 2 amount, premium, deductible amounts

### Quotation Registry (Excel-Based Numbering)

Excel registry file for quotation numbering and logging:
- **Path**: Configurable in Admin Panel → File Paths → Quotation Registry
- **Format**: `Q/{R|N}/{branch}/{YY}/{serial}` — R=Renewal, N=New, branch=P/H/W/C/F
- **Serial**: Read from last row column D of current year sheet, incremented
- **Row data**: Date, Quotation Type, Branch, Serial, Reference, Managers, Vessel, IMO, Type, Broker, Remarks
- **Cancelled**: Moving away from Approved marks row as CANCELLED in Remarks column (K)
- **Year sheets**: Auto-created when year changes
- **Fallback**: DB counter used if no registry path configured
- **File locked**: Approval fails with error if Excel is open
- **Write method**: Uses Excel COM via PowerShell to preserve tables/formulas/formatting. Falls back to `xlsx-js-style` if Excel is not installed. Reads still use `xlsx-js-style`. Everything is async (Excel COM takes seconds and the file is on a share; a sync call froze the app), reads parse only the current year's sheet, and the CANCELLED mark takes the same named lock as approvals (`vc_quotation_registry`)
- **IPC**: `quotationRegistry:getPath`, `quotationRegistry:setPath`, `quotationRegistry:browse`
- **Service**: `src/main/services/QuotationRegistryService.ts`

### Quotation Workflow Enforcement

- **Initial step**: New quotations auto-assigned the `isInitial` workflow step
- **canEdit**: Step constraint enforced — `canEdit=false` disables editing with blue banner
- **Approve & Export**: Gated by `hasPermission('quotations:approve')`, not by workflow step's `canExport` (dead column removed from workflow settings)
- **Create Revision**: Visible for approved quotations, gated by `hasPermission('quotations:edit')` not `canEdit`
- **isDraft**: Checks `q.status === 'draft'` — not reference number prefix. Draft quotations with real references (revisions) get registry numbers correctly.
- **isApproved**: Checks `status` field only — no longer checks reference number format
- **Step deletion**: Blocked when quotations exist on the step
- **Single initial**: Setting a step as initial unsets all others
- **Transaction**: Workflow move (update + log insert) wrapped in transaction, validates transition exists
- **Workflow log**: History button in editor shows transition log dropdown
- **Approved = read-only**: Green banner + pointer-events overlay blocks all interaction. "Create a new revision from the Actions menu"
- **Status flow**: `draft` → `approved` (on approval) → `exported` (on export) → `converted` (on policy conversion) - set by the conversion once every vessel has a policy, back to `exported` if a policy is deleted
- **Status badges**: Colored badges in QuotationList (draft=gray, approved=green, exported=teal, converted=purple)
- **Locked quotations**: Blocked from opening entirely (not read-only, error toast)

### Quotation Export Enhancements

- **Revision display**: Centered "Rev.N" below title (not in title text)
- **Reference**: Includes `/RN` suffix for revisions
- **Export date**: Always today (not quotation creation date)
- **Filename**: `{subject} - {type} Quote {year} - {broker}` — 1 vessel=name, 2=Name1 & Name2, 2+ same fleet=fleet, 3+ same manager=manager, else first and others
- **Draft export**: Users without `quotations:approve` get toast "Exporting as draft"; users with permission get Approve & Export modal
- **TBA**: When no assureds defined, shows "TBA" as Registered Owners
- **IACS first**: Dual-classed vessels show IACS classification first in all displays/exports
- **Previous premium in red**: UPCC discount table shows "(previously USD X)" in red in DOCX

### Pro-Rata Premium

Sub-annual quotation premium with auto-detection:
- **Detection**: Parses `periodText` for "X months" / "X year(s) Y months" patterns
- **Fields**: `is_pro_rata`, `annual_premium_amount`, `pro_rata_months` on quotations
- **UI**: Annual Premium input (p.a.) + Pro-Rata Premium (calculated) + editable months + enable/disable toggle
- **Calculation**: `annualPremium / 12 × months`
- **Export**: Annual amount "per annum" line + "Pro-rata premium: {currency} {amount}" line
- **Not for cargo**: Cargo has its own rate-based premium

### Outstanding Premium & Full Loss Notices

Two checkbox-based notices in PremiumTab (non-cargo):
- **Outstanding Premium**: Configurable text + bold/underline toggles. Default: "All outstanding premium to be settled prior inception". Enabled by default on new quotations.
- **Full Premium Loss**: Configurable text (no formatting). Default: "Full annual premium payable in case of loss."
- **Non-refundable default**: New quotations default to `nonRefundableType = 'first_instalment'`
- **Default texts**: `outstandingPremiumDefaultText` and `fullPremiumLossDefaultText` configurable in Quotation Settings → Standard Texts → Premium section of `PISectionTexts`
- **Settings**: Defaults in Policy Settings → Premium Intro
- **Export**: Rendered after instalments in quotation (PDF/DOCX) and policy exports

### FD&D Quotations (code F)

FD&D (Freight, Demurrage & Defence) quotations are built on P&I:
- **Same tabs and features**: Limit of Liability (incl. LOL alternatives), Conditions, Trading, Deductibles, Exclusions, P&I alternatives, section order (P&I default order, own `section_order_defaults_F`). `isPiLike(code)` in `src/shared/quotationTypes.ts` is the switch (P or F); keep blue cards and other P&I-only policy items on `=== 'P'`
- **Type scope**: the P&I settings lists carry `type_scope` (`pi`, `fdd`, `pi,fdd`/`all`): `pi_clauses`, `pi_deductibles`, `pi_text_deductibles` (default `pi`), `pi_exclusions`, `pi_additional_clauses` (default `all`). Edited with the P&I / FD&D chips on each row (`TypeScopeToggle`, IPC `pi:setItemTypeScope`); the editor tabs show only items in scope (`inTypeScope`). Warranties/subjectivities use the same `fdd` token (a one-time migration added it wherever `pi` was, since FD&D used to see the P&I items)
- **FD&D has no Section B clauses**: the Conditions tab's Clauses list holds only conditions tagged FD&D in settings (none by default, never auto-selected, P&I presets hidden); the export prints the clause name instead of "Section B Cl.N". Additional Clauses work as in P&I. Cargo exclusions and warranties are offered (no cargo clause to select) unless every vessel is a livestock carrier (`allLivestockCarriers` in quotation-tabs/sharedUtils: type MLV or "livestock" in the type's name/description); then they are hidden and any ticked ones are removed with a message (P&I does this through its cargo clauses)
- **Text deductibles** are exported line by line (`mp`), so multi-line ones (FD&D 25% / min / max) keep their breaks
- **Deductible values**: a text deductible's wording can hold `{percent}`, `{minimum}`, `{maximum}` (or any `{name}`); each gets an input on the deductible card (`quotation-tabs/DeductibleValueInputs`), defaults in Quotation Settings (`pi_text_deductibles.default_values`), the quotation's own in `quotation_text_deductibles.field_values` (copied with the quotation). `{currency}` has no input: it is the quotation's premium currency. Both exports fill them in where the deductibles load (`fillTextDeductibles` in `shared/deductibleValues.ts`). The FD&D default (25% / USD 10,000 / USD 30,000) was converted to these fields; removing a deductible asks first
- **Wording**: title "FREIGHT DEMURRAGE & DEFENCE QUOTATION FOR", standard texts `conditionsIntroFDD`, `limitOfLiabilityDefaultTextFDD` (applied over the P&I key by `textsForType`), `importantNoticeFDD`
- **One type**: a startup migration merges duplicate code-F types into one named "FD&D" (moves quotations, vessel policies, characteristics, commissions, document tags)
- **Policy**: the policy export treats F like P&I (alternatives, limit options, Limit of Liability, Conditions with the clause name instead of Section B, Deductibles), with the FD&D texts (`textsForType`, `importantNoticeFDD`), its own opening clause default and certificate title ("Freight, Demurrage and Defence Certificate"). Policy Settings has an FD&D category (`policy_text_F_openingClause` / `_closingText` / `_premiumIntro`) and FD&D in Header Titles, Cancel & Replace and Section Order. Blue cards and QR stay P&I only
- **Trading countries**: the excluded / DDQ type chips include FD&D (`F`); a one-time migration (`migration_fdd_trading_v1`) added F wherever P was
- **Migration order**: `migrateFddQuotations` runs after the warranty / subjectivity `type_scope` columns are created, widens them, and inserts its items only when missing

### Cargo Quotation Specifics

- **Rate-based premium**: Rate % input → calculated premium amount (no "p.a." suffix, no previous premium display)
- **TBA vessel**: "Any other vessel(s) to be agreed" checkbox (cargo-only, updates local state via `setQ`)
- **Cargo clause**: Cargo warranties and exclusions only visible when cargo quotation type OR cargo clause selected in P&I conditions

### Abandoned Draft Quotation Cleanup

- **QuotationEditor**: Tracks edits via `hasEdited` ref, set `true` on any `updateField` call
- **Back navigation**: If draft + no edits + created <60s ago + no vessels → auto-deleted
- **Applies to**: Renewal quotations from PolicyRenewals, new quotations — prevents orphaned empty drafts

### Quotation Recycle Bin

Soft-delete system for quotations with restore capability:

- **Schema**: `deleted_at DATETIME` + `deleted_by VARCHAR(36)` columns on `quotations` table
- **Soft delete**: `deleteQuotation` sets `deleted_at` timestamp instead of hard DELETE. Delete messages say "moved to recycle bin".
- **Restore**: `restoreQuotation` clears `deleted_at` and `deleted_by`
- **Permanent delete**: `permanentlyDeleteQuotation` requires `quotations:bulkDelete` permission
- **Filtered queries**: `getQuotations` filters `WHERE deleted_at IS NULL` — soft-deleted items hidden from normal views
- **Recycle Bin tab**: Right-aligned tab in QuotationList with trash icon. Shows soft-deleted quotations with Restore + Permanently Delete actions.
- **Error display**: Delete shows actual error from `safeHandle` instead of silent success
- **IPC**: `db:getDeletedQuotations`, `db:restoreQuotation`, `db:permanentlyDeleteQuotation`

### Subjectivity Days

Configurable subjectivity compliance period per quotation and policy:

- **Fields**: `subjectivity_days INT DEFAULT 0` on `quotations`, `subjectivity_days INT DEFAULT 7` on `policy_documents`
- **UI**: Number input in SubjectivitiesTab
- **Export**: Uses `{subjectivity_days}` placeholder in standard text intro. Handles both placeholder and old hardcoded text.
- **Rendering**: 0 = "prior inception", N = "within N days"
- **Select All**: Button in master subjectivity list picker for bulk selection — skips subjectivities that are "optional". A subjectivity is optional when it has ≥1 linked doc types AND all of those doc types have `required = false` in Document Types settings. Subjectivities with no linked doc types are always included.
- **Sort order**: Items sorted by master list order from settings (`resortByMasterOrder`)

### Quotation Assured per Vessel

- **Multi-vessel**: Same entity can appear as assured on multiple vessels in a quotation
- **Dedup scope**: Only skips duplicates within the same vessel label (not across all vessels)
- **Fleet renewal dedup** (`renewFleetPolicies` in adapter.ts): Uses `entityId:vesselLabel` composite keys — NOT plain `entityId`. A plain-entityId global set would cause shared entities (e.g. same ship owner on all fleet vessels) to be added only for the first vessel and skipped for the rest.

### Conditions Sub-Tabs

- **P&I Conditions**: Split into "Clauses" and "Additional Clauses" sub-tabs with count badges
- **Hull Conditions**: Split into "Conditions", "Additional Conditions", and "Custom" sub-tabs with count badges

### Deductible MoneyInput

- **MoneyInput**: Shared component in `shared.tsx` — shows thousand separators when not focused, raw number while editing
- **Applied to**: All deductible amount fields (primary, secondary, previous, per-vessel)
- **Layout**: Previous amounts on dedicated second row below main amounts
