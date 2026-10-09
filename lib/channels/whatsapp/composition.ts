import { getPrisma } from "../../auth/prisma.ts";
import { createMistralExtractionProviderFromEnvironment } from "../../bot/extraction/index.ts";
import { StorageBusinessCardResolver } from "../../bot/extraction/storage-business-card-resolver.ts";
import { AttachmentService } from "../../bot/attachments.ts";
import { PrismaAttachmentRepository } from "../../bot/persistence/prisma-attachment-repository.ts";
import { getStorageProvider } from "../../bot/storage/index.ts";
import { AttachmentTranscriptionService, createMistralTranscriptionProviderFromEnvironment } from "../../bot/transcription.ts";
import { SupplierExtractionService } from "../../bot/extraction/service.ts";
import { OperationsCaptureRepository } from "../../nihao/operations/capture-repository-adapter.ts";
import { PrismaWhatsAppIdentityRepository } from "./prisma-identity-repository.ts";
import { WhatsAppCaptureService } from "./whatsapp-capture-service.ts";
import { PrismaWhatsAppCardRepository } from "./prisma-card-repository.ts";
import { PrismaWhatsAppConversationRepository } from "./prisma-conversation-repository.ts";
import { PrismaWhatsAppMessageReplyRepository } from "./prisma-message-reply-repository.ts";
import { createWhatsAppBatchService } from "./batch-composition.ts";
import { createWhatsAppTextIntentClassifier } from "./text-intent.ts";

/** Server-only composition: WhatsApp is a channel adapter over the web capture pipeline. */
export function createWhatsAppCaptureService(): WhatsAppCaptureService {
  const prisma = getPrisma();
  const attachments = new PrismaAttachmentRepository(prisma);
  const storage = getStorageProvider();
  return new WhatsAppCaptureService({
    identities: new PrismaWhatsAppIdentityRepository(prisma),
    conversations: new PrismaWhatsAppConversationRepository(prisma),
    replies: new PrismaWhatsAppMessageReplyRepository(prisma),
    captures: new OperationsCaptureRepository(prisma, "automation"),
    cards: new PrismaWhatsAppCardRepository(prisma),
    attachments: Object.assign(new AttachmentService(attachments, storage), { get: attachments.get.bind(attachments) }),
    transcription: new AttachmentTranscriptionService(attachments, storage, createMistralTranscriptionProviderFromEnvironment()),
    extraction: new SupplierExtractionService([createMistralExtractionProviderFromEnvironment({ businessCards: new StorageBusinessCardResolver(attachments, storage) })]),
    batches: createWhatsAppBatchService(),
    textIntent: createWhatsAppTextIntentClassifier(),
  });
}
