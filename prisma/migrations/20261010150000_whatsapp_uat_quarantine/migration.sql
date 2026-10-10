CREATE TABLE "WhatsAppQuarantinedMessage" (
    "id" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "originalSha256" TEXT,
    "originalSize" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppQuarantinedMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppQuarantinedMessage_instance_messageId_key"
ON "WhatsAppQuarantinedMessage"("instance", "messageId");

CREATE INDEX "WhatsAppQuarantinedMessage_status_receivedAt_idx"
ON "WhatsAppQuarantinedMessage"("status", "receivedAt");

CREATE INDEX "WhatsAppQuarantinedMessage_instance_phone_receivedAt_idx"
ON "WhatsAppQuarantinedMessage"("instance", "phone", "receivedAt");
