# Roadmap: making the app one cohesive application

Agreed 2026-10-29 as a list to DISCUSS point by point (starting with 1). Nothing here is
approved to build until the user says so for that point. Mock-up of point 1 (case page +
renewals board): https://claude.ai/artifact/TsPAEXa2Q6fMm8QbKUQeNc

Today the app is a set of strong modules (quotations, policies, compliance, vessels, surveys,
calculators, wiki) that hand work to each other by hand. The aim: organise it around the life
of a risk, so every screen is a view of the same story.

## 1. The risk case as the backbone (discussing first)
- One CASE per vessel + cover + year: quotation -> approval -> policy -> endorsements ->
  (payments, claims) -> renewal are stages of it, not separate objects.
- A case page: header with stage bar, timeline of everything that happened (quotation,
  approval, conversion, exports, signing, endorsements, claims, screenings), the risk facts,
  open items, documents (the policy folder), and the same vessel's other cases.
- Renewals open themselves (60-90 days before expiry) pre-filled from the current policy,
  premium history and claims. The Renewals page becomes a pipeline board (opening soon ->
  drafting -> quoted -> approved -> issued) instead of a list of dates.
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
