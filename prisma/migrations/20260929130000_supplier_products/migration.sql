ALTER TABLE "Supplier" ADD COLUMN "website" TEXT;
ALTER TABLE "SupplierCapture" ADD COLUMN "website" TEXT;
ALTER TABLE "SupplierCapture" ADD COLUMN "contactMethods" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "SupplierContact" ADD COLUMN "type" TEXT;

CREATE TABLE "SupplierProduct" (
  "id" TEXT NOT NULL,
  "captureId" TEXT NOT NULL,
  "supplierId" TEXT,
  "name" TEXT NOT NULL,
  "fobAmount" DECIMAL(12,4),
  "fobCurrency" TEXT,
  "fobUnit" TEXT,
  "fobRawText" TEXT,
  "moqQuantity" INTEGER,
  "moqUnit" TEXT,
  "moqNotes" TEXT,
  "moqRawText" TEXT,
  "leadTimeRawText" TEXT,
  "leadTimeDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierProduct_captureId_idx" ON "SupplierProduct"("captureId");
CREATE INDEX "SupplierProduct_supplierId_idx" ON "SupplierProduct"("supplierId");
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "SupplierCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierAttachment" ADD COLUMN "productId" TEXT;
CREATE INDEX "SupplierAttachment_productId_idx" ON "SupplierAttachment"("productId");
ALTER TABLE "SupplierAttachment" ADD CONSTRAINT "SupplierAttachment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SupplierProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SupplierProduct" ("id", "captureId", "supplierId", "name", "fobAmount", "fobCurrency", "fobUnit", "fobRawText", "moqQuantity", "moqUnit", "moqNotes", "moqRawText", "leadTimeRawText", "leadTimeDays", "updatedAt")
SELECT gen_random_uuid()::text, "captureId", "id", 'Producto sin nombre', "fobAmount", "fobCurrency", "fobUnit", "fobRawText", "moqQuantity", "moqUnit", "moqNotes", "moqRawText", "leadTimeRawText", "leadTimeDays", CURRENT_TIMESTAMP
FROM "Supplier"
WHERE "fobAmount" IS NOT NULL OR "fobCurrency" IS NOT NULL OR "fobUnit" IS NOT NULL OR "fobRawText" IS NOT NULL
   OR "moqQuantity" IS NOT NULL OR "moqUnit" IS NOT NULL OR "moqNotes" IS NOT NULL OR "moqRawText" IS NOT NULL
   OR "leadTimeRawText" IS NOT NULL OR "leadTimeDays" IS NOT NULL;

UPDATE "Supplier" SET "pendingFields" = COALESCE((
  SELECT jsonb_agg(field) FROM jsonb_array_elements("Supplier"."pendingFields") AS field
  WHERE field NOT IN ('"fob"'::jsonb, '"moq"'::jsonb, '"leadTime"'::jsonb)
), '[]'::jsonb);
