-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "SupplierType" AS ENUM ('FACTORY', 'TRADING', 'UNKNOWN');
CREATE TYPE "CaptureStatus" AS ENUM ('DRAFT', 'CONFIRMED');
CREATE TYPE "CaptureSourceType" AS ENUM ('TEXT', 'IMAGE_BUSINESS_CARD', 'AUDIO_TRANSCRIPT');
CREATE TYPE "AttachmentType" AS ENUM ('BUSINESS_CARD', 'PRODUCT_IMAGE', 'AUDIO', 'OTHER');

-- Better Auth models
CREATE TABLE "user" (
    "id" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false, "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "session" (
    "id" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT, "userAgent" TEXT, "userId" TEXT NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "account" (
    "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "providerId" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "accessToken" TEXT, "refreshToken" TEXT, "idToken" TEXT, "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3), "scope" TEXT, "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "verification" (
    "id" TEXT NOT NULL, "identifier" TEXT NOT NULL, "value" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- Trip and capture domain
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL, "name" TEXT NOT NULL, "startDate" TIMESTAMP(3), "endDate" TIMESTAMP(3),
    "status" "TripStatus" NOT NULL DEFAULT 'PLANNED', "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TripMember" (
    "tripId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripMember_pkey" PRIMARY KEY ("tripId", "userId")
);
CREATE TABLE "SupplierCapture" (
    "id" TEXT NOT NULL, "tripId" TEXT NOT NULL, "createdById" TEXT NOT NULL,
    "status" "CaptureStatus" NOT NULL DEFAULT 'DRAFT', "sourceType" "CaptureSourceType" NOT NULL,
    "sourceText" TEXT, "sourceAttachmentId" TEXT, "companyName" TEXT, "city" TEXT, "province" TEXT,
    "contact" TEXT, "category" TEXT, "supplierType" "SupplierType" NOT NULL DEFAULT 'UNKNOWN',
    "fobAmount" DECIMAL(12,4), "fobCurrency" TEXT, "fobUnit" TEXT, "fobRawText" TEXT,
    "moqQuantity" INTEGER, "moqUnit" TEXT, "moqNotes" TEXT, "moqRawText" TEXT,
    "leadTimeRawText" TEXT, "leadTimeDays" INTEGER, "interestScore" INTEGER,
    "missingFields" JSONB NOT NULL, "reviewFields" JSONB NOT NULL, "acknowledgedUnknownFields" JSONB NOT NULL,
    "evidence" JSONB NOT NULL, "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierCapture_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL, "tripId" TEXT NOT NULL, "createdById" TEXT NOT NULL, "captureId" TEXT NOT NULL,
    "status" "CaptureStatus" NOT NULL DEFAULT 'CONFIRMED',
    "companyName" TEXT, "city" TEXT, "province" TEXT, "category" TEXT,
    "supplierType" "SupplierType" NOT NULL DEFAULT 'UNKNOWN',
    "fobAmount" DECIMAL(12,4), "fobCurrency" TEXT, "fobUnit" TEXT, "fobRawText" TEXT,
    "moqQuantity" INTEGER, "moqUnit" TEXT, "moqNotes" TEXT, "moqRawText" TEXT,
    "leadTimeRawText" TEXT, "leadTimeDays" INTEGER, "interestScore" INTEGER, "pendingFields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL, "supplierId" TEXT NOT NULL, "tripId" TEXT NOT NULL, "createdById" TEXT NOT NULL,
    "rawText" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierAttachment" (
    "id" TEXT NOT NULL, "supplierCaptureId" TEXT NOT NULL, "type" "AttachmentType" NOT NULL,
    "storageKey" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierAttachment_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");
CREATE INDEX "session_userId_idx" ON "session"("userId");
CREATE INDEX "account_userId_idx" ON "account"("userId");
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
CREATE INDEX "Trip_createdById_idx" ON "Trip"("createdById");
CREATE INDEX "TripMember_userId_idx" ON "TripMember"("userId");
CREATE INDEX "SupplierCapture_tripId_createdById_idx" ON "SupplierCapture"("tripId", "createdById");
CREATE UNIQUE INDEX "Supplier_captureId_key" ON "Supplier"("captureId");
CREATE INDEX "Supplier_tripId_updatedAt_idx" ON "Supplier"("tripId", "updatedAt");
CREATE INDEX "Supplier_createdById_idx" ON "Supplier"("createdById");
CREATE INDEX "SupplierContact_supplierId_idx" ON "SupplierContact"("supplierId");
CREATE INDEX "SupplierContact_tripId_createdById_idx" ON "SupplierContact"("tripId", "createdById");
CREATE UNIQUE INDEX "SupplierAttachment_storageKey_key" ON "SupplierAttachment"("storageKey");
CREATE INDEX "SupplierAttachment_supplierCaptureId_idx" ON "SupplierAttachment"("supplierCaptureId");

-- Foreign keys
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierCapture" ADD CONSTRAINT "SupplierCapture_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierCapture" ADD CONSTRAINT "SupplierCapture_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "SupplierCapture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierAttachment" ADD CONSTRAINT "SupplierAttachment_supplierCaptureId_fkey" FOREIGN KEY ("supplierCaptureId") REFERENCES "SupplierCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
