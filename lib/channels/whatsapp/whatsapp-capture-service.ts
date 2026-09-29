import { createHash } from "node:crypto";
import { SupplierExtractionService } from "../../bot/extraction/service.ts";
import { runProductExtraction } from "../../bot/extraction/production.ts";
import { AttachmentService, validateAttachmentContent, validateAttachmentFile, type AttachmentRepository } from "../../bot/attachments.ts";
import type { AttachmentTranscriptionService } from "../../bot/transcription.ts";
import { EMPTY_TIER_1_DATA, type StructuredExtractionResult } from "../../bot/types.ts";
import { calculateMissingFields } from "../../bot/tier1.ts";
import { ValidationError } from "../../bot/validation.ts";
import type { EvolutionGetMediaInput, EvolutionMediaMessage } from "../evolution/client.ts";
import type { SupplierCaptureRepository, TripAccessRepository } from "../../bot/persistence/repository.ts";
import { formatWhatsAppCaptureReply } from "./capture-formatter.ts";
import { resolveWhatsAppIdentity, type WhatsAppIdentityRepository } from "./identity.ts";
import type { CardContext, WhatsAppCardRepository } from "./prisma-card-repository.ts";
import type { WhatsAppTextIntent } from "./text-intent.ts";

type ConversationRepository = { select(phone: string, message: string | undefined): Promise<{ kind: "ready"; userId: string; tripId: string; companyId: string } | { kind: "prompt"; text: string } | { kind: "unlinked" }>; complete(userId: string): Promise<void> };
type MessageReplyRepository = { claim(instance: string, messageId: string, phone: string): Promise<{ kind: "owned" } | { kind: "completed"; reply: WhatsAppCaptureResult } | { kind: "processing" }>; complete(instance: string, messageId: string, reply: WhatsAppCaptureResult): Promise<void> };
type BatchIntake = {
  receive(input: { instance: string; messageId: string; phone: string; type: "TEXT" | "IMAGE" | "AUDIO"; text?: string; media?: EvolutionMediaMessage; getMedia?: (input: EvolutionGetMediaInput) => Promise<{ bytes: Uint8Array; mimeType: string }> }, context: { userId: string; tripId: string; companyId: string }): Promise<WhatsAppCaptureResult>;
  receiveUnresolved(input: { instance: string; messageId: string; phone: string; type: "TEXT" | "IMAGE" | "AUDIO"; text?: string; media?: EvolutionMediaMessage; getMedia?: (input: EvolutionGetMediaInput) => Promise<{ bytes: Uint8Array; mimeType: string }> }): Promise<WhatsAppCaptureResult>;
  assignFromConversation(phone: string): Promise<boolean>;
  flush(context: { userId: string; tripId: string; companyId: string }): Promise<boolean>;
};

export type WhatsAppCaptureResult = { kind: "captured"; text: string } | { kind: "unlinked"; text: string } | { kind: "ambiguous"; text: string } | { kind: "failed"; text: string };
type CaptureRepository = SupplierCaptureRepository & TripAccessRepository;
const ANALYZING_STALE_MS = 10 * 60 * 1000;
const FIRST_PHOTO_REPLY = "Foto recibida ✅\nSi la tarjeta tiene otra cara, mandala ahora.\nCuando termines escribí: analizar tarjeta";
const SECOND_PHOTO_REPLY = "Segunda foto recibida ✅\nCuando termines escribí: analizar tarjeta";
const THIRD_PHOTO_REPLY = "Tercera foto recibida ✅\nYa tenés el máximo de 3 fotos.\nEscribí: analizar tarjeta";
const FOURTH_PHOTO_REPLY = "Esta tarjeta ya tiene el máximo de 3 fotos.\nEscribí: analizar tarjeta";
const ANALYZING_REPLY = "La tarjeta se está analizando. Te aviso cuando termine.";
const NO_PENDING_REPLY = "No tenés una tarjeta pendiente para analizar.";
const HELP_REPLY = "Hola, soy Nihao 👋\nPodés enviarme datos de proveedores por texto, fotos de tarjetas o productos y notas de voz. Si mandás varios mensajes seguidos, los agrupo y te pregunto cuando una imagen no se pueda asociar con seguridad. Revisá y confirmá los borradores en la web de Nihao. Las consultas de proveedores también están disponibles en la web.";
const WEB_LOOKUP_REPLY = "Podés consultar los proveedores y borradores en la web de Nihao. Por WhatsApp recibo información para cargarlos y te ayudo con las instrucciones.";

function isControlMessage(value: string): boolean {
  const text = value.trim().toLocaleLowerCase("es");
  return /^(?:cambiar|viaje|empresa|analizar tarjeta|\d{1,2})$/u.test(text) || /^(?:foto|mensaje)\s+\d{1,2}\s*=\s*.+$/u.test(text) || /^audio\s+\d{1,2}\s+fragmento\s+\d{1,2}\s*=\s*.+$/u.test(text);
}

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
    conversations?: ConversationRepository;
    replies?: MessageReplyRepository;
    captures: CaptureRepository;
    cards: WhatsAppCardRepository;
    attachments?: AttachmentService & Pick<AttachmentRepository, "get">;
    transcription?: AttachmentTranscriptionService;
    extraction: SupplierExtractionService;
    batches?: BatchIntake;
    textIntent: { classify(text: string): Promise<WhatsAppTextIntent> };
  }) {}

  async capture(input: {
    instance: string; messageId: string; phone: string; type?: "TEXT" | "IMAGE" | "AUDIO"; text?: string;
    media?: EvolutionMediaMessage; getMedia?: (input: EvolutionGetMediaInput) => Promise<{ bytes: Uint8Array; mimeType: string }>;
  }): Promise<WhatsAppCaptureResult> {
    const key = `${input.instance}:${input.messageId}`;
    const pending = WhatsAppCaptureService.pending.get(key);
    if (pending) return pending;
    const task = this.captureOnce(input);
    WhatsAppCaptureService.pending.set(key, task);
    try {
      return await task;
    } finally {
      if (WhatsAppCaptureService.pending.get(key) === task) WhatsAppCaptureService.pending.delete(key);
    }
  }

  private async captureOnce(input: {
    instance: string; messageId: string; phone: string; type?: "TEXT" | "IMAGE" | "AUDIO"; text?: string;
    media?: EvolutionMediaMessage; getMedia?: (input: EvolutionGetMediaInput) => Promise<{ bytes: Uint8Array; mimeType: string }>;
  }): Promise<WhatsAppCaptureResult> {
    const claim = await this.dependencies.replies?.claim(input.instance, input.messageId, input.phone);
    if (claim?.kind === "completed") return claim.reply;
    if (claim?.kind === "processing") return { kind: "captured", text: "Estoy procesando ese mensaje. Esperá un momento." };
    let result: WhatsAppCaptureResult;
    try { result = await this.captureFresh(input); }
    catch { result = { kind: "failed", text: "No pude procesar ese mensaje. Probá nuevamente." }; }
    await this.dependencies.replies?.complete(input.instance, input.messageId, result);
    return result;
  }

  private async captureFresh(input: {
    instance: string; messageId: string; phone: string; type?: "TEXT" | "IMAGE" | "AUDIO"; text?: string;
    media?: EvolutionMediaMessage; getMedia?: (input: EvolutionGetMediaInput) => Promise<{ bytes: Uint8Array; mimeType: string }>;
  }): Promise<WhatsAppCaptureResult> {
    if ((input.type ?? "TEXT") === "TEXT" && input.text && !isControlMessage(input.text)) {
      const trimmed = input.text.trim();
      if (/^(?:buscar|consultar)\s+\S/iu.test(trimmed)) return { kind: "captured", text: WEB_LOOKUP_REPLY };
      if (/^(?:ayuda|help)[\s!?.]*$/iu.test(trimmed)) return { kind: "captured", text: HELP_REPLY };
      const intent = await this.dependencies.textIntent.classify(trimmed);
      if (intent === "GUIDANCE") return { kind: "captured", text: HELP_REPLY };
      if (intent === "LOOKUP") return { kind: "captured", text: WEB_LOOKUP_REPLY };
    }
    const selection = this.dependencies.conversations ? await this.dependencies.conversations.select(input.phone, input.text) : null;
    if (selection?.kind === "prompt") {
      await this.dependencies.batches?.assignFromConversation(input.phone);
      const type = input.type ?? "TEXT";
      if (this.dependencies.batches && (type === "IMAGE" || type === "AUDIO" || type === "TEXT" && input.text && !/^\s*\d+\s*$/.test(input.text))) {
        await this.dependencies.batches.receiveUnresolved({ ...input, type });
      }
      return { kind: "ambiguous", text: selection.text };
    }
    if (selection?.kind === "unlinked") return { kind: "unlinked", text: "Este número todavía no está vinculado a Nihao. Entrá a Nihao y vinculá tu WhatsApp en tu viaje." };
    const resolution = selection ? null : await resolveWhatsAppIdentity(input.phone, this.dependencies.identities);
    if (resolution?.kind === "unlinked") return { kind: "unlinked", text: "Este número todavía no está vinculado a Nihao. Entrá a Nihao y vinculá tu WhatsApp en tu viaje." };
    if (resolution?.kind === "ambiguous") return { kind: "ambiguous", text: "Tenés más de un viaje disponible en Nihao. Por ahora ingresá a la app para continuar." };
    const context = selection?.kind === "ready" ? { userId: selection.userId, tripId: selection.tripId, companyId: selection.companyId } : { userId: resolution!.identity.userId, tripId: resolution!.identity.tripId };
    const captureId = whatsappCaptureId(input.instance, input.messageId);
    const type = input.type ?? "TEXT";
    try {
      if (type === "TEXT" && input.text?.trim().toLocaleLowerCase("es") === "analizar tarjeta" && context.companyId && await this.dependencies.batches?.flush(context)) {
        return { kind: "captured", text: "Voy a agrupar y analizar los mensajes que enviaste." };
      }
      if (type === "IMAGE" && this.dependencies.batches && context.companyId && !await this.dependencies.cards.findActive(context)) {
        return this.dependencies.batches.receive({ ...input, type }, context);
      }
      if (type === "AUDIO" && this.dependencies.batches && context.companyId) {
        return this.dependencies.batches.receive({ ...input, type }, context);
      }
      if (type === "IMAGE") return await this.captureImage(input, context, captureId);
      if (type === "TEXT" && input.text?.trim().toLocaleLowerCase("es") === "analizar tarjeta") {
        const result = await this.analyzeCard(context, input.instance, input.messageId);
        if (result.kind === "captured" && result.text.includes("Tarjeta analizada")) await this.dependencies.conversations?.complete(context.userId);
        return result;
      }
      if (this.dependencies.batches && context.companyId && type === "TEXT") {
        return this.dependencies.batches.receive({ ...input, type }, context);
      }
      if (await this.dependencies.cards.findActive(context)) return { kind: "captured", text: "Tenés una tarjeta pendiente. Enviá las fotos que falten y escribí: analizar tarjeta." };
      const existing = await this.dependencies.captures.getCapture(context, captureId);
      if (existing) return { kind: "captured", text: formatWhatsAppCaptureReply(existing) };
      if (type === "TEXT") {
        if (!input.text) throw new ValidationError("Escribí un mensaje para analizar");
        const capture = await runProductExtraction({ ...context, clientCaptureId: captureId, text: input.text, businessCardAttachmentIds: [] }, { captures: this.dependencies.captures, attachments: { async get() { return null; } }, extraction: this.dependencies.extraction });
        await this.dependencies.conversations?.complete(context.userId);
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
        ...context, captureId, clientEvidenceId: evidenceId, type: "AUDIO",
        mimeType: normalizeMediaMimeType(media.mimeType), size: media.bytes.byteLength, body: media.bytes,
      });
      const capture = await runProductExtraction({
        ...context, captureId, businessCardAttachmentIds: [], audioAttachmentIds: [attachment.id],
      }, { captures: this.dependencies.captures, attachments: this.dependencies.attachments, transcription: this.dependencies.transcription, extraction: this.dependencies.extraction });
      await this.dependencies.conversations?.complete(context.userId);
      return { kind: "captured", text: formatWhatsAppCaptureReply(capture) };
    } catch (error) {
      if (error instanceof ValidationError) return { kind: "failed", text: error.message };
      return { kind: "failed", text: type === "TEXT" ? "No pude analizar ese mensaje. Probá nuevamente en unos segundos." : "No pude analizar ese archivo. Podés reintentarlo o cargarlo desde Nihao." };
    }
  }

  private async captureImage(input: {
    instance: string; messageId: string; media?: EvolutionMediaMessage;
    getMedia?: (input: EvolutionGetMediaInput) => Promise<{ bytes: Uint8Array; mimeType: string }>;
  }, context: CardContext, captureId: string): Promise<WhatsAppCaptureResult> {
    if (!this.dependencies.attachments || !input.media || !input.getMedia) return { kind: "failed", text: "La media no está disponible" };
    const attachments = this.dependencies.attachments;
    const evidenceId = whatsappEvidenceId(input.instance, input.messageId);
    return this.dependencies.cards.withUserLock(context, async () => {
      const duplicate = await attachments.get(evidenceId);
      if (duplicate && duplicate.userId === context.userId && duplicate.tripId === context.tripId) {
        const card = await this.dependencies.cards.get(context, duplicate.captureId);
        if (card?.state === "ANALYZED") return { kind: "captured", text: "Esta tarjeta ya fue analizada y quedó pendiente de revisión en Nihao." };
        if (card?.state === "ANALYZING") return { kind: "captured", text: ANALYZING_REPLY };
        const count = (await attachments.list(context, duplicate.captureId)).filter((item) => item.type === "BUSINESS_CARD").length;
        return { kind: "captured", text: this.photoReply(count) };
      }
      const active = await this.dependencies.cards.findActive(context);
      if (active?.state === "ANALYZING") return { kind: "captured", text: ANALYZING_REPLY };
      const currentCount = active ? (await attachments.list(context, active.id)).filter((item) => item.type === "BUSINESS_CARD").length : 0;
      if (currentCount >= 3) return { kind: "captured", text: FOURTH_PHOTO_REPLY };

      let media: { bytes: Uint8Array; mimeType: string };
      try {
        media = await input.getMedia!({ message: input.media! });
      } catch {
        return { kind: "failed", text: "No pude descargar ese archivo. Probá enviándolo nuevamente." };
      }
      const mimeType = normalizeMediaMimeType(media.mimeType);
      const allowedMime = validateAttachmentFile(mimeType, media.bytes.byteLength, "BUSINESS_CARD");
      validateAttachmentContent(allowedMime, media.bytes);
      const pending = active ? { card: active, created: false } : await this.dependencies.cards.createPending(context, captureId, evidenceId);
      if (pending.card.state !== "PENDING") return { kind: "captured", text: ANALYZING_REPLY };
      try {
        await attachments.upload({ ...context, captureId: pending.card.id, clientEvidenceId: evidenceId,
          type: "BUSINESS_CARD", mimeType, size: media.bytes.byteLength, body: media.bytes });
      } catch (error) {
        if (pending.created) await this.dependencies.cards.deleteIfEmpty(context, pending.card.id);
        throw error;
      }
      return { kind: "captured", text: this.photoReply(currentCount + 1) };
    });
  }

  private photoReply(count: number): string {
    return count >= 3 ? THIRD_PHOTO_REPLY : count === 2 ? SECOND_PHOTO_REPLY : FIRST_PHOTO_REPLY;
  }

  private async analyzeCard(context: CardContext, instance: string, messageId: string): Promise<WhatsAppCaptureResult> {
    const begin = await this.dependencies.cards.beginAnalyzeCommand(context, instance, messageId, new Date(Date.now() - ANALYZING_STALE_MS));
    const captureId = begin.receipt.supplierCaptureId;
    if (begin.kind !== "owned") {
      if (begin.receipt.status === "PROCESSING") return { kind: "captured", text: ANALYZING_REPLY };
      if (begin.receipt.status === "FAILED") return { kind: "captured", text: "Este intento falló. Escribí analizar tarjeta otra vez para reintentar." };
      if (begin.receipt.status === "COMPLETED") return { kind: "captured", text: "Esta tarjeta ya fue analizada y quedó pendiente de revisión en Nihao." };
      return { kind: "captured", text: captureId ? ANALYZING_REPLY : NO_PENDING_REPLY };
    }
    if (!captureId) throw new Error("El comando no tiene tarjeta asociada");
    try {
      const attachments = this.dependencies.attachments;
      if (!attachments) throw new Error("AttachmentService no está disponible");
      const cards = (await attachments.list(context, captureId)).filter((item) => item.type === "BUSINESS_CARD");
      if (!cards.length) {
        await this.dependencies.cards.settleAnalyzeCommand(context, instance, messageId, captureId, "IGNORED");
        return { kind: "captured", text: NO_PENDING_REPLY };
      }
      const existing = await this.dependencies.captures.getCapture(context, captureId);
      if (existing && cards.every((card) => existing.analyzedAttachmentIds.includes(card.id))) {
        if (!(await this.dependencies.cards.settleAnalyzeCommand(context, instance, messageId, captureId, "COMPLETED"))) throw new Error("El ownership del análisis expiró");
        return { kind: "captured", text: formatWhatsAppCaptureReply(existing, "Tarjeta analizada ✅", false) };
      }
      const capture = await runProductExtraction({ ...context, captureId, businessCardAttachmentIds: cards.map((card) => card.id) },
        { captures: this.dependencies.captures, attachments, extraction: this.dependencies.extraction });
      if (!(await this.dependencies.cards.settleAnalyzeCommand(context, instance, messageId, captureId, "COMPLETED"))) throw new Error("El ownership del análisis expiró");
      return { kind: "captured", text: formatWhatsAppCaptureReply(capture, "Tarjeta analizada ✅", false) };
    } catch {
      await this.dependencies.cards.settleAnalyzeCommand(context, instance, messageId, captureId, "FAILED");
      return { kind: "failed", text: "No pude analizar la tarjeta. Las fotos siguen guardadas; probá escribir analizar tarjeta nuevamente." };
    }
  }
}
