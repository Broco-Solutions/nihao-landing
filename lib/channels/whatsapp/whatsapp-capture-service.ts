import { createHash } from "node:crypto";
import { SupplierExtractionService } from "../../bot/extraction/service.ts";
import { runProductExtraction } from "../../bot/extraction/production.ts";
import { AttachmentService, type AttachmentRepository } from "../../bot/attachments.ts";
import type { AttachmentTranscriptionService } from "../../bot/transcription.ts";
import { EMPTY_TIER_1_DATA, type StructuredExtractionResult } from "../../bot/types.ts";
import { calculateMissingFields } from "../../bot/tier1.ts";
import { ValidationError } from "../../bot/validation.ts";
import type { EvolutionGetMediaInput, EvolutionMediaMessage } from "../evolution/client.ts";
import type { SupplierCaptureRepository, TripAccessRepository } from "../../bot/persistence/repository.ts";
import { formatWhatsAppCaptureReply } from "./capture-formatter.ts";
import { resolveWhatsAppIdentity, type WhatsAppIdentityRepository } from "./identity.ts";

export type WhatsAppCaptureResult = { kind: "captured"; text: string } | { kind: "unlinked"; text: string } | { kind: "ambiguous"; text: string } | { kind: "failed"; text: string };
type CaptureRepository = SupplierCaptureRepository & TripAccessRepository;

export function whatsappCaptureId(instance: string, messageId: string) {
  return `wa_${createHash("sha256").update(`${instance}:${messageId}`).digest("hex")}`;
}

export function whatsappEvidenceId(instance: string, messageId: string) {
  return `wae_${createHash("sha256").update(`${instance}:${messageId}`).digest("hex")}`;
}

export function normalizeMediaMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function emptyAttachmentExtraction(type: "IMAGE" | "AUDIO", attachmentId: string): StructuredExtractionResult {
  return {
    rawSource: { type: type === "IMAGE" ? "IMAGE_BUSINESS_CARD" : "AUDIO_TRANSCRIPT", attachmentId },
    mergedSources: [],
    extractedFields: { ...EMPTY_TIER_1_DATA },
    missingFields: calculateMissingFields(EMPTY_TIER_1_DATA),
    reviewFields: [],
    evidence: [],
  };
}

export class WhatsAppCaptureService {
  private static readonly pending = new Map<string, Promise<WhatsAppCaptureResult>>();
  constructor(private readonly dependencies: {
    identities: WhatsAppIdentityRepository;
    captures: CaptureRepository;
    attachments?: AttachmentService & Pick<AttachmentRepository, "get">;
    transcription?: AttachmentTranscriptionService;
    extraction: SupplierExtractionService;
  }) {}

  async capture(input: {
    instance: string; messageId: string; phone: string; type?: "TEXT" | "IMAGE" | "AUDIO"; text?: string;
    media?: EvolutionMediaMessage; getMedia?: (input: EvolutionGetMediaInput) => Promise<{ bytes: Uint8Array; mimeType: string }>;
  }): Promise<WhatsAppCaptureResult> {
    const key = `${input.instance}:${input.messageId}`;
    const pending = WhatsAppCaptureService.pending.get(key);
    if (pending) return pending;
    const task = this.captureFresh(input);
    WhatsAppCaptureService.pending.set(key, task);
    try {
      return await task;
    } finally {
      if (WhatsAppCaptureService.pending.get(key) === task) WhatsAppCaptureService.pending.delete(key);
    }
  }

  private async captureFresh(input: {
    instance: string; messageId: string; phone: string; type?: "TEXT" | "IMAGE" | "AUDIO"; text?: string;
    media?: EvolutionMediaMessage; getMedia?: (input: EvolutionGetMediaInput) => Promise<{ bytes: Uint8Array; mimeType: string }>;
  }): Promise<WhatsAppCaptureResult> {
    const resolution = await resolveWhatsAppIdentity(input.phone, this.dependencies.identities);
    if (resolution.kind === "unlinked") return { kind: "unlinked", text: "Este número todavía no está vinculado a Nihao. Entrá a Nihao y vinculá tu WhatsApp en tu viaje." };
    if (resolution.kind === "ambiguous") return { kind: "ambiguous", text: "Tenés más de un viaje disponible en Nihao. Por ahora ingresá a la app para continuar." };
    const context = { userId: resolution.identity.userId, tripId: resolution.identity.tripId };
    const captureId = whatsappCaptureId(input.instance, input.messageId);
    const existing = await this.dependencies.captures.getCapture(context, captureId);
    if (existing) return { kind: "captured", text: formatWhatsAppCaptureReply(existing) };
    const type = input.type ?? "TEXT";
    try {
      if (type === "TEXT") {
        if (!input.text) throw new ValidationError("Escribí un mensaje para analizar");
        const capture = await runProductExtraction({ ...context, clientCaptureId: captureId, text: input.text, businessCardAttachmentIds: [] }, { captures: this.dependencies.captures, attachments: { async get() { return null; } }, extraction: this.dependencies.extraction });
        return { kind: "captured", text: formatWhatsAppCaptureReply(capture) };
      }
      if (!input.media || !input.getMedia || !this.dependencies.attachments) throw new Error("La media no está disponible");
      const evidenceId = whatsappEvidenceId(input.instance, input.messageId);
      // Create the DRAFT first so AttachmentService remains the single authorized upload path.
      await this.dependencies.captures.createDraft({ ...context, clientCaptureId: captureId, extraction: emptyAttachmentExtraction(type, evidenceId) });
      let media: { bytes: Uint8Array; mimeType: string };
      try {
        media = await input.getMedia({ message: input.media });
      } catch {
        return { kind: "failed", text: "No pude descargar ese archivo. Probá enviándolo nuevamente." };
      }
      const attachment = await this.dependencies.attachments.upload({
        ...context, captureId, clientEvidenceId: evidenceId, type: type === "IMAGE" ? "BUSINESS_CARD" : "AUDIO",
        mimeType: normalizeMediaMimeType(media.mimeType), size: media.bytes.byteLength, body: media.bytes,
      });
      const capture = await runProductExtraction({
        ...context, captureId, businessCardAttachmentIds: type === "IMAGE" ? [attachment.id] : [],
        audioAttachmentIds: type === "AUDIO" ? [attachment.id] : [],
      }, { captures: this.dependencies.captures, attachments: this.dependencies.attachments, transcription: this.dependencies.transcription, extraction: this.dependencies.extraction });
      return { kind: "captured", text: formatWhatsAppCaptureReply(capture) };
    } catch (error) {
      if (error instanceof ValidationError) return { kind: "failed", text: error.message };
      return { kind: "failed", text: type === "TEXT" ? "No pude analizar ese mensaje. Probá nuevamente en unos segundos." : "No pude analizar ese archivo. Podés reintentarlo o cargarlo desde Nihao." };
    }
  }
}
