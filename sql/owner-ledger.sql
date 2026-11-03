-- Owner's private money ledger. Run this BEFORE deploying the /admin/money code.
-- Safe to re-run.
CREATE TABLE IF NOT EXISTS "OwnerLedgerEntry" (
  "id"         TEXT PRIMARY KEY,
  "ledger"     TEXT NOT NULL,
  "kind"       TEXT NOT NULL,
  "amountGhs"  DOUBLE PRECISION NOT NULL,
  "category"   TEXT,
  "note"       TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OwnerLedgerEntry_ledger_occurredAt_idx"
  ON "OwnerLedgerEntry" ("ledger", "occurredAt");
