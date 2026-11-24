-- Nalo delivery reports. Safe to run more than once. Run before switching reports on.
CREATE TABLE IF NOT EXISTS "NaloReport" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT,
  "to" TEXT,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "status" TEXT,
  "raw" TEXT,
  "reportedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "NaloReport_jobId_idx" ON "NaloReport" ("jobId");
CREATE INDEX IF NOT EXISTS "NaloReport_createdAt_idx" ON "NaloReport" ("createdAt");
ALTER TABLE "NaloReport" ENABLE ROW LEVEL SECURITY;
