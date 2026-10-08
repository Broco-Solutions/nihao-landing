CREATE TABLE "WhatsAppPendingEvidence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "sourceAt" TIMESTAMP(3) NOT NULL,
    "sourceSequence" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "targetProductId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppPendingEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppPendingEvidence_instance_phone_userId_sourceMessage_key" ON "WhatsAppPendingEvidence"("instance", "phone", "userId", "sourceMessageId");
CREATE INDEX "WhatsAppPendingEvidence_instance_phone_userId_captureId_sta_idx" ON "WhatsAppPendingEvidence"("instance", "phone", "userId", "captureId", "status", "sourceAt");
ALTER TABLE "WhatsAppPendingEvidence" ADD CONSTRAINT "WhatsAppPendingEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppPendingEvidence" ADD CONSTRAINT "WhatsAppPendingEvidence_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "SupplierCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppPendingEvidence" ADD CONSTRAINT "WhatsAppPendingEvidence_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "WhatsAppBurstMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppPendingEvidence" ADD CONSTRAINT "WhatsAppPendingEvidence_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "SupplierProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
