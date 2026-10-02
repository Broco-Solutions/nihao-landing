CREATE TABLE "TripAgendaEntry" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "city" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TripAgendaEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TripAgendaEntry_tripId_companyId_date_idx" ON "TripAgendaEntry"("tripId", "companyId", "date");
ALTER TABLE "TripAgendaEntry" ADD CONSTRAINT "TripAgendaEntry_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripAgendaEntry" ADD CONSTRAINT "TripAgendaEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "TripCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TripFeedback" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TripFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TripFeedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "TripFeedback_tripId_userId_key" ON "TripFeedback"("tripId", "userId");
CREATE INDEX "TripFeedback_tripId_idx" ON "TripFeedback"("tripId");
ALTER TABLE "TripFeedback" ADD CONSTRAINT "TripFeedback_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripFeedback" ADD CONSTRAINT "TripFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
