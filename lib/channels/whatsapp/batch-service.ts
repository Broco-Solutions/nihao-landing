import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { AttachmentService, validateAttachmentContent, validateAttachmentFile, type AttachmentRepository } from "../../bot/attachments.ts";
import { runProductExtraction } from "../../bot/extraction/production.ts";
import type { SupplierExtractionService } from "../../bot/extraction/service.ts";
import type { SupplierCaptureRepository, TripAccessRepository } from "../../bot/persistence/repository.ts";
import type { StorageProvider } from "../../bot/storage/provider.ts";
import { EMPTY_TIER_1_DATA } from "../../bot/types.ts";
import { calculateMissingFields } from "../../bot/tier1.ts";
import type { EvolutionClient, EvolutionGetMediaInput, EvolutionMediaMessage } from "../evolution/client.ts";
import { normalizeWhatsAppPhone } from "../../bot/whatsapp-phone.ts";
import { type BatchAnalysis, type BatchEvidence, type BatchGroup, type MistralBatchAnalyzer } from "./batch-association.ts";
import { whatsappEvidenceId } from "./whatsapp-capture-service.ts";

const QUIET_MS = 60_000;
type Context = { userId: string; tripId: string; companyId: string };
type ResolvedBatch = NonNullable<BatchRow> & { tripId: string; companyId: string };
type Incoming = { instance: string; messageId: string; phone: string; type: "TEXT" | "IMAGE"; text?: string; media?: EvolutionMediaMessage; getMedia?: (input: EvolutionGetMediaInput) => Promise<{ bytes: Uint8Array; mimeType: string }> };
type BatchRow = Awaited<ReturnType<PrismaClient["whatsAppBatch"]["findFirst"]>>;
type MessageRow = NonNullable<Awaited<ReturnType<PrismaClient["whatsAppBatchMessage"]["findFirst"]>>>;

function captureId(batchId: string, name: string): string {
  return `wab_${createHash("sha256").update(`${batchId}:${name.trim().toLocaleLowerCase("es")}`).digest("hex")}`;
}

function stagingKey(instance: string, messageId: string, mimeType: string): string {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return `whatsapp/staging/${whatsappEvidenceId(instance, messageId)}.${extension}`;
}

function asAnalysis(value: unknown): BatchAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Partial<BatchAnalysis>;
  return Array.isArray(result.groups) && Array.isArray(result.suggestions) && result.imageKinds && typeof result.imageKinds === "object" ? result as BatchAnalysis : null;
}

export class WhatsAppBatchService {
  constructor(private readonly dependencies: {
    prisma: PrismaClient;
    storage: StorageProvider;
    analyzer: MistralBatchAnalyzer;
    captures: SupplierCaptureRepository & TripAccessRepository;
    attachments: AttachmentService & Pick<AttachmentRepository, "get">;
    extraction: SupplierExtractionService;
    client: Pick<EvolutionClient, "sendText">;
    completeConversation(userId: string): Promise<void>;
  }) {}

  async receive(input: Incoming, context: Context): Promise<{ kind: "captured" | "failed"; text: string }> {
    const { prisma } = this.dependencies;
    const membership = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId: context.tripId, userId: context.userId } }, select: { role: true } });
    if (membership?.role !== "TRAVELER") return { kind: "failed", text: "Solo los viajeros pueden cargar proveedores. Podés consultar los datos desde Nihao." };
    const clarification = input.type === "TEXT" && input.text?.trim().match(/^(foto|mensaje)\s+(\d{1,2})\s*=\s*(.{2,120})$/iu);
    if (clarification) return this.resolveSuggestion(input, context, clarification[1], Number(clarification[2]), clarification[3].trim());
    return this.enqueue(input, context.userId, context);
  }

  async receiveUnresolved(input: Incoming): Promise<{ kind: "captured" | "failed"; text: string }> {
    const user = await this.dependencies.prisma.user.findUnique({ where: { whatsappPhone: normalizeWhatsAppPhone(input.phone) }, select: { id: true, role: true } });
    if (!user) return { kind: "failed", text: "Este número todavía no está vinculado a Nihao." };
    if (user.role === "ADMIN") return { kind: "failed", text: "Solo los viajeros pueden cargar proveedores. Podés consultar los datos desde Nihao." };
    return this.enqueue(input, user.id, null);
  }

  async assignFromConversation(phone: string): Promise<boolean> {
    const { prisma } = this.dependencies;
    const user = await prisma.user.findUnique({ where: { whatsappPhone: normalizeWhatsAppPhone(phone) }, select: { id: true, whatsappConversation: true } });
    const conversation = user?.whatsappConversation;
    if (!user || conversation?.stage !== "READY" || !conversation.tripId || !conversation.companyId) return false;
    const member = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId: conversation.tripId, userId: user.id } }, select: { role: true } });
    if (member?.role !== "TRAVELER") return false;
    const updated = await prisma.whatsAppBatch.updateMany({ where: { userId: user.id, phone, status: "OPEN", tripId: null }, data: { tripId: conversation.tripId, companyId: conversation.companyId, dueAt: new Date(Date.now() + QUIET_MS) } });
    return updated.count > 0;
  }

  private async enqueue(input: Incoming, userId: string, context: Context | null): Promise<{ kind: "captured" | "failed"; text: string }> {
    const { prisma, storage } = this.dependencies;
    const existing = await prisma.whatsAppBatchMessage.findUnique({ where: { instance_messageId: { instance: input.instance, messageId: input.messageId } } });
    if (existing) return { kind: "captured", text: "" };

    let key: string | null = null;
    let mimeType: string | null = null;
    if (input.type === "IMAGE") {
      if (!input.media || !input.getMedia) return { kind: "failed", text: "No pude descargar la imagen. Reenviála." };
      const media = await input.getMedia({ message: input.media });
      mimeType = media.mimeType.split(";", 1)[0].trim().toLowerCase();
      validateAttachmentContent(validateAttachmentFile(mimeType, media.bytes.byteLength, "PRODUCT_IMAGE"), media.bytes);
      key = stagingKey(input.instance, input.messageId, mimeType);
      await storage.put({ key, body: media.bytes, contentType: mimeType });
    }
    try {
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.instance}:${input.phone}`}, 0))::text`;
        const duplicate = await tx.whatsAppBatchMessage.findUnique({ where: { instance_messageId: { instance: input.instance, messageId: input.messageId } } });
        if (duplicate) return false;
        let batch = await tx.whatsAppBatch.findFirst({ where: { instance: input.instance, phone: input.phone, status: "OPEN" } });
        if (batch && (batch.userId !== userId || (!context && batch.tripId !== null) || (context && batch.tripId !== null && (batch.tripId !== context.tripId || batch.companyId !== context.companyId)))) {
          await tx.whatsAppBatch.update({ where: { id: batch.id }, data: { dueAt: now, status: "READY" } });
          batch = null;
        }
        if (batch) {
          const count = await tx.whatsAppBatchMessage.count({ where: { batchId: batch.id } });
          if (count >= 30) throw new Error("El lote tiene el máximo de 30 mensajes");
          await tx.whatsAppBatch.update({ where: { id: batch.id }, data: { ...(context && batch.tripId === null ? { tripId: context.tripId, companyId: context.companyId } : {}), dueAt: new Date(now.getTime() + QUIET_MS) } });
        } else {
          batch = await tx.whatsAppBatch.create({ data: { id: randomUUID(), instance: input.instance, phone: input.phone, userId, tripId: context?.tripId ?? null, companyId: context?.companyId ?? null, dueAt: new Date(now.getTime() + QUIET_MS) } });
        }
        await tx.whatsAppBatchMessage.create({ data: { batchId: batch.id, instance: input.instance, messageId: input.messageId, type: input.type, text: input.text ?? null, storageKey: key, mimeType } });
        return true;
      });
      return { kind: "captured", text: "" };
    } catch (error) {
      if (key) await storage.delete(key).catch(() => {});
      return { kind: "failed", text: error instanceof Error ? error.message : "No pude guardar ese mensaje. Reenviálo." };
    }
  }

  async flush(context: Context): Promise<boolean> {
    const result = await this.dependencies.prisma.whatsAppBatch.updateMany({ where: { ...context, status: "OPEN" }, data: { dueAt: new Date() } });
    return result.count > 0;
  }

  async processDue(limit = 5): Promise<number> {
    const { prisma } = this.dependencies;
    await prisma.whatsAppBatch.updateMany({ where: { status: "PROCESSING", claimedAt: { lt: new Date(Date.now() - 5 * 60_000) } }, data: { status: "READY", dueAt: new Date() } });
    const due = await prisma.whatsAppBatch.findMany({ where: { status: { in: ["OPEN", "READY"] }, tripId: { not: null }, companyId: { not: null }, dueAt: { lte: new Date() } }, orderBy: { dueAt: "asc" }, take: limit });
    let processed = 0;
    for (const batch of due) {
      const claimed = await prisma.whatsAppBatch.updateMany({ where: { id: batch.id, status: { in: ["OPEN", "READY"] }, dueAt: { lte: new Date() } }, data: { status: "PROCESSING", claimedAt: new Date(), attempts: { increment: 1 } } });
      if (!claimed.count) continue;
      try { await this.processBatch(batch.id); processed++; }
      catch (error) {
        const attempts = batch.attempts + 1;
        await prisma.whatsAppBatch.update({ where: { id: batch.id }, data: { status: attempts >= 5 ? "ERROR" : "READY", dueAt: new Date(Date.now() + Math.min(attempts * 30_000, 120_000)) } });
        console.error("WhatsApp batch processing failed", { batchId: batch.id, error: error instanceof Error ? error.name : "UnknownError" });
        if (attempts >= 5) await this.dependencies.client.sendText({ number: batch.phone, text: "No pude procesar este lote de proveedores. Tus mensajes quedaron guardados; avisá al administrador para revisarlos." }).catch(() => {});
      }
    }
    return processed;
  }

  private async processBatch(batchId: string): Promise<void> {
    const { prisma, storage, analyzer, client } = this.dependencies;
    const batch = await prisma.whatsAppBatch.findUnique({ where: { id: batchId }, include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
    if (!batch || batch.status !== "PROCESSING") return;
    if (!batch.tripId || !batch.companyId) throw new Error("El lote todavía no tiene viaje y empresa");
    for (const message of batch.messages) {
      if (message.type !== "IMAGE" || message.ocrText !== null || !message.storageKey || !message.mimeType) continue;
      const object = await storage.get(message.storageKey);
      if (!object) throw new Error("Falta una imagen del lote");
      const ocrText = await analyzer.readImage(new Uint8Array(await new Response(object).arrayBuffer()), message.mimeType);
      await prisma.whatsAppBatchMessage.update({ where: { id: message.id }, data: { ocrText } });
      message.ocrText = ocrText;
    }
    const evidence: BatchEvidence[] = batch.messages.map((message) => ({ id: message.messageId, type: message.type as "TEXT" | "IMAGE", text: message.text, ocrText: message.ocrText }));
    const analysis = asAnalysis(batch.analysis) ?? await analyzer.analyze(evidence);
    if (!batch.analysis) await prisma.whatsAppBatch.update({ where: { id: batch.id }, data: { analysis: JSON.parse(JSON.stringify(analysis)) } });
    for (const group of analysis.groups) await this.materializeGroup(batch as ResolvedBatch, batch.messages, group, analysis);
    for (const suggestion of analysis.suggestions) {
      await prisma.whatsAppBatchMessage.updateMany({ where: { batchId, messageId: suggestion.messageId, status: "PENDING" }, data: { status: "SUGGESTED", suggestedProvider: suggestion.providerName } });
    }
    const unresolved = await prisma.whatsAppBatchMessage.findMany({ where: { batchId, status: "SUGGESTED" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const images = batch.messages.filter((message) => message.type === "IMAGE");
    const textMessages = batch.messages.filter((message) => message.type === "TEXT");
    const questions = unresolved.map((message) => {
      const type = message.type === "IMAGE" ? "foto" : "mensaje";
      const ordinal = (message.type === "IMAGE" ? images : textMessages).findIndex((item) => item.id === message.id) + 1;
      return `${type} ${ordinal}: ${message.suggestedProvider ? `¿Es de ${message.suggestedProvider}?` : "¿De qué proveedor es?"} Respondé “${type} ${ordinal} = Nombre del proveedor”.`;
    });
    const status = unresolved.length ? "NEEDS_CLARIFICATION" : "DONE";
    await prisma.whatsAppBatch.update({ where: { id: batchId }, data: { status } });
    const names = [...new Set(analysis.groups.map((group) => group.name))];
    const reply = `${names.length ? `Guardé ${names.length} proveedor${names.length === 1 ? "" : "es"} como borrador${names.length === 1 ? "" : "es"}.` : "Conservé tus mensajes para revisarlos."}${questions.length ? `\nNecesito confirmar:\n${questions.join("\n")}` : "\nRevisá los borradores en Nihao."}`;
    if (!batch.replySentAt) {
      await client.sendText({ number: batch.phone, text: reply });
      await prisma.whatsAppBatch.update({ where: { id: batchId }, data: { replySentAt: new Date() } });
    }
    if (!unresolved.length) await this.dependencies.completeConversation(batch.userId);
  }

  private async materializeGroup(batch: ResolvedBatch, messages: MessageRow[], group: BatchGroup, analysis: BatchAnalysis): Promise<void> {
    const { captures, attachments, extraction, storage, prisma } = this.dependencies;
    const context = { userId: batch.userId, tripId: batch.tripId, companyId: batch.companyId };
    const id = captureId(batch.id, group.name);
    const groupMessages = messages.filter((message) => group.messageIds.includes(message.messageId));
    const alreadyAssigned = await prisma.whatsAppBatchMessage.findMany({ where: { batchId: batch.id, assignedCaptureId: id } });
    const texts = [...new Set([group.name, ...alreadyAssigned.map((message) => message.text).filter((value): value is string => Boolean(value)), ...groupMessages.map((message) => message.text).filter((value): value is string => Boolean(value))])];
    const text = texts.join("\n");
    await captures.createDraft({ ...context, clientCaptureId: id, extraction: { rawSource: { type: "TEXT", text }, extractedFields: { ...EMPTY_TIER_1_DATA }, missingFields: calculateMissingFields(EMPTY_TIER_1_DATA), reviewFields: [], evidence: [] } });
    const cardIds: string[] = [];
    for (const message of [...alreadyAssigned, ...groupMessages]) {
      if (message.type !== "IMAGE" || !message.storageKey || !message.mimeType) continue;
      const evidenceId = whatsappEvidenceId(message.instance, message.messageId);
      const kind = analysis.imageKinds[message.messageId] ?? "PRODUCT_IMAGE";
      const existing = await attachments.get(evidenceId);
      if (!existing) {
        const object = await storage.get(message.storageKey);
        if (!object) throw new Error("Falta una imagen para asociar al proveedor");
        const bytes = new Uint8Array(await new Response(object).arrayBuffer());
        await attachments.upload({ ...context, captureId: id, clientEvidenceId: evidenceId, type: kind, mimeType: message.mimeType, size: bytes.byteLength, body: bytes });
      } else if (existing.captureId !== id) throw new Error("La imagen ya pertenece a otro proveedor");
      if (kind === "BUSINESS_CARD") cardIds.push(evidenceId);
    }
    await runProductExtraction({ ...context, captureId: id, text, businessCardAttachmentIds: [...new Set(cardIds)] }, { captures, attachments, extraction });
    await prisma.supplierCapture.update({ where: { id }, data: { sourceText: text } });
    for (const message of groupMessages) {
      await prisma.whatsAppBatchMessage.update({ where: { id: message.id }, data: { status: "ASSIGNED", assignedCaptureId: id } });
      if (message.storageKey) await storage.delete(message.storageKey).catch(() => {});
    }
  }

  private async resolveSuggestion(input: Incoming, context: Context, kind: string, ordinal: number, name: string): Promise<{ kind: "captured" | "failed"; text: string }> {
    const { prisma } = this.dependencies;
    const batch = await prisma.whatsAppBatch.findFirst({ where: { instance: input.instance, phone: input.phone, ...context, status: "NEEDS_CLARIFICATION" }, include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } }, orderBy: { createdAt: "desc" } });
    if (!batch) return { kind: "failed", text: "No hay imágenes pendientes de aclaración." };
    const matching = batch.messages.filter((message) => message.type === (kind.toLocaleLowerCase("es") === "foto" ? "IMAGE" : "TEXT"));
    const message = matching[ordinal - 1];
    if (!message || message.status !== "SUGGESTED") return { kind: "failed", text: "Ese número no corresponde a un mensaje pendiente." };
    const analysis = asAnalysis(batch.analysis);
    if (!analysis) return { kind: "failed", text: "No pude recuperar el análisis. Probá otra vez." };
    await this.materializeGroup(batch as ResolvedBatch, batch.messages, { name, messageIds: [message.messageId] }, analysis);
    const remaining = await prisma.whatsAppBatchMessage.count({ where: { batchId: batch.id, status: "SUGGESTED" } });
    if (!remaining) {
      await prisma.whatsAppBatch.update({ where: { id: batch.id }, data: { status: "DONE" } });
      await this.dependencies.completeConversation(batch.userId);
    }
    return { kind: "captured", text: `Asocié ${kind.toLocaleLowerCase("es")} ${ordinal} a ${name}. ${remaining ? `Quedan ${remaining} mensajes por aclarar.` : "Ya podés revisar los borradores en Nihao."}` };
  }
}
