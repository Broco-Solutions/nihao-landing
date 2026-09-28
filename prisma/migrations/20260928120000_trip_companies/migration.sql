-- Stop before changing any data if legacy WhatsApp assignments cannot become unique per user.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "TripMember" WHERE "whatsappPhone" IS NOT NULL GROUP BY "userId" HAVING count(DISTINCT "whatsappPhone") > 1)
     OR EXISTS (SELECT 1 FROM "TripMember" WHERE "whatsappPhone" IS NOT NULL GROUP BY "whatsappPhone" HAVING count(DISTINCT "userId") > 1) THEN
    RAISE EXCEPTION 'Conflicting legacy WhatsApp numbers; resolve TripMember assignments before migration';
  END IF;
END $$;

ALTER TABLE "user" ADD COLUMN "whatsappPhone" TEXT;
UPDATE "user" AS u SET "whatsappPhone" = m."whatsappPhone"
FROM "TripMember" AS m WHERE m."userId" = u."id" AND m."whatsappPhone" IS NOT NULL;
CREATE UNIQUE INDEX "user_whatsappPhone_key" ON "user"("whatsappPhone");

CREATE TABLE "WhatsAppConversation" (
  "userId" TEXT NOT NULL, "tripId" TEXT, "companyId" TEXT,
  "stage" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppMessageReply" (
  "instance" TEXT NOT NULL, "messageId" TEXT NOT NULL, "phone" TEXT NOT NULL, "status" TEXT NOT NULL,
  "kind" TEXT, "text" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppMessageReply_pkey" PRIMARY KEY ("instance", "messageId")
);

CREATE TABLE "TripCompany" (
  "id" TEXT NOT NULL, "tripId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripCompany_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TripCompany_tripId_name_key" ON "TripCompany"("tripId", "name");
ALTER TABLE "TripCompany" ADD CONSTRAINT "TripCompany_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "TripCompany" ("id", "tripId", "name") SELECT 'legacy_' || md5("id"), "id", 'Empresa del viaje' FROM "Trip";

CREATE TABLE "TripCompanyMember" (
  "companyId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripCompanyMember_pkey" PRIMARY KEY ("companyId", "userId")
);
CREATE INDEX "TripCompanyMember_userId_idx" ON "TripCompanyMember"("userId");
ALTER TABLE "TripCompanyMember" ADD CONSTRAINT "TripCompanyMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "TripCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripCompanyMember" ADD CONSTRAINT "TripCompanyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "TripCompanyMember" ("companyId", "userId")
  SELECT 'legacy_' || md5(t."id"), m."userId" FROM "TripMember" m JOIN "Trip" t ON t."id" = m."tripId" WHERE m."role" = 'TRAVELER';

ALTER TABLE "TripInvitation" ADD COLUMN "companyId" TEXT;
UPDATE "TripInvitation" SET "companyId" = 'legacy_' || md5("tripId");
ALTER TABLE "TripInvitation" ALTER COLUMN "companyId" SET NOT NULL;
DROP INDEX "TripInvitation_tripId_email_status_key";
CREATE UNIQUE INDEX "TripInvitation_pending_company_email_key" ON "TripInvitation"("companyId", "email") WHERE "status" = 'PENDING';
ALTER TABLE "TripInvitation" ADD CONSTRAINT "TripInvitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "TripCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierCapture" ADD COLUMN "companyId" TEXT;
UPDATE "SupplierCapture" SET "companyId" = 'legacy_' || md5("tripId");
ALTER TABLE "SupplierCapture" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "SupplierCapture" ADD CONSTRAINT "SupplierCapture_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "TripCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SupplierCapture_companyId_idx" ON "SupplierCapture"("companyId");

ALTER TABLE "Supplier" ADD COLUMN "companyId" TEXT;
UPDATE "Supplier" SET "companyId" = 'legacy_' || md5("tripId");
ALTER TABLE "Supplier" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "TripCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");

DROP INDEX "TripMember_tripId_whatsappPhone_key";
ALTER TABLE "TripMember" DROP COLUMN "whatsappPhone";
