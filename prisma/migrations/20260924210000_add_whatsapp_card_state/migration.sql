CREATE TYPE "WhatsAppCardState" AS ENUM ('PENDING', 'ANALYZING', 'ANALYZED');

ALTER TABLE "SupplierCapture"
ADD COLUMN "whatsappCardState" "WhatsAppCardState";

CREATE UNIQUE INDEX "SupplierCapture_one_active_whatsapp_card_per_user_trip"
ON "SupplierCapture" ("tripId", "createdById")
WHERE "whatsappCardState" IN ('PENDING'::"WhatsAppCardState", 'ANALYZING'::"WhatsAppCardState");

CREATE TYPE "WhatsAppCommand" AS ENUM ('ANALYZE_CARD');
CREATE TYPE "WhatsAppCommandStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED', 'IGNORED');

CREATE TABLE "WhatsAppCommandReceipt" (
  "id" TEXT NOT NULL,
  "instance" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "command" "WhatsAppCommand" NOT NULL,
  "status" "WhatsAppCommandStatus" NOT NULL,
  "tripId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "supplierCaptureId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppCommandReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppCommandReceipt_instance_messageId_key"
ON "WhatsAppCommandReceipt" ("instance", "messageId");
CREATE INDEX "WhatsAppCommandReceipt_supplierCaptureId_idx"
ON "WhatsAppCommandReceipt" ("supplierCaptureId");
ALTER TABLE "WhatsAppCommandReceipt"
ADD CONSTRAINT "WhatsAppCommandReceipt_supplierCaptureId_fkey"
FOREIGN KEY ("supplierCaptureId") REFERENCES "SupplierCapture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Serialize attachment inserts against the capture state transition and enforce the three-photo limit.
CREATE FUNCTION enforce_whatsapp_card_attachment_limit() RETURNS trigger AS $$
DECLARE
  card_state "WhatsAppCardState";
  card_count integer;
BEGIN
  IF NEW."type" <> 'BUSINESS_CARD' THEN
    RETURN NEW;
  END IF;

  SELECT "whatsappCardState" INTO card_state
  FROM "SupplierCapture"
  WHERE "id" = NEW."supplierCaptureId"
  FOR UPDATE;

  IF card_state IS NULL THEN
    RETURN NEW;
  END IF;

  IF card_state <> 'PENDING' THEN
    RAISE EXCEPTION 'WhatsApp card does not accept images in state %', card_state USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO card_count
  FROM "SupplierAttachment"
  WHERE "supplierCaptureId" = NEW."supplierCaptureId" AND "type" = 'BUSINESS_CARD';

  IF card_count >= 3 THEN
    RAISE EXCEPTION 'WhatsApp card has the maximum of three images' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SupplierAttachment_whatsapp_card_limit"
BEFORE INSERT ON "SupplierAttachment"
FOR EACH ROW EXECUTE FUNCTION enforce_whatsapp_card_attachment_limit();
