CREATE TABLE "WhatsAppAgentOperation" (
 "id" TEXT PRIMARY KEY, "burstId" TEXT NOT NULL, "revision" INTEGER NOT NULL,
 "tool" TEXT NOT NULL, "arguments" JSONB NOT NULL, "result" JSONB NOT NULL,
 "status" TEXT NOT NULL, "expiresAt" TIMESTAMP(3), "displayedRevision" INTEGER,
 "approvedMessageId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "WhatsAppAgentOperation_burstId_fkey" FOREIGN KEY ("burstId") REFERENCES "WhatsAppBurst"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WhatsAppAgentOperation_burstId_status_idx" ON "WhatsAppAgentOperation"("burstId", "status");
