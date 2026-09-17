-- Add roles to the trip membership boundary without changing existing rows.
CREATE TYPE "TripMemberRole" AS ENUM ('ADMIN', 'TRAVELER');

ALTER TABLE "TripMember"
ADD COLUMN "role" "TripMemberRole" NOT NULL DEFAULT 'TRAVELER';

-- The creator is the administrator of every existing trip. All other
-- memberships retain the safe default TRAVELER role.
UPDATE "TripMember" AS member
SET "role" = 'ADMIN'
FROM "Trip" AS trip
WHERE member."tripId" = trip."id"
  AND member."userId" = trip."createdById";
