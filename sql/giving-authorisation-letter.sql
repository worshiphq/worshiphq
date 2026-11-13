-- Online giving: the church's signed and stamped authorisation letter (kept privately in R2, never public).
-- Run BEFORE pushing the code that reads these columns.
ALTER TABLE "PaymentRequest" ADD COLUMN IF NOT EXISTS "authLetterKey" TEXT;
ALTER TABLE "PaymentRequest" ADD COLUMN IF NOT EXISTS "authLetterType" TEXT;
ALTER TABLE "PaymentRequest" ADD COLUMN IF NOT EXISTS "authLetterAt" TIMESTAMP(3);
