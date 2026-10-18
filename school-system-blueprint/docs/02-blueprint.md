# SchoolOS — Blueprint

How the product is put together: modules, roles, flows, routes, system layout, build order.
Pictures: `design/images/` (open `design/index.html` for the gallery). Screen IDs `W##` / diagrams `D##` are used throughout.

## 1. Module map

```
                  ┌───────────────────────── PLATFORM (Wodona Tech) ─────────────────────────┐
                  │  Schools · Plans · Subscriptions · Billing · Support access   (W02)      │
                  └───────────────────────────────────┬──────────────────────────────────────┘
                                                      │ one tenant per school (schoolId)
   ┌──────────────┬───────────────┬────────────────────┼───────────────────┬────────────────┐
   │  FOUNDATION  │  PEOPLE       │  ATTENDANCE        │  RESULTS          │  FEES          │
   │  Setup       │  Students     │  Register (W14)    │  Scheme/scale     │  Structure     │
   │  Calendar    │  Guardians    │  Today (W15)       │  Score entry      │  Invoices      │
   │  Classes     │  Staff        │  Class/student     │  Completion       │  Payments      │
   │  Subjects    │  Admissions   │  reports (W16/17)  │  Broadsheet       │  Receipts      │
   │  Users/roles │  Promotion    │  Absence SMS       │  Remarks/approve  │  Debtors       │
   │  Settings    │  Import       │                    │  Report cards     │  Collections   │
   └──────┬───────┴───────┬───────┴─────────┬──────────┴─────────┬─────────┴───────┬────────┘
          └───────────────┴──── COMMUNICATION (SMS, templates, credits) ────────────┘
                                   │                                        │
                        PARENT PORTAL (phone)                   AUDIT LOG · DASHBOARDS
```

## 2. Roles and what they see

| Capability | Admin | Head | Teacher | Bursar | Registrar | Parent |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| School settings, users | ✓ | | | | | |
| Years/terms/classes/subjects | ✓ | ✓ | | | | |
| Students & guardians (write) | ✓ | | | | ✓ | |
| Students (read) | ✓ | ✓ | own classes | ✓ | ✓ | own children |
| Admissions | ✓ | ✓ | | | ✓ | |
| Take attendance | ✓ | | own class | | | |
| View attendance reports | ✓ | ✓ | own class | | ✓ | own children |
| Enter scores | ✓ | | own subjects | | | |
| Remarks | ✓ | ✓ | class teacher | | | |
| Approve / publish / unlock reports | ✓ | ✓ | | | | |
| Fee structure & invoices | ✓ | | | ✓ | | |
| Record payments | ✓ | | | ✓ | | |
| Reverse payments | ✓ | | | | | |
| View fees | ✓ | ✓ | | ✓ | | own children |
| Send messages | ✓ | ✓ | | ✓ | ✓ | |
| Audit log | ✓ | ✓ | | | | |

Source of truth: `src/lib/permissions.ts`. "Own" rules are enforced in queries.

## 3. Core flows

### 3.1 Attendance (daily)
```
Teacher opens class register (W14) → marks exceptions → Submit
   → AttendanceRecord rows (upsert per student/date) + AttendanceSubmission(class,date)
   → job: for each ABSENT child → guardians with receivesSms → Message(QUEUED) → SMS provider
   → delivery webhook updates Message.status
Head sees unsubmitted classes (W15) → reminder to teacher
Term totals (present, late, days opened) feed TermReport at publish time (W23)
```

### 3.2 Report cards (term)
```
Scheme + scale set per level (W18)
Teacher enters raw scores per component (W19)  → Score rows
   → recompute: total = Σ(raw/max × weight) → grade by band → SubjectResult
   → per class: rank totals (ties share) → subject positions; overall position in TermReport
Class teacher writes conduct/remarks (W22)   status DRAFT → SUBMITTED
Head approves (W22)                           → APPROVED, Term.scoresLocked
Head publishes (W25)                          → PUBLISHED (+ withheld flag if fees policy), SMS "report ready"
Parent opens card (W43) / PDF (W23, W24)      → withhold re-evaluated live
```

### 3.3 Fees
```
Fee structure per term × level (W26)
Generate invoices (W27): per student → FEE lines + ARREARS line + DISCOUNT lines → Invoice ISSUED
Payment (counter W29 or online W44/W45):
   tx { next receiptNo ; insert Payment ; allocate oldest-first → PaymentAllocation ; update Invoice.amountPaid/balance/status }
   → receipt (W30) + SMS
Reversal: Payment.status=REVERSED + reason + audit; allocations removed; invoice balances recalculated
Debtors (W32) → reminder SMS ; Collections (W33) ; Cash-up (W34)
```

### 3.4 Online payment sequence
```
Parent taps Pay (W44) → server creates Payment(PENDING, providerRef) → Paystack/Hubtel charge (MoMo prompt, W45)
Provider webhook  → verify signature → lookup by providerRef (unique) → idempotent:
     PENDING→SUCCESS : allocate + receipt + SMS (W46)    |   PENDING→FAILED : show retry
Browser polls Payment.status only for display; the webhook is the source of truth.
```

## 4. Route map (App Router, grouped by audience)

| Group | Route | Screen |
|---|---|---|
| (public) | `/login` | W01, W01b |
| (platform) | `/platform/schools` · `plans` · `billing` | W02 |
| (staff) | `/` | W03, W03b, W40 (role-based home) |
| | `/students` · `/new` · `/import` · `/[id]` · `/promotion` | W07 · W09 · W10 · W08/W17 · W13 |
| | `/admissions` · `/staff` | W11 · W12 |
| | `/classes/[id]/attendance` | W14 |
| | `/attendance` · `/attendance/classes/[id]` | W15 · W16 |
| | `/results/entry` · `completion` · `broadsheet` · `reports/[classId]` · `publish` | W19 · W20 · W21 · W22 · W25 |
| | `/fees/structure` · `invoices` · `invoices/generate` · `payments/new` · `debtors` · `collections` · `cashup` | W26 · W28 · W27 · W29 · W32 · W33 · W34 |
| | `/messages` · `/messages/new` | W36 · W35 |
| | `/setup/calendar` · `classes` · `subjects` · `grading` | W04 · W05 · W06 · W18 |
| | `/settings` · `/settings/users` · `/audit` | W38 · W37 · W39 |
| (parent) | `/` · `/children/[id]/attendance` · `results` · `fees` · `/pay/[ref]` | W41 · W42 · W43 · W44 · W45/W46 |
| api | `/api/webhooks/paystack` · `/api/webhooks/sms` | payment + delivery callbacks |

Empty folders for all of these already exist under `src/app/`.

## 5. System layout (see D04)

- **One Next.js app** (TypeScript), role-aware route groups, server actions for mutations.
- **Domain services** (`src/lib`, later `src/domain/*`): pure functions first (`grading.ts`, `fees.ts`, `permissions.ts` are already written and tested), then Prisma-backed services that call them.
- **Tenant guard**: `forSchool(schoolId)` Prisma extension injects `schoolId`; Postgres Row-Level Security as a second layer; super-admin client is separate and never reachable from tenant handlers.
- **Jobs/queue**: absence & reminder SMS, batch PDF, webhook reconcile, nightly backup, invoice due reminders. Start with a DB-backed queue; move to Redis/worker when volume needs it.
- **Files**: S3-compatible bucket for photos/documents/PDF outputs (signed URLs).
- **Integrations behind interfaces**: `PaymentProvider` (Paystack, Hubtel), `SmsProvider` (Arkesel, Hubtel), `Mailer`.
- **PDF**: server-rendered HTML → PDF (headless Chromium) so the A4 report card and receipt match the wireframes exactly.
- **PWA** for teacher/parent: installable, cached shell, offline queue for attendance/score drafts.

## 6. Build order (suggested milestones)

| # | Milestone | Outcome | Wireframes |
|---|---|---|---|
| M0 | Project, CI, DB, auth, tenant guard, RBAC | Login works; one demo school | W01 |
| M1 | Setup + people | Year/terms/classes/subjects; students, guardians, import | W04–W13 |
| M2 | **Attendance** + SMS | Teacher register, absence SMS, head dashboard | W14–W17, W03, W40 |
| M3 | **Fees** core | Structure, invoices, counter payments, receipts, debtors | W26–W34 |
| M4 | **Report cards** | Scheme, score entry, ranking, remarks, approve, PDF | W18–W25 |
| M5 | Parent portal + online pay | OTP login, results, attendance, MoMo | W41–W46 |
| M6 | Messaging polish, audit, settings, platform billing | Launch readiness | W35–W39, W02 |
| M7 | Pilot school, hardening, pricing | First paying schools | — |

Rationale: attendance first (daily habit, quick win for parents), fees second (the money pain and buy-in from owners), report cards third (term-end peak; needs the most data and polish).

## 7. Risks and decisions to take early

| Risk | Mitigation |
|---|---|
| Schools' report cards all look different | Template-driven card (header, columns, wording) with per-school overrides; get 3 real samples before M4 |
| Grading rules vary (weights, ranking, KG) | Everything configurable per level; seeded defaults flagged as placeholders |
| Unreliable internet | PWA drafts, small payloads, SMS as notification channel |
| SMS cost/deliverability | Credit ledger, per-school sender ID, provider abstraction, show cost before send |
| Payment reconciliation errors | Append-only payments, idempotent webhooks, daily cash-up, audit log |
| Data protection (children's data) | Least privilege, encryption, retention policy, registration/consent review with counsel |
| Scope creep (timetable, library, hostel…) | Roadmap phases; MVP = attendance + report cards + fees |

## 8. Screen index

Open `design/index.html` for thumbnails. Files: `design/images/<ID>-<slug>.png`.

| Group | Screens |
|---|---|
| Blueprint diagrams | D01 sitemap · D02 term lifecycle · D03 data model · D04 architecture |
| Platform & access | W01 sign-in · W01b parent OTP · W02 platform schools |
| Dashboards | W03 admin/head · W03b bursar · W40 teacher (phone) |
| Setup | W04 calendar · W05 classes · W06 subjects · W18 grading |
| People | W07 list · W08 profile · W09 add · W10 import · W11 admissions · W12 staff · W13 promotion |
| Attendance | W14 take (phone) · W15 today · W16 class report · W17 student |
| Report cards | W19 score entry · W20 completion · W21 broadsheet · W22 remarks/approval · W23 JHS card · W24 KG card · W25 publish |
| Fees | W26 structure · W27 generate · W28 invoices · W29 record payment · W30 receipt · W31 statement · W32 debtors · W33 collections · W34 cash-up |
| Communication | W35 compose · W36 log & credits |
| Administration | W37 users · W38 settings · W39 audit |
| Parent (phone) | W41 home · W42 attendance · W43 report card · W43b withheld · W44 fees · W45 MoMo prompt · W46 success |
