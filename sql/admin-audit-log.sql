-- SuperAdmin audit log, and a record of the texts WorshipHQ itself sends (sign-in codes, alerts, notices).
-- Nothing else depends on these tables: until this runs, the site works and the new page says to run it.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
  "id" TEXT PRIMARY KEY,
  "actorEmail" TEXT NOT NULL,
  "actorName" TEXT,
  "action" TEXT NOT NULL,
  "churchId" TEXT,
  "churchName" TEXT,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog" ("createdAt");

CREATE TABLE IF NOT EXISTS "PlatformSmsLog" (
  "id" TEXT PRIMARY KEY,
  "toNumbers" TEXT NOT NULL,
  "recipients" INTEGER NOT NULL,
  "sent" INTEGER NOT NULL,
  "carrier" TEXT,
  "sender" TEXT,
  "body" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlatformSmsLog_createdAt_idx" ON "PlatformSmsLog" ("createdAt");

-- Church activity across all churches is listed newest first, which the existing per-church index cannot serve.
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt");
