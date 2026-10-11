ALTER TABLE "SupplierProduct" ADD COLUMN "invalidatedAt" TIMESTAMP(3), ADD COLUMN "invalidationReason" TEXT;
CREATE TABLE "HistoricalCorrection" (
  "id" TEXT NOT NULL,
  "manifestHash" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "beforeSnapshot" JSONB NOT NULL,
  "afterSnapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPLIED',
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revertedAt" TIMESTAMP(3),
  CONSTRAINT "HistoricalCorrection_pkey" PRIMARY KEY ("id")
);
