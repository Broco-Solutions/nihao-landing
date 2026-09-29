CREATE TABLE "WhatsAppBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "instance" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tripId" TEXT,
  "companyId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "dueAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "analysis" JSONB,
  "replySentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppBatch_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "TripCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "WhatsAppBatchMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "instance" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "text" TEXT,
  "storageKey" TEXT,
  "mimeType" TEXT,
  "ocrText" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "suggestedProvider" TEXT,
  "assignedCaptureId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppBatchMessage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WhatsAppBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WhatsAppBatch_status_dueAt_idx" ON "WhatsAppBatch"("status", "dueAt");
CREATE INDEX "WhatsAppBatch_instance_phone_createdAt_idx" ON "WhatsAppBatch"("instance", "phone", "createdAt");
CREATE UNIQUE INDEX "WhatsAppBatch_one_open_per_phone" ON "WhatsAppBatch"("instance", "phone") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "WhatsAppBatchMessage_instance_messageId_key" ON "WhatsAppBatchMessage"("instance", "messageId");
CREATE INDEX "WhatsAppBatchMessage_batchId_createdAt_idx" ON "WhatsAppBatchMessage"("batchId", "createdAt");
