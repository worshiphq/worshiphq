-- Monday briefing (Max plan). Run in Supabase SQL editor BEFORE pushing the code that uses it.
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "briefing" JSONB;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "briefingSent" TEXT;

-- Launch: switch the briefing on for the two Max churches, with the one-time "NEW for Max" note.
-- Goes to every Owner, Admin and Pastor by email AND SMS, on Mondays from 7am (the first one on the
-- next hourly run after the code is live, if it is still Monday). They can change it on the Reminders page.
UPDATE "Church" SET "briefing" = '{"on":true,"day":1,"hour":7,"userIds":[],"email":true,"sms":true,"intro":true}'::jsonb
WHERE "id" IN ('cmq3qarwg0000jx040kt27cr3', 'cmvt8klmh000ojr089e0m21ou');
