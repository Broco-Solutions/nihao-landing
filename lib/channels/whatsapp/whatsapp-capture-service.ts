import { createHash } from "node:crypto";
import { SupplierExtractionService } from "../../bot/extraction/service.ts";
import { runProductExtraction } from "../../bot/extraction/production.ts";
import type { SupplierCaptureRepository, TripAccessRepository } from "../../bot/persistence/repository.ts";
import { formatWhatsAppCaptureReply } from "./capture-formatter.ts";
import { resolveWhatsAppIdentity, type WhatsAppIdentityRepository } from "./identity.ts";

export type WhatsAppCaptureResult = { kind: "captured"; text: string } | { kind: "unlinked"; text: string } | { kind: "ambiguous"; text: string } | { kind: "failed"; text: string };
type CaptureRepository = SupplierCaptureRepository & TripAccessRepository;

export function whatsappCaptureId(instance: string, messageId: string) {
  return `wa_${createHash("sha256").update(`${instance}:${messageId}`).digest("hex")}`;
}

export class WhatsAppCaptureService {
  constructor(private readonly dependencies: { identities: WhatsAppIdentityRepository; captures: CaptureRepository; extraction: SupplierExtractionService }) {}

  async capture(input: { instance: string; messageId: string; phone: string; text: string }): Promise<WhatsAppCaptureResult> {
    const resolution = await resolveWhatsAppIdentity(input.phone, this.dependencies.identities);
    if (resolution.kind === "unlinked") return { kind: "unlinked", text: "Este número todavía no está vinculado a Nihao. Entrá a Nihao y vinculá tu WhatsApp en tu viaje." };
    if (resolution.kind === "ambiguous") return { kind: "ambiguous", text: "Tenés más de un viaje disponible en Nihao. Por ahora ingresá a la app para continuar." };
    const context = { userId: resolution.identity.userId, tripId: resolution.identity.tripId };
    const captureId = whatsappCaptureId(input.instance, input.messageId);
    const existing = await this.dependencies.captures.getCapture(context, captureId);
    if (existing) return { kind: "captured", text: formatWhatsAppCaptureReply(existing) };
    try {
      const capture = await runProductExtraction({ ...context, clientCaptureId: captureId, text: input.text, businessCardAttachmentIds: [] }, { captures: this.dependencies.captures, attachments: { async get() { return null; } }, extraction: this.dependencies.extraction });
      return { kind: "captured", text: formatWhatsAppCaptureReply(capture) };
    } catch {
      return { kind: "failed", text: "No pude analizar ese mensaje. Probá nuevamente en unos segundos." };
    }
  }
}
