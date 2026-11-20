-- Self-service church deletion: the Main Admin closes the church, it is kept for 30 days so it can be
-- restored, then the daily cron deletes it permanently.
-- Run this BEFORE pushing the code that uses it. Safe to run more than once.
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "deleteAfter" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Church_deleteAfter_idx" ON "Church" ("deleteAfter") WHERE "deleteAfter" IS NOT NULL;
