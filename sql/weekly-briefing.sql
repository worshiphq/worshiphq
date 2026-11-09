-- Monday briefing (Max plan). Run in Supabase SQL editor BEFORE pushing the code that uses it.
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "briefing" JSONB;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "briefingSent" TEXT;
