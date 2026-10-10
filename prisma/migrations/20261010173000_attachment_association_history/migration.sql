ALTER TABLE "SupplierAttachment"
ADD COLUMN "associationHistory" JSONB NOT NULL DEFAULT '[]'::jsonb;
