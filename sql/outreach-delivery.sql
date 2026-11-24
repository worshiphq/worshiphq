-- SuperAdmin outreach texts: remembers each text so one the network could not deliver can be emailed instead.
-- Safe to run more than once. Run it before pushing; the rest of outreach works with or without it.
CREATE TABLE IF NOT EXISTS "OutreachDelivery" (
  "id" TEXT PRIMARY KEY,
  "churchId" TEXT NOT NULL,
  "smsId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "checkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OutreachDelivery_state_checkedAt_idx" ON "OutreachDelivery" ("state", "checkedAt");
CREATE INDEX IF NOT EXISTS "OutreachDelivery_churchId_idx" ON "OutreachDelivery" ("churchId");
ALTER TABLE "OutreachDelivery" ENABLE ROW LEVEL SECURITY;
