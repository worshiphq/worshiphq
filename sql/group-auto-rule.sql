-- Groups that fill themselves from a form answer (e.g. Day Born cell groups).
-- Run this BEFORE pushing the code that uses it. Safe to run more than once.
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "autoRule" JSONB;
