-- Free trials of the next plan up (Free -> Starter, Starter -> Pro, Pro -> Max). 5 Nov 2026.
-- Adds columns only. Nothing is changed or removed, and it is safe to run more than once.
-- RUN THIS BEFORE the code that uses it goes live, or every page that reads a subscription will error.
ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "trialPlan" TEXT,
  ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trialsUsed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "trialNotified" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "PlatformConfig"
  ADD COLUMN IF NOT EXISTS "trialSettings" JSONB;

-- The trial notice job and the Trials page look churches up by when their trial ends.
CREATE INDEX IF NOT EXISTS "Subscription_trialEndsAt_idx" ON "Subscription" ("trialEndsAt");
