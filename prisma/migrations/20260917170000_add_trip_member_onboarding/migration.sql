ALTER TABLE "TripMember" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Existing members already use the product and must not be unexpectedly gated.
-- New invitation-created TRAVELER rows keep the nullable default.
UPDATE "TripMember"
SET "onboardingCompletedAt" = CURRENT_TIMESTAMP
WHERE "onboardingCompletedAt" IS NULL;
