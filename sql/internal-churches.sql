-- Hidden internal QA church flag. Safe to run more than once.
-- Run this BEFORE deploying the code that reads Church.isInternal.
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;
