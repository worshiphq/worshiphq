-- Records what every text costs us, so OTPs, alerts and church sends can all be added up accurately.
-- Self-contained and safe to run more than once, in any order relative to admin-audit-log.sql.
-- RUN THIS BEFORE THE UPDATE GOES LIVE: the church SMS log reads the two new columns, so without them it breaks.

-- WorshipHQ's own texts (sign-in codes, alerts, notices, donor receipts). One row per carrier used.
CREATE TABLE IF NOT EXISTS "PlatformSmsLog" (
  "id" TEXT PRIMARY KEY,
  "toNumbers" TEXT NOT NULL,
  "recipients" INTEGER NOT NULL,
  "sent" INTEGER NOT NULL,
  "carrier" TEXT,
  "sender" TEXT,
  "body" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlatformSmsLog_createdAt_idx" ON "PlatformSmsLog" ("createdAt");
ALTER TABLE "PlatformSmsLog" ADD COLUMN IF NOT EXISTS "purpose" TEXT;
ALTER TABLE "PlatformSmsLog" ADD COLUMN IF NOT EXISTS "segments" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PlatformSmsLog" ADD COLUMN IF NOT EXISTS "billedSegments" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlatformSmsLog" ADD COLUMN IF NOT EXISTS "costGhs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PlatformSmsLog" ADD COLUMN IF NOT EXISTS "churchId" TEXT;

-- Churches' sends: which carrier took them and what they cost us. Older rows stay empty and are estimated.
ALTER TABLE "SmsAuditLog" ADD COLUMN IF NOT EXISTS "carrier" TEXT;
ALTER TABLE "SmsAuditLog" ADD COLUMN IF NOT EXISTS "costGhs" DOUBLE PRECISION;
