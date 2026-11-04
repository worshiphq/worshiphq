-- New churches get 30 free SMS credits at signup instead of 60. Safe to run more than once.
-- Existing churches are handled separately by scripts/trim-free-credits.cjs.
ALTER TABLE "Church" ALTER COLUMN "smsCredits" SET DEFAULT 30;
