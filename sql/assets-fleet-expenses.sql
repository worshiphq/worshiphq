-- Assets, vehicles, maintenance, and expense upgrades. Additive only. Safe to run more than once.

-- Church settings
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "assetTagSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "assetAlerts" JSONB;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "assetAlertsSent" TEXT;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "expenseApprovalOver" DOUBLE PRECISION;

-- Payees
CREATE TABLE IF NOT EXISTS "Vendor" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "momoNumber" TEXT,
  "category" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Vendor_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Vendor_churchId_name_key" ON "Vendor"("churchId", "name");

-- Asset upgrades
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "tagCode" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'in-service';
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "custodianId" TEXT REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "departmentId" TEXT REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "facilityId" TEXT REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "supplier" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "warrantyExpires" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "depreciation" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "usefulLifeYears" INTEGER;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "salvageValue" DOUBLE PRECISION;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "inServiceDate" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposalMethod" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposalAmount" DOUBLE PRECISION;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposalNote" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "disposalTxnId" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "Asset_churchId_tagCode_key" ON "Asset"("churchId", "tagCode");
CREATE INDEX IF NOT EXISTS "Asset_churchId_status_idx" ON "Asset"("churchId", "status");
CREATE INDEX IF NOT EXISTS "Asset_custodianId_idx" ON "Asset"("custodianId");

-- Expense upgrades
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "vendorId" TEXT REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "budgetId" TEXT REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "budgetItemId" TEXT REFERENCES "BudgetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "assetId" TEXT REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "Expense_budgetId_idx" ON "Expense"("budgetId");
CREATE INDEX IF NOT EXISTS "Expense_assetId_idx" ON "Expense"("assetId");
CREATE INDEX IF NOT EXISTS "Expense_vendorId_idx" ON "Expense"("vendorId");

-- Vehicles
CREATE TABLE IF NOT EXISTS "Vehicle" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "regNumber" TEXT NOT NULL,
  "make" TEXT, "model" TEXT, "year" INTEGER, "colour" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'bus',
  "seats" INTEGER,
  "fuelType" TEXT NOT NULL DEFAULT 'diesel',
  "chassisNo" TEXT,
  "odometerKm" INTEGER NOT NULL DEFAULT 0,
  "odometerAt" TIMESTAMP(3),
  "insurer" TEXT, "insurancePolicyNo" TEXT, "insuranceType" TEXT,
  "insuranceExpires" TIMESTAMP(3),
  "roadworthyExpires" TIMESTAMP(3),
  "registrationExpires" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Vehicle_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Vehicle_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_assetId_key" ON "Vehicle"("assetId");
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_churchId_regNumber_key" ON "Vehicle"("churchId", "regNumber");
CREATE INDEX IF NOT EXISTS "Vehicle_churchId_idx" ON "Vehicle"("churchId");

CREATE TABLE IF NOT EXISTS "VehicleDriver" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "personId" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT, "licenceNo" TEXT, "licenceClass" TEXT,
  "licenceExpires" TIMESTAMP(3),
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleDriver_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VehicleDriver_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleDriver_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleDriver_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VehicleDriver_vehicleId_idx" ON "VehicleDriver"("vehicleId");
CREATE INDEX IF NOT EXISTS "VehicleDriver_churchId_idx" ON "VehicleDriver"("churchId");

CREATE TABLE IF NOT EXISTS "VehicleTrip" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "driverId" TEXT,
  "driverName" TEXT,
  "purpose" TEXT NOT NULL DEFAULT 'service-pickup',
  "destination" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endAt" TIMESTAMP(3),
  "odometerStart" INTEGER, "odometerEnd" INTEGER,
  "passengers" INTEGER,
  "eventId" TEXT,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleTrip_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VehicleTrip_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleTrip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "VehicleDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "VehicleTrip_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "VehicleTrip_churchId_startAt_idx" ON "VehicleTrip"("churchId", "startAt");
CREATE INDEX IF NOT EXISTS "VehicleTrip_vehicleId_startAt_idx" ON "VehicleTrip"("vehicleId", "startAt");

CREATE TABLE IF NOT EXISTS "VehicleFuel" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "litres" DOUBLE PRECISION NOT NULL,
  "cost" DOUBLE PRECISION NOT NULL,
  "odometer" INTEGER,
  "station" TEXT,
  "fullTank" BOOLEAN NOT NULL DEFAULT true,
  "paymentMethod" TEXT,
  "receiptUrl" TEXT,
  "expenseId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleFuel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VehicleFuel_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleFuel_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VehicleFuel_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleFuel_expenseId_key" ON "VehicleFuel"("expenseId");
CREATE INDEX IF NOT EXISTS "VehicleFuel_vehicleId_date_idx" ON "VehicleFuel"("vehicleId", "date");
CREATE INDEX IF NOT EXISTS "VehicleFuel_churchId_date_idx" ON "VehicleFuel"("churchId", "date");

-- Asset check-out and documents
CREATE TABLE IF NOT EXISTS "AssetCheckout" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "personId" TEXT,
  "borrowerName" TEXT NOT NULL,
  "borrowerPhone" TEXT,
  "purpose" TEXT,
  "outAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "conditionOut" TEXT, "conditionIn" TEXT,
  "note" TEXT,
  "outById" TEXT, "inById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetCheckout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssetCheckout_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetCheckout_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetCheckout_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AssetCheckout_assetId_outAt_idx" ON "AssetCheckout"("assetId", "outAt");
CREATE INDEX IF NOT EXISTS "AssetCheckout_churchId_returnedAt_idx" ON "AssetCheckout"("churchId", "returnedAt");

CREATE TABLE IF NOT EXISTS "AssetDocument" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'other',
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "contentType" TEXT,
  "sizeBytes" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssetDocument_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AssetDocument_assetId_idx" ON "AssetDocument"("assetId");

-- Maintenance
CREATE TABLE IF NOT EXISTS "MaintenanceSchedule" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "everyDays" INTEGER, "everyKm" INTEGER,
  "lastDoneAt" TIMESTAMP(3), "lastDoneKm" INTEGER,
  "nextDueAt" TIMESTAMP(3), "nextDueKm" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "alertedFor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceSchedule_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MaintenanceSchedule_churchId_idx" ON "MaintenanceSchedule"("churchId");
CREATE INDEX IF NOT EXISTS "MaintenanceSchedule_assetId_idx" ON "MaintenanceSchedule"("assetId");

CREATE TABLE IF NOT EXISTS "MaintenanceRequest" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "facilityId" TEXT,
  "assetId" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "status" TEXT NOT NULL DEFAULT 'open',
  "photoUrl" TEXT,
  "reportedById" TEXT,
  "reportedByName" TEXT,
  "assigneeUserId" TEXT,
  "assigneeName" TEXT,
  "vendorId" TEXT,
  "dueDate" TIMESTAMP(3),
  "estimatedCost" DOUBLE PRECISION,
  "actualCost" DOUBLE PRECISION,
  "resolvedAt" TIMESTAMP(3),
  "resolution" TEXT,
  "expenseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceRequest_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRequest_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRequest_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRequest_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MaintenanceRequest_expenseId_key" ON "MaintenanceRequest"("expenseId");
CREATE INDEX IF NOT EXISTS "MaintenanceRequest_churchId_status_idx" ON "MaintenanceRequest"("churchId", "status");

CREATE TABLE IF NOT EXISTS "MaintenanceRecord" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "assetId" TEXT,
  "scheduleId" TEXT,
  "requestId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'service',
  "title" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "odometerKm" INTEGER,
  "vendorName" TEXT,
  "vendorId" TEXT,
  "cost" DOUBLE PRECISION,
  "notes" TEXT,
  "expenseId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceRecord_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRecord_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRecord_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaintenanceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRecord_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MaintenanceRecord_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MaintenanceRecord_expenseId_key" ON "MaintenanceRecord"("expenseId");
CREATE INDEX IF NOT EXISTS "MaintenanceRecord_assetId_date_idx" ON "MaintenanceRecord"("assetId", "date");
CREATE INDEX IF NOT EXISTS "MaintenanceRecord_churchId_date_idx" ON "MaintenanceRecord"("churchId", "date");

-- Expense approvals and recurring expenses
CREATE TABLE IF NOT EXISTS "ExpenseRequest" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'General',
  "vendorName" TEXT,
  "vendorId" TEXT, "budgetId" TEXT, "budgetItemId" TEXT, "accountId" TEXT, "fundId" TEXT, "assetId" TEXT,
  "neededBy" TIMESTAMP(3),
  "attachmentUrl" TEXT,
  "note" TEXT,
  "source" TEXT, "sourceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "requestedById" TEXT, "requestedByName" TEXT,
  "decidedById" TEXT, "decidedByName" TEXT, "decidedAt" TIMESTAMP(3), "decisionNote" TEXT,
  "expenseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseRequest_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChurchAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExpenseRequest_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRequest_expenseId_key" ON "ExpenseRequest"("expenseId");
CREATE INDEX IF NOT EXISTS "ExpenseRequest_churchId_status_idx" ON "ExpenseRequest"("churchId", "status");

CREATE TABLE IF NOT EXISTS "RecurringExpense" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'General',
  "vendorName" TEXT,
  "vendorId" TEXT, "accountId" TEXT, "fundId" TEXT, "budgetId" TEXT, "budgetItemId" TEXT,
  "paymentMethod" TEXT,
  "frequency" TEXT NOT NULL DEFAULT 'monthly',
  "anchorDay" INTEGER,
  "nextDue" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastRecordedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecurringExpense_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecurringExpense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecurringExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChurchAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecurringExpense_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecurringExpense_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RecurringExpense_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RecurringExpense_churchId_nextDue_idx" ON "RecurringExpense"("churchId", "nextDue");

-- Close the Supabase public API on the new tables (the app connects as owner and is unaffected)
ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VehicleDriver" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VehicleTrip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VehicleFuel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetCheckout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecurringExpense" ENABLE ROW LEVEL SECURITY;

-- Optional backfill (safe to repeat): older assets get an in-service date, and decommissioned ones count as disposed.
UPDATE "Asset" SET "inServiceDate" = "purchaseDate" WHERE "inServiceDate" IS NULL AND "purchaseDate" IS NOT NULL;
UPDATE "Asset" SET "status" = 'disposed' WHERE "condition" = 'decommissioned' AND "status" = 'in-service';
