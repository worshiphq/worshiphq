-- SMS delivery reports: per-send counts of delivered / not delivered / waiting, and a link to the campaign.
-- Run BEFORE pushing the code that writes these columns.
ALTER TABLE "SmsAuditLog" ADD COLUMN IF NOT EXISTS "delivered" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SmsAuditLog" ADD COLUMN IF NOT EXISTS "failed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SmsAuditLog" ADD COLUMN IF NOT EXISTS "pending" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SmsAuditLog" ADD COLUMN IF NOT EXISTS "statusDone" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SmsAuditLog" ADD COLUMN IF NOT EXISTS "communicationId" TEXT;
CREATE INDEX IF NOT EXISTS "SmsAuditLog_statusDone_createdAt_idx" ON "SmsAuditLog" ("statusDone", "createdAt");
CREATE INDEX IF NOT EXISTS "SmsAuditLog_communicationId_idx" ON "SmsAuditLog" ("communicationId");
-- Older sends: the carrier never reported, so their "failed" is the numbers it refused at the time.
UPDATE "SmsAuditLog" SET "failed" = GREATEST("recipients" - "sent", 0) WHERE "failed" = 0 AND "recipients" > "sent";
