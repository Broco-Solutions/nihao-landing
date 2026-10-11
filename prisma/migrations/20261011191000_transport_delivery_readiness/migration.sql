ALTER TABLE "WhatsAppBurstReply" ADD COLUMN "partIndex" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "WhatsAppBurstReply_burstId_revision_partIndex_idx" ON "WhatsAppBurstReply"("burstId", "revision", "partIndex");
ALTER TABLE "WhatsAppQuarantinedMessage" ADD COLUMN "recoveryAttempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "nextRecoveryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "recoveryLeaseUntil" TIMESTAMP(3);
CREATE INDEX "WhatsAppQuarantinedMessage_status_nextRecoveryAt_idx" ON "WhatsAppQuarantinedMessage"("status", "nextRecoveryAt");
CREATE TABLE "WhatsAppDeliveryEvent" (
 "id" TEXT NOT NULL, "instance" TEXT NOT NULL, "providerMessageId" TEXT NOT NULL, "status" TEXT NOT NULL,
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "appliedAt" TIMESTAMP(3), "lastReconcileAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WhatsAppDeliveryEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppDeliveryEvent_instance_providerMessageId_status_key" ON "WhatsAppDeliveryEvent"("instance", "providerMessageId", "status");
CREATE INDEX "WhatsAppDeliveryEvent_appliedAt_receivedAt_idx" ON "WhatsAppDeliveryEvent"("appliedAt", "receivedAt");
CREATE TABLE "WhatsAppOperationalNotification" (
 "id" TEXT NOT NULL, "alertId" TEXT NOT NULL, "episode" TIMESTAMP(3) NOT NULL, "transition" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" TIMESTAMP(3), "sentAt" TIMESTAMP(3), "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "WhatsAppOperationalNotification_pkey" PRIMARY KEY ("id"), CONSTRAINT "WhatsAppOperationalNotification_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "WhatsAppOperationalAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WhatsAppOperationalNotification_alertId_episode_transition_key" ON "WhatsAppOperationalNotification"("alertId", "episode", "transition");
CREATE INDEX "WhatsAppOperationalNotification_status_nextAttemptAt_idx" ON "WhatsAppOperationalNotification"("status", "nextAttemptAt");
CREATE TABLE "WhatsAppServiceHeartbeat" ("id" TEXT NOT NULL, "checkedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "WhatsAppServiceHeartbeat_pkey" PRIMARY KEY ("id"));
