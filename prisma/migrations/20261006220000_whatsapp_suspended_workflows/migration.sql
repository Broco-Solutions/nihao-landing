-- Keep suspended questions and queued ingestion units independent.
-- Existing data already satisfies this narrower worker ownership constraint.
CREATE UNIQUE INDEX "WhatsAppBurst_one_worker_sender"
ON "WhatsAppBurst" ("instance", "phone")
WHERE "status" IN ('PROCESSING', 'COMMITTING');
DROP INDEX "WhatsAppBurst_one_active_sender";
