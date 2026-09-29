import { getPrisma } from "../../auth/prisma.ts";
import { AttachmentService } from "../../bot/attachments.ts";
import { createMistralExtractionProviderFromEnvironment } from "../../bot/extraction/index.ts";
import { StorageBusinessCardResolver } from "../../bot/extraction/storage-business-card-resolver.ts";
import { SupplierExtractionService } from "../../bot/extraction/service.ts";
import { createMistralTranscriptionProviderFromEnvironment } from "../../bot/transcription.ts";
import { PrismaAttachmentRepository } from "../../bot/persistence/prisma-attachment-repository.ts";
import { PrismaSupplierCaptureRepository } from "../../bot/persistence/prisma-repository.ts";
import { getStorageProvider } from "../../bot/storage/index.ts";
import { createEvolutionClientFromEnvironment } from "../evolution/client.ts";
import { createMistralBatchAnalyzer } from "./batch-association.ts";
import { WhatsAppBatchService } from "./batch-service.ts";
import { PrismaWhatsAppConversationRepository } from "./prisma-conversation-repository.ts";

export function createWhatsAppBatchService(): WhatsAppBatchService {
  const prisma = getPrisma();
  const repository = new PrismaAttachmentRepository(prisma);
  const storage = getStorageProvider();
  const conversations = new PrismaWhatsAppConversationRepository(prisma);
  return new WhatsAppBatchService({
    prisma,
    storage,
    analyzer: createMistralBatchAnalyzer(),
    transcription: createMistralTranscriptionProviderFromEnvironment(),
    captures: new PrismaSupplierCaptureRepository(prisma),
    attachments: Object.assign(new AttachmentService(repository, storage), { get: repository.get.bind(repository) }),
    extraction: new SupplierExtractionService([createMistralExtractionProviderFromEnvironment({ businessCards: new StorageBusinessCardResolver(repository, storage) })]),
    client: createEvolutionClientFromEnvironment(),
    completeConversation: (userId) => conversations.complete(userId),
  });
}
