ALTER TABLE "Trip" ADD COLUMN "publicSlug" TEXT;

UPDATE "Trip"
SET "publicSlug" =
  coalesce(nullif(trim(both '-' from regexp_replace(
    lower(translate("name", 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
    '[^a-z0-9]+', '-', 'g'
  )), ''), 'viaje') || '-' || left("id", 8);

CREATE UNIQUE INDEX "Trip_publicSlug_key" ON "Trip"("publicSlug");
