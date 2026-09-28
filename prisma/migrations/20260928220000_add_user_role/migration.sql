CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TRAVELER');

ALTER TABLE "user" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'TRAVELER';

-- Keep existing trip administrators able to create and administer trips.
UPDATE "user" SET "role" = 'ADMIN'
WHERE "id" IN (
  SELECT "createdById" FROM "Trip"
  UNION
  SELECT "userId" FROM "TripMember" WHERE "role" = 'ADMIN'
);
