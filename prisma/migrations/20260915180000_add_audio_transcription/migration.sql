ALTER TABLE "SupplierAttachment"
  ADD COLUMN "transcription" TEXT,
  ADD COLUMN "transcriptionModel" TEXT,
  ADD COLUMN "transcribedAt" TIMESTAMP(3);
