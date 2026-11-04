-- Choose per church whether texts go through Hubtel or Nalo, and record which carrier approved a church's sender ID.
-- Empty means Hubtel (the platform default), so nothing changes for anyone until you change a church in SuperAdmin.
-- Every sender ID approved so far was approved on Hubtel. Safe to run more than once.
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "smsProvider" TEXT;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "smsSenderIdProvider" TEXT;
UPDATE "Church" SET "smsSenderIdProvider" = 'hubtel' WHERE "smsSenderIdStatus" = 'approved' AND "smsSenderIdProvider" IS NULL;
