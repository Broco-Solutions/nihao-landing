import { getPrisma } from "../../auth/prisma.ts";
import { createMistralExtractionProviderFromEnvironment } from "../../bot/extraction/index.ts";
import { SupplierExtractionService } from "../../bot/extraction/service.ts";
import { PrismaSupplierCaptureRepository } from "../../bot/persistence/prisma-repository.ts";
import { PrismaWhatsAppIdentityRepository } from "./prisma-identity-repository.ts";
import { WhatsAppCaptureService } from "./whatsapp-capture-service.ts";

/** Server-only composition for the WhatsApp text flow. */
export function createWhatsAppCaptureService(): WhatsAppCaptureService {
  const prisma = getPrisma();
  return new WhatsAppCaptureService({
    identities: new PrismaWhatsAppIdentityRepository(prisma),
    captures: new PrismaSupplierCaptureRepository(prisma),
    extraction: new SupplierExtractionService([createMistralExtractionProviderFromEnvironment({ businessCards: { async resolve() { throw new Error("Business cards no disponibles por WhatsApp"); } } })]),
  });
}
