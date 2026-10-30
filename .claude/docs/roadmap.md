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
- 5 compliance at every step: AGREED, to plan.
- 6 document store: to PLAN CAREFULLY (major change for users).
- 7 wording library: to DISCUSS. Found 2026-10-30: quotation items point to the settings rows by id with ON
  DELETE CASCADE, and Delete in settings has no confirmation, so deleting a wording removes it from every
  quotation using it; editing a wording changes every quotation that uses it.
- 8 shared UI building blocks: to DISCUSS.
- 9 server: to DISCUSS / PLAN.
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

## 6. One managed document store
Files stored in one managed place (or the DB) with versions, linked to case / vessel / entity /
claim. Exports land there automatically; Windows folders become a browsable mirror. Ends the
remap / missing-path problems.

## 7. One wording library, quotation to policy
Clause / warranty / standard-text library with versions; quotations and policies point to a
version and record any wording changed for that risk. "What changed since the quotation" before
issuing. Wording updates as "new version from 1 Jan" with the live policies affected.

## 8. Shared UI building blocks
One combobox, sortable list, document picker, money input, date range used everywhere (the
flag-field and arrows-vs-drag fixes of 2026-10-29 came from tabs building their own), with a
lint rule against hand-built copies.

## 9. A small server between the app and the database
Holds the DB login, enforces permissions server-side, runs migrations once. Opens the door to
a broker portal (policies, documents, subjectivity uploads), email in/out linked to cases, a
phone view.

## 10. Quality safety net
Golden copies of every export type compared on each change (with Word renders of differences),
and a recorded end-to-end test run before each deploy.
