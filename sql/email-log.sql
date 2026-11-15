-- A record of every email WorshipHQ sends, so SuperAdmin can see what failed and send it again.
-- Nothing depends on this table: until this runs, emails still send and the Emails page says to run it.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "EmailLog" (
  "id" TEXT PRIMARY KEY,
  "churchId" TEXT,
  "toAddrs" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "fromAddr" TEXT NOT NULL,
  "replyTo" TEXT,
  "html" TEXT,
  "attachments" JSONB,
  "status" TEXT NOT NULL,
  "provider" TEXT,
  "error" TEXT,
  "attempts" JSONB,
  "messageId" TEXT,
  "delivery" TEXT,
  "deliveryNote" TEXT,
  "deliveryCheckedAt" TIMESTAMP(3),
  "tries" INTEGER NOT NULL DEFAULT 1,
  "resentAt" TIMESTAMP(3),
  "retryable" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog" ("createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_status_createdAt_idx" ON "EmailLog" ("status", "createdAt");
ALTER TABLE "EmailLog" ENABLE ROW LEVEL SECURITY;
