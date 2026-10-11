CREATE TABLE "WhatsAppEvidenceDecision" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "captureId" TEXT,
    "supplierId" TEXT,
    "productId" TEXT,
    "appliedFields" JSONB NOT NULL DEFAULT '[]',
    "reviewedValues" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppEvidenceDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhatsAppEvidenceDecision_messageId_createdAt_idx" ON "WhatsAppEvidenceDecision"("messageId", "createdAt");
CREATE INDEX "WhatsAppEvidenceDecision_tripId_companyId_createdAt_idx" ON "WhatsAppEvidenceDecision"("tripId", "companyId", "createdAt");
CREATE INDEX "WhatsAppEvidenceDecision_captureId_idx" ON "WhatsAppEvidenceDecision"("captureId");
CREATE INDEX "WhatsAppEvidenceDecision_productId_idx" ON "WhatsAppEvidenceDecision"("productId");
ALTER TABLE "WhatsAppEvidenceDecision" ADD CONSTRAINT "WhatsAppEvidenceDecision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WhatsAppBurstMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletedById" TEXT;
ALTER TABLE "SupplierProduct" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletedById" TEXT;
CREATE INDEX "Supplier_deletedAt_idx" ON "Supplier"("deletedAt");
CREATE INDEX "SupplierProduct_deletedAt_idx" ON "SupplierProduct"("deletedAt");
