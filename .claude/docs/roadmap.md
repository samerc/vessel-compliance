# Roadmap: making the app one cohesive application

Agreed 2026-10-29 as a list to DISCUSS point by point (starting with 1). Nothing here is
approved to build until the user says so for that point. Mock-up of point 1 (case page +
renewals board): https://claude.ai/artifact/TsPAEXa2Q6fMm8QbKUQeNc

Today the app is a set of strong modules (quotations, policies, compliance, vessels, surveys,
calculators, wiki) that hand work to each other by hand. The aim: organise it around the life
of a risk, so every screen is a view of the same story.

## Status per point (user, 2026-10-30)
- 1 risk case: ON HOLD, the user is thinking about the 4 open questions (what is a case, renewals opening
  themselves, board columns, assignment).
- 2 premium status: LATER, works once quotations are converted to policies (today policies are still filled in
  by hand).
- 3 claims: WAITING for management feedback.
- 4 tracked tasks: NOT NEEDED now (more work for the team), kept as a note.
- 5 compliance at every step: BUILT 2026-10-30 (undeployed), see compliance.md Party Screening.
- 6 document store: to PLAN CAREFULLY (major change for users).
- 7 wording library: to DISCUSS. Found 2026-10-30: quotation items point to the settings rows by id with ON
  DELETE CASCADE, and Delete in settings has no confirmation, so deleting a wording removes it from every
  quotation using it; editing a wording changes every quotation that uses it.
- 8 shared UI building blocks: to DISCUSS.
- 9 server: ON HOLD (user 2026-10-31; everyone works on the Windows server via RDP, see point 9). Revisit for a broker portal / phone view.
- 10 safety net: detailed to the user 2026-10-30, to agree.

## 1. The risk case as the backbone (discussing first)
- One CASE per vessel + cover + year: quotation -> approval -> policy -> endorsements ->
  (payments, claims) -> renewal are stages of it, not separate objects.
- A case page: header with stage bar, timeline of everything that happened (quotation,
  approval, conversion, exports, signing, endorsements, claims, screenings), the risk facts,
  open items, documents (the policy folder), and the same vessel's other cases.
- Renewals open themselves (60-90 days before expiry) pre-filled from the current policy,
  premium history and claims. The Renewals page becomes a pipeline board (opening soon ->
  drafting -> quoted -> approved -> issued) instead of a list of dates.
- DECIDED 2026-10-29 (user): the case is CONTEXT, not a door. Clicking a quotation still opens the
  editor, a policy still opens Policy Detail. Both get a thin CASE BAR on top (vessel + cover +
  year, clickable stages quotation -> approved -> policy -> signed -> in force -> renewal, last
  year's premium / claims, open items) and a History side panel (timeline, open items,
  documents). NO full case page (user: "the bar is better than a whole page"): the Renewals
  board, the vessel's cases by year and Ctrl+K open the screen for the case's stage (draft
  quotation while quoting, policy once issued; a not-yet-started renewal opens last year's policy
  with History open and "Start renewal"). History panel = the only whole-story view.
- One source of truth for the customer / insured on the case (fixes the open
  project_policy_customer_source issue: policy detail uses the legacy vessel customer).

## 2. Premium status (adjusted: ACCOUNTING STAYS IN QUICKBOOKS)
User: QuickBooks handles accounting, not this app. What could still fit: show instalment due
dates and payment status on the case (read from QB or marked by hand), warn when premium is
overdue (premium payment is a condition precedent of cover), and make the QB hand-off a
smoother export/sync. To discuss.

## 3. Claims register
Claims per policy (event, reserve, payments, deductible), loss ratio per vessel / fleet /
broker / cover shown when pricing renewals, NCB eligibility from claims history.

## 4. Promises become tracked tasks
Subjectivities (documents within N days), survey warranties (within 30 days), surveyor
recommendations and document expiries become tasks with due date and owner, closed by uploading
the document or recording the survey. One "My work" inbox across modules.

## 5. Compliance at every step
Screening runs automatically at quotation creation, conversion, endorsements that change
owners / managers, and receipts. One compliance badge (result, date, trigger) on every vessel,
entity and case. Conversion blocked on an unresolved hit, with a recorded override.
PLAN (2026-10-30, proposed, waiting for the user's answers):
TODAY: screening runs only weekly (all vessels + entities) and by hand (Sanctions Search, Check Report,
badge Recheck). The quotation export only READS the stored status (warnings: match / potential match /
not screened / assured typed without an entity). Conversion, endorsements and receipts check nothing;
a typed assured or receipt payer name is never screened.
A. One screening step + log: a shared screenParties(parties, trigger, context) using the existing
   search process and threshold; every run stored in a new screening log (subject, trigger, quotation /
   policy / endorsement / receipt id, result, hits, who, when). Same rules as the weekly run: cleared
   hits remembered, never auto-clears MATCH / pending. "Fresh" = screened after the last list update
   and within N days; fresh parties are not screened again.
B. Badge: vessel, entity, quotation header, Policy Detail: Clear (date, trigger) / To review / Match /
   Not screened. A quotation's or policy's badge = the worst of its parties; a click lists them.
C. Triggers: quotation (vessel / assured / customer added: screen in the background, warn); approval
   (warn, or block - user to choose); CONVERSION (new Compliance check in the converter: fresh screening
   of every party, Create Policy blocked on an unresolved hit unless overridden with a reason by a
   permitted user; the screening report PDF saved in the policy folder); endorsements adding or changing
   owners / managers / assureds / vessel (same gate as conversion); receipts (payer screened on save,
   warn and record).
D. Overrides: permission-based, reason required, shown on the policy and in the activity log.
Order: A+B, then quotation + conversion, then endorsements + receipts.
DECIDED (user 2026-10-30): warn on quotation / approval / receipt, BLOCK at conversion and on endorsements
changing parties; override by admin and a compliance role; screen ALL parties (vessel, owners, managers,
operators, customer / broker, payer); fresh = 30 days (and after the last list update); save the screening
report PDF in the policy folder at conversion; typed assureds are screened by the typed name, no linking
needed. APPROVED TO BUILD.

## 6. One managed document store
Files stored in one managed place (or the DB) with versions, linked to case / vessel / entity /
claim. Exports land there automatically; Windows folders become a browsable mirror. Ends the
remap / missing-path problems.
PROPOSED PLAN (2026-10-30, not approved): users keep working in their Windows folders; the app takes
over the files gradually, 4 phases, each reversible and piloted with one user first:
1. Track, don't move: one register of every file the app knows (vessel docs, exports, attachments)
   with path, size, fingerprint; a check warns when a file goes missing / changes and re-finds moved
   files. Invisible to users.
2. Safe copy of exports: exports still go to the policy folder, the app also keeps its own copy (as
   signed policies already do in policy_export_files).
3. Copy uploads in, optional per area: on upload a copy goes to the app's store (a server folder only
   the app writes to); the original stays.
4. Store becomes the main copy only when everyone is comfortable; Windows folders become a mirror the
   app keeps up to date.
Storage: a server FOLDER, not the database (DB, backups and dumps would balloon).
Needed from the user: size of today's document folders, how the server is backed up, how many VPN users.

## 7. One wording library, quotation to policy
Clause / warranty / standard-text library with versions; quotations and policies point to a
version and record any wording changed for that risk. "What changed since the quotation" before
issuing. Wording updates as "new version from 1 Jan" with the live policies affected.
TODAY (checked 2026-10-30): quotation items point to settings rows by id (e.g. quotation_warranties.
pi_warranty_id, quotation_clauses.pi_clause_id) with ON DELETE CASCADE. Editing a wording in settings
changes every quotation using it, approved ones included; policies freeze only on first export; no
"where used". URGENT side finding: Delete on a settings warranty (QuotationSettings piDeleteWarranty)
has NO confirmation and the cascade removes it from every quotation. Proposed quick fix (asked, not yet
answered): confirm, and when in use show "used by N quotations" and offer RETIRE (hidden from new
quotations, kept in old ones).
PROPOSAL: editing makes a new version; a quotation keeps its version; drafts show "newer wording
available" with a diff and one-click update; conversion carries exact versions; "what changed since the
quotation" before issuing; where-used per wording incl. live policies.
Open questions: drafts follow changes automatically or ask? Who may edit wordings?

## 8. Shared UI building blocks
One combobox, sortable list, document picker, money input, date range used everywhere (the
flag-field and arrows-vs-drag fixes of 2026-10-29 came from tabs building their own), with a
lint rule against hand-built copies.
Mostly code: users see the same keyboard behaviour everywhere, drag-to-sort instead of arrows,
fewer "works on my screen" bugs. Done screen by screen alongside other work. Question for the user:
drag-to-sort everywhere?

## 9. A small server between the app and the database
Holds the DB login, enforces permissions server-side, runs migrations once. Opens the door to
a broker portal (policies, documents, subjectivity uploads), email in/out linked to cases, a
phone view.
TODAY: every PC connects straight to MySQL with the DB password stored on the PC; permissions are
checked inside the app, so anyone with the password can bypass them.
With a server: users never hold a DB password, permissions checked server-side, migrations once.
Base for point 6 over VPN, broker portal, email linked to quotations/policies, phone view.
Cost: the biggest technical change (~820 adapter methods go through the server), movable area by area.
Needed from the user: what the server runs (Windows? always on?), do remote users reach it only via VPN.
ANSWERS (user, 2026-10-31): one Windows Server 2019 machine, always on, backed up, holds all company
files, the registers, Excel and Word. ~10 users all work ON that machine (in the office or VPN + RDP);
only the CEO runs the app on a laptop. The user has no admin rights and Claude gets no access:
anything needing admin goes through IT.
ASSESSMENT: with everyone on the server, most gains disappear: no speed gain (the DB is local),
background jobs already run once (DB named locks: vc_daily_alerts, weekly check, migrations), files
are already local. What is left: security (the DB password sits in db-config.json on that machine)
and the base for a broker portal / phone view / the CEO laptop. Cost: a Windows service (admin, IT
once) + a firewall port for the CEO, plus the biggest code change on the roadmap.
DECISION (user 2026-10-31): ON HOLD. Recommendation was: park point 9; revisit when a broker portal or phone view
becomes a goal. Meanwhile a no-admin hardening check: where db-config.json lives and which MariaDB
account the app uses (a limited app account instead of root).

## 10. Quality safety net
Golden copies of every export type compared on each change (with Word renders of differences),
and a recorded end-to-end test run before each deploy.
DETAIL (given 2026-10-30):
A. Reference copies: a fixed set of real cases (P&I quotation, Hull fleet quotation, War policy,
   endorsement, DA, ...). On every change every export is regenerated, text + layout compared with the
   approved copy, differences rendered in Word page by page before/after. Intended changes: approve the
   new copy as the reference.
B. Pre-deploy run: a script drives the real app on a DB copy (temp test user): every page, create / edit
   / export quotations, calculators, error check. Approval, registry numbering, Create Policy stay
   manual. One-page report; a failure stops the deploy.
Effort ~2-3 days (Word on the dev PC). User's part: pick 10-15 real quotations/policies covering every
cover type and the awkward cases.
