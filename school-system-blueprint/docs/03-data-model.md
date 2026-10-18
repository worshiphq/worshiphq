# SchoolOS — Data model

Source of truth: `prisma/schema.prisma` (43 models, 20 enums). Verified: `prisma validate` passes, `prisma db push` succeeds on PostgreSQL 16, and `prisma/seed.ts` runs twice without error (idempotent) producing 13 levels, 3 grading scales (18 bands) and 13 assessment schemes (22 components).

## Core relationships

```mermaid
erDiagram
  School ||--o{ Membership : has
  User ||--o{ Membership : "role per school"
  School ||--o{ AcademicYear : has
  AcademicYear ||--|{ Term : has
  School ||--o{ Level : has
  Level ||--o{ Class : has
  Class ||--o{ ClassSubject : "taught as"
  Subject ||--o{ ClassSubject : ""
  Staff ||--o{ ClassSubject : teaches
  School ||--o{ Student : enrols
  Student ||--o{ StudentGuardian : ""
  Guardian ||--o{ StudentGuardian : ""
  Student ||--o{ Enrollment : "per year"
  Class ||--o{ Enrollment : ""
  Student ||--o{ AttendanceRecord : "unique per day"
  Class ||--o{ AttendanceSubmission : "register taken"
  Level ||--|| AssessmentScheme : uses
  AssessmentScheme ||--|{ SchemeComponent : ""
  GradingScale ||--|{ GradeBand : ""
  Student ||--o{ Score : ""
  SchemeComponent ||--o{ Score : ""
  ClassSubject ||--o{ Score : ""
  Student ||--o{ SubjectResult : "cached"
  Student ||--o{ TermReport : "per term"
  Term ||--o{ FeeStructureLine : ""
  Level ||--o{ FeeStructureLine : ""
  FeeItem ||--o{ FeeStructureLine : ""
  Student ||--o{ Invoice : ""
  Invoice ||--|{ InvoiceLine : ""
  Student ||--o{ Payment : ""
  Payment ||--o{ PaymentAllocation : ""
  Invoice ||--o{ PaymentAllocation : ""
  Guardian ||--o{ Message : "sms"
```

## Design decisions (and why)

| Decision | Why |
|---|---|
| `schoolId` on every tenant table, `forSchool()` Prisma extension, RLS later | One bug must never leak another school's children or money |
| `Enrollment` (student × class × year) instead of `Student.classId` | Promotion adds rows; history and past report cards never change |
| `ClassSubject` carries year + teacher | Teacher changes don't rewrite old results; drives score-entry permission |
| `Score` per component, `SubjectResult` cached | Raw marks stay editable/auditable; ranking queries stay fast |
| Blank score = no row / null, not 0 | "Incomplete" must be visible and block ranking |
| `GradingScale.kind` SCORE_BAND vs RATING | Same engine serves JHS/Primary (scores) and Nursery/KG (descriptors) |
| `AssessmentScheme` unique per `Level` | Each level has exactly one active build-up (editable weights, validated to 100) |
| `Payment` + `PaymentAllocation` + denormalised `Invoice.amountPaid/balance` | Part payments, multi-term payments, fast debtors queries; allocation is the audit trail |
| Payments never deleted: `REVERSED` + reason + `reversedBy` | Financial integrity; matches bursar workflows |
| `DocumentSequence(schoolId, key)` | Transactional receipt/invoice/admission numbers without duplicates (`receipt:2027`) |
| `AttendanceRecord` unique(student, date) | No double marking; edits are upserts + audit |
| `AttendanceSubmission` unique(class, date) | Distinguishes "all present" from "register not taken" |
| `TermReport.withheld` + settings JSON | Fees policy is per-school and evaluated live, stored for staff overrides |
| `Guardian` unique(school, phone) | Siblings share one parent login; duplicate detection at entry |
| Money `Decimal(12,2)`, no floats | Pesewa-exact totals (see `tests/fees.test.ts`) |
| Platform tables (`Plan`, `Subscription`, `PlatformInvoice`) separate from tenant data | Your SaaS billing; no schoolId needed on Plan |

## Invariants worth enforcing in service code / tests

1. Σ `SchemeComponent.weight` for a scheme = 100.
2. `GradeBand`s of a SCORE_BAND scale cover 0–100 without gaps/overlap.
3. `Invoice.total = subtotal − discountTotal`; `balance = total − Σ allocations(SUCCESS payments)`.
4. A SUCCESS payment's allocations sum ≤ amount; the remainder is student credit.
5. A student has at most one Enrollment per academic year.
6. `AttendanceRecord.date` must be a school day in the term (not a `CalendarDay` holiday/closure).
7. A teacher may write `Score`/`AttendanceRecord` only for classes/subjects assigned to them.
8. Published `TermReport` → term scores locked; unlock requires reason + audit entry.

## Known gaps to decide before build

- **Row-Level Security** policies are not in the schema file — add as a raw SQL migration when the auth layer exists.
- **Term-level lock** is a flag on `Term` (`scoresLocked`); per-class locking may be wanted.
- **Family grouping** for sibling discounts is derived through shared guardians; add an explicit `Family` model only if schools need non-phone-based grouping.
- **Boarding, transport, library, timetable, payroll, expenses** deliberately absent (Phase 2/3).
- **Report-card templates**: layout is code-driven today; a per-school template table (header text, column set, wording) is a likely addition during M4.
- **Seeded grade bands** (JHS 1–9, Primary proficiency bands, KG ratings) are placeholders — confirm with the pilot school and current GES/NaCCA guidance.
