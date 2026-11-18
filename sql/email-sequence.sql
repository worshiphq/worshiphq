-- Automatic email sequence (SuperAdmin > Email sequence). Safe to run more than once. Adds only; changes no existing data.

-- On/off, per-step switches and the daily cap.
ALTER TABLE "PlatformConfig" ADD COLUMN IF NOT EXISTS "lifecycleSettings" JSONB;

-- One row per email sent to one address and step, so nobody gets the same email twice.
CREATE TABLE IF NOT EXISTS "LifecycleSend" (
  "id" TEXT NOT NULL,
  "churchId" TEXT,
  "email" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LifecycleSend_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LifecycleSend_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LifecycleSend_email_step_key" ON "LifecycleSend" ("email", "step");
CREATE INDEX IF NOT EXISTS "LifecycleSend_churchId_sentAt_idx" ON "LifecycleSend" ("churchId", "sentAt");
CREATE INDEX IF NOT EXISTS "LifecycleSend_sentAt_idx" ON "LifecycleSend" ("sentAt");
ALTER TABLE "LifecycleSend" ENABLE ROW LEVEL SECURITY;

-- Addresses that pressed "Stop these emails".
CREATE TABLE IF NOT EXISTS "EmailOptOut" (
  "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailOptOut_pkey" PRIMARY KEY ("email")
);
ALTER TABLE "EmailOptOut" ENABLE ROW LEVEL SECURITY;
