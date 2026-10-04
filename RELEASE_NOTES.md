## 8.1.0

### New
- New: Import scanned SIC letters: the app reads the Arabic names, writes them in English and saves the entries for you to check (works offline) [try:sic-import-letters]
- New: Statement of Account: upload the accounting Excel and get a statement or invoice letter on the company letterhead, in Word or PDF [try:report-statement]
- New: Search or jump anywhere with Ctrl+K, and a Features page listing everything the app can do [try:features]
- New: Survey reports: defects imported accurately from Word and PDF reports, time scales become due dates or due events [try:surveys]
- New: Converter: edit the survey warranty wording for each policy, and set the subjectivity days (default 7)
- New: Policies: change the section order, subjectivity days and UPCC name of a single policy in Policy Detail [try:policies]
- New: Additional discounts can be marked "not deducted from the premium", for a discount granted later; placeholders are listed under each discount
- New: Signed policies, war declarations and signed endorsements re-export exactly the same file every time

### Improved
- Improved: Policy documents now match their quotation: hull conditions grouped under Hull and Machinery, Increased Value or both sections, the agreed value chosen in the converter, each alternative's own clause wording, items scoped to other vessels left out
- Improved: War: the Debit Advice splits the premium into Section 1 and Section 2; same Section 1/2 wording in the editor, quotation and policy
- Improved: UPCC is now "Upfront Profit Continuity Credit" and its name can be edited per quotation and per policy
- Improved: A discount placed in the Premium section sits right below the premium
- Improved: The outstanding premium notice starts unchecked for a new vessel and checked for renewals
- Improved: Policy screen: compact instalment table, amounts in the policy's own currency
- Improved: One page header style across the app, clearer buttons and dialogs, better light-mode colours
- Improved: Faster start-up and lists; the weekly sanctions check now runs on schedule
- Improved: Electron 44 and security updates, smaller installer

### Fixed
- Fixed: A failed save now shows an error instead of a success message
- Fixed: Policy revisions keep every choice made for the policy (limit option, subjectivities, section order and more)
- Fixed: Subjectivity days were not saved on policies (every policy said 7 days)
- Fixed: Section-2-only war cover was charged a Section 1 premium in the converter
- Fixed: Security: permission gaps and unsafe inputs closed
- Fixed: Many smaller fixes behind the scenes (the whole code base was reviewed and tidied)
