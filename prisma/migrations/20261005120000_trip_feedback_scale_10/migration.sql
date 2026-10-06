BEGIN;

ALTER TABLE "TripFeedback" DROP CONSTRAINT "TripFeedback_rating_check";

-- Preserve the meaning of feedback collected on the previous five-point scale.
UPDATE "TripFeedback" SET "rating" = "rating" * 2;

ALTER TABLE "TripFeedback"
  ADD CONSTRAINT "TripFeedback_rating_check" CHECK ("rating" BETWEEN 0 AND 10);

COMMIT;
