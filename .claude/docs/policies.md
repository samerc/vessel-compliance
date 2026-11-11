# Policies

Customer per policy, vessel policies and renewals, the policy system (converter, exports, freezing, signed files), revisions, blue cards, signatures, T&C, QR, QuickBooks, commissions, war declaration. Read with the root CLAUDE.md (architecture, IPC chain, migrations, code style).

### Typed vessels at conversion (2026-11-05)

A vessel typed on a quotation has no record. Before the converter opens, `ConvertVesselGate` makes the user link each one (match by the IMO field, else exact name, or search any vessel) or create a record from the typed details (`createVesselFromQuotationVessel`, needs `vessels:create`). If the names differ it warns to use Vessel sold first, because a linked quotation vessel reads the record. `convertQuotationToPolicy` refuses an unlinked vessel. A vessel with no assureds takes the converter's insured at conversion. The Vessel tab already offers Link / Add as typed when a typed IMO exists.

### Assured per policy (2026-11-05)

An insured typed in the converter becomes a Directory company when the policy is created (`entityForTypedInsured`: same tidy name reuses the entry; a new one takes the converter's sanctions result, else PENDING; its address is saved on it), so a new vessel record gets it as an assured.

`vessel_policy_assureds` = who is assured under a hand-filled policy (`vessel_dynamic_policies`): entity (or a typed name), role, optional from / to (blank = whole period; ended rows stay). Shown on the vessel's Policies tab, edited in the policy form (Fill from vessel, Add assured, Change from a date). A new ACTIVE policy (also Renew) starts from the vessel's current assureds; a policy added as expired starts empty; conversion copies the converter's insured (`policy_doc_addresses`). The c/o is never copied: the broker is the policy's customer. Backfill ran once (`app_settings.policy_assureds_backfilled`): active policies only, expired / cancelled show "Not recorded" (user decision). Names are read through the entity, so a typo fixed in the Directory reaches every policy.

### Customer Assignment (Policy-Level)

Customer/broker is tracked at the **policy level**, not the vessel level. A vessel can have different customers per policy type (e.g., Hull via Broker A, P&I via Broker B).

- **Fields**: `customer_entity_id` (FK to entities) and `customer_type` ('broker' or 'direct') on `vessel_dynamic_policies`
- **Legacy**: `customer_id`/`customer_type` columns still exist on `vessels` table but are deprecated — all views read from policies
- **Auto-sync**: When `broker_entity_id` is updated on a policy without explicit `customer_entity_id`, the adapter auto-syncs customer fields
- **Multi-broker vessels**: A vessel appears under every customer that has an active policy on it. FleetManager "By Customer" view, CustomerComplianceReport, DAB, and analytics all derive customer from active policies
- **Policy edit UI**: "Customer / Broker" field with broker/direct toggle buttons + entity search combobox in VesselDetail policy edit form
- **Quotation addresses**: "Print addresses" switch on the Insured tab (`quotations.show_addresses`, default off): each assured's address (the vessel assured's `address_id`, else the entity's first address) on a row under it, printed once after consecutive assureds with the same address, and the broker's first address under "c/o"
- **Quotation customer**: `customer_entity_id` + `customer_type` on `quotations` table, set in InsuredTab with entity search and broker/direct toggle. Auto-copied from vessel's existing policy when adding a vessel. Synced to vessel dynamic policy on quotation-to-policy conversion.
- **c/o line** (`careOfName`, src/shared/careOf.ts): quotation, policy and Debit Advice print "c/o {name}" under the insured only for a broker business. `coName` also holds a DIRECT client's name (it is the Customer column of the quotation list), so `customerType = 'direct'` means no c/o line; without a customer type (older quotations) the typed c/o name, else a Broker-role insured, still prints. The converter counts a direct client as having no broker (no commission / Credit Advice)
- **Document filtering**: Customer compliance reports only show document types tagged for the policy types the customer covers (e.g., Hull broker sees only Hull-tagged docs)
- **Vessel list**: Customer column hidden by default (labeled "Legacy" in column selector)

### Policy Types & Vessel Policies

Classification system for vessel insurance policies:

- **Policy Types**: Admin-managed list with CRUD and reorder (`policy_types` table)
- **Vessel Policies**: Many-to-many assignment via `vessel_policies` table
- **VesselDetail**: Modal with checkbox list to assign/remove policy types per vessel
- **Dynamic Policies**: `vessel_dynamic_policies` with configurable characteristics per policy type (`policy_type_characteristics`)
- **Policy Values**: `vessel_policy_values` stores field values (text, date, number) per policy
- **Date Storage**: All policy dates stored in ISO `YYYY-MM-DD` format for MySQL comparison compatibility
- **Broker field**: `broker_entity_id` on `vessel_dynamic_policies`; custom combobox (text input + dropdown) with `onBlur+setTimeout(150)` for click-outside handling

### Policy Renewals

Monthly view of expiring policies (`src/renderer/src/components/PolicyRenewals.tsx`):

- **Month Selector**: Navigate months with arrows, "Today" button to jump to current month
- **3-Month View**: Toggle button switches between single-month and 3-consecutive-months view; multi-month fetches 3 parallel IPC calls tagged with `_monthLabel`, renders with month group headers in the table
- **Table Columns**: Vessel, IMO, Customer, Fleet, Policy Type, Policy Number, End Date, Actions (View)
- **Query**: Joins `vessel_dynamic_policies` → `vessel_policy_values` where characteristic name contains "end" and field_type is date
- **Filters**: Only active vessels (`v.is_active = TRUE`); cancelled policies are left out (expired ones stay, they are due for renewal)
- **Export**: Excel export via `xlsx` library
- **IPC Handler**: `policies:getRenewalsByMonth`
- **Renewal States**: `renewal_status_types` table, `renewal_status_id` FK on `vessel_dynamic_policies`. IPC prefix: `renewalStates:`. Status badge in table: text always black, background `statusColor + "22"` (hex opacity), border `2px solid statusColor`.
- **Sort persistence**: Sort field + direction persisted in localStorage

### Policy System

Insurance policy document management:

- **Policy Documents** (`policy_documents`): Created from quotations via 6-step conversion wizard
- **Policy Numbering**: `{type_code}{4-digit code}{serial}` (e.g., P26200001). The code is a pattern in Policy Settings > General > Policy Numbers (`app_settings.policy_number_code`, default `{YY}20`, {YY} = the year's last two digits; `shared/policyNumber.ts`), used by the converter's number (`assignPolicyNumber`, current year) and the vessel policy renewal Fill in (year of the new inception). Always 4 digits: the serial is read from the 6th character and the SUR reference strips letter + 4 digits
- **Conversion Wizard** (`PolicySetupWizard.tsx`): Step 1: Vessel & Alternative, Step 2: Period & Premium, Step 3: Instalments, Step 4: Details, Step 5: Blue Cards (P&I only), Step 6: Review. Layout (redesign 2026-10): 6 visible steps (Vessel and cover, Period and premium, Insured and bank, Subjectivities and warranties, Blue cards, Review) on the left, content with Back / Continue at its foot, live summary on the right. Step ids stay 0-7 (`STEP_LABELS` / `STEP_HINTS` / `STEP_ICONS` indexed by id): Premium (2) renders inside step 1 and `validateStep(1)` also runs step 2's checks; Survey Warranties (7) renders inside step 6, which shows when the quotation has subjectivities or survey warranties
- **Policy Detail** (`PolicyDetail.tsx`): Overview, Financial, Addresses, Blue Cards, Revision History, editing mode with 4 tabs
- **Policy List** (`PolicyList.tsx`): Stats, search, filters, sortable table with conversion/export dates
- **Policy Settings** (`PolicySettings.tsx`): Two-tier navigation (General/P&I/Hull/War) for opening clause, closing text, important notice, premium intro, font size, timezones, page numbering, footer, header titles, banks, cancel & replace, blue card texts, signatures, QR verification, T&C templates
- **Exports**: Policy DOCX, Debit Advice, Credit Advice, Blue Cards (individual), PDF+T&C combined, and **Export All Documents (ZIP)** — bundles policy DOCX + DA + CA (when commission > 0) + every active blue card into one `.zip` via JSZip (`exportPolicyBundleZip`; shared blob-builders `buildDebitAdviceBlob`/`buildCreditAdviceBlob`/`buildBlueCardBlob`)
- **Policy life cycle** (user 2026-11-03): convert (draft number POL-DRAFT-...) -> edit and export as often as needed -> **Assign Number** (PolicyDetail header, `policy:assignNumber`, asks first; the policy stays editable, last-minute changes allowed) -> **Sign** -> locked (New Revision / Endorsement). Edit Policy is open while `signed_at` is NULL, whatever was exported. Endorsements can be added at any time (one is sometimes issued with the policy)
- **Freeze at signing**: exports of an UNSIGNED policy always use the latest data (an old `export_snapshot` is ignored), so DA/CA/BC follow every change. Signing clears the snapshot (`signPolicy`) and the renderer captures a fresh one (`capturePolicyExportSnapshot`); from then on all exports (policy/DA/CA/BC/declaration/endorsement) read it. A `FrozenExportSettings` bundle captures every setting/entity the builders read. A revision is a new row with no snapshot. See memory `project_export_freeze`
- **DRAFT watermark**: a policy still on a POL-DRAFT number prints Word's own text watermark (grey "DRAFT", diagonal, behind the text) on the policy, DA, CA, blue cards and endorsements: `polPack(document, polIsDraftNumber(...))` injects a VML textpath shape into every header part (`polAddDraftWatermark`); a document without a header gets an empty one when draft
- **Follows the quotation until signed**: clauses, warranties and texts are read from the policy's quotation at every export. A converted quotation is read-only, so a change is a quotation **New Revision**: when the quotation has policies it says which move (the active UNSIGNED ones) and which stay (signed: policy revision / endorsement), then `createQuotationRevision(id, { movePolicies: true })` re-points them to the revision (`movePoliciesToRevision`: `cloneQuotationJunctions` returns old -> new ids of alternatives, subjectivities, LOL and agreed-value options; the snapshot is cleared). PolicyDetail "Edit Coverage in Quotation" (unsigned only) does the same, or opens the quotation directly when it is already an open draft. Approving a revision whose vessels all have policies makes it converted at once (`markQuotationConvertedIfCovered`, shared with the converter), so Convert to Policy does not come back. A quotation with unsigned policies cannot go to the recycle bin (`deleteQuotation` / `deleteQuotationGroup` refuse), and the startup heal leaves a revised quotation on Converted
- **Update from quotation** (`utils/policyQuotationSync.ts`): what the converter COPIED onto the policy is compared with a baseline, `policy_documents.quotation_baseline` (JSON: payable premium for the policy's vessel / alternative / LOL option, instalment days, insured `entityId|role`, subjectivity texts, survey warranty wording), stored right after conversion (`captureQuotationBaseline`) and on the first view of an older policy. Only a change of the quotation since the baseline is offered, never the policy's own edits: an unsigned policy shows "The quotation has changed: ..." with **Update from quotation** -> a dialog (item / on the policy / in the quotation, tick each). Applying: premium (pro rata keeps its ratio) re-split over the instalments with commission, instalments re-dated from inception (30 days = 1 month), insured replaced (first address of each entity), new subjectivities added to the selection, survey wording back to the quotation's. Dismiss / apply both move the baseline to the quotation. A policy keeping all subjectivities, or with no stored survey wording, already follows those
- **Audit**: `policy:update` logs each changed field as `field: old -> new` (snapshot / exportedAt / baseline writes are not logged); Assign Number logs the old and new number
- **Signed policies keep their exact files**: the snapshot freezes CONTENT, but layout code still runs on each export. So for a SIGNED policy the first export stores the generated file byte for byte in `policy_export_files` (LONGBLOB, key `policy_doc_id` + `doc_key`: `policy`, `policy-pdf`, `da`, `ca`, `bc:{type}:{number}`), and re-exports return it - export-code changes never alter a signed document. `polFrozenFile`/`polStoredFile`/`polStoreFile` in PolicyExportService; the adapter stores only when `signed_at` is set (first file wins). Any `policyUpdate` touching `exportSnapshot` (edit, blue-card edit, signing capture) and `signPolicy` clear the files. Unsigned policies are never stored (they always use the current layout). The war **declaration** is stored once per signed policy (`decl`) - re-export ignores modal edits; a changed declaration needs a policy revision. **Endorsements** (`end:`, `end-da:`, `end-ca:` + endorsement id) are stored once the ENDORSEMENT is signed; editing it (fields, sections, instalments, signing) clears them, marking it exported does not, and a policy-level reset keeps them.
- **Policy folder** (`src/main/policyFolder.ts`): the converter's Review step asks each vessel's folder (pre-filled from `vessels.policy_folder`, the last one chosen; required) and shows where the exports will go. After the conversion `policy:setExportFolder` makes the year folder (CURRENT calendar year) inside it: `{year}` when missing or holding no policy, else `{year}-2`, `-3`... A policy file = a name starting with the policy number (type letter + YY + code + 4-digit serial, no spaces, e.g. `H26210015 - JULIA AK - Debit Advice.docx`) or `POL-DRAFT-`; other files do not block a folder. Stored canonical in `policy_documents.export_folder` (copied by revisions). Every export of the policy (policy, PDF, for-signing, signed + T&C, DA, CA, blue cards, ZIP, declaration, endorsements, QuickBooks Excel) saves there WITHOUT a dialog (`savePolicyFile` in utils/saveFile.ts -> `policy:writeExportFile`); an existing name gets " (2)", never overwritten. No folder (policies converted before) or folder unreachable -> the Save dialog as before. PolicyDetail header: Open Folder (`policy:openFolder`)
- **Sanctions check at conversion** (2026-10-30): the converter's last step screens every party (vessels, insureds as edited, customer); Create Policy is blocked until clear or overridden by `compliance:override`, enforced again in `policy:convertFromQuotation` (`screeningId`). The screening PDF is saved in each policy folder and the policy keeps `screening_id`; Policy Detail shows the sanctions badge. Endorsements naming parties are checked before export / signing. See compliance.md, Party Screening
- **Cancel Policy dialog** (PolicyDetail): on an instalment (returns the later instalments) or on a date (pro-rata return of the remaining days, bottom-filled into the instalments). Date mode can **reclaim the NCB/UPCC** (tick box, off by default): NCB and UPCC (% or amount) are filled from the quotation (vessel exclusions and own UPCC rate respected), the technical premium is worked back from the policy premium (`discountGivenFromPayable`) and the full discount is taken off the return; commission is on the reduced return. The summary shows pro-rata return, reclaim, technical premium; a reclaim larger than the return blocks the cancellation with a note. The endorsement text gets a sentence stating the NCB/UPCC amount reclaimed
- **Hide broker toggle** (`policy_documents.hide_broker`, edited in PolicyDetail): suppresses the "c/o {broker}" line on the **policy and DA** only. The CA always shows the broker (it is the broker's document).
- **Conversion updates the vessel's policy record** (`syncVesselPolicyFromConversion`): the vessel_dynamic_policies row for the same period (matched by inception or end date, entered by hand) is linked and updated, otherwise one is created (`conversion_created = 1`), with inception/end dates, the single premium field (Premium / War Premium, only if empty), currency, number and customer. Earlier active rows of that type ending on or before the new inception become `expired` (`expired_by_policy_document_id`) - rows stay active until their renewal is converted. `policy_document_id` links the row; the real policy number is copied to it when assigned
- **Quotation status `converted`**: set once every vessel of the quotation has a policy (with the Converted workflow step); a startup migration fixed older ones
- **Delete policy reverts**: deleting a policy removes the vessel policy row the conversion created (or unlinks the one it updated), makes the row it expired active again, and - when the quotation no longer has a policy for every vessel - moves its workflow step off "Converted" and its status back to `exported`. A startup migration heals already-orphaned quotations (Converted step with zero policies).
- **Per-policy choices** (converter, editable in Policy Detail before the first export; copied by revisions): subjectivity days (`policy_documents.subjectivity_days`, default 7), section order, UPCC section name (`upcc_title`, empty = the quotation's `quotations.upcc_title`, default "Upfront Profit Continuity Credit (UPCC)"). The converter's "Survey Warranties" step stores the final wording per vessel in `survey_warranty_texts` (JSON `[{id, text}]`; NULL = built from the quotation); on a policy `{days}` = 0 reads "at inception" (`utils/surveyWarrantyText.ts`)
- **Quotation parity**: the policy export filters every alternative/vessel-scoped item to its vessel and chosen alternative (incl. hull/war conditions), uses the converter's agreed-value option, the chosen alternative's own clause wording, and `vesselTechnical` (shared/premium.ts, War Settings default rates) as the base of NCB/UPCC/discount `{amount}`. War Section 1/2 wording comes from `utils/warTexts.ts` (field → War Settings → default) in editor, quotation and policy. The Debit Advice splits the payable premium H&M / IV and War Section 1 / Section 2
- **Instalment Dates**: Each 30 days = 1 calendar month from inception
- **Copy instalment dates** (`CopyInstalmentDatesModal`): "Copy dates from a policy" in the converter's Premium & Instalments step and in Policy Detail editing: pick another policy (search; same inception date first) and take its number of instalments and due dates; the amounts are split again on this policy's premium (and commission)
- **Premium**: Uses payable amount (after NCB/UPCC discounts)
- **Export layout invariants** (PolicyExportService, see lessons-learned): nested tables use `POL_TABLE_MARGINS` (zero cell inset) to align with paragraphs; section titles use `keepLines` so a multi-line title never splits across pages (content still flows — NOT `cantSplit`); small gaps via `polSpacerPts(n)` not blank `polEmptyP()`. Every policy-family document is packed by `polPack`: a blank line between two paragraphs is exactly one empty line (its own space after and the space after/before the paragraphs on either side are set to 0 in document.xml); spacer gaps and the empty paragraph after a nested table are left alone. Trading Warranty: the intro, the excluded-countries line and the first numbered item are separated by one blank line each, the numbered items by 3pt (`pushListGap`). Premium Payment Condition Precedent: one 6pt gap between all its parts (intro, instalments, outstanding notice, condition, premium earned) Policy/DA/CA share the insured (`polBuildInsuredSection`) and period (`polBuildPeriodParagraphs`) builders — a change to one applies to all.

### Policy Revisions

- **Create Revision**: Clones policy with incremented revision number, old marked "Superseded"
- **Revision Suffix**: Internal `-R1`, `-R2` etc. appended to policy number
- **Blue Cards**: Carried over to new revision
- **Cancel & Replace**: Configurable footer text per document type, shown on revised documents
- **Edit vs Revise**: Edit available until the policy is signed, New Revision (or an Endorsement) after

### Renewing a Policy (renewal quotation)

- **Renew Button**: Creates new quotation pre-filled from expiring policy
- **Period**: New inception = old expiry, new expiry = +1 year (string math, no timezone issues)
- **Change Highlighting**: Renewal quotation DOCX exports show differences in red (added) and red strikethrough (removed)
- **Tracking**: `renewed_from_policy_id` and `renewed_from_policy_number` on quotations

### Blue Cards

P&I insurance certificates:

- **Types**: BBC (Bunker), WRC (Wreck Removal), MLC4.2 (Shipowners' Liability), MLC2.5.2 (Repatriation)
- **Issue/Reissue**: Per-type with auto-incremented numbers (P26200001/BBC, P26200001-2/BBC)
- **Owner Override**: Per-card owner entity selection
- **Port of Registry**: From flag state ports, auto-selected if single
- **Auto-populate on conversion**: `convertQuotationToPolicy` sets each card's `port_of_registry` (flag's single/default port), owner (`owner_entity_id`/`owner_name`/`owner_address` from the Registered-Owner assured + entity_addresses), AND — for BBC/WRC — `addressed_to_*` from the vessel's flag-state authority when the flag ratifies the convention (BBC=`ratified_bunker`, WRC=`ratified_wreck`; MLC cards get none). A backfill migration fills the addressee on existing blank BBC/WRC cards for ratifying flags with an authority on file.
- **Export port format**: `PORT / COUNTRY` (both uppercased); when no port is set it prints just the country — never `COUNTRY / COUNTRY`.
- **Addressed To (ratification enforcement)**: BBC/WRC addressed to a flag-state maritime authority. The issue/reissue modal's addressee dropdown lists ONLY flags that ratify the relevant convention; a not-ratified warning shows when the vessel's own flag doesn't ratify. **Saving a BBC/WRC is blocked unless a ratified flag is selected** (`addressedToFlagId` required). An inline **"Add flag state"** form (name/ISO3/ratified bunker+wreck/authority) creates + selects a missing flag via `addFlagState` without leaving the modal.
- **Reissue for another flag state**: from an existing card, reissue defaults new inception = today, expiry carried over, number increments (`-2`). The addressee flag can be switched (updates the "To:"). **Cancel & Replace is driven by period OVERLAP** — `new inception < old expiry` — recomputed live as the dates change (consecutive/touching periods omit it); when on, the source card is superseded.
- **Cancel & Replace**: Configurable text with placeholders; auto-set from period overlap on reissue
- **Status**: Active / Superseded (one active per type)
- **Further assureds**: `policy_blue_cards.additional_owners` (JSON `[{entityId, name, address}]`, `BlueCardOwner`): "Add another assured" under the Owner in the issue / reissue / edit dialog (picked from the vessel's assureds or typed). Printed under the owner on every card layout, each name + address in bold (`bcAdditionalOwners`); copied by reissue and policy revisions
- **Export**: Individual DOCX per card matching real certificate templates. MLC provider block de-dupes the company name (report-settings `companyName` vs the `bc_mlc_company_address` first line, compared normalized so hyphenation differences match); Email/Tel contact rows have zero inter-row spacing. All blue-card tables use `BC_TABLE_MARGINS` (zero cell inset) to align with the surrounding paragraphs.

### Digital Signatures

- **User Signatures** (`user_signatures`): LONGBLOB image per user, managed in Policy Settings
- **Sign Button**: PolicyDetail header, opens a choice: **Sign in the app** (`policies:sign` + an uploaded signature; assigns the number if still a draft) or **Signed by hand...** (any `policies:manage` user, needs the real number: pick the scan, the T&C are added when the type has a T&C template, else the scan is saved as it is, `(signed).pdf`; then `policy:signByHand`). `policy_documents.signed_method` = `app` / `hand`; `getPolicySignature` returns nothing for `hand`, so no signature image is printed on a hand-signed policy. Badge: "Signed by hand (recorded by X)"
- **Export for Signing** needs the real number (alert otherwise); a type without T&C prints the policy alone
- **Placement**: Signature image in footer (every page, bottom-right) + closing section (above THE INSURER)
- **Tracking**: `signed_by`, `signed_at` on policy_documents

### Terms & Conditions Automation

- **T&C Templates** (`policy_tc_templates`): several per policy type, one default; rich text (written in the app) or an uploaded Word file (Policy Settings, T&C Templates)
- **DOCX→PDF**: Via Microsoft Word COM (PowerShell) or LibreOffice (headless fallback). Slow (10-40 s per document), so the T&C page count is cached per template file per session (`countTcPages`, sha1 of the file)
- **Word T&C keep their own headers / footers** (`prepareTcDocx` in `DocxToPdfService.ts`): the first section's `w:pgNumType w:start` = page after the policy / scan (later sections continue; a "continuous" type on the first section is dropped, LibreOffice ignored the start with it), and in every header/footer part the text is filled across Word's split runs: placeholders `{policy_number}`/`{number}`, `{total_pages}`/`{total}`, `{type}`; without placeholders the number after "Certificate"/"Cover", the total after "Page N of", and a stray "x" before "Page" (cut placeholder in the Hull file). A Word file with no PAGE field in any footer gets the generated footer (old `setDocxPageStart`)
- **Policy exported without its T&C** (Export Policy DOCX, Export All ZIP) still counts them (user 2026-11-03): "Page X of {policy + T&C pages}" as Word's formula field `{ = { NUMPAGES } + n }` (`polAddTcToPageTotal` in polPack replaces the `POL_TOTAL_MARKER` run), so an edit that changes the policy's length keeps the total right. n = `tc:pageCount`: the default Word T&C's pages, counted once by a Word conversion (~30 s, the first export) and kept in `policy_tc_templates.page_count` (reset when the file is replaced). Every type: a rich-text T&C is built as its own section, sent to `tc:pageCount(typeCode, sectionDocx)` and counted by Word (`docxPageCount`, cached per content for the session), then left out of the file. A type with no T&C = the policy's own total
- **Export Policy (PDF + T&C)**: count (policy + T&C, `countOnly`), then the policy with that total + the T&C numbered after it, merged with `pdf-lib`
- **Wet-ink signing** (PolicyDetail actions): "Export for Signing (PDF)" = the policy alone whose footer already counts the T&C pages; it stores `policy_documents.signing_pages` / `signing_total`. "Add T&C to Signed Scan..." = pick the scanned PDF (`tcScan:pick`, the main process remembers the path) -> `tcScan:append` (`appendTcToPdf`): scan + T&C numbered from the page after it with total scan + T&C. Asks first when the scan's page count differs from `signing_pages` or the policy was never exported for signing. Needs the default T&C to be a Word file (rich-text T&C: error message)

### QR Verification

- **Settings**: Configurable verification URL base in Policy Settings → QR tab
- **Placement**: Verification link on last policy page before closing
- **Format**: `{baseUrl}{policyNumber}`

### QuickBooks Export

- **64-column Excel**: Matches accounting system template
- **Deductible Encoding**: Letter codes + amount/1000 (e.g., C10P5O25)
- **Base Currency**: App setting (default USD) with exchange rate per policy
- **Export Button**: "QB Export" in PolicyDetail

### Commission Defaults

3-tier commission hierarchy for policies:
- **Policy type default**: `policy_type_commissions` table, managed in Policy Settings → Commissions tab
- **Customer override**: `entity_commission_overrides` table, per entity + policy type. Managed in Policy Settings + Entity Directory slide-in panel
- **Per-policy**: `commissionPercent` on `policy_documents`, editable in wizard and PolicyDetail
- **Resolution**: `commissionResolve(entityId, policyTypeId)` — customer override → type default → null
- **Wizard auto-fill**: PolicySetupWizard resolves commission on load using `quotationTypeId || policyTypeId`

### War Declaration Export

Reinsurance declaration document for War policies:
- **Export button**: "Export Declaration" in PolicyDetail actions menu (War policies only)
- **Editable modal**: All fields pre-filled from policy/quotation, fully editable before export
- **Fields**: Year of Account, UMR, Reinsured, Assured, Vessel (with IV split), Period, Wording (from war conditions), Warranties, Annual Rate, Our Share, Trading, Risk Code, Amlin Ref
- **Settings**: Policy Settings → Declaration tab with per-year UMR, Amlin Ref, Risk Code stored in `declaration_settings` app_settings key
- **Schema**: `our_share DECIMAL(5,2)` on `policy_documents`
- **No headers/footers**, filename: `{policyNumber} - {vesselName} (Declaration).docx`

### Policy Export Improvements

- **Single instalment**: "Premium of {currency} {amount} shall be payable on {date}..." (configurable in Settings)
- **Debit Advice**: Compact header (company only), title size 10 bold underline, 2-column instalment table, premium on one line with words + "Only", period as 3-column table, bank details without title
- **Debit Advice section gaps**: every section row (Insured, Premium, Premium Payment Condition Precedent, Period, Bank Details) has 10pt under it (`DA_ROW_MARGINS`); no extra blank line after the instalment table
- **Credit Advice**: Broker from quotation customerEntityId at top, broker excluded from Insured + c/o line, commission wording configurable in Settings (placeholders: `{instalments}`, `{date}`), reduced cell margins
- **Blue Cards (BBC/WRC)**: NOT TRANSFERABLE left / REF right, 3-column vessel table (label|:|value bold) with FIXED layout, 3-column period table, owner section without border, port includes country
- **MLC Blue Cards**: Same vessel table design, provider address bold uppercase zero spacing, contact details in 2-column table
- **Footer**: Strips HTML tags, splits by `<br>`, Arial 9pt left-aligned not italic
- **Header spacing**: `spacingAfter: 0` on all document headers (policy, DA, CA, blue cards)
- **QR Code**: Actual QR image via `qrcode` package, URL uses IMO number not policy number
- **Draft policy numbers**: `POL-DRAFT-{code}-XXXX` format (includes type code)
