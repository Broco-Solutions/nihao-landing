-- Operational state is additive. Existing messages, originals and replies stay intact.
ALTER TABLE "WhatsAppBurst"
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "processingFinishedAt" TIMESTAMP(3),
  ADD COLUMN "lastProgressAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastErrorAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorCode" TEXT;

UPDATE "WhatsAppBurst" SET "lastProgressAt" = "updatedAt";

ALTER TABLE "WhatsAppBurstMessage"
  ADD COLUMN "storageStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "storageAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "storedAt" TIMESTAMP(3),
  ADD COLUMN "storageLastErrorAt" TIMESTAMP(3),
  ADD COLUMN "storageLastErrorCode" TEXT;

UPDATE "WhatsAppBurstMessage"
SET "storageStatus" = CASE
  WHEN "envelope"->>'type' = 'TEXT' THEN 'NOT_REQUIRED'
  WHEN COALESCE("reading"->>'storageKey', '') <> '' THEN 'STORED'
  ELSE 'PENDING_STORAGE'
END,
"storedAt" = CASE
  WHEN COALESCE("reading"->>'storageKey', '') <> '' THEN "receivedAt"
  ELSE NULL
END;

ALTER TABLE "WhatsAppBurstReply"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FINAL',
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "sendStartedAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorCode" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "WhatsAppBurstReply"
SET "updatedAt" = "createdAt",
    "acceptedAt" = CASE WHEN "status" IN ('ACCEPTED', 'SERVER_ACK', 'DELIVERED', 'READ', 'PLAYED', 'SENT') THEN "createdAt" ELSE NULL END,
    "deliveryUpdatedAt" = CASE WHEN "status" IN ('SERVER_ACK', 'DELIVERED', 'READ', 'PLAYED', 'DELIVERY_FAILED') THEN "createdAt" ELSE NULL END;

DROP INDEX "WhatsAppBurstReply_burstId_revision_key";
CREATE UNIQUE INDEX "WhatsAppBurstReply_burstId_revision_kind_key" ON "WhatsAppBurstReply"("burstId", "revision", "kind");
CREATE INDEX "WhatsAppBurstReply_providerMessageId_idx" ON "WhatsAppBurstReply"("providerMessageId");

ALTER TABLE "WhatsAppQuarantinedMessage"
  ADD COLUMN "reason" TEXT NOT NULL DEFAULT 'QUARANTINE',
  ADD COLUMN "replyText" TEXT,
  ADD COLUMN "replyStatus" TEXT,
  ADD COLUMN "replyLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "replyProviderMessageId" TEXT,
  ADD COLUMN "replySendStartedAt" TIMESTAMP(3),
  ADD COLUMN "replyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "replyDeliveryUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "replyLastErrorAt" TIMESTAMP(3),
  ADD COLUMN "replyLastErrorCode" TEXT;

CREATE INDEX "WhatsAppQuarantinedMessage_replyStatus_receivedAt_idx" ON "WhatsAppQuarantinedMessage"("replyStatus", "receivedAt");
CREATE INDEX "WhatsAppQuarantinedMessage_replyProviderMessageId_idx" ON "WhatsAppQuarantinedMessage"("replyProviderMessageId");

CREATE TABLE "WhatsAppOperationalAlert" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "details" JSONB NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "recoveryNotifiedAt" TIMESTAMP(3),
  "notificationError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppOperationalAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppOperationalAlert_fingerprint_key" ON "WhatsAppOperationalAlert"("fingerprint");
CREATE INDEX "WhatsAppOperationalAlert_status_severity_lastSeenAt_idx" ON "WhatsAppOperationalAlert"("status", "severity", "lastSeenAt");

CREATE TABLE "WhatsAppOperationalState" (
  "id" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL,
  "evolutionState" TEXT NOT NULL,
  "lastWebhookAt" TIMESTAMP(3),
  "lastMessageReceivedAt" TIMESTAMP(3),
  "lastReplyAcceptedAt" TIMESTAMP(3),
  "lastDeliveryConfirmedAt" TIMESTAMP(3),
  "pendingCount" INTEGER NOT NULL DEFAULT 0,
  "oldestPendingAt" TIMESTAMP(3),
  "activeAlertCount" INTEGER NOT NULL DEFAULT 0,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppOperationalState_pkey" PRIMARY KEY ("id")
);
