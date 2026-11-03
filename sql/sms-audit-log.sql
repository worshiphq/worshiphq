-- SMS audit log: one row per billable SMS send (the message, not the money).
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS "SmsAuditLog" (
  "id"         TEXT NOT NULL,
  "churchId"   TEXT NOT NULL,
  "label"      TEXT,
  "body"       TEXT NOT NULL,
  "segments"   INTEGER NOT NULL,
  "recipients" INTEGER NOT NULL,
  "sent"       INTEGER NOT NULL,
  "credits"    INTEGER NOT NULL,
  "senderName" TEXT,
  "sentById"   TEXT,
  "sentByName" TEXT,
  "trigger"    TEXT NOT NULL DEFAULT 'manual',
  "numbers"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SmsAuditLog_churchId_createdAt_idx" ON "SmsAuditLog" ("churchId", "createdAt");
CREATE INDEX IF NOT EXISTS "SmsAuditLog_createdAt_idx" ON "SmsAuditLog" ("createdAt");

DO $$
BEGIN
  ALTER TABLE "SmsAuditLog"
    ADD CONSTRAINT "SmsAuditLog_churchId_fkey"
    FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
