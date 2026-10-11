import { questionOption } from "./followup-resolution.ts";
import { recoverReferencedPendingLoad } from "./pending-load-recovery.ts";
import { userTripCatalog } from "../../nihao/operations/trip-catalog.ts";
import { answersPending, isIndependentConversationTurn, namesPendingProduct } from "./burst-routing.ts";
import { isConversationFollowUp } from "./conversation-intent.ts";
import { emptyFocus, type ConversationFocus } from "./conversation-context.ts";
import { requireTime } from "./operational-runtime.ts";
import { AgentCheckpoint, AgentSuperseded } from "./agent-contract.ts";
import { selectedSupplierNumber, type ReplyContext } from "./supplier-picker.ts";
import { agentState } from "./agent-contract.ts";
import { handoffUnresolvedLegacyBatch } from "./legacy-batch-handoff.ts";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import type { StorageProvider } from "../../bot/storage/provider.ts";
import type { EvolutionClient } from "../evolution/client.ts";
import { EvolutionRequestError } from "../evolution/client.ts";
import type { WhatsAppDeliveryStatus } from "../evolution/webhook.ts";
import { originalBytes } from "./operational-runtime.ts";
import { failure } from "./operational-runtime.ts";
import { burstOriginalKey } from "./burst-original.ts";
import { normalizeWhatsAppPhone } from "../../bot/whatsapp-phone.ts";
import { whatsappUatAllowedPhones } from "./uat-access.ts";
import { BURST_QUIET_MS, type BurstCatalog, type BurstEnvelope, type BurstReading, type BurstSnapshot, type BurstState, type BurstStore } from "./burst-types.ts";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const initialState = (): BurstState => ({ tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] });
const acceptedReplyStatuses = ["ACCEPTED", "SERVER_ACK", "DELIVERED", "READ", "PLAYED", "SENT"] as const;
const deliveryRank: Record<string, number> = { ACCEPTED: 1, SENT: 1, SERVER_ACK: 2, DELIVERED: 3, READ: 4, PLAYED: 5 };

export class PrismaBurstStore implements BurstStore {
  constructor(private readonly prisma: PrismaClient, private readonly options: { newVersion?: number; claimVersions?: number[]; allowNew?: boolean } = {}) {}

  /** Applies provider delivery evidence to the outbox row without guessing when no event was emitted. */
  async applyDeliveryStatus(instance: string, messageId: string, status: WhatsAppDeliveryStatus): Promise<boolean> {
    const direct = await this.prisma.whatsAppBurstReply.findFirst({
      where: { providerMessageId: messageId, burst: { instance } },
      select: { id: true, status: true },
    });
    if (direct) {
      const currentRank = deliveryRank[direct.status] ?? 0;
      const nextRank = status === "DELIVERY_FAILED" ? 0 : deliveryRank[status];
      if (direct.status === "DELIVERY_FAILED" || (status !== "DELIVERY_FAILED" && currentRank >= nextRank)) return false;
      if (status === "DELIVERY_FAILED" && currentRank >= deliveryRank.DELIVERED) return false;
      await this.prisma.whatsAppBurstReply.update({
        where: { id: direct.id },
        data: { status, deliveryUpdatedAt: new Date(), leaseUntil: null, ...(status === "DELIVERY_FAILED" ? { lastErrorAt: new Date(), lastErrorCode: "EVOLUTION_DELIVERY_FAILED" } : {}) },
      });
      return true;
    }
    const candidates = await this.prisma.whatsAppBurst.findMany({
      where: { instance, state: { path: ["outboundReplies"], array_contains: [{ messageId }] } },
      select: { id: true },
    });
    for (const candidate of candidates) {
      const changed = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "WhatsAppBurst" WHERE id = ${candidate.id} FOR UPDATE`;
        const burst = await tx.whatsAppBurst.findUniqueOrThrow({ where: { id: candidate.id } });
        const state = burst.state as unknown as BurstState;
        const pointer = state.outboundReplies?.find((reply) => reply.messageId === messageId);
        if (!pointer) return false;
        const reply = await tx.whatsAppBurstReply.findFirst({ where: { burstId: burst.id, revision: pointer.revision, ...(pointer.kind ? { kind: pointer.kind } : {}) }, orderBy: { createdAt: "desc" } });
        if (!reply) return false;
        const currentRank = deliveryRank[reply.status] ?? 0;
        const nextRank = status === "DELIVERY_FAILED" ? 0 : deliveryRank[status];
        if (reply.status === "DELIVERY_FAILED" || (status !== "DELIVERY_FAILED" && currentRank >= nextRank)) return false;
        if (status === "DELIVERY_FAILED" && currentRank >= deliveryRank.DELIVERED) return false;
        await tx.whatsAppBurstReply.update({ where: { id: reply.id }, data: { status, deliveryUpdatedAt: new Date(), leaseUntil: null, ...(status === "DELIVERY_FAILED" ? { lastErrorAt: new Date(), lastErrorCode: "EVOLUTION_DELIVERY_FAILED" } : {}) } });
        return true;
      });
      if (changed) return true;
    }
    return false;
  }

  /** A media ACK requires a readable copy of the bytes, not only Evolution's temporary descriptor. */
  async persistOriginal(envelope: BurstEnvelope, storage: StorageProvider, client: Pick<EvolutionClient, "getMedia">): Promise<void> {
    if (envelope.type === "TEXT") return;
    const received = await this.prisma.whatsAppBurstMessage.findUnique({ where: { instance_messageId: { instance: envelope.instance, messageId: envelope.messageId } } });
    if (!received) throw new Error("El medio no está en el inbox durable");
    const reading = received.reading as unknown as BurstReading | null;
    if (reading?.storageKey) {
      const copy = await storage.get(reading.storageKey);
      if (copy) {
        const bytes = await originalBytes(copy);
        if (!reading.originalSha256 || createHash("sha256").update(bytes).digest("hex") === reading.originalSha256) {
          await this.prisma.whatsAppBurstMessage.update({ where: { id: received.id }, data: { storageStatus: "STORED", storedAt: received.storedAt ?? new Date(), storageLastErrorAt: null, storageLastErrorCode: null } });
          return;
        }
      }
    }
    await this.prisma.whatsAppBurstMessage.update({ where: { id: received.id }, data: { storageStatus: "PENDING_STORAGE", storageAttempts: { increment: 1 } } });
    try {
      const media = (received.envelope as unknown as BurstEnvelope).media;
      if (!media) throw new Error("Falta el descriptor del medio recibido");
      const original = await client.getMedia({ message: media });
      const mimeType = original.mimeType.split(";", 1)[0].trim().toLowerCase();
      const key = burstOriginalKey(received.id);
      await storage.put({ key, body: original.bytes, contentType: mimeType });
      const stored = await storage.get(key);
      if (!stored) throw new Error("El original todavía no está disponible en el almacenamiento");
      const persisted = await originalBytes(stored);
      const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
      if (digest(persisted) !== digest(original.bytes)) throw new Error("La copia del original no coincide con el medio recibido");
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "WhatsAppBurst" WHERE id = ${received.burstId} FOR UPDATE`;
        const latest = await tx.whatsAppBurstMessage.findUniqueOrThrow({ where: { id: received.id } });
        const current = latest.reading as unknown as BurstReading | null;
        const now = new Date();
        await tx.whatsAppBurstMessage.update({ where: { id: received.id }, data: { storageStatus: "STORED", storedAt: now, storageLastErrorAt: null, storageLastErrorCode: null, reading: json({ ...(current ?? { segments: [] }), storageKey: key, mimeType, originalSha256: digest(persisted), originalSize: persisted.length, validated: current?.validated ?? false }) } });
        await tx.whatsAppBurst.update({ where: { id: received.burstId }, data: { lastProgressAt: now, lastErrorAt: null, lastErrorCode: null } });
      });
    } catch (error) {
      const reason = failure(error);
      await this.prisma.whatsAppBurstMessage.update({ where: { id: received.id }, data: { storageStatus: "PENDING_STORAGE", storageLastErrorAt: new Date(), storageLastErrorCode: reason.type } });
      throw error;
    }
  }

  async receive(envelope: BurstEnvelope): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { whatsappPhone: normalizeWhatsAppPhone(envelope.phone) }, select: { id: true } });
    if (!user || !(await this.catalog(user.id)).trips.length) return false;
    const activeV2 = await this.prisma.whatsAppBurst.findFirst({ where: { instance: envelope.instance, phone: envelope.phone, status: { not: "DONE" } }, select: { id: true, version: true } });
    const hasPendingCard = !activeV2 && await this.prisma.supplierCapture.findFirst({ where: { createdById: user.id, status: "DRAFT", trip: { status: { in: ["ACTIVE", "PLANNED"] } }, company: { active: true, members: { some: { userId: user.id } } }, whatsappCardState: { in: ["PENDING", "ANALYZING"] } }, select: { id: true } });
    if (hasPendingCard) return false;
    if (!activeV2 && this.options.newVersion !== 3 && await this.prisma.whatsAppBatch.findFirst({ where: { instance: envelope.instance, phone: envelope.phone, status: { in: ["OPEN", "READY", "PROCESSING", "NEEDS_CLARIFICATION"] } }, select: { id: true } })) return false;
    const accepted = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`burst:${envelope.instance}:${envelope.phone}`}))`;
      if (await tx.whatsAppBurstMessage.findUnique({ where: { instance_messageId: { instance: envelope.instance, messageId: envelope.messageId } } })) return;
      // A v1 capture already acknowledged this delivery. Never process it twice across rollout.
      if (await tx.whatsAppBatchMessage.findUnique({ where: { instance_messageId: { instance: envelope.instance, messageId: envelope.messageId } } })) return;
      if (await tx.whatsAppMessageReply.findUnique({ where: { instance_messageId: { instance: envelope.instance, messageId: envelope.messageId } } })) return;
      if (await tx.whatsAppCommandReceipt.findUnique({ where: { instance_messageId: { instance: envelope.instance, messageId: envelope.messageId } } })) return;
      const workflows = await tx.whatsAppBurst.findMany({ where: { instance: envelope.instance, phone: envelope.phone, userId: user.id, status: { not: "DONE" } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], include: { messages: { select: { messageId: true } } } });
      const contextKey = { instance: envelope.instance, phone: envelope.phone, userId: user.id };
      const storedContext = await tx.whatsAppAgentContext.findUnique({ where: { instance_phone_userId: contextKey } });
      const focus = storedContext?.focus as unknown as ConversationFocus | undefined;
      // A durable inbound pointer prevents old WAITING questions from owning a new reply.
      // Legacy conversations bootstrap from the last received message, including DONE.
      const latestInbound = !focus?.activeBurstId ? await tx.whatsAppBurstMessage.findFirst({
        where: { instance: envelope.instance, burst: { userId: user.id, phone: envelope.phone } },
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }], select: { burstId: true },
      }) : null;
      const activeId = focus?.activeBurstId ?? latestInbound?.burstId;
      const explicitlySelected = workflows.filter(row => {
        const state = row.state as unknown as BurstState;
        const pending = agentState(state).agent.pending;
        const replies = state.outboundReplies?.map(reply => reply.messageId) ?? [];
        if (envelope.selectionId) return Boolean(selectedSupplierNumber(envelope.selectionId, { burstId: row.id, revision: row.revision, state: agentState(state) }));
        if (envelope.quotedMessageId) return [...replies, ...row.messages.map(m => m.messageId)].includes(envelope.quotedMessageId);
        return namesPendingProduct(envelope, pending);
      });
      const explicit = workflows.filter(row => {
        const state = row.state as unknown as BurstState;
        const pending = agentState(state).agent.pending;
        const replyIds = state.outboundReplies?.filter(reply => reply.revision === pending?.revision).map(reply => reply.messageId) ?? [];
        if (envelope.selectionId) return Boolean(selectedSupplierNumber(envelope.selectionId, { burstId: row.id, revision: row.revision, state: agentState(state) }));
        return answersPending(envelope, state, [...replyIds, ...row.messages.map(m => m.messageId)]);
      });
      const active = workflows.find(row => row.id === activeId);
      const explicitReference = Boolean(envelope.selectionId || envelope.quotedMessageId || explicitlySelected.length);
      const independentTurn = envelope.type === "TEXT" && isIndependentConversationTurn(envelope.text);
      const followUp = envelope.type === "TEXT" && isConversationFollowUp(envelope.text);
      let burst: Omit<(typeof workflows)[number], "messages"> | null = explicitlySelected.length === 1 ? explicitlySelected[0]
        : !envelope.selectionId && !envelope.quotedMessageId && active && explicitlySelected.includes(active) ? active
        : !explicitReference && active && (followUp || !independentTurn && (active.status !== "WAITING" || answersPending(envelope, active.state as unknown as BurstState))) ? active
        : !explicitReference && !activeId && explicit.length === 1 ? explicit[0] : null;
      // A new unquoted support never takes over a pending answer, even during the quiet window.
      if (burst && agentState(burst.state as unknown as BurstState).agent.pending && ["IMAGE", "DOCUMENT"].includes(envelope.type) && !explicitReference) burst = null;
      if (burst?.status === "WAITING" && !envelope.selectionId) {
        const recoveredId = await recoverReferencedPendingLoad(tx, burst.id);
        if (recoveredId !== burst.id) burst = await tx.whatsAppBurst.findUniqueOrThrow({ where: { id: recoveredId }, include: { messages: { select: { messageId: true } } } });
      }
      if (!burst && this.options.newVersion === 3 && this.options.allowNew !== false) {
        const handoff = await handoffUnresolvedLegacyBatch(tx, envelope.instance, envelope.phone, user.id);
        if (handoff.blocked) return false;
        burst = handoff.burst;
      }
      if (envelope.type === "DOCUMENT" && (burst?.version ?? this.options.newVersion) !== 3) return false;
      const now = new Date();
      const dueAt = new Date(now.getTime() + (/^listo[.!]?$/iu.test(envelope.text?.trim() ?? "") ? 0 : BURST_QUIET_MS));
      if (!burst && this.options.allowNew === false) return false;
      if (!burst) burst = await tx.whatsAppBurst.create({ data: { instance: envelope.instance, phone: envelope.phone, userId: user.id, version: this.options.newVersion ?? 2, dueAt, state: json(initialState()) } });
      if (burst.userId !== user.id) throw new Error("La vinculación de WhatsApp cambió durante la carga");
      if (envelope.selectionId) {
        const selected = selectedSupplierNumber(envelope.selectionId, { burstId: burst.id, revision: burst.revision, state: agentState(burst.state as unknown as BurstState) });
        envelope = { ...envelope, text: selected ?? "La lista de proveedores anterior ya no está vigente. Mostrame las opciones actuales." };
      }
      const nextFocus = { ...(focus ?? emptyFocus()), activeBurstId: burst.id };
      await tx.whatsAppAgentContext.upsert({ where: { instance_phone_userId: contextKey },
        create: { ...contextKey, focus: json(nextFocus) }, update: { focus: json(nextFocus) } });
      const revision = burst.revision + 1;
      const received = await tx.whatsAppBurstMessage.create({ data: { burstId: burst.id, instance: envelope.instance, messageId: envelope.messageId, sequence: revision, sentAt: envelope.sentAt ? new Date(envelope.sentAt) : null, envelope: json(envelope), storageStatus: envelope.type === "TEXT" ? "NOT_REQUIRED" : "PENDING_STORAGE" } });
      const state = agentState(burst.state as unknown as BurstState);
      if (state.agent.pending && !state.agent.pending.answer && answersPending(envelope, state)) {
        const option = questionOption(state.agent.pending, envelope.text ?? "");
        state.agent.pending.answer = { messageId: received.id, questionRevision: state.agent.pending.revision, ...(option ? { optionId: option.id } : {}) };
      }
      await tx.whatsAppBurst.update({ where: { id: burst.id }, data: { revision, dueAt, state: json(state), lastProgressAt: now, processingFinishedAt: null, ...(burst.status === "COMMITTING" ? {} : { status: "OPEN" }) } });
      // Superseded questions must not be sent after a clarification has already arrived.
      await tx.whatsAppBurstReply.updateMany({ where: { burstId: burst.id, status: "PENDING" }, data: { status: "SUPERSEDED" } });
    });
    return accepted !== false;
  }

  async catalog(userId: string, includeSuppliers = false): Promise<BurstCatalog> {
    return userTripCatalog(this.prisma, userId, includeSuppliers);
  }

  async claim(limit: number): Promise<BurstSnapshot[]> {
    const now = new Date();
    const allowedPhones = whatsappUatAllowedPhones();
    const candidates = await this.prisma.whatsAppBurst.findMany({ where: { ...(allowedPhones ? { phone: { in: [...allowedPhones] } } : {}), version: { in: this.options.claimVersions ?? [2] }, dueAt: { lte: now }, OR: [{ status: { in: ["OPEN", "COMMITTING"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, { status: "PROCESSING", leaseUntil: { lt: now } }] }, orderBy: { dueAt: "asc" }, take: Math.max(limit, 20) });
    const snapshots: BurstSnapshot[] = [];
    for (const candidate of candidates) {
      if (snapshots.length >= limit) break;
      const leaseId = randomUUID();
      const claimed = await this.prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`burst:${candidate.instance}:${candidate.phone}`}))`;
        if (await tx.whatsAppBurst.findFirst({ where: { id: { not: candidate.id }, instance: candidate.instance, phone: candidate.phone, status: { in: ["PROCESSING", "COMMITTING"] } }, select: { id: true } })) return { count: 0 };
        return tx.whatsAppBurst.updateMany({ where: { id: candidate.id, revision: candidate.revision, status: candidate.status, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { status: candidate.status === "COMMITTING" ? "COMMITTING" : "PROCESSING", leaseId, leaseUntil: new Date(now.getTime() + 330_000), attempts: { increment: 1 }, processingStartedAt: candidate.processingStartedAt ?? now } });
      });
      if (!claimed.count) continue;
      const row = await this.prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: candidate.id }, include: { messages: { orderBy: { sequence: "asc" } } } });
      snapshots.push({ ...row, recoveredLease: Boolean(candidate.leaseUntil), state: row.state as unknown as BurstState, messages: row.messages.map((m) => ({ ...m, envelope: m.envelope as unknown as BurstEnvelope, reading: m.reading as unknown as BurstReading | null })) });
    }
    return snapshots;
  }

  async saveReading(messageId: string, reading: BurstReading, snapshot?: BurstSnapshot) {
    const storage = reading.storageKey && reading.originalSha256 && reading.originalSize !== undefined
      ? { storageStatus: "STORED", storedAt: new Date(), storageLastErrorAt: null, storageLastErrorCode: null }
      : {};
    if (!snapshot) { await this.prisma.whatsAppBurstMessage.update({ where: { id: messageId }, data: { reading: json(reading), ...storage } }); return; }
    await this.prisma.$transaction(async (tx) => {
      // Serialize against claim/release: a stale worker cannot overwrite a new owner's checkpoint.
      await tx.$queryRaw`SELECT id FROM "WhatsAppBurst" WHERE id = ${snapshot.id} FOR UPDATE`;
      const owner = await tx.whatsAppBurst.findUniqueOrThrow({ where: { id: snapshot.id } });
      if (owner.leaseId !== snapshot.leaseId || !owner.leaseUntil || owner.leaseUntil.getTime() <= Date.now()) throw new AgentSuperseded();
      const now = new Date();
      await tx.whatsAppBurstMessage.update({ where: { id: messageId, burstId: snapshot.id }, data: { reading: json(reading), ...storage } });
      await tx.whatsAppBurst.update({ where: { id: snapshot.id }, data: { lastProgressAt: now, lastErrorAt: null, lastErrorCode: null } });
    });
  }

  async reserve(snapshot: BurstSnapshot, state: BurstState): Promise<boolean> {
    const changed = await this.prisma.whatsAppBurst.updateMany({ where: { id: snapshot.id, revision: snapshot.revision, leaseId: snapshot.leaseId, status: "PROCESSING" }, data: { status: "COMMITTING", state: json(state), lastProgressAt: new Date() } });
    return changed.count === 1;
  }

  async finish(snapshot: BurstSnapshot, state: BurstState, text: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`burst:${snapshot.instance}:${snapshot.phone}`}))`;
      const current = await tx.whatsAppBurst.findUniqueOrThrow({ where: { id: snapshot.id } });
      if (current.leaseId !== snapshot.leaseId) return;
      const newer = current.revision !== (state.evaluatedRevision ?? snapshot.revision);
      // A superseded worker cannot erase an answer pinned by the newer inbox revision.
      const now = new Date();
      await tx.whatsAppBurst.update({ where: { id: snapshot.id }, data: { state: newer ? current.state! : json(state), status: newer ? "OPEN" : state.question ? "WAITING" : "DONE", leaseId: null, leaseUntil: null, attempts: 0, lastProgressAt: now, processingFinishedAt: newer ? null : now, lastErrorAt: null, lastErrorCode: null } });
      if (text && !newer) await tx.whatsAppBurstReply.upsert({ where: { burstId_revision_kind: { burstId: snapshot.id, revision: snapshot.revision, kind: "FINAL" } }, create: { burstId: snapshot.id, revision: snapshot.revision, kind: "FINAL", text }, update: {} });
      const proposalId = (state as BurstState & { agent?: { pending?: { proposalId?: string } } }).agent?.pending?.proposalId;
      if (text && !newer && proposalId) {
        const proposal = await tx.whatsAppAgentOperation.findFirst({ where: { id: proposalId, burstId: snapshot.id, status: "PROPOSED" } });
        const sent = proposal?.displayedRevision != null && await tx.whatsAppBurstReply.findFirst({ where: { burstId: snapshot.id, revision: proposal.displayedRevision, kind: "FINAL", status: { in: [...acceptedReplyStatuses] } } });
        if (proposal && !sent) await tx.whatsAppAgentOperation.update({ where: { id: proposal.id }, data: { displayedRevision: snapshot.revision } });
      }
    });
  }

  async retry(snapshot: BurstSnapshot, checkpoint = false, error?: unknown) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`burst:${snapshot.instance}:${snapshot.phone}`}))`;
      const current = await tx.whatsAppBurst.findUniqueOrThrow({ where: { id: snapshot.id } });
      if (current.leaseId !== snapshot.leaseId) return;
      const notifyTraveler = !checkpoint && current.status !== "COMMITTING" && current.attempts === 5 && current.revision === snapshot.revision;
      const state = current.state as unknown as BurstState;
      const notifyProcessing = checkpoint && !state.processingNoticeSent && current.revision === snapshot.revision;
      const text = "Recibí tus mensajes, pero todavía no pude terminar de procesar algunos archivos. Voy a reintentar automáticamente; podés seguir enviando información.";
      const processingText = "Recibí y conservé tus mensajes. Todavía estoy procesándolos; te aviso cuando termine o si necesito una aclaración. No hace falta reenviarlos.";
      const delay = checkpoint || current.attempts < 5 ? 30_000 : Math.min(300_000, 30_000 * 2 ** Math.min(current.attempts - 5, 4));
      const reason = error ? failure(error).type : "WORKER_RETRY";
      if (notifyProcessing) state.processingNoticeSent = true;
      await tx.whatsAppBurst.update({ where: { id: current.id }, data: { status: current.status === "COMMITTING" ? "COMMITTING" : "OPEN", leaseId: null, leaseUntil: null, state: notifyProcessing ? json(state) : undefined, ...(checkpoint ? { attempts: 0 } : {}), dueAt: new Date(Date.now() + delay), lastErrorAt: new Date(), lastErrorCode: reason } });
      if (notifyTraveler) await tx.whatsAppBurstReply.upsert({ where: { burstId_revision_kind: { burstId: current.id, revision: current.revision, kind: "ERROR" } }, create: { burstId: current.id, revision: current.revision, kind: "ERROR", text }, update: {} });
      if (notifyProcessing) await tx.whatsAppBurstReply.upsert({ where: { burstId_revision_kind: { burstId: current.id, revision: current.revision, kind: "PROCESSING" } }, create: { burstId: current.id, revision: current.revision, kind: "PROCESSING", text: processingText }, update: {} });
    });
  }

  /** Enqueues at most one progress notice and one delayed-processing error per revision. */
  async enqueueTimedFeedback(now = new Date(), noticeMs = 45_000, criticalMs = 180_000) {
    const allowedPhones = whatsappUatAllowedPhones();
    const bursts = await this.prisma.whatsAppBurst.findMany({
      where: {
        ...(allowedPhones ? { phone: { in: [...allowedPhones] } } : {}),
        status: { in: ["OPEN", "PROCESSING", "COMMITTING"] },
      },
      include: {
        messages: { orderBy: { receivedAt: "desc" }, take: 1, select: { receivedAt: true } },
        replies: { select: { revision: true, kind: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    let processing = 0;
    let critical = 0;
    for (const burst of bursts) {
      const receivedAt = burst.messages[0]?.receivedAt ?? burst.createdAt;
      const age = now.getTime() - receivedAt.getTime();
      const replies = burst.replies.filter((reply) => reply.revision === burst.revision && reply.status !== "SUPERSEDED");
      if (replies.some((reply) => reply.kind === "FINAL" || reply.kind === "ERROR")) continue;
      const pendingOriginals = await this.prisma.whatsAppBurstMessage.count({ where: { burstId: burst.id, storageStatus: "PENDING_STORAGE" } });
      if (age >= criticalMs) {
        const text = pendingOriginals
          ? "Recibí tus mensajes, pero algunos archivos todavía no pudieron conservarse y el procesamiento excedió el tiempo esperado. El equipo ya fue alertado. No los reenvíes por ahora; te aviso si hace falta volver a enviarlos."
          : "Recibí y conservé tus mensajes, pero no pude completar el procesamiento dentro del tiempo esperado. El equipo ya fue alertado y la información sigue disponible para recuperación. Te aviso cuando termine o si necesito una aclaración.";
        await this.prisma.$transaction(async (tx) => {
          await tx.whatsAppBurstReply.upsert({ where: { burstId_revision_kind: { burstId: burst.id, revision: burst.revision, kind: "ERROR" } }, create: { burstId: burst.id, revision: burst.revision, kind: "ERROR", text }, update: {} });
          await tx.whatsAppBurst.update({ where: { id: burst.id }, data: { lastErrorAt: now, lastErrorCode: pendingOriginals ? "STORAGE_CRITICAL_DELAY" : "PROCESSING_CRITICAL_DELAY" } });
        });
        critical++;
        continue;
      }
      if (age >= noticeMs && !replies.some((reply) => reply.kind === "PROCESSING")) {
        const text = pendingOriginals
          ? "Recibí tus mensajes y el evento quedó registrado. Todavía estoy intentando conservar algunos archivos originales. No los reenvíes por ahora; te aviso al terminar o si necesito que vuelvas a enviarlos."
          : "Recibí y conservé tus mensajes. Todavía estoy procesándolos; te aviso cuando termine o si necesito una aclaración. No hace falta reenviarlos.";
        await this.prisma.whatsAppBurstReply.upsert({ where: { burstId_revision_kind: { burstId: burst.id, revision: burst.revision, kind: "PROCESSING" } }, create: { burstId: burst.id, revision: burst.revision, kind: "PROCESSING", text }, update: {} });
        processing++;
      }
    }
    return { processing, critical };
  }

  async flushReplies(send: (phone: string, text: string, context?: ReplyContext) => Promise<void>) {
    const now = new Date();
    const allowedPhones = whatsappUatAllowedPhones();
    // A worker can die after Evolution accepted a request but before the DB
    // commit. Treat an expired send lease as uncertain and never resend it.
    await this.prisma.whatsAppBurstReply.updateMany({ where: { status: "SENDING", leaseUntil: { lt: now } }, data: { status: "DELIVERY_UNKNOWN", leaseUntil: null, lastErrorAt: now, lastErrorCode: "SEND_LEASE_EXPIRED" } });
    const replies = await this.prisma.whatsAppBurstReply.findMany({ where: { ...(allowedPhones ? { burst: { is: { phone: { in: [...allowedPhones] } } } } : {}), status: "PENDING" }, include: { burst: true }, take: 10, orderBy: { createdAt: "asc" } });
    for (const reply of replies) {
      try { requireTime(8_000); } catch (error) { if (error instanceof AgentCheckpoint) return; throw error; }
      const claim = await this.prisma.whatsAppBurstReply.updateMany({ where: { id: reply.id, status: "PENDING" }, data: { status: "SENDING", leaseUntil: new Date(now.getTime() + 30_000), sendStartedAt: now, lastErrorAt: null, lastErrorCode: null } });
      if (!claim.count) continue;
      try {
        const current = await this.prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: reply.burstId } });
        if (current.revision !== reply.revision) {
          await this.prisma.whatsAppBurstReply.update({ where: { id: reply.id }, data: { status: "SUPERSEDED" } });
          continue;
        }
        const delivery: { messageId?: string } = {};
        await send(reply.burst.phone, reply.text, { burstId: reply.burstId, revision: reply.revision, state: agentState(current.state as unknown as BurstState), delivery });
        await this.prisma.$transaction(async tx => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`burst:${reply.burst.instance}:${reply.burst.phone}`}))`;
          if (delivery.messageId) {
            const latest = await tx.whatsAppBurst.findUniqueOrThrow({ where: { id: reply.burstId } });
            const state = latest.state as unknown as BurstState;
            state.outboundReplies = [...(state.outboundReplies ?? []).filter(r => !(r.revision === reply.revision && (r.kind ?? "FINAL") === reply.kind)), { revision: reply.revision, kind: reply.kind as import("./burst-types.ts").BurstReplyKind, messageId: delivery.messageId }];
            await tx.whatsAppBurst.update({ where: { id: latest.id }, data: { state: json(state) } });
          }
          // HTTP 2xx means Evolution accepted the request. It is not proof that WhatsApp delivered it.
          await tx.whatsAppBurstReply.update({ where: { id: reply.id }, data: { status: "ACCEPTED", providerMessageId: delivery.messageId, acceptedAt: new Date(), leaseUntil: null } });
        });
      } catch (error) {
        if (error instanceof EvolutionRequestError) {
          // Evolution explicitly rejected this request. It did not accept a
          // WhatsApp message, so calling this delivery "unknown" would hide
          // an actionable channel fault. Do not blindly resend terminal 4xx
          // responses: the operator must restore the instance or request.
          await this.prisma.whatsAppBurstReply.update({ where: { id: reply.id }, data: { status: "DELIVERY_FAILED", leaseUntil: null, lastErrorAt: new Date(), lastErrorCode: `EVOLUTION_HTTP_${error.status}` } });
          console.error("WhatsApp reply rejected by Evolution", { burstId: reply.burstId, revision: reply.revision, status: error.status });
          continue;
        }
        // A timeout or network failure can happen after Evolution accepted the
        // request. Never retry blindly, because doing so can duplicate a valid
        // WhatsApp reply; reconcile this state operationally instead.
        await this.prisma.whatsAppBurstReply.update({ where: { id: reply.id }, data: { status: "DELIVERY_UNKNOWN", leaseUntil: null, lastErrorAt: new Date(), lastErrorCode: "EVOLUTION_TRANSPORT_UNKNOWN" } });
        console.warn("WhatsApp reply delivery outcome unknown", { burstId: reply.burstId, revision: reply.revision, error: error instanceof Error ? error.name : "UnknownError" });
      }
    }
  }
}
