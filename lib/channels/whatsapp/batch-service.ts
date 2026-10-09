import { enrichSupplierCapture } from "../../nihao/operations/capture-lifecycle.ts";
import { renderSavedResults } from "./clarification-rendering.ts";
import { AgentCheckpoint } from "./agent-contract.ts";
import { operationContext, requireTime, safeDeadline } from "./operational-runtime.ts";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { AttachmentService, validateAttachmentContent, validateAttachmentFile, type AttachmentRepository } from "../../bot/attachments.ts";
import { runProductExtraction } from "../../bot/extraction/production.ts";
import type { SupplierExtractionService } from "../../bot/extraction/service.ts";
import type { SupplierCaptureRepository, TripAccessRepository } from "../../bot/persistence/repository.ts";
import type { StorageProvider } from "../../bot/storage/provider.ts";
import { EMPTY_TIER_1_DATA } from "../../bot/types.ts";
import { calculateMissingFields } from "../../bot/tier1.ts";
import type { TranscriptionProvider } from "../../bot/transcription.ts";
import type { EvolutionClient, EvolutionGetMediaInput, EvolutionMediaMessage } from "../evolution/client.ts";
import { normalizeWhatsAppPhone } from "../../bot/whatsapp-phone.ts";
import { type BatchAnalysis, type BatchEvidence, type BatchGroup, type MistralBatchAnalyzer } from "./batch-association.ts";
import { whatsappEvidenceId } from "./whatsapp-capture-service.ts";

const QUIET_MS = 10_000;
type Context = { userId: string; tripId: string; companyId: string };
type ResolvedBatch = NonNullable<BatchRow> & { tripId: string; companyId: string };
type Incoming = { instance: string; messageId: string; phone: string; type: "TEXT" | "IMAGE" | "AUDIO"; text?: string; media?: EvolutionMediaMessage; getMedia?: (input: EvolutionGetMediaInput) => Promise<{ bytes: Uint8Array; mimeType: string }> };
type BatchRow = Awaited<ReturnType<PrismaClient["whatsAppBatch"]["findFirst"]>>;
type MessageRow = NonNullable<Awaited<ReturnType<PrismaClient["whatsAppBatchMessage"]["findFirst"]>>>;

function captureId(batchId: string, name: string): string {
  return `wab_${createHash("sha256").update(`${batchId}:${name.trim().toLocaleLowerCase("es")}`).digest("hex")}`;
}

function stagingKey(instance: string, messageId: string, mimeType: string): string {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : mimeType === "audio/ogg" ? "ogg" : mimeType === "audio/mpeg" ? "mp3" : mimeType === "audio/mp4" ? "m4a" : mimeType === "audio/webm" ? "webm" : mimeType === "audio/wav" ? "wav" : "jpg";
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
    transcription: TranscriptionProvider;
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
    const audioClarification = input.type === "TEXT" && input.text?.trim().match(/^audio\s+(\d{1,2})\s+fragmento\s+(\d{1,2})\s*=\s*(.{2,120})$/iu);
    if (audioClarification) return this.resolveAudioSuggestion(input, context, Number(audioClarification[1]), Number(audioClarification[2]), audioClarification[3].trim());
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
    const receivedAt = new Date();
    const existing = await prisma.whatsAppBatchMessage.findUnique({ where: { instance_messageId: { instance: input.instance, messageId: input.messageId } } });
    if (existing) return { kind: "captured", text: "" };

    let key: string | null = null;
    let mimeType: string | null = null;
    if (input.type === "IMAGE" || input.type === "AUDIO") {
      if (!input.media || !input.getMedia) return { kind: "failed", text: "No pude descargar el archivo. Reenviálo." };
      const media = await input.getMedia({ message: input.media });
      mimeType = media.mimeType.split(";", 1)[0].trim().toLowerCase();
      validateAttachmentContent(validateAttachmentFile(mimeType, media.bytes.byteLength, input.type === "AUDIO" ? "AUDIO" : "PRODUCT_IMAGE"), media.bytes);
      key = stagingKey(input.instance, input.messageId, mimeType);
      await storage.put({ key, body: media.bytes, contentType: mimeType });
    }
    try {
      const now = new Date();
      const dueAt = new Date(receivedAt.getTime() + QUIET_MS);
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
          await tx.whatsAppBatch.update({ where: { id: batch.id }, data: { ...(context && batch.tripId === null ? { tripId: context.tripId, companyId: context.companyId } : {}), dueAt: new Date(Math.max(batch.dueAt.getTime(), dueAt.getTime())) } });
        } else {
          batch = await tx.whatsAppBatch.create({ data: { id: randomUUID(), instance: input.instance, phone: input.phone, userId, tripId: context?.tripId ?? null, companyId: context?.companyId ?? null, dueAt } });
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

  async processDue(limit = 5, deadline = safeDeadline()): Promise<number> {
    return operationContext.run({ deadline }, () => this.processWindow(limit, deadline));
  }
  private async processWindow(limit: number, deadline: number): Promise<number> {
    const { prisma } = this.dependencies;
    await prisma.whatsAppBatch.updateMany({ where: { status: "PROCESSING", claimedAt: { lt: new Date(Date.now() - 5 * 60_000) } }, data: { status: "READY", dueAt: new Date() } });
    const due = await prisma.whatsAppBatch.findMany({ where: { status: { in: ["OPEN", "READY"] }, tripId: { not: null }, companyId: { not: null }, dueAt: { lte: new Date() } }, orderBy: { dueAt: "asc" }, take: limit });
    let processed = 0;
    for (const batch of due) {
      if (Date.now() + 30_000 >= deadline) break;
      const claimed = await prisma.whatsAppBatch.updateMany({ where: { id: batch.id, status: { in: ["OPEN", "READY"] }, dueAt: { lte: new Date() } }, data: { status: "PROCESSING", claimedAt: new Date(), attempts: { increment: 1 } } });
      if (!claimed.count) continue;
      try { await this.processBatch(batch.id); processed++; }
      catch (error) {
        if (error instanceof AgentCheckpoint) {
          await prisma.whatsAppBatch.update({ where: { id: batch.id }, data: { status: "READY", attempts: batch.attempts, dueAt: new Date(Date.now() + 30_000) } });
          break;
        }
        const attempts = batch.attempts + 1;
        await prisma.whatsAppBatch.update({ where: { id: batch.id }, data: { status: attempts >= 5 ? "ERROR" : "READY", dueAt: new Date(Date.now() + Math.min(attempts * 30_000, 120_000)) } });
        console.error("WhatsApp batch processing failed", { batchId: batch.id, error: error instanceof Error ? error.name : "UnknownError" });
        if (attempts >= 5) await this.dependencies.client.sendText({ number: batch.phone, text: "No pude procesar este lote de proveedores. Tus mensajes quedaron guardados; avisá al administrador para revisarlos." }).catch(() => {});
      }
    }
    return processed;
  }

  private async processBatch(batchId: string): Promise<void> {
    const { prisma, storage, analyzer, transcription, client } = this.dependencies;
    const batch = await prisma.whatsAppBatch.findUnique({ where: { id: batchId }, include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
    if (!batch || batch.status !== "PROCESSING") return;
    if (!batch.tripId || !batch.companyId) throw new Error("El lote todavía no tiene viaje y empresa");
    for (const message of batch.messages) {
      requireTime();
      if (message.type !== "IMAGE" || message.ocrText !== null || !message.storageKey || !message.mimeType) continue;
      const object = await storage.get(message.storageKey);
      if (!object) throw new Error("Falta una imagen del lote");
      const ocrText = await analyzer.readImage(new Uint8Array(await new Response(object).arrayBuffer()), message.mimeType);
      await prisma.whatsAppBatchMessage.update({ where: { id: message.id }, data: { ocrText } });
      message.ocrText = ocrText;
    }
    const audioSegments: Array<{ id: string; batchMessageId: string; segmentIndex: number; text: string; status: string }> = [];
    for (const message of batch.messages.filter((item) => item.type === "AUDIO")) {
      if (!message.storageKey || !message.mimeType) throw new Error("Falta un audio del lote");
      let transcript = message.transcription;
      if (!transcript) {
        const object = await storage.get(message.storageKey);
        if (!object) throw new Error("Falta un audio del lote");
        const result = await transcription.transcribe({ bytes: new Uint8Array(await new Response(object).arrayBuffer()), mimeType: message.mimeType, filename: `audio.${message.storageKey.split(".").pop() ?? "ogg"}` });
        transcript = result.text;
        await prisma.whatsAppBatchMessage.update({ where: { id: message.id }, data: { transcription: transcript, transcriptionModel: result.model } });
      }
      let segments = await prisma.whatsAppAudioSegment.findMany({ where: { batchMessageId: message.id }, orderBy: { segmentIndex: "asc" } });
      if (!segments.length) {
        const result = await analyzer.segmentAudio(transcript);
        await prisma.whatsAppAudioSegment.createMany({ data: result.segments.map((text, segmentIndex) => ({ id: randomUUID(), batchMessageId: message.id, segmentIndex: segmentIndex + 1, text, status: result.confident ? "PENDING" : "SUGGESTED" })), skipDuplicates: true });
        segments = await prisma.whatsAppAudioSegment.findMany({ where: { batchMessageId: message.id }, orderBy: { segmentIndex: "asc" } });
      }
      audioSegments.push(...segments);
    }
    const evidence: BatchEvidence[] = [
      ...batch.messages.filter((message) => message.type !== "AUDIO").map((message) => ({ id: message.messageId, type: message.type as "TEXT" | "IMAGE", text: message.text, ocrText: message.ocrText })),
      ...audioSegments.filter((segment) => segment.status === "PENDING").map((segment) => ({ id: segment.id, type: "AUDIO" as const, text: segment.text, ocrText: null })),
    ];
    const analysis = asAnalysis(batch.analysis) ?? (evidence.length ? await analyzer.analyze(evidence) : { groups: [], suggestions: [], imageKinds: {} });
    if (!batch.analysis) await prisma.whatsAppBatch.update({ where: { id: batch.id }, data: { analysis: JSON.parse(JSON.stringify(analysis)) } });
    for (const group of analysis.groups) await this.materializeGroup(batch as ResolvedBatch, batch.messages, audioSegments, group, analysis);
    for (const suggestion of analysis.suggestions) {
      await prisma.whatsAppBatchMessage.updateMany({ where: { batchId, messageId: suggestion.messageId, status: "PENDING" }, data: { status: "SUGGESTED", suggestedProvider: suggestion.providerName } });
      await prisma.whatsAppAudioSegment.updateMany({ where: { id: suggestion.messageId, status: "PENDING" }, data: { status: "SUGGESTED", suggestedProvider: suggestion.providerName } });
    }
    const unresolved = await prisma.whatsAppBatchMessage.findMany({ where: { batchId, status: "SUGGESTED" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const unresolvedAudio = await prisma.whatsAppAudioSegment.findMany({ where: { batchMessage: { batchId }, status: "SUGGESTED" }, include: { batchMessage: true }, orderBy: [{ batchMessage: { createdAt: "asc" } }, { segmentIndex: "asc" }] });
    const images = batch.messages.filter((message) => message.type === "IMAGE");
    const textMessages = batch.messages.filter((message) => message.type === "TEXT");
    const questions = unresolved.map((message) => {
      const type = message.type === "IMAGE" ? "foto" : "mensaje";
      const ordinal = (message.type === "IMAGE" ? images : textMessages).findIndex((item) => item.id === message.id) + 1;
      return `${type} ${ordinal}: ${message.suggestedProvider ? `¿Es de ${message.suggestedProvider}?` : "¿De qué proveedor es?"} Respondé “${type} ${ordinal} = Nombre del proveedor”.`;
    });
    const audioMessages = batch.messages.filter((message) => message.type === "AUDIO");
    questions.push(...unresolvedAudio.map((segment) => {
      const ordinal = audioMessages.findIndex((message) => message.id === segment.batchMessageId) + 1;
      return `Audio ${ordinal}, fragmento ${segment.segmentIndex}: ${segment.suggestedProvider ? `¿Es de ${segment.suggestedProvider}?` : "¿De qué proveedor es?"} Respondé “audio ${ordinal} fragmento ${segment.segmentIndex} = Nombre del proveedor”.`;
    }));
    const status = questions.length ? "NEEDS_CLARIFICATION" : "DONE";
    await prisma.whatsAppBatch.update({ where: { id: batchId }, data: { status } });
    const names = [...new Set(analysis.groups.map((group) => group.name))];
    const reply = renderSavedResults(names.map(name => ({ operationId: name, tool: "create_supplier_draft", id: name, name, status: "COMPLETED", resourceStatus: "DRAFT" })), questions.length ? `Necesito confirmar algunos datos:\n\n${questions.map(q => `• ${q}`).join("\n\n")}` : null) || "Conservé tus mensajes para revisarlos.";
    if (!batch.replySentAt) {
      await client.sendText({ number: batch.phone, text: reply });
      await prisma.whatsAppBatch.update({ where: { id: batchId }, data: { replySentAt: new Date() } });
    }
    if (!questions.length) await this.dependencies.completeConversation(batch.userId);
  }

  private async materializeGroup(batch: ResolvedBatch, messages: MessageRow[], audioSegments: Array<{ id: string; batchMessageId: string; segmentIndex: number; text: string }>, group: BatchGroup, analysis: BatchAnalysis): Promise<void> {
    const { captures, attachments, extraction, storage, prisma } = this.dependencies;
    const context = { userId: batch.userId, tripId: batch.tripId, companyId: batch.companyId };
    const id = captureId(batch.id, group.name);
    const groupMessages = messages.filter((message) => group.messageIds.includes(message.messageId));
    const groupAudio = audioSegments.filter((segment) => group.messageIds.includes(segment.id));
    const alreadyAssigned = await prisma.whatsAppBatchMessage.findMany({ where: { batchId: batch.id, assignedCaptureId: id } });
    const assignedAudio = await prisma.whatsAppAudioSegment.findMany({ where: { assignedCaptureId: id } });
    const texts = [...new Set([group.name, ...alreadyAssigned.map((message) => message.text).filter((value): value is string => Boolean(value)), ...groupMessages.map((message) => message.text).filter((value): value is string => Boolean(value)), ...assignedAudio.map((segment) => segment.text), ...groupAudio.map((segment) => segment.text)])];
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
    await prisma.$transaction(tx => enrichSupplierCapture(tx, context, { captureId: id, sourceText: text }, "automation"));
    for (const message of groupMessages) {
      await prisma.whatsAppBatchMessage.update({ where: { id: message.id }, data: { status: "ASSIGNED", assignedCaptureId: id } });
      if (message.storageKey) await storage.delete(message.storageKey).catch(() => {});
    }
    for (const segment of groupAudio) await prisma.whatsAppAudioSegment.update({ where: { id: segment.id }, data: { status: "ASSIGNED", assignedCaptureId: id } });
  }

  private async resolveSuggestion(input: Incoming, context: Context, kind: string, ordinal: number, name: string): Promise<{ kind: "captured" | "failed"; text: string }> {
    const { prisma } = this.dependencies;
    const batch = await prisma.whatsAppBatch.findFirst({ where: { instance: input.instance, phone: input.phone, ...context, status: "NEEDS_CLARIFICATION" }, include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } }, orderBy: { createdAt: "desc" } });
    if (!batch) return { kind: "failed", text: "No hay mensajes pendientes de aclaración." };
    const matching = batch.messages.filter((message) => message.type === (kind.toLocaleLowerCase("es") === "foto" ? "IMAGE" : "TEXT"));
    const message = matching[ordinal - 1];
    if (!message || message.status !== "SUGGESTED") return { kind: "failed", text: "Ese número no corresponde a un mensaje pendiente." };
    const analysis = asAnalysis(batch.analysis);
    if (!analysis) return { kind: "failed", text: "No pude recuperar el análisis. Probá otra vez." };
    const audioSegments = await prisma.whatsAppAudioSegment.findMany({ where: { batchMessage: { batchId: batch.id } } });
    await this.materializeGroup(batch as ResolvedBatch, batch.messages, audioSegments, { name, messageIds: [message.messageId] }, analysis);
    const remaining = await prisma.whatsAppBatchMessage.count({ where: { batchId: batch.id, status: "SUGGESTED" } });
    const remainingAudio = await prisma.whatsAppAudioSegment.count({ where: { batchMessage: { batchId: batch.id }, status: "SUGGESTED" } });
    if (!remaining && !remainingAudio) {
      await prisma.whatsAppBatch.update({ where: { id: batch.id }, data: { status: "DONE" } });
      await this.dependencies.completeConversation(batch.userId);
    }
    return { kind: "captured", text: `Asocié ${kind.toLocaleLowerCase("es")} ${ordinal} a ${name}. ${remaining + remainingAudio ? `Quedan ${remaining + remainingAudio} fragmentos por aclarar.` : "Ya podés revisar los borradores en Nihao."}` };
  }

  private async resolveAudioSuggestion(input: Incoming, context: Context, audioOrdinal: number, segmentOrdinal: number, name: string): Promise<{ kind: "captured" | "failed"; text: string }> {
    const { prisma } = this.dependencies;
    const batch = await prisma.whatsAppBatch.findFirst({ where: { instance: input.instance, phone: input.phone, ...context, status: "NEEDS_CLARIFICATION" }, include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } }, orderBy: { createdAt: "desc" } });
    if (!batch) return { kind: "failed", text: "No hay audios pendientes de aclaración." };
    const audio = batch.messages.filter((message) => message.type === "AUDIO")[audioOrdinal - 1];
    if (!audio) return { kind: "failed", text: "Ese número de audio no existe." };
    const segment = await prisma.whatsAppAudioSegment.findUnique({ where: { batchMessageId_segmentIndex: { batchMessageId: audio.id, segmentIndex: segmentOrdinal } } });
    if (!segment || segment.status !== "SUGGESTED") return { kind: "failed", text: "Ese fragmento no está pendiente de aclaración." };
    const analysis = asAnalysis(batch.analysis);
    if (!analysis) return { kind: "failed", text: "No pude recuperar el análisis. Probá otra vez." };
    const segments = await prisma.whatsAppAudioSegment.findMany({ where: { batchMessage: { batchId: batch.id } } });
    await this.materializeGroup(batch as ResolvedBatch, batch.messages, segments, { name, messageIds: [segment.id] }, analysis);
    const remainingMessages = await prisma.whatsAppBatchMessage.count({ where: { batchId: batch.id, status: "SUGGESTED" } });
    const remainingAudio = await prisma.whatsAppAudioSegment.count({ where: { batchMessage: { batchId: batch.id }, status: "SUGGESTED" } });
    if (!remainingMessages && !remainingAudio) {
      await prisma.whatsAppBatch.update({ where: { id: batch.id }, data: { status: "DONE" } });
      await this.dependencies.completeConversation(batch.userId);
    }
    return { kind: "captured", text: `Asocié el fragmento ${segmentOrdinal} del audio ${audioOrdinal} a ${name}. ${remainingMessages + remainingAudio ? `Quedan ${remainingMessages + remainingAudio} fragmentos por aclarar.` : "Ya podés revisar los borradores en Nihao."}` };
  }
}
