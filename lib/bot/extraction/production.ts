import { AuthorizationError, requireTripAccess } from "../authorization.ts";
import type { AttachmentRepository } from "../attachments.ts";
import type { SupplierCaptureRepository, TripAccessRepository } from "../persistence/repository.ts";
import type { RawSource, SupplierCaptureRecord } from "../types.ts";
import { ValidationError } from "../validation.ts";
import { SupplierExtractionService } from "./service.ts";
import type { AttachmentTranscriptionService } from "../transcription.ts";

export type ProductExtractionInput = {
  userId: string;
  tripId: string;
  captureId?: string;
  text?: string;
  businessCardAttachmentIds: string[];
  audioAttachmentIds?: string[];
};

/**
 * Product composition boundary. It authorizes every capture and attachment
 * before the provider can read an object from private storage.
 */
export async function runProductExtraction(
  input: ProductExtractionInput,
  dependencies: {
    captures: SupplierCaptureRepository & TripAccessRepository;
    attachments: Pick<AttachmentRepository, "get">;
    transcription?: AttachmentTranscriptionService;
    extraction: SupplierExtractionService;
  },
): Promise<SupplierCaptureRecord> {
  const context = { userId: input.userId, tripId: input.tripId };
  await requireTripAccess(dependencies.captures, context);

  let capture: SupplierCaptureRecord | null = null;
  if (input.captureId) {
    capture = await dependencies.captures.getCapture(context, input.captureId);
    if (!capture) throw new ValidationError("Captura no encontrada en este viaje");
    if (capture.userId !== input.userId) throw new AuthorizationError("No podés modificar una captura creada por otra persona");
  }

  const text = input.text?.trim() || (capture?.source.type === "TEXT" ? capture.source.text?.trim() : undefined);
  const sources: RawSource[] = text ? [{ type: "TEXT", text }] : [];
  const attachmentIds = [...new Set(input.businessCardAttachmentIds)];
  for (const attachmentId of attachmentIds) {
    const attachment = await dependencies.attachments.get(attachmentId);
    if (!attachment || attachment.captureId !== input.captureId || attachment.tripId !== input.tripId || attachment.type !== "BUSINESS_CARD") {
      throw new AuthorizationError("La business card no pertenece a esta captura");
    }
    sources.push({ type: "IMAGE_BUSINESS_CARD", attachmentId });
  }
  for (const attachmentId of [...new Set(input.audioAttachmentIds ?? [])]) {
    const attachment = await dependencies.attachments.get(attachmentId);
    if (!attachment || attachment.captureId !== input.captureId || attachment.tripId !== input.tripId || attachment.type !== "AUDIO") {
      throw new AuthorizationError("El audio no pertenece a esta captura");
    }
    if (!dependencies.transcription) throw new ValidationError("La transcripción no está disponible");
    const transcript = await dependencies.transcription.transcribe(attachmentId);
    sources.push({ type: "AUDIO_TRANSCRIPT", text: transcript.text, attachmentId });
  }
  if (!sources.length) throw new ValidationError("Escribí una nota o adjuntá una business card antes de analizar");

  const extraction = await dependencies.extraction.extractMany(sources.map((source) => ({ source })));
  if (capture) return dependencies.captures.replaceExtraction(context, capture.id, extraction);
  return dependencies.captures.createDraft({ ...context, extraction });
}
