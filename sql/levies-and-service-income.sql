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
