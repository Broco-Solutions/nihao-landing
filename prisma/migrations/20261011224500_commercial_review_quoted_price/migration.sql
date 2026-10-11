ALTER TABLE "SupplierCapture" ADD COLUMN "reviewedAt" TIMESTAMP(3), ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "SupplierProduct" ADD COLUMN "quotedPriceAmount" DECIMAL(12,4), ADD COLUMN "quotedPriceCurrency" TEXT, ADD COLUMN "quotedPriceUnit" TEXT, ADD COLUMN "quotedPriceRawText" TEXT;
ALTER TABLE "WhatsAppEvidenceDecision" ADD COLUMN "batchId" TEXT;
CREATE INDEX "WhatsAppEvidenceDecision_batchId_idx" ON "WhatsAppEvidenceDecision"("batchId");
