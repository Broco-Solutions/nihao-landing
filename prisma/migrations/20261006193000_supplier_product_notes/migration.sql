-- Additive nullable fields: historical records remain valid; no data rewrite.
ALTER TABLE "SupplierCapture" ADD COLUMN "notes" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "notes" TEXT;
ALTER TABLE "SupplierProduct" ADD COLUMN "notes" TEXT;
