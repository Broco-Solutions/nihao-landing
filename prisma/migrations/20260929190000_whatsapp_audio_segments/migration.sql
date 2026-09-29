ALTER TABLE "WhatsAppBatchMessage"
  ADD COLUMN "transcription" TEXT,
  ADD COLUMN "transcriptionModel" TEXT;

CREATE TABLE "WhatsAppAudioSegment" (
  "id" TEXT NOT NULL,
  "batchMessageId" TEXT NOT NULL,
  "segmentIndex" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "suggestedProvider" TEXT,
  "assignedCaptureId" TEXT,
  CONSTRAINT "WhatsAppAudioSegment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppAudioSegment_batchMessageId_segmentIndex_key" ON "WhatsAppAudioSegment"("batchMessageId", "segmentIndex");
CREATE INDEX "WhatsAppAudioSegment_assignedCaptureId_idx" ON "WhatsAppAudioSegment"("assignedCaptureId");

ALTER TABLE "WhatsAppAudioSegment" ADD CONSTRAINT "WhatsAppAudioSegment_batchMessageId_fkey"
  FOREIGN KEY ("batchMessageId") REFERENCES "WhatsAppBatchMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAudioSegment" ADD CONSTRAINT "WhatsAppAudioSegment_assignedCaptureId_fkey"
  FOREIGN KEY ("assignedCaptureId") REFERENCES "SupplierCapture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
