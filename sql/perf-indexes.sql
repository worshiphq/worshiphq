-- Indexes for the lookups that had none, found by listing foreign keys with no index behind them (4 Nov 2026).
-- Adding them only makes reads faster. Safe to run more than once. The tables are small today, so each takes moments.
CREATE INDEX IF NOT EXISTS "AttendanceRecord_personId_idx" ON "AttendanceRecord" ("personId");
CREATE INDEX IF NOT EXISTS "AttendanceSession_slotId_idx" ON "AttendanceSession" ("slotId");
CREATE INDEX IF NOT EXISTS "Gift_personId_idx" ON "Gift" ("personId");
CREATE INDEX IF NOT EXISTS "Gift_fundId_idx" ON "Gift" ("fundId");
CREATE INDEX IF NOT EXISTS "Person_householdId_idx" ON "Person" ("householdId");
CREATE INDEX IF NOT EXISTS "FollowUp_personId_idx" ON "FollowUp" ("personId");
CREATE INDEX IF NOT EXISTS "FollowUp_visitorId_idx" ON "FollowUp" ("visitorId");
CREATE INDEX IF NOT EXISTS "FollowUp_assigneeId_idx" ON "FollowUp" ("assigneeId");
CREATE INDEX IF NOT EXISTS "Pledge_campaignId_idx" ON "Pledge" ("campaignId");
CREATE INDEX IF NOT EXISTS "HarvestContribution_personId_idx" ON "HarvestContribution" ("personId");
CREATE INDEX IF NOT EXISTS "PrayerRequest_personId_idx" ON "PrayerRequest" ("personId");
CREATE INDEX IF NOT EXISTS "WelfareRecord_personId_idx" ON "WelfareRecord" ("personId");
CREATE INDEX IF NOT EXISTS "Testimony_personId_idx" ON "Testimony" ("personId");
CREATE INDEX IF NOT EXISTS "Expense_accountId_idx" ON "Expense" ("accountId");
CREATE INDEX IF NOT EXISTS "Transaction_accountId_idx" ON "Transaction" ("accountId");
CREATE INDEX IF NOT EXISTS "Group_leaderId_idx" ON "Group" ("leaderId");
CREATE INDEX IF NOT EXISTS "User_customRoleId_idx" ON "User" ("customRoleId");
CREATE INDEX IF NOT EXISTS "BudgetItem_churchId_idx" ON "BudgetItem" ("churchId");
CREATE INDEX IF NOT EXISTS "VolunteerSlot_churchId_idx" ON "VolunteerSlot" ("churchId");
