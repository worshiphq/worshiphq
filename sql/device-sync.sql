-- Device sync: members and registrations kept in step across a church's ZKTeco terminals (Max).
-- Additive only. Safe to run more than once. Run BEFORE deploying the code.

-- ── Existing tables: new columns ──
ALTER TABLE "Church"                 ADD COLUMN IF NOT EXISTS "deviceAutoSync" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BiometricDevice"        ADD COLUMN IF NOT EXISTS "reported"       JSONB;
ALTER TABLE "BiometricDevice"        ADD COLUMN IF NOT EXISTS "syncedAt"       TIMESTAMP(3);
ALTER TABLE "BiometricDevice"        ADD COLUMN IF NOT EXISTS "reconciledAt"   TIMESTAMP(3);
ALTER TABLE "BiometricDeviceCommand" ADD COLUMN IF NOT EXISTS "key"            TEXT;
ALTER TABLE "BiometricDeviceCommand" ADD COLUMN IF NOT EXISTS "result"         INTEGER;
CREATE INDEX IF NOT EXISTS "BiometricDeviceCommand_deviceId_key_idx" ON "BiometricDeviceCommand" ("deviceId", "key");

-- ── Registrations uploaded by devices (sensitive: base64 templates) ──
CREATE TABLE IF NOT EXISTS "BiometricTemplate" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "pin" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "bioType" INTEGER NOT NULL,
  "no" INTEGER NOT NULL DEFAULT 0,
  "index" INTEGER NOT NULL DEFAULT 0,
  "majorVer" INTEGER,
  "minorVer" INTEGER,
  "format" INTEGER NOT NULL DEFAULT 0,
  "data" TEXT NOT NULL,
  "size" INTEGER,
  "sourceDeviceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BiometricTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BiometricTemplate_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BiometricTemplate_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BiometricTemplate_sourceDeviceId_fkey" FOREIGN KEY ("sourceDeviceId") REFERENCES "BiometricDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "BiometricTemplate_churchId_pin_bioType_no_index_key" ON "BiometricTemplate" ("churchId", "pin", "bioType", "no", "index");
CREATE INDEX IF NOT EXISTS "BiometricTemplate_personId_idx" ON "BiometricTemplate" ("personId");
CREATE INDEX IF NOT EXISTS "BiometricTemplate_sourceDeviceId_idx" ON "BiometricTemplate" ("sourceDeviceId");
ALTER TABLE "BiometricTemplate" ENABLE ROW LEVEL SECURITY;

-- ── Who was last put on the devices (no link to Person: it must outlive a deleted person) ──
CREATE TABLE IF NOT EXISTS "BiometricSyncedMember" (
  "churchId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "pin" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BiometricSyncedMember_pkey" PRIMARY KEY ("churchId", "personId"),
  CONSTRAINT "BiometricSyncedMember_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "BiometricSyncedMember_churchId_pin_idx" ON "BiometricSyncedMember" ("churchId", "pin");
ALTER TABLE "BiometricSyncedMember" ENABLE ROW LEVEL SECURITY;
