-- "How did you hear about WorshipHQ?" at sign-up. Run BEFORE pushing the code.
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "heardFrom" TEXT;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "heardFromDetail" TEXT;
