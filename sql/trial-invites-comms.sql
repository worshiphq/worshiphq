-- Trials by invitation, and the free month of Communications by choice. 8 Nov 2026.
-- Adds columns, then keeps the free month for churches that are inside it today (it ends on its own date, nobody is cut off).
-- Safe to run more than once. RUN THIS BEFORE the code that uses it goes live.
ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "trialInvitedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "commsTrialStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "commsTrialEndsAt" TIMESTAMP(3);

-- Churches that have no subscription row yet (they are on Free) get one, so the month can be stored for them.
INSERT INTO "Subscription" ("id", "churchId")
SELECT md5(random()::text || c."id"), c."id"
FROM "Church" c
WHERE c."isDemo" = false
  AND NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."churchId" = c."id");

-- The old automatic month: 30 days from signup (or from 26 Oct 2026 for older churches). Anyone still inside it keeps it until it ends.
UPDATE "Subscription" s
SET "commsTrialStartedAt" = GREATEST(c."createdAt", TIMESTAMP '2026-10-26 00:00:00'),
    "commsTrialEndsAt"    = GREATEST(c."createdAt", TIMESTAMP '2026-10-26 00:00:00') + INTERVAL '30 days'
FROM "Church" c
WHERE c."id" = s."churchId"
  AND c."isDemo" = false
  AND s."plan" = 'free'
  AND s."commsTrialEndsAt" IS NULL
  AND GREATEST(c."createdAt", TIMESTAMP '2026-10-26 00:00:00') + INTERVAL '30 days' > (now() AT TIME ZONE 'UTC');
