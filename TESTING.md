# Quotation & Policy Testing Guide

Comprehensive test cases covering the full quotation-to-policy workflow.

---

## Quotation Testing

### Test 1: P&I Quotation — Single Vessel, No Alternatives
1. Create new P&I quotation
2. Add 1 vessel from the database
3. Verify vessel details auto-populate (name, IMO, flag, type, GT, class)
4. Add insured entities with roles (Owner, Manager)
5. Set limit of liability amount + text
6. Select P&I conditions (apply a clause set)
7. Set trading warranty (select template, check excluded/DDQ countries)
8. Select warranties (apply a default set, verify order matches set order)
9. Add deductibles (standard + text deductibles)
10. Add exclusions (select from master list + add custom)
11. Add sanctions clause
12. Add subjectivities
13. Set premium (single amount, 3 instalments, NCB 10%)
14. Verify payable premium = technical x (1 - NCB%)
15. Export to Word - verify all sections present and formatted correctly
16. Export to PDF - verify matches Word content

**Expected**: Clean document with all sections, correct premium calculation, proper formatting.

---

### Test 2: P&I Quotation — Multi-Vessel, 2 Alternatives
1. Create P&I quotation with 2 vessels
2. Create 2 alternatives
3. For Alt 1: select Full Cover clause set
4. For Alt 2: select Restricted Cover clause set
5. Verify clause descriptions differ per alternative
6. Select different deductibles per alternative
7. Select exclusions — some for both alts, some for Alt 1 only, some for Alt 2 only
8. Set per-alternative premiums
9. Export - verify:
   - Both alternatives shown with correct conditions
   - Common exclusions in main section
   - Alt-specific exclusions under "Additional exclusions applicable to Alternative X"
   - Premium table shows both alternatives with payable amounts

**Expected**: Clean separation of alternatives, correct premium per alt.

---

### Test 3: Hull Quotation — Multi-Vessel, IV Enabled
1. Create Hull quotation with 2 vessels
2. Set agreed value + enable IV
3. Set IV value
4. Add agreed value text items (H&M + IV texts)
5. Select hull clause (ITC 280)
6. Verify default conditions auto-selected
7. Add hull additional conditions
8. Set per-vessel conditions if different
9. Add 2 hull alternatives (280 + 280 FPA)
10. Set per-alternative premiums + IV premium
11. Apply NCB discount
12. Export - verify:
    - "Interest" section shows Section A + Section B
    - Agreed value amounts correct
    - Both alternatives with correct conditions
    - IV section separate from main conditions
    - Premium table: Technical + Payable for each alt + IV

**Expected**: Proper IV separation, correct condition dedup, per-alt premiums.

---

### Test 4: War Quotation
1. Create War quotation
2. Add vessel
3. Set conditions (standard war text)
4. Set trading warranty (should be simple one-liner for War)
5. Add warranties
6. Set premium (single, no alternatives)
7. Export - verify simpler format (no deductibles, no LoL)

**Expected**: Simplified War format, no unnecessary sections.

---

### Test 5: Quotation Workflow
1. Create a quotation (starts at Draft)
2. Verify non-approver cannot export
3. Move to "Under Review" - verify approver can export
4. Move to "Approved"
5. Move to "Sent"
6. Verify quotation is now locked (read-only)
7. Create a revision - verify R1 badge, old version locked
8. Edit R1 - change a warranty
9. Export R1 - verify change appears
10. Try to re-convert the original (should be blocked after conversion)

**Expected**: Proper state transitions, locking, revision creation.

---

### Test 6: Trading Warranty — Custom Mode
1. Create P&I quotation
2. Go to Trading tab
3. Select a trading template (intro text)
4. Check "Use custom wording"
5. Verify standard paragraphs (1, 2, 3) are hidden
6. Select a custom trading text template
7. Modify the text
8. Export - verify only intro + custom text appear (no numbered paragraphs)

**Expected**: Custom wording replaces standard paragraphs.

---

### Test 7: Survey Warranties in Quotation
1. Create quotation (any type)
2. Go to Survey Warranties tab
3. Apply a template set
4. For each warranty, fill in placeholders ({deadline}, {days})
5. Verify preview shows resolved text
6. Add a custom (free-text) survey warranty
7. Export - verify survey warranties appear after regular warranties

**Expected**: Placeholders resolved, custom warranties included.

---

## Policy Testing

### Test 8: Convert P&I Quotation to Policy
1. Send a P&I quotation (move to Sent)
2. Click "Convert to Policy"
3. Verify 6-step wizard opens
4. Step 1: Select vessel (if multi-vessel, each gets a policy)
5. Step 2: Set inception/expiry dates + times + timezone
6. Step 3: Verify instalment dates auto-calculated (30 days = 1 month)
7. Step 4: Set commission %, select bank
8. Step 5: Select blue cards (BBC, WRC, MLC4.2, MLC2.5.2)
9. Step 6: Review summary - Create Policy
10. Verify policy number format: P{inverted year}{4-digit serial} (e.g., P26200001)
11. Verify quotation moves to "Converted" status
12. Navigate to new policy - verify all data present

**Expected**: Policy created with correct number, all data carried over.

---

### Test 9: Convert Hull Quotation with Alternatives
1. Send a Hull quotation with 2 alternatives
2. Convert to policy
3. Wizard Step 1: verify alternative selector shows both with premiums
4. Select Alternative 2
5. Complete the wizard
6. Export policy - verify ONLY Alternative 2's conditions appear (no Alt 1)
7. Verify premium is Alternative 2's payable amount

**Expected**: Single alternative exported, correct conditions/premium.

---

### Test 10: Multi-Vessel Conversion
1. Create quotation with 3 vessels
2. Send and convert
3. In wizard, select 2 out of 3 vessels
4. Complete wizard
5. Verify 2 policies created (one per vessel)
6. Each policy has its own number
7. Each shows correct vessel data

**Expected**: 2 separate policies, correct vessel assignment.

---

### Test 11: Policy Export — Full Document
1. Open a P&I policy
2. Export Policy DOCX - verify:
   - Header with company details + policy number + vessel name
   - Opening clause
   - Insured with addresses
   - Vessel table (name, IMO, flag, type, built, GT, class)
   - Limit of Liability with full text
   - Period with dates + times + timezone (not bold)
   - Conditions (from quotation)
   - Trading warranty (full numbered paragraphs or custom)
   - Warranties + breach clause
   - Deductibles + additional text
   - Sanctions clause
   - Exclusions
   - Subjectivities with intro text
   - Premium section with instalment dates
   - Important Notice
   - Closing + signature block
   - Footer with page numbers + configurable text

**Expected**: Complete, professional document matching the templates.

---

### Test 12: Debit Advice & Credit Advice
1. Export DA - verify:
   - Premium amount in figures + words
   - Instalment table with dates
   - Bank details
   - Non-refundable note (if applicable)
2. Export CA (only if commission > 0) - verify:
   - Broker header with address
   - Commission amount in figures + words
   - Commission per instalment

**Expected**: Correct amounts, words match figures.

---

### Test 13: Blue Cards
1. Open a P&I policy
2. Issue BBC card - verify:
   - NOT TRANSFERABLE header
   - Addressed to flag authority (if ratified)
   - Vessel details with port of registry
   - Owner block
   - Period with times
   - Cancellation text (3 months)
3. Issue MLC 4.2 - verify:
   - Provider details (company, website, email, phone)
   - Cancellation text (30 days, Standard A4.2.12)
4. Test reissue - verify:
   - Number increments (P26200001-2/BBC)
   - Cancel & replace auto-checked if periods overlap
5. Test flag not ratified - verify warning + alternative flag selector

**Expected**: Correct certificate format per type, proper reissue numbering.

---

### Test 14: Policy Revision
1. Export a policy (marks it as exported)
2. Verify "Edit" button is hidden (can only revise)
3. Click "New Revision"
4. Verify old policy superseded, new policy is R1
5. Edit premium on the revision
6. Export - verify "cancels and replaces" in footer
7. Check blue cards carried over to revision

**Expected**: Old superseded, new has correct footer, blue cards intact.

---

### Test 15: Policy Renewal
1. Open an active policy
2. Click "Renew"
3. Verify new quotation created with:
   - Period = old expiry to old expiry + 1 year
   - Vessel details refreshed from DB
   - All conditions/warranties/deductibles copied
4. Modify a warranty in the renewal quotation
5. Export - verify changed warranty appears in red
6. Removed items appear in red strikethrough

**Expected**: Correct period, change highlighting in red.

---

### Test 16: Edit Policy Coverage
1. Open a policy - click Edit - Coverage tab
2. Click "Edit Coverage in Quotation"
3. Verify auto-creates quotation revision
4. Verify "Editing coverage for Policy P..." banner
5. Verify export/revision buttons hidden
6. Make a change - Save
7. Click "Return to Policy"
8. Export policy - verify change reflected

**Expected**: Seamless round-trip editing.

---

## Cross-Module Testing

### Test 17: QuickBooks Export
1. Open a policy - QB Export
2. Verify Excel has 64 columns with correct data
3. Check: policy number, vessel, customer, premium, commission, exchange rate
4. Check: deductible encoding (letter codes)
5. Check: conditions summary

---

### Test 18: Renewal with Status Tracking
1. Go to Renewals page
2. Verify KPI cards show correct totals
3. Set renewal status on a policy
4. Add a note
5. Export to Excel - verify notes column populated
6. Filter by policy type - verify count updates

---

### Test 19: Permissions (RBAC)
1. Log in as a user WITHOUT quotations:approve
2. Verify cannot move quotation to "Approved"
3. Log in as user WITHOUT policies:manage
4. Verify cannot edit or revise policies
5. Verify export buttons hidden without reports:export

---

### Test 20: Notification Flow
1. User A creates a quotation and moves to "Under Review"
2. User B (approver) - verify notification received
3. User A adds a note with @UserB
4. User B - verify @mention notification
5. User B replies to the note
6. User A - verify reply notification

---

## Notes

- All exports should use dd/mm/yyyy date format within the app
- DOCX exports use "Month Day, Year" format (e.g., "April 13, 2026")
- Premium calculations: Payable = Technical x (1 - NCB%) x (1 - UPCC%)
- Instalment dates: each 30 days = 1 calendar month from inception
- Policy numbers: {type code}{inverted year}{4-digit serial} (e.g., P26200001)
- Blue card reissue: append -2, -3, etc. (e.g., P26200001-2/BBC)
