import { autoConfirmWebCapture } from "@/lib/bot/persistence/auto-confirmation";
import { requireTripTraveler } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { createMistralExtractionProviderFromEnvironment } from "@/lib/bot/extraction";
import { SupplierExtractionService } from "@/lib/bot/extraction/service";
import { runProductExtraction } from "@/lib/bot/extraction/production";
import { StorageBusinessCardResolver } from "@/lib/bot/extraction/storage-business-card-resolver";
import { apiError } from "@/lib/bot/http";
import { PrismaAttachmentRepository } from "@/lib/bot/persistence/prisma-attachment-repository";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";
import { getStorageProvider } from "@/lib/bot/storage";
import { AttachmentTranscriptionService, createMistralTranscriptionProviderFromEnvironment } from "@/lib/bot/transcription";
import { parseProductExtractionRequest } from "@/lib/bot/validation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";

export async function POST(request: Request) {
  try {
    const input = parseProductExtractionRequest(await request.json());
    const user = await getAuthenticatedUser();
    const prisma = getPrisma();
    await requireTripTraveler(new PrismaTripAccessRepository(prisma), { userId: user.id, tripId: input.tripId });
    const captures = new PrismaSupplierCaptureRepository(prisma);
    const attachments = new PrismaAttachmentRepository(prisma);
    const storage = getStorageProvider();
    const provider = createMistralExtractionProviderFromEnvironment({
      businessCards: new StorageBusinessCardResolver(attachments, storage),
    });
    const capture = await runProductExtraction({ ...input, userId: user.id }, {
      captures,
      attachments,
      transcription: new AttachmentTranscriptionService(attachments, storage, createMistralTranscriptionProviderFromEnvironment()),
      extraction: new SupplierExtractionService([provider]),
    });
    const confirmed = await autoConfirmWebCapture(prisma, { userId: user.id, tripId: input.tripId }, capture.id);
    return Response.json({ capture: confirmed }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
