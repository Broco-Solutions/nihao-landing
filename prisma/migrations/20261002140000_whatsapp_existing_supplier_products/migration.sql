-- Existing manually reviewed products keep their current published behavior.
ALTER TABLE "SupplierProduct"
 ADD COLUMN "status" "CaptureStatus" NOT NULL DEFAULT 'CONFIRMED',
 ADD COLUMN "sourceText" TEXT,
 ADD COLUMN "sourceEvidence" JSONB NOT NULL DEFAULT '[]',
 ADD COLUMN "reviewFields" JSONB NOT NULL DEFAULT '[]',
 ADD COLUMN "sourceConflicts" JSONB NOT NULL DEFAULT '[]';
