-- Keep the existing SupplierAttachment collection as the evidence model.
-- These fields only track draft provenance so a re-analysis cannot overwrite
-- an explicit human correction or leave deleted analyzed evidence unnoticed.
ALTER TABLE "SupplierCapture"
  ADD COLUMN "humanCorrectedFields" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "analyzedAttachmentIds" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "needsReanalysis" BOOLEAN NOT NULL DEFAULT false;
