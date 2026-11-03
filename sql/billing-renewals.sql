-- Renewals, saved cards, billing notices, auto-inactive and restricted funds.
-- Safe to run more than once. Run the whole file in the Supabase SQL editor.
--
-- Nothing here changes or removes existing data: every statement adds a column or a table, and
-- every new column has a default, so no church's current plan, balance or member is touched.

-- ── Subscription: automatic renewal, owner alerts, bypass expiry ──
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "autoRenew"            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "cardId"               TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lastRenewalAttemptAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "renewalFailures"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "ownerAlertedFor"      TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "bypassExpiresAt"      TIMESTAMP(3);

-- ── SavedCard: a card a church kept for renewals (the charge token is stored encrypted) ──
CREATE TABLE IF NOT EXISTS "SavedCard" (
  "id"        TEXT NOT NULL,
  "churchId"  TEXT NOT NULL,
  "authCode"  TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "brand"     TEXT,
  "last4"     TEXT NOT NULL,
  "expMonth"  TEXT,
  "expYear"   TEXT,
  "bank"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SavedCard_churchId_signature_key" ON "SavedCard" ("churchId", "signature");
CREATE INDEX IF NOT EXISTS "SavedCard_churchId_idx" ON "SavedCard" ("churchId");

-- ── BillingEvent: what the billing system told each church, and whether it was delivered ──
CREATE TABLE IF NOT EXISTS "BillingEvent" (
  "id"        TEXT NOT NULL,
  "churchId"  TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "detail"    TEXT,
  "channels"  TEXT,
  "delivered" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BillingEvent_churchId_createdAt_idx" ON "BillingEvent" ("churchId", "createdAt");
CREATE INDEX IF NOT EXISTS "BillingEvent_createdAt_idx" ON "BillingEvent" ("createdAt");

-- ── Church: auto-inactive (Max) ──
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "autoInactiveOn"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "autoInactiveWeeks" INTEGER NOT NULL DEFAULT 12;

-- ── Fund accounting (Max): restricted funds, and which fund an expense was paid from ──
ALTER TABLE "Fund"    ADD COLUMN IF NOT EXISTS "restricted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "fundId"     TEXT;
CREATE INDEX IF NOT EXISTS "Expense_fundId_idx" ON "Expense" ("fundId");

-- ── Foreign keys (skipped quietly if they already exist) ──
DO $$ BEGIN
  ALTER TABLE "SavedCard" ADD CONSTRAINT "SavedCard_churchId_fkey"
    FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_churchId_fkey"
    FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
