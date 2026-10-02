-- Stop if someone added company agenda entries after the production inspection.
-- They need an explicit owner assignment before this model can replace them.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "TripAgendaEntry") THEN
    RAISE EXCEPTION 'La agenda anterior contiene actividades; asignarlas a viajeros antes de migrar';
  END IF;
END $$;

-- Replace the empty company agenda with individual traveler entries.
DROP TABLE "TripAgendaEntry";

CREATE TABLE "TripAgendaEntry" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "time" TEXT NOT NULL,
  "place" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "instructions" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TripAgendaEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TripAgendaEntry_tripId_userId_date_time_idx" ON "TripAgendaEntry"("tripId", "userId", "date", "time");
ALTER TABLE "TripAgendaEntry" ADD CONSTRAINT "TripAgendaEntry_tripId_userId_fkey" FOREIGN KEY ("tripId", "userId") REFERENCES "TripMember"("tripId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
