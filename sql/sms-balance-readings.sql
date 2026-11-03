-- A reading of the provider (Hubtel) balance can now be recorded alongside top-ups.
-- Safe to run more than once. Existing rows are top-ups.
ALTER TABLE "SmsPurchase" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'topup';
