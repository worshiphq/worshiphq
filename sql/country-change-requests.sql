-- Country change requests: the Main Admin asks for a new country in Settings, and it only takes
-- effect when the SuperAdmin approves it (the country sets the plan price and the SMS rules).
-- Run this BEFORE pushing the code that uses it. Safe to run more than once.
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "countryRequested" TEXT;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "countryRequestedAt" TIMESTAMP(3);
