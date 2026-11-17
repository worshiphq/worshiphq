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
