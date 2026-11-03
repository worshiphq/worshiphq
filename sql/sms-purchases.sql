-- SMS the platform bought from its provider, entered by the owner. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "SmsPurchase" (
  "id"          TEXT NOT NULL,
  "credits"     INTEGER NOT NULL,
  "costGhs"     DOUBLE PRECISION NOT NULL,
  "provider"    TEXT,
  "note"        TEXT,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsPurchase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SmsPurchase_purchasedAt_idx" ON "SmsPurchase" ("purchasedAt");
