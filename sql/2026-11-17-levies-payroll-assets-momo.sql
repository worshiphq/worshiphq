-- WorshipHQ November 2026 batch: hidden QA church, levies + service income, staff + payroll, assets + vehicles + maintenance + expenses upgrade.
-- Additive only (new tables and columns). Safe to run more than once. Run this in the Supabase SQL editor BEFORE deploying the code.
BEGIN;

-- ===== sql/internal-churches.sql =====
-- Hidden internal QA church flag. Safe to run more than once.
-- Run this BEFORE deploying the code that reads Church.isInternal.
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;


-- ===== sql/levies-and-service-income.sql =====
-- Levies (remittances to head office, district, area or denomination) and service income records.
-- Run in the Supabase SQL editor BEFORE pushing the code: the Prisma client reads the new columns on Gift, Fund and Church.
-- Additive only and safe to re-run.

CREATE TABLE IF NOT EXISTS "ServiceIncome" (
  "id"            TEXT NOT NULL,
  "churchId"      TEXT NOT NULL,
  "date"          TIMESTAMP(3) NOT NULL,
  "serviceName"   TEXT NOT NULL,
  "sessionId"     TEXT,
  "slotId"        TEXT,
  "headcount"     INTEGER,
  "countedBy"     TEXT,
  "note"          TEXT,
  "createdById"   TEXT,
  "createdByName" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceIncome_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceIncome_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceIncome_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ServiceIncome_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ServiceSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ServiceIncome_churchId_date_idx" ON "ServiceIncome" ("churchId", "date");
CREATE INDEX IF NOT EXISTS "ServiceIncome_sessionId_idx" ON "ServiceIncome" ("sessionId");

ALTER TABLE "Gift" ADD COLUMN IF NOT EXISTS "serviceIncomeId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Gift" ADD CONSTRAINT "Gift_serviceIncomeId_fkey" FOREIGN KEY ("serviceIncomeId") REFERENCES "ServiceIncome"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Gift_churchId_serviceIncomeId_idx" ON "Gift" ("churchId", "serviceIncomeId");

ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "inServiceSheet" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "levyRemindOn"      BOOLEAN   NOT NULL DEFAULT true;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "levyRemindDays"    INTEGER[] NOT NULL DEFAULT ARRAY[7, 1]::INTEGER[];
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "levyRemindSms"     BOOLEAN   NOT NULL DEFAULT false;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "levyRemindUserIds" TEXT[]    NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "levyAutoClose"     BOOLEAN   NOT NULL DEFAULT true;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "levySchedule"      JSONB;   -- a main church's suggested levies for its linked churches

CREATE TABLE IF NOT EXISTS "LevyRule" (
  "id"             TEXT NOT NULL,
  "churchId"       TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "payee"          TEXT NOT NULL,
  "payeeKind"      TEXT NOT NULL DEFAULT 'hq',
  "payeeChurchId"  TEXT,
  "frequency"      TEXT NOT NULL DEFAULT 'monthly',
  "yearStartMonth" INTEGER NOT NULL DEFAULT 1,
  "dueDays"        INTEGER NOT NULL DEFAULT 15,
  "startsOn"       TIMESTAMP(3) NOT NULL,
  "endsOn"         TIMESTAMP(3),
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "afterRuleId"    TEXT,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "templateKey"    TEXT,
  "notes"          TEXT,
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LevyRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LevyRule_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LevyRule_payeeChurchId_fkey" FOREIGN KEY ("payeeChurchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LevyRule_afterRuleId_fkey" FOREIGN KEY ("afterRuleId") REFERENCES "LevyRule"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LevyRule_churchId_active_idx" ON "LevyRule" ("churchId", "active");
CREATE INDEX IF NOT EXISTS "LevyRule_payeeChurchId_idx" ON "LevyRule" ("payeeChurchId");

CREATE TABLE IF NOT EXISTS "LevyRuleVersion" (
  "id"            TEXT NOT NULL,
  "churchId"      TEXT NOT NULL,
  "ruleId"        TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "kind"          TEXT NOT NULL,
  "rate"          DECIMAL(7,4),
  "fixedAmount"   DECIMAL(12,2),
  "allIncome"     BOOLEAN NOT NULL DEFAULT false,
  "sources"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "minAmount"     DECIMAL(12,2),
  "maxAmount"     DECIMAL(12,2),
  "createdById"   TEXT,
  "createdByName" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LevyRuleVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LevyRuleVersion_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LevyRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "LevyRule"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LevyRuleVersion_ruleId_effectiveFrom_idx" ON "LevyRuleVersion" ("ruleId", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "LevyRuleVersion_churchId_idx" ON "LevyRuleVersion" ("churchId");

-- Permanent change history: no link to the rule or the user, so it outlives both.
CREATE TABLE IF NOT EXISTS "LevyRuleChange" (
  "id"        TEXT NOT NULL,
  "churchId"  TEXT NOT NULL,
  "ruleId"    TEXT NOT NULL,
  "ruleName"  TEXT NOT NULL,
  "action"    TEXT NOT NULL,
  "summary"   TEXT NOT NULL,
  "before"    JSONB,
  "after"     JSONB,
  "byUserId"  TEXT,
  "byName"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LevyRuleChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LevyRuleChange_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LevyRuleChange_churchId_createdAt_idx" ON "LevyRuleChange" ("churchId", "createdAt");
CREATE INDEX IF NOT EXISTS "LevyRuleChange_ruleId_idx" ON "LevyRuleChange" ("ruleId");

CREATE TABLE IF NOT EXISTS "LevyRecord" (
  "id"            TEXT NOT NULL,
  "churchId"      TEXT NOT NULL,
  "ruleId"        TEXT NOT NULL,
  "periodKey"     TEXT NOT NULL,
  "periodStart"   TIMESTAMP(3) NOT NULL,
  "periodEnd"     TIMESTAMP(3) NOT NULL,
  "dueDate"       TIMESTAMP(3) NOT NULL,
  "state"         TEXT NOT NULL DEFAULT 'open',
  "incomeBase"    DECIMAL(14,2) NOT NULL DEFAULT 0,
  "calculated"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "adjustments"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amountDue"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amountPaid"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "breakdown"     JSONB,
  "calculatedAt"  TIMESTAMP(3),
  "closedAt"      TIMESTAMP(3),
  "closedById"    TEXT,
  "closedByName"  TEXT,
  "driftAmount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "driftAccepted" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "remindersSent" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "note"          TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LevyRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LevyRecord_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LevyRecord_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "LevyRule"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LevyRecord_ruleId_periodKey_key" ON "LevyRecord" ("ruleId", "periodKey");
CREATE INDEX IF NOT EXISTS "LevyRecord_churchId_periodStart_idx" ON "LevyRecord" ("churchId", "periodStart");
CREATE INDEX IF NOT EXISTS "LevyRecord_churchId_state_dueDate_idx" ON "LevyRecord" ("churchId", "state", "dueDate");

CREATE TABLE IF NOT EXISTS "LevyAdjustment" (
  "id"            TEXT NOT NULL,
  "churchId"      TEXT NOT NULL,
  "recordId"      TEXT NOT NULL,
  "amount"        DECIMAL(12,2) NOT NULL,
  "kind"          TEXT NOT NULL,
  "reason"        TEXT NOT NULL,
  "fromRecordId"  TEXT,
  "createdById"   TEXT,
  "createdByName" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LevyAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LevyAdjustment_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LevyAdjustment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "LevyRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LevyAdjustment_recordId_idx" ON "LevyAdjustment" ("recordId");
CREATE INDEX IF NOT EXISTS "LevyAdjustment_churchId_idx" ON "LevyAdjustment" ("churchId");

CREATE TABLE IF NOT EXISTS "LevyPayment" (
  "id"                    TEXT NOT NULL,
  "churchId"              TEXT NOT NULL,
  "recordId"              TEXT NOT NULL,
  "amount"                DECIMAL(12,2) NOT NULL,
  "paidOn"                TIMESTAMP(3) NOT NULL,
  "method"                TEXT NOT NULL DEFAULT 'bank',
  "reference"             TEXT,
  "accountId"             TEXT,
  "expenseId"             TEXT,
  "proofKey"              TEXT,
  "proofName"             TEXT,
  "proofType"             TEXT,
  "note"                  TEXT,
  "recordedById"          TEXT,
  "recordedByName"        TEXT,
  "parentConfirmedAt"     TIMESTAMP(3),
  "parentConfirmedByName" TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LevyPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LevyPayment_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LevyPayment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "LevyRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LevyPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChurchAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LevyPayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LevyPayment_expenseId_key" ON "LevyPayment" ("expenseId");
CREATE INDEX IF NOT EXISTS "LevyPayment_recordId_idx" ON "LevyPayment" ("recordId");
CREATE INDEX IF NOT EXISTS "LevyPayment_churchId_paidOn_idx" ON "LevyPayment" ("churchId", "paidOn");

ALTER TABLE "ServiceIncome"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LevyRule"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LevyRuleVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LevyRuleChange"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LevyRecord"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LevyAdjustment"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LevyPayment"     ENABLE ROW LEVEL SECURITY;


-- ===== sql/staff-payroll.sql =====
-- Staff & Payroll (Max). Additive only. Safe to run more than once.
-- Run BEFORE deploying the code. Afterwards run `npx prisma generate` locally (no DB access needed).

-- ── Existing tables: new columns ──
ALTER TABLE "User"        ADD COLUMN IF NOT EXISTS "payrollAccess"   TEXT;                       -- null | 'view' | 'manage'
ALTER TABLE "User"        ADD COLUMN IF NOT EXISTS "staffPortalOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense"     ADD COLUMN IF NOT EXISTS "payrollRunId"    TEXT;
ALTER TABLE "Expense"     ADD COLUMN IF NOT EXISTS "staffLoanId"     TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "payrollRunId"    TEXT;

-- ── Staff ──
CREATE TABLE IF NOT EXISTS "StaffMember" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "personId" TEXT,
  "userId" TEXT,
  "staffNo" TEXT,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "otherNames" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "jobTitle" TEXT,
  "departmentId" TEXT,
  "employmentType" TEXT NOT NULL DEFAULT 'full_time',
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "endReason" TEXT,
  "reportsToUserId" TEXT,
  "emergencyName" TEXT,
  "emergencyPhone" TEXT,
  "emergencyRelation" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffMember_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StaffMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StaffMember_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StaffMember_reportsToUserId_fkey" FOREIGN KEY ("reportsToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffMember_personId_key" ON "StaffMember"("personId");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffMember_userId_key" ON "StaffMember"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffMember_churchId_staffNo_key" ON "StaffMember"("churchId","staffNo");
CREATE INDEX IF NOT EXISTS "StaffMember_churchId_status_idx" ON "StaffMember"("churchId","status");
CREATE INDEX IF NOT EXISTS "StaffMember_departmentId_idx" ON "StaffMember"("departmentId");

-- Pay setup + everything payroll-only (IDs, payout). Kept in its own table so staff-directory queries never touch it.
CREATE TABLE IF NOT EXISTS "StaffPayProfile" (
  "staffId" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "basicSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "payFrequency" TEXT NOT NULL DEFAULT 'monthly',
  "ssnitApplies" BOOLEAN NOT NULL DEFAULT true,
  "tier2Applies" BOOLEAN NOT NULL DEFAULT true,
  "payeApplies" BOOLEAN NOT NULL DEFAULT true,
  "isClergy" BOOLEAN NOT NULL DEFAULT false,
  "taxResident" BOOLEAN NOT NULL DEFAULT true,
  "ssnitNoSealed" TEXT, "ssnitNoLast4" TEXT,
  "tinSealed" TEXT, "tinLast4" TEXT,
  "ghanaCardSealed" TEXT, "ghanaCardLast4" TEXT,
  "payoutMethod" TEXT NOT NULL DEFAULT 'bank',          -- bank | momo | cash | cheque
  "bankName" TEXT, "bankBranch" TEXT, "accountName" TEXT,
  "accountNoSealed" TEXT, "accountNoLast4" TEXT,
  "momoNetwork" TEXT, "momoNoSealed" TEXT, "momoNoLast4" TEXT,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffPayProfile_pkey" PRIMARY KEY ("staffId"),
  CONSTRAINT "StaffPayProfile_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffPayProfile_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StaffPayProfile_churchId_idx" ON "StaffPayProfile"("churchId");

CREATE TABLE IF NOT EXISTS "StaffLoan" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "ref" TEXT NOT NULL,                                   -- L-0001 (shown in the ledger instead of the name)
  "kind" TEXT NOT NULL DEFAULT 'loan',                   -- loan | advance
  "label" TEXT NOT NULL,
  "principal" DECIMAL(12,2) NOT NULL,
  "installment" DECIMAL(12,2) NOT NULL,
  "balance" DECIMAL(12,2) NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startPeriod" TEXT NOT NULL,                           -- YYYY-MM first month recovered
  "status" TEXT NOT NULL DEFAULT 'active',               -- active | cleared | written_off
  "accountId" TEXT,
  "note" TEXT,
  "createdById" TEXT, "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffLoan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffLoan_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffLoan_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffLoan_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChurchAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffLoan_churchId_ref_key" ON "StaffLoan"("churchId","ref");
CREATE INDEX IF NOT EXISTS "StaffLoan_staffId_status_idx" ON "StaffLoan"("staffId","status");

CREATE TABLE IF NOT EXISTS "StaffPayItem" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,                                  -- earning | deduction
  "code" TEXT NOT NULL,                                  -- housing|transport|fuel|utility|other | welfare|union|tier3|other
  "label" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "taxable" BOOLEAN NOT NULL DEFAULT true,               -- earnings: counts for PAYE
  "ssnitable" BOOLEAN NOT NULL DEFAULT false,            -- earnings: counts for SSNIT (basic only, by default)
  "preTax" BOOLEAN NOT NULL DEFAULT false,               -- deductions: reduces taxable income (e.g. Tier 3)
  "remitted" BOOLEAN NOT NULL DEFAULT false,             -- deductions: paid over to a third party (posted as an expense when paid over)
  "fromPeriod" TEXT, "toPeriod" TEXT,                    -- YYYY-MM, inclusive; null = open
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffPayItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffPayItem_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffPayItem_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StaffPayItem_staffId_idx" ON "StaffPayItem"("staffId");
CREATE INDEX IF NOT EXISTS "StaffPayItem_churchId_idx" ON "StaffPayItem"("churchId");

CREATE TABLE IF NOT EXISTS "StaffDocument" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'contract',               -- contract | id | certificate | other
  "name" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  "payrollOnly" BOOLEAN NOT NULL DEFAULT true,
  "uploadedById" TEXT, "uploadedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffDocument_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffDocument_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StaffDocument_staffId_idx" ON "StaffDocument"("staffId");
CREATE INDEX IF NOT EXISTS "StaffDocument_churchId_idx" ON "StaffDocument"("churchId");

CREATE TABLE IF NOT EXISTS "StaffAttendance" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "clockIn" TIMESTAMP(3), "clockOut" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'present',              -- present | late | absent | leave | holiday
  "source" TEXT NOT NULL DEFAULT 'manual',               -- manual | device | self
  "deviceId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffAttendance_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffAttendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffAttendance_staffId_date_key" ON "StaffAttendance"("staffId","date");
CREATE INDEX IF NOT EXISTS "StaffAttendance_churchId_date_idx" ON "StaffAttendance"("churchId","date");

-- ── Settings ──
CREATE TABLE IF NOT EXISTS "PayrollSettings" (
  "churchId" TEXT NOT NULL,
  "ssnitEmployeePct" DECIMAL(6,3) NOT NULL DEFAULT 5.5,
  "ssnitEmployerPct" DECIMAL(6,3) NOT NULL DEFAULT 13,
  "tier1Pct" DECIMAL(6,3) NOT NULL DEFAULT 13.5,
  "tier2Pct" DECIMAL(6,3) NOT NULL DEFAULT 5,
  "ssnitMonthlyCap" DECIMAL(12,2),
  "statutoryMode" TEXT NOT NULL DEFAULT 'ghana',         -- ghana | none (churches outside Ghana)
  "workingDaysRule" TEXT NOT NULL DEFAULT 'weekdays',    -- weekdays | fixed
  "fixedWorkingDays" INTEGER NOT NULL DEFAULT 22,
  "postingMode" TEXT NOT NULL DEFAULT 'split',           -- split (net now, statutory when paid over) | together
  "salaryCategory" TEXT NOT NULL DEFAULT 'Salaries and wages',
  "ssnitCategory" TEXT NOT NULL DEFAULT 'SSNIT and pension',
  "payeCategory" TEXT NOT NULL DEFAULT 'PAYE income tax',
  "deductionsCategory" TEXT NOT NULL DEFAULT 'Staff deductions paid over',
  "loansCategory" TEXT NOT NULL DEFAULT 'Staff loans and advances',
  "defaultAccountId" TEXT,
  "employerSsnitNo" TEXT, "employerTin" TEXT,
  "makerChecker" TEXT NOT NULL DEFAULT 'auto',           -- auto | always
  "portalOn" BOOLEAN NOT NULL DEFAULT true,
  "smsShowAmounts" BOOLEAN NOT NULL DEFAULT false,
  "payslipNote" TEXT,
  "staffNoPrefix" TEXT NOT NULL DEFAULT 'ST',
  "staffSeq" INTEGER NOT NULL DEFAULT 0,
  "loanSeq" INTEGER NOT NULL DEFAULT 0,
  "selfClockOn" BOOLEAN NOT NULL DEFAULT false,
  "remindersOn" BOOLEAN NOT NULL DEFAULT true,
  "budgetLinkOn" BOOLEAN NOT NULL DEFAULT false,
  "bonusTaxMode" TEXT NOT NULL DEFAULT 'normal',
  "bonusRatePct" DECIMAL(6,3) NOT NULL DEFAULT 5,
  "bonusCapPct" DECIMAL(6,3) NOT NULL DEFAULT 15,
  "overtimeTaxMode" TEXT NOT NULL DEFAULT 'normal',
  "overtimeLowPct" DECIMAL(6,3) NOT NULL DEFAULT 5,
  "overtimeHighPct" DECIMAL(6,3) NOT NULL DEFAULT 10,
  "overtimeQualifyMax" DECIMAL(12,2),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("churchId"),
  CONSTRAINT "PayrollSettings_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PayeBandSet" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "bands" JSONB NOT NULL,                                -- [{ "width": 490, "pct": 0 }, ..., { "width": null, "pct": 35 }]
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayeBandSet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayeBandSet_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PayeBandSet_churchId_effectiveFrom_idx" ON "PayeBandSet"("churchId","effectiveFrom");

CREATE TABLE IF NOT EXISTS "PayrollHoliday" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "PayrollHoliday_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollHoliday_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollHoliday_churchId_date_key" ON "PayrollHoliday"("churchId","date");

-- ── Runs ──
CREATE TABLE IF NOT EXISTS "PayrollRun" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,                              -- 1-12
  "kind" TEXT NOT NULL DEFAULT 'regular',                -- regular | supplementary
  "regularKey" TEXT,                                     -- 'YYYY-MM' while a regular run is live; null for supplementary/reversed
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',                -- draft | review | approved | paid | reversed
  "payDate" TIMESTAMP(3),
  "accountId" TEXT,
  "fundId" TEXT,
  "rules" JSONB NOT NULL,                                -- frozen rates + PAYE bands used
  "headcount" INTEGER NOT NULL DEFAULT 0,
  "gross" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "ssnitEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "ssnitEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paye" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "otherDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "employerCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "preparedById" TEXT, "preparedByName" TEXT, "preparedAt" TIMESTAMP(3),
  "lastEditedById" TEXT,
  "submittedById" TEXT, "submittedByName" TEXT, "submittedAt" TIMESTAMP(3),
  "approvedById" TEXT, "approvedByName" TEXT, "approvedAt" TIMESTAMP(3), "selfApproved" BOOLEAN NOT NULL DEFAULT false,
  "paidById" TEXT, "paidByName" TEXT, "paidAt" TIMESTAMP(3),
  "reversedById" TEXT, "reversedByName" TEXT, "reversedAt" TIMESTAMP(3),
  "reversalMode" TEXT, "reversalReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollRun_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PayrollRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChurchAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_churchId_regularKey_key" ON "PayrollRun"("churchId","regularKey");
CREATE INDEX IF NOT EXISTS "PayrollRun_churchId_year_month_idx" ON "PayrollRun"("churchId","year","month");

CREATE TABLE IF NOT EXISTS "PayrollLine" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "staffId" TEXT,
  "staffNo" TEXT, "staffName" TEXT NOT NULL, "jobTitle" TEXT,
  "departmentId" TEXT, "departmentName" TEXT, "employmentType" TEXT,
  "payoutMethod" TEXT, "payoutLabel" TEXT,               -- masked, e.g. "MTN MoMo ending 4821"
  "basic" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "gross" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "ssnitBase" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxableIncome" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "ssnitEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "ssnitEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tier1" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tier2" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paye" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "preTaxDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "otherDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "employerCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "specialTax" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "ssnitApplies" BOOLEAN NOT NULL DEFAULT true,
  "payeApplies" BOOLEAN NOT NULL DEFAULT true,
  "unpaidDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "workingDays" INTEGER NOT NULL DEFAULT 22,
  "excluded" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "emailedAt" TIMESTAMP(3), "smsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollLine_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PayrollLine_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollLine_runId_staffId_key" ON "PayrollLine"("runId","staffId");
CREATE INDEX IF NOT EXISTS "PayrollLine_churchId_staffId_idx" ON "PayrollLine"("churchId","staffId");

CREATE TABLE IF NOT EXISTS "PayrollLineItem" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,                                  -- earning | deduction
  "code" TEXT NOT NULL,                                  -- basic|housing|...|bonus|overtime|unpaid_leave | welfare|loan|advance|tier3|other
  "label" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,                       -- signed for unpaid_leave (negative earning)
  "taxable" BOOLEAN NOT NULL DEFAULT true,
  "ssnitable" BOOLEAN NOT NULL DEFAULT false,
  "preTax" BOOLEAN NOT NULL DEFAULT false,
  "remitted" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL DEFAULT 'recurring',            -- recurring | oneoff | loan | leave
  "payItemId" TEXT, "loanId" TEXT, "leaveRequestId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PayrollLineItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollLineItem_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PayrollLineItem_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "PayrollLine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PayrollLineItem_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "StaffLoan"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PayrollLineItem_lineId_idx" ON "PayrollLineItem"("lineId");
CREATE INDEX IF NOT EXISTS "PayrollLineItem_loanId_idx" ON "PayrollLineItem"("loanId");

CREATE TABLE IF NOT EXISTS "PayrollPosting" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,                                  -- net_pay | ssnit | paye | deductions
  "label" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',              -- pending | posted | reversed
  "dueDate" TIMESTAMP(3),
  "accountId" TEXT,
  "expenseId" TEXT,
  "transactionId" TEXT,
  "reference" TEXT,
  "postedAt" TIMESTAMP(3), "postedById" TEXT,
  "reversedAt" TIMESTAMP(3),
  "budgetEntryId" TEXT,
  "remindedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollPosting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollPosting_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PayrollPosting_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PayrollPosting_runId_idx" ON "PayrollPosting"("runId");
CREATE INDEX IF NOT EXISTS "PayrollPosting_churchId_status_idx" ON "PayrollPosting"("churchId","status");

-- Payroll's own permanent trail (AuditLog rows are deleted with the user; these never are).
CREATE TABLE IF NOT EXISTS "PayrollEvent" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "runId" TEXT,
  "staffId" TEXT,
  "action" TEXT NOT NULL,
  "actorId" TEXT, "actorName" TEXT,
  "detail" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayrollEvent_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PayrollEvent_churchId_createdAt_idx" ON "PayrollEvent"("churchId","createdAt");
CREATE INDEX IF NOT EXISTS "PayrollEvent_runId_idx" ON "PayrollEvent"("runId");

-- ── Leave ──
CREATE TABLE IF NOT EXISTS "LeaveType" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "daysPerYear" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "paid" BOOLEAN NOT NULL DEFAULT true,
  "carryOverMax" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "color" TEXT NOT NULL DEFAULT '#6D5EF8',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeaveType_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LeaveType_churchId_name_key" ON "LeaveType"("churchId","name");

CREATE TABLE IF NOT EXISTS "LeaveRequest" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "days" DECIMAL(5,2) NOT NULL,
  "halfDay" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',              -- pending | approved | declined | cancelled
  "requestedById" TEXT, "requestedByName" TEXT,
  "decidedById" TEXT, "decidedByName" TEXT, "decidedAt" TIMESTAMP(3), "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeaveRequest_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeaveRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LeaveRequest_churchId_status_idx" ON "LeaveRequest"("churchId","status");
CREATE INDEX IF NOT EXISTS "LeaveRequest_staffId_startDate_idx" ON "LeaveRequest"("staffId","startDate");

CREATE TABLE IF NOT EXISTS "LeaveAdjustment" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "days" DECIMAL(5,2) NOT NULL,                          -- + opening balance / carry-over, - correction
  "note" TEXT,
  "byId" TEXT, "byName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeaveAdjustment_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeaveAdjustment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeaveAdjustment_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LeaveAdjustment_staffId_year_idx" ON "LeaveAdjustment"("staffId","year");

-- ── New FKs on existing tables (DO blocks so a re-run is harmless) ──
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_staffLoanId_fkey" FOREIGN KEY ("staffLoanId") REFERENCES "StaffLoan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Expense_payrollRunId_idx" ON "Expense"("payrollRunId");
CREATE INDEX IF NOT EXISTS "Expense_staffLoanId_idx" ON "Expense"("staffLoanId");
CREATE INDEX IF NOT EXISTS "Transaction_payrollRunId_idx" ON "Transaction"("payrollRunId");

-- ── Close the Supabase public API to the new tables (same as scripts/enable-rls.mjs) ──
ALTER TABLE "StaffMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffPayProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffLoan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffPayItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayeBandSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollHoliday" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollLineItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollPosting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveAdjustment" ENABLE ROW LEVEL SECURITY;


-- ===== sql/assets-fleet-expenses.sql =====
-- Assets, vehicles, maintenance, and expense upgrades. Additive only. Safe to run more than once.

-- Church settings
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "assetTagSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "assetAlerts" JSONB;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "assetAlertsSent" TEXT;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "expenseApprovalOver" DOUBLE PRECISION;

-- Payees
CREATE TABLE IF NOT EXISTS "Vendor" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "momoNumber" TEXT,
  "category" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Vendor_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Vendor_churchId_name_key" ON "Vendor"("churchId", "name");

-- Asset upgrades
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "tagCode" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'in-service';
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "custodianId" TEXT REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "departmentId" TEXT REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "facilityId" TEXT REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "supplier" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "warrantyExpires" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "depreciation" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "usefulLifeYears" INTEGER;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "salvageValue" DOUBLE PRECISION;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "inServiceDate" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposalMethod" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposalAmount" DOUBLE PRECISION;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposalNote" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposalTxnId" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "Asset_churchId_tagCode_key" ON "Asset"("churchId", "tagCode");
CREATE INDEX IF NOT EXISTS "Asset_churchId_status_idx" ON "Asset"("churchId", "status");
CREATE INDEX IF NOT EXISTS "Asset_custodianId_idx" ON "Asset"("custodianId");

-- Expense upgrades
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "vendorId" TEXT REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "budgetId" TEXT REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "budgetItemId" TEXT REFERENCES "BudgetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "assetId" TEXT REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "Expense_budgetId_idx" ON "Expense"("budgetId");
CREATE INDEX IF NOT EXISTS "Expense_assetId_idx" ON "Expense"("assetId");
CREATE INDEX IF NOT EXISTS "Expense_vendorId_idx" ON "Expense"("vendorId");

-- Vehicles
CREATE TABLE IF NOT EXISTS "Vehicle" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "regNumber" TEXT NOT NULL,
  "make" TEXT, "model" TEXT, "year" INTEGER, "colour" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'bus',
  "seats" INTEGER,
  "fuelType" TEXT NOT NULL DEFAULT 'diesel',
  "chassisNo" TEXT,
  "odometerKm" INTEGER NOT NULL DEFAULT 0,
  "odometerAt" TIMESTAMP(3),
  "insurer" TEXT, "insurancePolicyNo" TEXT, "insuranceType" TEXT,
  "insuranceExpires" TIMESTAMP(3),
  "roadworthyExpires" TIMESTAMP(3),
  "registrationExpires" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Vehicle_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Vehicle_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_assetId_key" ON "Vehicle"("assetId");
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_churchId_regNumber_key" ON "Vehicle"("churchId", "regNumber");
CREATE INDEX IF NOT EXISTS "Vehicle_churchId_idx" ON "Vehicle"("churchId");

CREATE TABLE IF NOT EXISTS "VehicleDriver" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "personId" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT, "licenceNo" TEXT, "licenceClass" TEXT,
  "licenceExpires" TIMESTAMP(3),
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleDriver_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VehicleDriver_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleDriver_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleDriver_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VehicleDriver_vehicleId_idx" ON "VehicleDriver"("vehicleId");
CREATE INDEX IF NOT EXISTS "VehicleDriver_churchId_idx" ON "VehicleDriver"("churchId");

CREATE TABLE IF NOT EXISTS "VehicleTrip" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "driverId" TEXT,
  "driverName" TEXT,
  "purpose" TEXT NOT NULL DEFAULT 'service-pickup',
  "destination" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endAt" TIMESTAMP(3),
  "odometerStart" INTEGER, "odometerEnd" INTEGER,
  "passengers" INTEGER,
  "eventId" TEXT,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleTrip_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VehicleTrip_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleTrip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "VehicleDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "VehicleTrip_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VehicleTrip_churchId_startAt_idx" ON "VehicleTrip"("churchId", "startAt");
CREATE INDEX IF NOT EXISTS "VehicleTrip_vehicleId_startAt_idx" ON "VehicleTrip"("vehicleId", "startAt");

CREATE TABLE IF NOT EXISTS "VehicleFuel" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "litres" DOUBLE PRECISION NOT NULL,
  "cost" DOUBLE PRECISION NOT NULL,
  "odometer" INTEGER,
  "station" TEXT,
  "fullTank" BOOLEAN NOT NULL DEFAULT true,
  "paymentMethod" TEXT,
  "receiptUrl" TEXT,
  "expenseId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleFuel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VehicleFuel_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleFuel_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleFuel_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleFuel_expenseId_key" ON "VehicleFuel"("expenseId");
CREATE INDEX IF NOT EXISTS "VehicleFuel_vehicleId_date_idx" ON "VehicleFuel"("vehicleId", "date");
CREATE INDEX IF NOT EXISTS "VehicleFuel_churchId_date_idx" ON "VehicleFuel"("churchId", "date");

-- Asset check-out and documents
CREATE TABLE IF NOT EXISTS "AssetCheckout" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "personId" TEXT,
  "borrowerName" TEXT NOT NULL,
  "borrowerPhone" TEXT,
  "purpose" TEXT,
  "outAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "conditionOut" TEXT, "conditionIn" TEXT,
  "note" TEXT,
  "outById" TEXT, "inById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetCheckout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssetCheckout_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetCheckout_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetCheckout_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AssetCheckout_assetId_outAt_idx" ON "AssetCheckout"("assetId", "outAt");
CREATE INDEX IF NOT EXISTS "AssetCheckout_churchId_returnedAt_idx" ON "AssetCheckout"("churchId", "returnedAt");

CREATE TABLE IF NOT EXISTS "AssetDocument" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'other',
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "contentType" TEXT,
  "sizeBytes" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssetDocument_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AssetDocument_assetId_idx" ON "AssetDocument"("assetId");

-- Maintenance
CREATE TABLE IF NOT EXISTS "MaintenanceSchedule" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "everyDays" INTEGER, "everyKm" INTEGER,
  "lastDoneAt" TIMESTAMP(3), "lastDoneKm" INTEGER,
  "nextDueAt" TIMESTAMP(3), "nextDueKm" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "alertedFor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceSchedule_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MaintenanceSchedule_churchId_idx" ON "MaintenanceSchedule"("churchId");
CREATE INDEX IF NOT EXISTS "MaintenanceSchedule_assetId_idx" ON "MaintenanceSchedule"("assetId");

CREATE TABLE IF NOT EXISTS "MaintenanceRequest" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "facilityId" TEXT,
  "assetId" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "status" TEXT NOT NULL DEFAULT 'open',
  "photoUrl" TEXT,
  "reportedById" TEXT,
  "reportedByName" TEXT,
  "assigneeUserId" TEXT,
  "assigneeName" TEXT,
  "vendorId" TEXT,
  "dueDate" TIMESTAMP(3),
  "estimatedCost" DOUBLE PRECISION,
  "actualCost" DOUBLE PRECISION,
  "resolvedAt" TIMESTAMP(3),
  "resolution" TEXT,
  "expenseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceRequest_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRequest_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRequest_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRequest_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MaintenanceRequest_expenseId_key" ON "MaintenanceRequest"("expenseId");
CREATE INDEX IF NOT EXISTS "MaintenanceRequest_churchId_status_idx" ON "MaintenanceRequest"("churchId", "status");

CREATE TABLE IF NOT EXISTS "MaintenanceRecord" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "assetId" TEXT,
  "scheduleId" TEXT,
  "requestId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'service',
  "title" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "odometerKm" INTEGER,
  "vendorName" TEXT,
  "vendorId" TEXT,
  "cost" DOUBLE PRECISION,
  "notes" TEXT,
  "expenseId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceRecord_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRecord_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRecord_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaintenanceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRecord_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRecord_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MaintenanceRecord_expenseId_key" ON "MaintenanceRecord"("expenseId");
CREATE INDEX IF NOT EXISTS "MaintenanceRecord_assetId_date_idx" ON "MaintenanceRecord"("assetId", "date");
CREATE INDEX IF NOT EXISTS "MaintenanceRecord_churchId_date_idx" ON "MaintenanceRecord"("churchId", "date");

-- Expense approvals and recurring expenses
CREATE TABLE IF NOT EXISTS "ExpenseRequest" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'General',
  "vendorName" TEXT,
  "vendorId" TEXT, "budgetId" TEXT, "budgetItemId" TEXT, "accountId" TEXT, "fundId" TEXT, "assetId" TEXT,
  "neededBy" TIMESTAMP(3),
  "attachmentUrl" TEXT,
  "note" TEXT,
  "source" TEXT, "sourceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "requestedById" TEXT, "requestedByName" TEXT,
  "decidedById" TEXT, "decidedByName" TEXT, "decidedAt" TIMESTAMP(3), "decisionNote" TEXT,
  "expenseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseRequest_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChurchAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequest_expenseId_key" ON "ExpenseRequest"("expenseId");
CREATE INDEX IF NOT EXISTS "ExpenseRequest_churchId_status_idx" ON "ExpenseRequest"("churchId", "status");

CREATE TABLE IF NOT EXISTS "RecurringExpense" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'General',
  "vendorName" TEXT,
  "vendorId" TEXT, "accountId" TEXT, "fundId" TEXT, "budgetId" TEXT, "budgetItemId" TEXT,
  "paymentMethod" TEXT,
  "frequency" TEXT NOT NULL DEFAULT 'monthly',
  "anchorDay" INTEGER,
  "nextDue" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastRecordedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecurringExpense_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecurringExpense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecurringExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChurchAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecurringExpense_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecurringExpense_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecurringExpense_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RecurringExpense_churchId_nextDue_idx" ON "RecurringExpense"("churchId", "nextDue");

-- Close the Supabase public API on the new tables (the app connects as owner and is unaffected)
ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VehicleDriver" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VehicleTrip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VehicleFuel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetCheckout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecurringExpense" ENABLE ROW LEVEL SECURITY;

-- Optional backfill (safe to repeat): older assets get an in-service date, and decommissioned ones count as disposed.
UPDATE "Asset" SET "inServiceDate" = "purchaseDate" WHERE "inServiceDate" IS NULL AND "purchaseDate" IS NOT NULL;
UPDATE "Asset" SET "status" = 'disposed' WHERE "condition" = 'decommissioned' AND "status" = 'in-service';

COMMIT;
