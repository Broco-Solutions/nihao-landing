import { createProductMaterializer } from "./prisma-product-materializer.ts";
import { createBurstMaterializer } from "./burst-materializer.ts";
import { getPrisma } from "../../auth/prisma.ts";
import { AttachmentService } from "../../bot/attachments.ts";
import { createMistralExtractionProviderFromEnvironment, FetchMistralHttpClient } from "../../bot/extraction/mistral-extraction-provider.ts";
import { StorageBusinessCardResolver } from "../../bot/extraction/storage-business-card-resolver.ts";
import { SupplierExtractionService } from "../../bot/extraction/service.ts";
import { PrismaAttachmentRepository } from "../../bot/persistence/prisma-attachment-repository.ts";
import { PrismaSupplierCaptureRepository } from "../../bot/persistence/prisma-repository.ts";
import { getStorageProvider } from "../../bot/storage/index.ts";
import { createMistralTranscriptionProviderFromEnvironment } from "../../bot/transcription.ts";
import { createEvolutionClientFromEnvironment } from "../evolution/client.ts";
import { MistralBatchAnalyzer } from "./batch-association.ts";
import { PrismaBurstStore } from "./prisma-burst-store.ts";
import { BurstReader } from "./burst-reader.ts";
import { MistralBurstInterpreter } from "./burst-interpreter.ts";
import { WhatsAppBurstService } from "./burst-service.ts";

export const whatsappBurstsEnabled = () => process.env.WHATSAPP_BURSTS_ENABLED === "true";

export function createWhatsAppBurstService(): WhatsAppBurstService {
  const prisma = getPrisma();
  const store = new PrismaBurstStore(prisma);
  const storage = getStorageProvider();
  const client = createEvolutionClientFromEnvironment();
  const repository = new PrismaAttachmentRepository(prisma);
  const attachments = new AttachmentService(repository, storage);
  const captures = new PrismaSupplierCaptureRepository(prisma);
  const provider = createMistralExtractionProviderFromEnvironment({ businessCards: new StorageBusinessCardResolver(repository, storage) });
  const extraction = new SupplierExtractionService([provider]);
  const mistral = new FetchMistralHttpClient(process.env.MISTRAL_API_KEY!);
  const captureMaterializer = createBurstMaterializer({ store, storage, attachments, repository, captures, extraction });
  const productMaterializer = createProductMaterializer({ prisma, storage, attachments, repository, extraction });
  return new WhatsAppBurstService({
    store,
    reader: new BurstReader({ storage, client, analyzer: new MistralBatchAnalyzer(mistral), transcription: createMistralTranscriptionProviderFromEnvironment(), extraction: provider, mistral }),
    interpreter: new MistralBurstInterpreter(mistral),
    send: (phone, text) => client.sendText({ number: phone, text }),
    materialize: (snapshot, group) => group.kind === "PRODUCT" ? productMaterializer(snapshot, group) : captureMaterializer(snapshot, group),
  });
}
