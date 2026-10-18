# SchoolOS (working title) — Requirements

Product by Wodona Tech. Multi-tenant school management SaaS for **Nursery → JHS** schools in Ghana, sold to many schools.
Phase 1 depth: **Attendance, Report Cards, Fees**, plus the foundation they sit on (school setup, students, guardians, staff, roles, messaging, parent portal, platform admin).

Requirement IDs (`FR-…`) are stable so tests, tickets and wireframes can point at them. **MUST** = Phase 1 launch, **SHOULD** = Phase 1 if time allows, **LATER** = roadmap.

---

## 1. Goals and non-goals

**Goals**
1. A school can onboard itself in under an hour and run a full term (attendance → report cards → fees) without spreadsheets.
2. Parents get what they care about on a phone: attendance alerts, fee balance with MoMo payment, and the report card.
3. Headteacher and bursar get accurate, auditable numbers (who owes, who paid, who was absent, who is unranked because a mark is missing).
4. Works on poor connections and cheap Android phones; SMS is first-class, not an afterthought.

**Non-goals (Phase 1)** — timetabling, library, hostel/boarding, transport, payroll, inventory, e-learning, accounting/expenses, SHS support.

## 2. Users and roles

| Role | Who | Core jobs |
|---|---|---|
| Platform admin | Wodona Tech staff | Onboard schools, plans, billing, support, impersonate (audited) |
| School admin | Proprietor / admin officer | Set up school, users, policies; everything in-school |
| Headteacher | Head / assistant head | Oversee attendance, approve & publish report cards, read fees |
| Teacher | Class or subject teacher | Take attendance (own class), enter scores (own subjects), write remarks (class teacher) |
| Bursar | Accounts / fees clerk | Fee structure, invoices, record payments, receipts, debtors |
| Registrar | Front desk / records | Admissions, student & guardian records |
| Parent / guardian | Fee payer | View own children only: attendance, report cards, fees; pay online |

Permission matrix lives in `src/lib/permissions.ts`; teacher scoping (only assigned classes/subjects) and parent scoping (only linked children) is enforced in the **data layer**, never only in the UI.

## 3. Ghana-specific rules

- Academic year with **three terms**; report card shows term vacation date and **next term begins** date.
- Level ladder: Nursery 1–2, KG 1–2, Primary 1–6, JHS 1–3 (schools may hide levels they don't run).
- Assessment per level group: **JHS** numeric score → grade 1–9; **Primary** score → proficiency band; **Nursery/KG** descriptive ratings (no numeric ranking by default). Bands and component weights are **editable per school**; seeded values are placeholders to confirm with each school / current GES-NaCCA guidance.
- Typical mark build-up: class score (SBA) + end-of-term exam, weights configurable (default 50/50).
- Report card fields: class position & class size, subject positions, conduct, interest, attitude, class-teacher and headteacher remarks, attendance "present out of opened", promoted-to / repeat decision (Term 3).
- Currency **GHS**; phone numbers normalised to `+233…`; mobile money (MTN MoMo, Telecel Cash, AT Money) is the default online payment path.
- Guardian phone is the identity for parents (OTP login). Many families share one number across siblings — one guardian record, many children.

## 4. Functional requirements

### 4.1 Platform & tenancy (PLT)
- **FR-PLT-01 MUST** Each school is an isolated tenant; every tenant row carries `schoolId`; no query may cross tenants (client extension + Postgres RLS).
- **FR-PLT-02 MUST** Platform admin creates a school (name, slug, region/town, admin email) → invitation email/SMS → admin sets password.
- **FR-PLT-03 MUST** Plans & subscriptions: Trial → Active → Past due → Cancelled; billing per student per term with a minimum; included SMS credits.
- **FR-PLT-04 SHOULD** Suspended school becomes read-only (parents can still view report cards already published).
- **FR-PLT-05 SHOULD** Audited "support access" into a tenant, time-boxed, visible to the school.
- **FR-PLT-06 MUST** School subdomain (`slug.schoolos.app`); custom domain LATER.

### 4.2 Authentication & access (AUTH)
- **FR-AUTH-01 MUST** Staff: email + password, forced change on first login, lockout after repeated failures.
- **FR-AUTH-02 MUST** Parents: phone number + SMS OTP; no password to forget.
- **FR-AUTH-03 MUST** Roles per school via `Membership`; a user may hold several roles or belong to several schools (school switcher).
- **FR-AUTH-04 MUST** Sessions expire; sensitive actions (reverse payment, publish reports, change grade bands) re-check role and are audit-logged.
- **FR-AUTH-05 SHOULD** Two-factor for admin/bursar roles.

### 4.3 School setup (SET)
- **FR-SET-01 MUST** School profile: name, logo, motto, address, phone, EMIS code, report-card header, SMS sender ID.
- **FR-SET-02 MUST** Academic years and three terms (dates, vacation date, reopening date); one current year/term at a time.
- **FR-SET-03 MUST** School calendar: holidays/closures so "days school opened" is correct.
- **FR-SET-04 MUST** Levels (seeded Nursery→JHS), classes/streams per level (e.g. *Primary 4 A/B*), class teacher, capacity.
- **FR-SET-05 MUST** Subjects and per-class subject assignment with teacher, per academic year.
- **FR-SET-06 MUST** Setup wizard with a completeness checklist ("Terms ✓, Classes ✓, Subjects ✗ …") on the admin dashboard.
- **FR-SET-07 MUST** Policies: withhold report cards if fees owed (off by default, threshold amount), attendance alert rules, lock scores after approval.

### 4.4 Students, guardians, staff, admissions (PPL)
- **FR-PPL-01 MUST** Student record: names, gender, DOB, photo, admission no. (auto, per-school format), nationality/religion/hometown, address, medical notes, previous school, documents, status (Active/Suspended/Withdrawn/Transferred/Graduated).
- **FR-PPL-02 MUST** Guardians: name, phone (+ alt), email, occupation; link to many students with relationship, primary, fee-payer, pick-up and SMS flags. Duplicate-phone detection when adding.
- **FR-PPL-03 MUST** Enrolment of a student into a class for a year; history preserved (promotion trail).
- **FR-PPL-04 MUST** Student list: search by name/admission no./phone, filter by level/class/status, export CSV/Excel.
- **FR-PPL-05 MUST** Bulk import students + guardians from Excel/CSV with a preview and row-level error report; downloadable template.
- **FR-PPL-06 MUST** Student profile with tabs: Overview · Guardians · Attendance · Results · Fees · Documents · Activity.
- **FR-PPL-07 MUST** Admissions pipeline: application → review → accepted/rejected → enrolled (creates student, guardian, class placement, optional admission invoice).
- **FR-PPL-08 SHOULD** Public online application form per school; applicant receives SMS reference.
- **FR-PPL-09 MUST** Staff directory (teacher/bursar/etc.), optional linked login; class-teacher and subject assignments visible.
- **FR-PPL-10 MUST** Year-end **promotion wizard**: per class choose Promote / Repeat / Graduate (JHS 3) / Withdraw, preview, confirm → creates next-year enrolments; reversible until the new year starts.
- **FR-PPL-11 MUST** Status changes (withdraw, transfer) require a reason and are audit-logged; financial history is never deleted.

### 4.5 Attendance (ATT) — *deep module*
- **FR-ATT-01 MUST** Daily class register: list of enrolled students, one tap per child cycles Present → Absent → Late → Excused; "Mark all present" then fix exceptions; optional remark.
- **FR-ATT-02 MUST** A teacher sees only their class; admin/head can mark any class and edit past days (audit-logged).
- **FR-ATT-03 MUST** "Submit register" records submission time; unsubmitted registers are visible to head/admin ("Primary 3 B has not taken attendance").
- **FR-ATT-04 MUST** Works on a phone in portrait; large tap targets; saves drafts locally if connection drops and syncs when back online.
- **FR-ATT-05 MUST** No marking on holidays/closures/weekends (configurable school days); date picker limited to the current term.
- **FR-ATT-06 MUST** Absence alert: on submit, SMS guardians of absent children using a template (editable), once per child per day, respecting the guardian's SMS flag and SMS credit balance.
- **FR-ATT-07 MUST** Reports: per student (calendar strip, % present, streak of absences), per class (daily grid for the term), school-wide daily summary (present %, absent count by class), term summary used on report cards (*days present / days opened*).
- **FR-ATT-08 MUST** Late arrivals count as present for the percentage but are reported separately.
- **FR-ATT-09 SHOULD** Chronic-absence flag (e.g. ≥3 consecutive days or <85%) surfaced on the head's dashboard with one-click message to guardian.
- **FR-ATT-10 SHOULD** Mid-day/late arrival and early pick-up note; QR/ID-card scan check-in LATER.
- **FR-ATT-11 SHOULD** Staff attendance (simple daily sign-in) — LATER if not needed for pilot.

### 4.6 Assessment & Report cards (RPT) — *deep module*
- **FR-RPT-01 MUST** Grading scales (score-band and rating) editable per school; assigned to levels via assessment schemes.
- **FR-RPT-02 MUST** Assessment scheme per level: named components (e.g. *Class Test 1*, *Project*, *Exam*) each with raw max and weight; weights must total 100 (validated).
- **FR-RPT-03 MUST** Score entry grid for a class + subject: students × components, keyboard navigation, paste from Excel, inline validation (0…max), unsaved-changes guard, autosave. Teachers can only enter their own subjects; blank ≠ zero (missing is flagged).
- **FR-RPT-04 MUST** Totals, grade, remark and subject position computed automatically; recalculated when any score changes.
- **FR-RPT-05 MUST** Class overall: total, average, position among classmates (ties share a position, next skips), computed only when required subjects are complete; incomplete students flagged, not silently ranked.
- **FR-RPT-06 MUST** Nursery/KG: rating per learning area/subject (no marks, no position by default); school can switch ranking on.
- **FR-RPT-07 MUST** Report remarks workflow: class teacher enters conduct, interest, attitude, remark → headteacher enters remark → **Approve** → **Publish**. Status per student: Draft → Submitted → Approved → Published.
- **FR-RPT-08 MUST** Completion tracker: matrix class × subject showing % scores entered, so the head can chase teachers before the deadline.
- **FR-RPT-09 MUST** Lock: after approval, scores for that term are locked; unlocking needs head/admin + reason (audited).
- **FR-RPT-10 MUST** Report card output: school header/logo, student photo & details, term & year, subject table (class score, exam, total, grade, position, remark), overall position, attendance, conduct/interest/attitude, remarks, promoted-to (Term 3), vacation/reopening dates, signature blocks, grading key. A4 PDF, one student or whole class (batch).
- **FR-RPT-11 MUST** Parent view of published cards in the portal + SMS "report ready" with link; download as PDF.
- **FR-RPT-12 MUST** Fee policy hook: if the school enables "withhold if owing", cards for debtors are published but hidden from the parent with a polite "please clear balance" notice; staff can override per student.
- **FR-RPT-13 SHOULD** Progress across terms (Term 1→3 chart) and cumulative annual summary on the Term 3 card.
- **FR-RPT-14 SHOULD** Class broadsheet (all subjects for all students) as printable/Excel; subject performance analysis (average, highest, lowest, grade distribution).
- **FR-RPT-15 SHOULD** Teacher comment bank (reusable remarks by grade band) to speed up writing.
- **FR-RPT-16 LATER** BECE mock tracking and WASSCE-style analysis.

### 4.7 Fees & payments (FEE) — *deep module*
- **FR-FEE-01 MUST** Fee items (Tuition, PTA, Feeding, Books, ICT, Uniform, Exam, …) with optional/mandatory flag.
- **FR-FEE-02 MUST** Fee structure per **term × level**: amount per item; some items apply only to new or continuing students.
- **FR-FEE-03 MUST** Copy last term's structure; bulk percentage increase with preview.
- **FR-FEE-04 MUST** Discounts/scholarships: percent or fixed, assigned per student (sibling, staff child, scholarship), with note and date range.
- **FR-FEE-05 MUST** Generate invoices for a term for a class/level/whole school: one invoice per student with lines = structure + **arrears brought forward** − discounts; preview before generating; idempotent (re-running never double-bills).
- **FR-FEE-06 MUST** Manual adjustment lines (e.g. add *Excursion GH₵ 50*, waive late charge) with reason; invoice cancel/re-issue keeps history.
- **FR-FEE-07 MUST** Record payment (bursar): student, amount, method (Cash / Bank deposit / Mobile money / Cheque / Card), reference, payer name & phone, date; auto-allocate to oldest unpaid invoice first, with manual override; part payments supported.
- **FR-FEE-08 MUST** Sequential **receipt numbers** per school per year; printable A5/thermal receipt with balance after payment; resend by SMS.
- **FR-FEE-09 MUST** Online payment: parent pays in the portal via mobile money / card (Paystack or Hubtel); webhook confirms, receipt auto-issued, idempotent on provider reference; failed/pending states visible.
- **FR-FEE-10 MUST** Payment reversal (bounced cheque, mistake): role-restricted, reason required, creates a reversal (never deletes), invoice balances recalculate, audit-logged.
- **FR-FEE-11 MUST** Overpayment is kept as student credit and offered against the next invoice.
- **FR-FEE-12 MUST** Student fee statement: all invoices, payments, adjustments, running balance; printable.
- **FR-FEE-13 MUST** Debtors report: filter by class/level/term/min amount/age; export; bulk SMS reminder with template (`{guardian}, {student} owes GH₵{balance}…`) respecting SMS credits.
- **FR-FEE-14 MUST** Collections dashboard: expected vs collected vs outstanding for the term, by class and by payment method, daily collections list, top debtors.
- **FR-FEE-15 MUST** Daily cash-up: bursar closes the day with totals per method; shows variance vs counted cash.
- **FR-FEE-16 SHOULD** Instalment plans (agreed dates) with reminders before due dates.
- **FR-FEE-17 SHOULD** Fee clearance letter / "cleared" flag for exams or transfer.
- **FR-FEE-18 LATER** Bank statement / MoMo statement import for reconciliation; expense tracking; accounting export.

### 4.8 Communication (MSG)
- **FR-MSG-01 MUST** SMS via provider abstraction (Arkesel/Hubtel); per-school sender ID; delivery status tracked.
- **FR-MSG-02 MUST** Templates with placeholders for: absence alert, fee reminder, receipt, report ready, general notice; editable per school with live preview and segment count.
- **FR-MSG-03 MUST** Bulk compose: audience by whole school / level / class / debtors / selected students → preview recipient count and credit cost → confirm.
- **FR-MSG-04 MUST** SMS credits ledger: allowance per term, top-ups, consumption per message; low-balance warning; block sends at zero (queue with notice).
- **FR-MSG-05 SHOULD** Announcements shown in the parent portal and optionally pushed by SMS.
- **FR-MSG-06 LATER** WhatsApp Business channel, in-app push notifications.

### 4.9 Parent portal (PAR) — mobile-first
- **FR-PAR-01 MUST** After OTP login: list of my children (across the school), switchable.
- **FR-PAR-02 MUST** Per child: today's attendance + term summary, published report cards (view/download), fee balance, invoices, payment history/receipts, **Pay now**.
- **FR-PAR-03 MUST** Announcements list.
- **FR-PAR-04 SHOULD** Update own contact details (goes to registrar for approval).
- **FR-PAR-05 MUST** Light on data: no heavy images, works on 3G, installable as a PWA.

### 4.10 Dashboards & reports (DSH)
- **Admin/Head dashboard MUST:** today's attendance (%, absent count, registers missing), term setup checklist, report-card completion, fees collected vs expected, alerts (chronic absence, unpaid invoices, low SMS credit).
- **Bursar dashboard MUST:** today's collections, outstanding total, debtors count, recent payments.
- **Teacher home MUST:** my classes today (take attendance), my subjects (score entry progress), my class remarks to-do.
- **Exports MUST:** every list/report exportable to Excel/CSV; report cards and receipts to PDF.

### 4.11 Audit & data protection (AUD)
- **FR-AUD-01 MUST** Audit log for payments (create/reverse), invoice changes, score edits after submission, grade-scale changes, report publish/unlock, status changes, role changes, logins to support access. Shows who, when, before → after.
- **FR-AUD-02 MUST** Children's data treated as sensitive: least-privilege roles, encrypted in transit and at rest, no student data in logs, parents see only their own children.
- **FR-AUD-03 MUST** Align with Ghana's **Data Protection Act, 2012 (Act 843)**: purpose limitation, consent text at admission, data subject access/export, retention policy, breach process. *(Confirm registration and legal specifics with counsel.)*
- **FR-AUD-04 MUST** Daily backups with tested restore; per-school data export on request.

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Attendance register for 40 pupils loads < 1.5 s on 3G; score grid for 60×4 cells saves < 1 s; batch PDF of 40 report cards < 60 s (queued job) |
| Availability | 99.5% monthly; scheduled maintenance outside school hours (Mon–Fri 07:00–15:00 GMT) |
| Offline | Attendance and score entry tolerate connection loss (local draft + sync with conflict notice) |
| Devices | Cheap Android (Chrome), desktop browsers at 1280 px; parent portal mobile-first at 360 px |
| Accessibility | WCAG AA contrast, tap targets ≥ 44 px, never colour-only status (use text/icons too) |
| Localisation | English first; date `dd MMM yyyy`; Twi/Ewe UI strings LATER |
| Security | OWASP ASVS L2 target, hashed passwords (bcrypt/argon2), OTP rate limiting, CSRF protection, secrets in env |
| Integrity | Money in Decimal(12,2); payments/receipts append-only; counters transactional so receipt numbers never duplicate |
| Scalability | Hundreds of schools × ≤ 1,500 students each on one Postgres; indexes lead with `schoolId` |
| Observability | Error tracking, structured logs without PII, SMS/payment webhook dashboards |

## 6. Key business rules (worth writing tests for)

1. **Ranking**: equal totals share a position and the next is skipped (1,2,2,4). Students with missing required scores get no position and are listed as "incomplete".
2. **Blank is not zero.** A missing score blocks totals/ranking until entered or marked "absent for exam" (counts 0, visibly).
3. **Invoice generation is idempotent** per student × term × structure version; arrears are carried once.
4. **Payments allocate oldest-first**; remainder becomes credit. No float arithmetic anywhere on money.
5. **Nothing financial is deleted** — cancel, reverse, adjust; each leaves a trail.
6. **Attendance percentage** = (present + late) / school days on which the register was submitted for that class.
7. **Withhold-report policy** compares current outstanding balance (all terms) to the school's threshold, evaluated at publish time and again at view time.
8. **Promotion** never changes past enrolments; it only adds the new year's enrolment.
9. **One guardian record per phone number per school**; sibling lists come from links, so parents see all children after one login.

## 7. Acceptance criteria — Phase 1 "definition of done" (pilot school)

- Admin sets up year, 3 terms, 13 levels, classes, subjects in ≤ 1 hour with the wizard.
- Registrar imports 300 students + guardians from Excel with < 5 min of fixes.
- A teacher takes attendance for 40 pupils in under 60 seconds on a phone; absent guardians receive SMS in under a minute.
- All teachers enter scores for a term; the completion tracker reaches 100%; head approves; 300 report cards print as one PDF; positions match a hand-calculated sample.
- Bursar generates term invoices for the whole school, records 20 mixed payments (cash, MoMo ref, part payments), prints receipts, and the debtors report matches the ledger to the pesewa.
- Parent logs in with phone OTP, sees two children, pays part of a fee via MoMo, and downloads a published report card.
- Audit log shows every one of those money/score/publish actions.

## 8. Roadmap

| Phase | Scope |
|---|---|
| **1 (MVP)** | Platform, auth, setup, students/guardians/staff, admissions, **attendance**, **report cards**, **fees**, SMS, parent portal, dashboards, audit |
| **2** | Timetable, staff attendance & leave, announcements/events, teacher comment bank, instalment plans, reconciliation imports, WhatsApp |
| **3** | Library, transport, boarding/hostel, inventory/uniform shop, e-learning/assignments, native mobile app, multi-branch groups |

## 9. Open questions to settle with the first pilot school

1. Exact grading/remark wording and weights they print today (get a real sample report card).
2. Do they rank Nursery/KG? Do Primary lower classes show positions?
3. Fee collection reality: how much arrives as cash vs MoMo vs bank? Who is allowed to reverse payments?
4. Which SMS provider and sender ID; who pays for SMS (school vs per-parent)?
5. Admission-number format and whether siblings share a family number.
6. Withhold-report policy: do they actually do it, and what threshold?
7. Per-student pricing acceptable? (Plan numbers in the seed are placeholders.)
