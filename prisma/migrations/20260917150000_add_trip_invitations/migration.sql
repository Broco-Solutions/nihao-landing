CREATE TYPE "TripInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED');

CREATE TABLE "TripInvitation" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" "TripInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripInvitation_tokenHash_key" ON "TripInvitation"("tokenHash");
CREATE UNIQUE INDEX "TripInvitation_tripId_email_status_key" ON "TripInvitation"("tripId", "email", "status");
CREATE INDEX "TripInvitation_tripId_status_idx" ON "TripInvitation"("tripId", "status");

ALTER TABLE "TripInvitation" ADD CONSTRAINT "TripInvitation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
