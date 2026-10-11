CREATE TABLE "WhatsAppOperationalConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppOperationalConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppTravelerWelcome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "phone" TEXT,
    "text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ELIGIBILITY',
    "eligibleAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "sendStartedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "deliveryUpdatedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppTravelerWelcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppOperationalConsent_userId_phone_scope_key" ON "WhatsAppOperationalConsent"("userId", "phone", "scope");
CREATE INDEX "WhatsAppOperationalConsent_phone_scope_revokedAt_idx" ON "WhatsAppOperationalConsent"("phone", "scope", "revokedAt");
CREATE UNIQUE INDEX "WhatsAppTravelerWelcome_userId_tripId_key" ON "WhatsAppTravelerWelcome"("userId", "tripId");
CREATE INDEX "WhatsAppTravelerWelcome_status_createdAt_idx" ON "WhatsAppTravelerWelcome"("status", "createdAt");
CREATE INDEX "WhatsAppTravelerWelcome_providerMessageId_idx" ON "WhatsAppTravelerWelcome"("providerMessageId");
ALTER TABLE "WhatsAppOperationalConsent" ADD CONSTRAINT "WhatsAppOperationalConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppTravelerWelcome" ADD CONSTRAINT "WhatsAppTravelerWelcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppTravelerWelcome" ADD CONSTRAINT "WhatsAppTravelerWelcome_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
