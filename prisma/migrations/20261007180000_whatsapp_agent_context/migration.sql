CREATE TABLE "WhatsAppAgentContext" (
    "instance" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "focus" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppAgentContext_pkey" PRIMARY KEY ("instance", "phone", "userId")
);
ALTER TABLE "WhatsAppAgentContext" ADD CONSTRAINT "WhatsAppAgentContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
