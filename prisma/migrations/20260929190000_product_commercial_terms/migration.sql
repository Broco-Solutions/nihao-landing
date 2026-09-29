-- Preserve commercial terms from existing drafts as products before clearing
-- the former supplier-level columns. Existing named products take precedence.
INSERT INTO "SupplierProduct" (
  "id", "captureId", "supplierId", "name",
  "fobAmount", "fobCurrency", "fobUnit", "fobRawText",
  "moqQuantity", "moqUnit", "moqNotes", "moqRawText",
  "leadTimeRawText", "leadTimeDays", "updatedAt"
)
SELECT
  'legacy_' || c."id", c."id", s."id",
  COALESCE(
    NULLIF(btrim(split_part(split_part(c."sourceText", 'Producto:', 2), '.', 1)), ''),
    NULLIF(c."category", ''),
    'Producto sin nombre'
  ),
  c."fobAmount", c."fobCurrency", c."fobUnit", c."fobRawText",
  c."moqQuantity", c."moqUnit", c."moqNotes", c."moqRawText",
  c."leadTimeRawText", c."leadTimeDays", CURRENT_TIMESTAMP
FROM "SupplierCapture" c
LEFT JOIN "Supplier" s ON s."captureId" = c."id"
WHERE (
  c."fobAmount" IS NOT NULL OR c."fobCurrency" IS NOT NULL OR c."fobUnit" IS NOT NULL OR c."fobRawText" IS NOT NULL
  OR c."moqQuantity" IS NOT NULL OR c."moqUnit" IS NOT NULL OR c."moqNotes" IS NOT NULL OR c."moqRawText" IS NOT NULL
  OR c."leadTimeRawText" IS NOT NULL OR c."leadTimeDays" IS NOT NULL
)
AND NOT EXISTS (
  SELECT 1 FROM "SupplierProduct" p
  WHERE p."captureId" = c."id"
    AND (p."fobAmount" IS NOT NULL OR p."moqQuantity" IS NOT NULL OR p."leadTimeRawText" IS NOT NULL OR p."leadTimeDays" IS NOT NULL)
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "SupplierCapture" SET
  "fobAmount" = NULL, "fobCurrency" = NULL, "fobUnit" = NULL, "fobRawText" = NULL,
  "moqQuantity" = NULL, "moqUnit" = NULL, "moqNotes" = NULL, "moqRawText" = NULL,
  "leadTimeRawText" = NULL, "leadTimeDays" = NULL,
  "missingFields" = COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements("missingFields") value WHERE value NOT IN ('"fob"'::jsonb, '"moq"'::jsonb, '"leadTime"'::jsonb)), '[]'::jsonb),
  "reviewFields" = COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements("reviewFields") value WHERE value NOT IN ('"fob"'::jsonb, '"moq"'::jsonb, '"leadTime"'::jsonb)), '[]'::jsonb);

UPDATE "Supplier" SET
  "fobAmount" = NULL, "fobCurrency" = NULL, "fobUnit" = NULL, "fobRawText" = NULL,
  "moqQuantity" = NULL, "moqUnit" = NULL, "moqNotes" = NULL, "moqRawText" = NULL,
  "leadTimeRawText" = NULL, "leadTimeDays" = NULL,
  "pendingFields" = COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements("pendingFields") value WHERE value NOT IN ('"fob"'::jsonb, '"moq"'::jsonb, '"leadTime"'::jsonb)), '[]'::jsonb);
