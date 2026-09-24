ALTER TABLE "TripMember" ADD COLUMN "whatsappPhone" TEXT;

CREATE UNIQUE INDEX "TripMember_tripId_whatsappPhone_key"
ON "TripMember"("tripId", "whatsappPhone");
