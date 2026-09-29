CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- Keep one catalog record per existing association. Equal names may represent
-- different legal entities and must only be merged after review.
INSERT INTO "Company" ("id", "name", "normalizedName", "createdAt", "updatedAt")
SELECT "id", "name", lower(regexp_replace(btrim("name"), '[[:space:]]+', ' ', 'g')), "createdAt", "updatedAt" FROM "TripCompany";

ALTER TABLE "TripCompany" ADD COLUMN "catalogCompanyId" TEXT;
ALTER TABLE "TripCompany" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
UPDATE "TripCompany" SET "catalogCompanyId" = "id";
ALTER TABLE "TripCompany" ALTER COLUMN "catalogCompanyId" SET NOT NULL;
DROP INDEX "TripCompany_tripId_name_key";
ALTER TABLE "TripCompany" DROP COLUMN "name";
CREATE INDEX "Company_normalizedName_idx" ON "Company"("normalizedName");
CREATE UNIQUE INDEX "Company_dedupeKey_key" ON "Company"("dedupeKey");
CREATE UNIQUE INDEX "TripCompany_tripId_catalogCompanyId_key" ON "TripCompany"("tripId", "catalogCompanyId");
ALTER TABLE "TripCompany" ADD CONSTRAINT "TripCompany_catalogCompanyId_fkey" FOREIGN KEY ("catalogCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
