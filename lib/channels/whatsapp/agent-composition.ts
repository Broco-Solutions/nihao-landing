import { sendSupplierReply } from "./supplier-picker.ts";
import { createWhatsAppAIClient, OPENAI_AGENT_MODEL } from "./agent-provider.ts";
import { getPrisma } from "../../auth/prisma.ts";
import { AttachmentService } from "../../bot/attachments.ts";
import { PrismaAttachmentRepository } from "../../bot/persistence/prisma-attachment-repository.ts";
import { getStorageProvider } from "../../bot/storage/index.ts";
import { MistralExtractionProvider } from "../../bot/extraction/mistral-extraction-provider.ts";
import { StorageBusinessCardResolver } from "../../bot/extraction/storage-business-card-resolver.ts";
import { createMistralTranscriptionProviderFromEnvironment } from "../../bot/transcription.ts";
import { createEvolutionClientFromEnvironment } from "../evolution/client.ts";
import { MistralBatchAnalyzer } from "./batch-association.ts";
import { BurstReader } from "./burst-reader.ts";
import { PrismaBurstStore } from "./prisma-burst-store.ts";
import { PrismaAgentDomain } from "./prisma-agent-domain.ts";
import { WhatsAppAgentOrchestrator } from "./agent-orchestrator.ts";
import { WhatsAppAgentService } from "./agent-service.ts";

export const whatsappAgentEnabled = () => process.env.WHATSAPP_AGENT_TOOLS_ENABLED === "true";
export function createWhatsAppAgentService() {
  const prisma = getPrisma(); const storage = getStorageProvider();
  const repository = new PrismaAttachmentRepository(prisma); const attachments = new AttachmentService(repository, storage);
  const mistral = createWhatsAppAIClient();
  const provider = new MistralExtractionProvider({ client: mistral, businessCards: new StorageBusinessCardResolver(repository, storage) });
  const evolution = createEvolutionClientFromEnvironment();
  const domain = new PrismaAgentDomain(prisma, { storage, repository, attachments });
  return new WhatsAppAgentService({
    store: new PrismaBurstStore(prisma, { newVersion: whatsappAgentEnabled() ? 3 : 2, claimVersions: [3] }), domain,
    reader: new BurstReader({ storage, client: evolution, analyzer: new MistralBatchAnalyzer(mistral), transcription: createMistralTranscriptionProviderFromEnvironment(), extraction: provider, mistral }),
    orchestrator: new WhatsAppAgentOrchestrator({ client: mistral, extraction: provider, domain, model: process.env.WHATSAPP_AGENT_MODEL ?? OPENAI_AGENT_MODEL }),
    async save(id, revision, leaseId, state) { const changed = await prisma.whatsAppBurst.updateMany({ where: { id, revision, leaseId, status: "PROCESSING" }, data: { state: JSON.parse(JSON.stringify(state)) } }); return changed.count === 1; },
    send: (phone, text, context) => sendSupplierReply(evolution, phone, text, context),
  });
}
