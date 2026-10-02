-- Additive: existing batches, captures and conversation state remain untouched.
CREATE TABLE "WhatsAppBurst" (
 "id" TEXT PRIMARY KEY, "instance" TEXT NOT NULL, "phone" TEXT NOT NULL,
 "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE, "version" INTEGER NOT NULL DEFAULT 2,
 "revision" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'OPEN',
 "dueAt" TIMESTAMP(3) NOT NULL, "leaseId" TEXT, "leaseUntil" TIMESTAMP(3),
 "attempts" INTEGER NOT NULL DEFAULT 0, "state" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "WhatsAppBurst_one_active_sender" ON "WhatsAppBurst" ("instance", "phone") WHERE "status" <> 'DONE';
CREATE INDEX "WhatsAppBurst_status_dueAt_idx" ON "WhatsAppBurst" ("status", "dueAt");
CREATE INDEX "WhatsAppBurst_instance_phone_createdAt_idx" ON "WhatsAppBurst" ("instance", "phone", "createdAt");
CREATE TABLE "WhatsAppBurstMessage" (
 "id" TEXT PRIMARY KEY, "burstId" TEXT NOT NULL REFERENCES "WhatsAppBurst"("id") ON DELETE CASCADE,
 "instance" TEXT NOT NULL, "messageId" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
 "sentAt" TIMESTAMP(3), "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "envelope" JSONB NOT NULL, "reading" JSONB
);
CREATE UNIQUE INDEX "WhatsAppBurstMessage_instance_messageId_key" ON "WhatsAppBurstMessage" ("instance", "messageId");
CREATE UNIQUE INDEX "WhatsAppBurstMessage_burstId_sequence_key" ON "WhatsAppBurstMessage" ("burstId", "sequence");
CREATE TABLE "WhatsAppBurstReply" (
 "id" TEXT PRIMARY KEY, "burstId" TEXT NOT NULL REFERENCES "WhatsAppBurst"("id") ON DELETE CASCADE,
 "revision" INTEGER NOT NULL, "text" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "leaseUntil" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "WhatsAppBurstReply_burstId_revision_key" ON "WhatsAppBurstReply" ("burstId", "revision");
CREATE INDEX "WhatsAppBurstReply_status_createdAt_idx" ON "WhatsAppBurstReply" ("status", "createdAt");
