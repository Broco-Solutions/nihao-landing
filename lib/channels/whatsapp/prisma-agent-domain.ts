import { advanceFocus, emptyFocus, focusCandidates, resetsConversation, continuationIntent, type ConversationFocus, type ConversationContext } from "./conversation-context.ts";
import { hasExplicitSupplierName, resolveConversationSupplier, type SupplierConversationReference } from "./conversation-association.ts";
import { orderedBurstMessages } from "./burst-types.ts";
import { reconcileSupplierConfirmation } from "../../bot/persistence/supplier-confirmation.ts";
import { captureEvidence, captureNotes, captureTrace } from "./capture-evidence.ts";
import { eligibleTrip } from "./trip-eligibility.ts";
import { assertGroundedNotes, mergeNotes } from "../../bot/notes.ts";
import { controlError, originalBytes, requireTime } from "./operational-runtime.ts";
import { assertLoadWrite, logicalLoadIds } from "./evidence-grouping.ts";
import { loadIdentity, recordIdentity, strongSupplierIdentity } from "./supplier-identity.ts";
import { rankSupplierSearch, type SupplierSearchMatch } from "./supplier-search.ts";
import { resolveHistoricalSnapshot } from "./historical-resolution.ts";
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient, WhatsAppAgentOperation } from "../../../generated/prisma/client.ts";
import type { AttachmentService, AttachmentRepository } from "../../bot/attachments.ts";
import type { StorageProvider } from "../../bot/storage/provider.ts";
import { SupplierExtractionService } from "../../bot/extraction/service.ts";
import { PrismaSupplierCaptureRepository } from "../../bot/persistence/prisma-repository.ts";
import { applySupplierPatch } from "../../bot/record-updates.ts";
import { parseProduct, parseSupplierEdit, productRecord, productUpdateData } from "../../bot/supplier-edit.ts";
import { deriveProductStatus } from "../../bot/record-completeness.ts";
import type { Tier1Field } from "../../bot/types.ts";
import type { BurstSnapshot } from "./burst-types.ts";
import { AgentSuperseded, AgentToolError, agentState, type AgentDomain, type AgentState, type AgentRecord, type AgentReceipt, type AgentWrite } from "./agent-contract.ts";
import { RECENT_CONVERSATION_LIMIT, RECENT_MEMORY_MS, rememberedIds, memoryReference, hasRecentReference, recentReferenceCandidates, type RecentConversation, type MemoryReference } from "./agent-memory.ts";
import { PrismaBurstStore } from "./prisma-burst-store.ts";
import { canonicalJson, pendingDecision } from "./agent-policy.ts";
import { factualText, sourceText } from "./agent-tools.ts";
import { commercialEvidence, mergeCommercialFacts, sourceTime } from "./pending-commercial-evidence.ts";
import type { CaptionFacts } from "./reading-enrichment.ts";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const normalized = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const canonical = canonicalJson;
const operationKey = (snapshot: BurstSnapshot, input: AgentWrite, legacy = false) => `waop_${createHash("sha256").update(`${snapshot.id}:${canonical({ ...input, ...(!legacy ? { targetKind: undefined } : {}), evidence: input.evidence.filter(e => !e.pendingId).map((e) => e.id).sort(), revision: input.tool.startsWith("update_") ? snapshot.revision : undefined })}`).digest("hex").slice(0, 40)}`;
export const operationId = (snapshot: BurstSnapshot, input: AgentWrite) => operationKey(snapshot, input);
const receipt = (row: WhatsAppAgentOperation) => ({ ...(row.result as unknown as AgentReceipt), status: row.status });
const client = (tx: Prisma.TransactionClient) => tx as PrismaClient;

export function approvalAnswer(snapshot: BurstSnapshot, displayedRevision: number | null): { id: string; cancel: boolean } | null {
  if (displayedRevision === null) return null;
  const decision = pendingDecision(snapshot, displayedRevision);
  return decision ? { id: decision.id, cancel: decision.cancel } : null;
}

export class PrismaAgentDomain implements AgentDomain {
  private readonly extraction = new SupplierExtractionService([]);
  constructor(private readonly prisma: PrismaClient, private readonly media: { storage: StorageProvider; attachments: AttachmentService; repository: Required<Pick<AttachmentRepository, "saveTranscription">> }) {}

  private contextKey(snapshot: BurstSnapshot) {
    return { instance: snapshot.instance, phone: snapshot.phone, userId: snapshot.userId };
  }

  private async readFocus(snapshot: BurstSnapshot, db: Prisma.TransactionClient): Promise<ConversationFocus> {
    const row = await db.whatsAppAgentContext.findUnique({ where: { instance_phone_userId: this.contextKey(snapshot) } });
    if (row) return row.focus as unknown as ConversationFocus;
    // Bootstrap existing installations from completed writes, not searches or reads.
    const history = await db.whatsAppBurst.findFirst({ where: { userId: snapshot.userId, instance: snapshot.instance, phone: snapshot.phone, version: 3, status: "DONE", id: { not: snapshot.id }, operations: { some: { status: "COMPLETED" } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: { operations: { where: { status: "COMPLETED" }, orderBy: { createdAt: "asc" } } } });
    let focus = emptyFocus();
    if (history) for (const operation of history.operations) {
      const r = receipt(operation);
      if (!r.tool.includes("product") && !r.tool.includes("supplier") && r.tool !== "resolve_existing_resource") continue;
      try {
        const target = await this.getWith(db, snapshot, r.tool.includes("product") ? "PRODUCT" : "SUPPLIER", r.id);
        focus = advanceFocus(focus, { ...r, id: target.id }, { ...snapshot, id: history.id, revision: operation.revision }, target.supplierId ?? (target.kind === "PRODUCT" ? target.captureId : target.id));
      } catch (error) { if (!(error instanceof AgentToolError && ["NOT_FOUND", "UNAUTHORIZED"].includes(error.code))) throw error; }
    }
    return focus;
  }

  private async contextWith(snapshot: BurstSnapshot, db: Prisma.TransactionClient): Promise<ConversationContext> {
    let focus = await this.readFocus(snapshot, db);
    if (resetsConversation(snapshot)) focus = { ...emptyFocus(), cleared: true };
    const suppliers: MemoryReference[] = [], products: MemoryReference[] = [];
    for (const [kind, ids, output] of [["SUPPLIER", focus.supplierIds, suppliers], ["PRODUCT", focus.productIds, products]] as const) {
      for (const id of ids) try { output.push(memoryReference(await this.getWith(db, snapshot, kind, id))); }
      catch (error) { if (!(error instanceof AgentToolError && ["NOT_FOUND", "UNAUTHORIZED"].includes(error.code))) throw error; }
    }
    const scope = snapshot.state.operationalContext;
    if (snapshot.state.tripId && focus.tripId && snapshot.state.tripId !== focus.tripId) return { focus: { ...emptyFocus(), cleared: true }, suppliers: [], products: [] };
    if (scope && focus.tripId && (scope.tripId !== focus.tripId || scope.companyId !== focus.companyId)) return { focus: { ...emptyFocus(), cleared: true }, suppliers: [], products: [] };
    return { focus, suppliers, products };
  }

  async conversationContext(snapshot: BurstSnapshot): Promise<ConversationContext> {
    return this.prisma.$transaction(async tx => {
      await this.guard(tx, snapshot);
      const context = await this.contextWith(snapshot, tx);
      if (context.focus.cleared) {
        await tx.whatsAppPendingEvidence.updateMany({ where: { ...this.contextKey(snapshot), status: "PENDING" }, data: { status: "DISCARDED" } });
      }
      await tx.whatsAppAgentContext.upsert({ where: { instance_phone_userId: this.contextKey(snapshot) }, create: { ...this.contextKey(snapshot), focus: json(context.focus) }, update: { focus: json(context.focus) } });
      return context;
    });
  }

  async resetConversationContext(snapshot: BurstSnapshot): Promise<void> {
    if (!resetsConversation(snapshot)) throw new AgentToolError("RESET_NOT_REQUESTED", "El usuario no pidió reiniciar el contexto");
    await this.conversationContext(snapshot);
  }

  private async pendingWith(snapshot: BurstSnapshot, db: Prisma.TransactionClient, target: AgentRecord, messageId?: string) {
    const source = messageId ? snapshot.messages.find(m => m.id === messageId) : orderedBurstMessages(snapshot).at(-1);
    const stored = source && await db.whatsAppBurstMessage.findUnique({ where: { id: source.id }, select: { sentAt: true, receivedAt: true } });
    const before = stored?.sentAt ?? source?.sentAt ?? (source?.envelope.sentAt ? new Date(source.envelope.sentAt) : stored?.receivedAt) ?? sourceTime(snapshot, source);
    if (resetsConversation(snapshot)) return [];
    await this.authorize(db, snapshot, target.tripId, target.companyId);
    return db.whatsAppPendingEvidence.findMany({ where: { ...this.contextKey(snapshot), tripId: target.tripId, companyId: target.companyId, captureId: target.captureId, status: "PENDING", sourceAt: { lte: before }, ...(source ? { sourceMessageId: { not: source.id } } : {}) }, orderBy: [{ sourceAt: "asc" }, { sourceSequence: "asc" }, { id: "asc" }] });
  }

  async pendingEvidence(snapshot: BurstSnapshot) {
    const refs = await this.referenceWith(snapshot, "SUPPLIER", this.prisma);
    if (refs.length !== 1) return [];
    const target = await this.get(snapshot, "SUPPLIER", refs[0].id);
    return (await this.pendingWith(snapshot, this.prisma, target)).map(commercialEvidence);
  }

  async preparePendingEvidence(snapshot: BurstSnapshot, id: string) {
    return (await this.pendingEvidence(snapshot)).find(e => e.pendingId === id) ?? null;
  }

  /** Named, verified product photos have a deterministic destination and need no association question. */
  async persistProductLoads(snapshot: BurstSnapshot): Promise<AgentReceipt[]> {
    const results: AgentReceipt[] = [];
    const graph = snapshot.state.ingestion;
    if (!graph) return results;
    const order = orderedBurstMessages(snapshot);
    const loads = graph.loads.filter(l => l.type === "PRODUCT" && !l.resourceId && !l.resolution && !["NEEDS_REVIEW", "FAILED", "PENDING_RETRY"].includes(l.status))
      .sort((a, b) => Math.min(...a.assetIds.map(id => order.findIndex(m => m.id === id))) - Math.min(...b.assetIds.map(id => order.findIndex(m => m.id === id))));
    for (const load of loads) {
      const messages = order.filter(m => load.assetIds.includes(m.id));
      const image = messages.find(m => m.envelope.type === "IMAGE" && m.reading?.productImageVerified && m.reading.ingestion?.caption?.products.length === 1);
      if (!image || continuationIntent({ ...snapshot, messages })) continue;
      if (graph.loads.some(prior => prior.type === "SUPPLIER" && !prior.resourceId && prior.assetIds.some(id => order.findIndex(m => m.id === id) < order.findIndex(m => m.id === image.id)))) continue;
      // Complex mixed audio/text loads remain with the semantic tool loop.
      if (messages.some(m => m.envelope.type !== "IMAGE")) continue;
      const product = image.reading!.ingestion!.caption!.products[0];
      const context = await this.currentSupplierContext(snapshot, this.prisma, image.id, image.envelope.text ?? "");
      if (context.records.length !== 1) continue;
      const target = await this.get(snapshot, "SUPPLIER", context.records[0].id);
      const evidence = messages.map(m => {
        const text = factualText(sourceText(snapshot, m.id));
        const candidate = structuredClone(m.reading!.segments[0]?.candidate ?? { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text } });
        if (m.id === image.id) Object.assign(candidate.extractedFields, { fob: product.fob, moq: product.moq, leadTime: product.leadTime });
        return { id: `${m.id}:product`, messageId: m.id, text, start: 0, end: text.length, role: "FACTS" as const, candidate };
      });
      const active = graph.activeLoadId;
      graph.activeLoadId = load.id;
      try {
        results.push(await this.write(snapshot, { tool: "create_product_draft", tripId: target.tripId, companyId: target.companyId, targetId: target.id, targetKind: target.kind, name: product.name, notes: product.notes, evidence }));
      } finally { graph.activeLoadId = active; }
    }
    return results;
  }

  private async rememberCompleted(tx: Prisma.TransactionClient, snapshot: BurstSnapshot, result: AgentReceipt) {
    const kind = result.tool.includes("product") ? "PRODUCT" : "SUPPLIER";
    if (!result.tool.includes("product") && !result.tool.includes("supplier") && result.tool !== "resolve_existing_resource") return;
    const target = await this.getWith(tx, snapshot, kind, result.id);
    if (kind === "SUPPLIER" && !target.name?.trim()) return; // Media preservation is not a conversational supplier.
    const previousFocus = await this.readFocus(snapshot, tx);
    const focus = advanceFocus(previousFocus, { ...result, id: target.id, status: "COMPLETED" }, snapshot, target.supplierId ?? (kind === "PRODUCT" ? target.captureId : target.id));
    if (focus === previousFocus) return;
    if (kind === "SUPPLIER") await tx.whatsAppPendingEvidence.updateMany({ where: { ...this.contextKey(snapshot), status: "PENDING", ...(focus.sourceAt ? { sourceAt: { lte: new Date(focus.sourceAt) } } : {}), OR: [{ captureId: { not: target.captureId } }, { tripId: { not: target.tripId } }, { companyId: { not: target.companyId } }] }, data: { status: "DISCARDED" } });
    await tx.whatsAppAgentContext.upsert({ where: { instance_phone_userId: this.contextKey(snapshot) }, create: { ...this.contextKey(snapshot), focus: json(focus) }, update: { focus: json(focus) } });
  }

  async selectConversationTarget(snapshot: BurstSnapshot, kind: "SUPPLIER" | "PRODUCT", id: string) {
    await this.prisma.$transaction(async tx => {
      await this.guard(tx, snapshot);
      const target = await this.getWith(tx, snapshot, kind, id);
      await this.rememberCompleted(tx, snapshot, { operationId: `selection:${snapshot.id}:${snapshot.revision}:${target.id}`, tool: kind === "PRODUCT" ? "update_product" : "update_supplier", id: target.id, tripId: target.tripId, companyId: target.companyId, status: "COMPLETED" });
    });
  }

  private async referenceWith(snapshot: BurstSnapshot, kind: "SUPPLIER" | "PRODUCT", db: Prisma.TransactionClient): Promise<MemoryReference[]> {
    const state = agentState(snapshot.state), pending = state.agent.pending;
    const messages = orderedBurstMessages(snapshot);
    const source = pending ? messages.filter(m => m.sequence > pending.revision).at(-1) : messages.at(-1);
    const text = (source?.envelope.type === "AUDIO" ? source.reading?.transcript ?? "" : source?.envelope.text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (pending) {
      const answer = source?.envelope.type === "AUDIO" ? source.reading?.transcript?.trim() : source?.envelope.text?.trim();
      const selected = answer && /^\d+$/u.test(answer) ? pending.options[Number(answer) - 1] : pending.options.find(o => normalized(o.label) === normalized(answer ?? ""));
      if (selected) try { return [memoryReference(await this.getWith(db, snapshot, kind, selected.id))]; } catch (error) { if (!(error instanceof AgentToolError)) throw error; }
      // Short answers belong to the pending question, never to an unrelated focus.
      return [];
    }
    const quote = source?.envelope.quotedMessageId;
    const context = await this.contextWith(snapshot, db);
    const current: MemoryReference[] = [];
    const operations = await db.whatsAppAgentOperation.findMany({ where: { burstId: snapshot.id, status: "COMPLETED", tool: { in: kind === "PRODUCT" ? ["create_product_draft", "update_product"] : ["create_supplier_draft", "update_supplier", "resolve_existing_resource"] } }, orderBy: { createdAt: "asc" } });
    for (const operation of operations) try { current.push(memoryReference(await this.getWith(db, snapshot, kind, receipt(operation).id))); } catch (error) { if (!(error instanceof AgentToolError)) throw error; }
    if (quote) {
      const quoted = await db.whatsAppBurstMessage.findUnique({ where: { instance_messageId: { instance: snapshot.instance, messageId: quote } }, include: { burst: true } });
      let quotedBurstId = quoted?.burstId;
      let replyRevision: number | undefined;
      if (!quoted) {
        const replied = await db.whatsAppBurst.findFirst({ where: { userId: snapshot.userId, instance: snapshot.instance, phone: snapshot.phone, version: 3, state: { path: ["outboundReplies"], array_contains: [{ messageId: quote }] } } });
        const reply = (replied?.state as unknown as AgentState | undefined)?.outboundReplies?.find(r => r.messageId === quote);
        quotedBurstId = replied?.id; replyRevision = reply?.revision;
      }
      if (!quotedBurstId || quoted && (quoted.burst.userId !== snapshot.userId || quoted.burst.phone !== snapshot.phone)) return [];
      const related = await db.whatsAppAgentOperation.findMany({ where: { burstId: quotedBurstId, status: "COMPLETED", ...(replyRevision !== undefined ? { revision: { lte: replyRevision } } : {}) } });
      const refs: MemoryReference[] = [];
      for (const operation of related) {
        const input = operation.arguments as unknown as AgentWrite;
        if (quoted && !(input.evidence ?? []).some(e => e.messageId === quoted.id)) continue;
        const r = receipt(operation);
        const id = kind === "PRODUCT" ? r.tool.includes("product") ? r.id : null : r.tool.includes("product") ? r.supplierId ?? r.captureId : r.id;
        if (id) try { refs.push(memoryReference(await this.getWith(db, snapshot, kind, id))); } catch (error) { if (!(error instanceof AgentToolError)) throw error; }
      }
      return [...new Map(refs.map(r => [r.id, r])).values()];
    }
    const pool = [...new Map([...current, ...(kind === "PRODUCT" ? context.products : context.suppliers)].map(r => [r.id, r])).values()];
    if (kind === "SUPPLIER" && current.length && source && !quote) return (await this.currentSupplierContext(snapshot, db, source.id, text)).records;
    const named = pool.filter(r => r.name && (` ${normalized(text)} `).includes(` ${normalized(r.name)} `));
    if (named.length) return named;
    const ordinal = text.match(/\b(primer|primero|segundo|tercer|tercero|cuarto|quinto|[1-9]) producto\b|\bproducto ([1-9])\b/u);
    if (kind === "PRODUCT" && ordinal) {
      const word = ordinal[1] ?? ordinal[2], index = /^\d$/u.test(word) ? Number(word) - 1 : word.startsWith("primer") ? 0 : word === "segundo" ? 1 : word.startsWith("tercer") ? 2 : word === "cuarto" ? 3 : 4;
      const ordered = current.length ? [...new Map(current.map(r => [r.id, r])).values()] : context.products;
      return ordered[index] ? [ordered[index]] : [];
    }
    if (kind === "SUPPLIER" && /\b(?:primer|segundo|tercer|cuarto|quinto|[1-9]) proveedor\b|\bproveedor [1-9]\b/u.test(text)) return (await this.currentSupplierContext(snapshot, db)).records;
    if (hasExplicitSupplierName(text) || /\b(?:para|al|a)\s+(?!(?:el|mismo|ese|este|ultimo|proveedor|producto|usd|eur|cny)\b)[\p{L}\p{N}]+/u.test(text)) return [];
    if (kind === "SUPPLIER" && source && !context.focus.cleared) {
      const resolved = await this.currentSupplierContext(snapshot, db, source.id, text);
      if (resolved.records.length) return resolved.records;
    }
    const scoped = focusCandidates(context, snapshot, kind);
    if (scoped.length || context.focus.burstId || context.focus.cleared) return scoped;
    return recentReferenceCandidates(await this.recentMemory(snapshot, db), snapshot, await new PrismaBurstStore(client(db)).catalog(snapshot.userId), kind);
  }

  async resolveConversationReference(snapshot: BurstSnapshot, kind: "SUPPLIER" | "PRODUCT") {
    return this.referenceWith(snapshot, kind, this.prisma);
  }

  async recentMemory(snapshot: BurstSnapshot, db: Prisma.TransactionClient = this.prisma): Promise<RecentConversation[]> {
    const rows = await db.whatsAppBurst.findMany({
      where: { id: { not: snapshot.id }, userId: snapshot.userId, instance: snapshot.instance, phone: snapshot.phone, version: 3, status: "DONE", updatedAt: { gte: new Date(Date.now() - RECENT_MEMORY_MS) } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: RECENT_CONVERSATION_LIMIT,
      select: { id: true, updatedAt: true, state: true, messages: { select: { id: true, sequence: true, sentAt: true, receivedAt: true }, orderBy: { sequence: "asc" } } },
    });
    const memory: RecentConversation[] = [];
    const currentTime = orderedBurstMessages(snapshot).find((message) => snapshot.state.ingestion?.loads.find((load) => load.id === snapshot.state.ingestion?.activeLoadId)?.assetIds.includes(message.id))?.sentAt ?? orderedBurstMessages(snapshot).at(-1)?.sentAt;
    for (const row of rows) {
      const chronological = [...row.messages].sort((a, b) => (a.sentAt?.getTime() ?? a.receivedAt.getTime()) - (b.sentAt?.getTime() ?? b.receivedAt.getTime()) || a.sequence - b.sequence);
      const lastMessageAt = chronological.at(-1)?.sentAt ?? chronological.at(-1)?.receivedAt ?? row.updatedAt;
      if (currentTime && lastMessageAt.getTime() >= currentTime.getTime()) continue;
      const state = row.state as unknown as AgentState;
      const references = new Map<string, ReturnType<typeof memoryReference>>();
      const remember = async (kind: "SUPPLIER" | "PRODUCT", id: string) => {
        try {
          // A supplier draft may have been confirmed on the web since this conversation.
          const promoted = kind === "SUPPLIER" ? await db.supplier.findUnique({ where: { captureId: id }, select: { id: true } }) : null;
          const record = await this.getWith(db, snapshot, kind, promoted?.id ?? id);
          references.set(record.id, memoryReference(record));
          return record;
        } catch (error) {
          if (error instanceof AgentToolError && ["NOT_FOUND", "UNAUTHORIZED"].includes(error.code)) return null;
          throw error;
        }
      };
      for (const ref of rememberedIds(state)) {
        const record = await remember(ref.kind, ref.id);
        if (record?.kind === "PRODUCT") await remember("SUPPLIER", record.supplierId ?? record.captureId);
      }
      const associations: NonNullable<RecentConversation["associations"]> = [];
      for (const operation of state.agent?.receipts ?? []) {
        if (operation.status !== "COMPLETED") continue;
        const product = references.get(operation.id);
        const supplier = product?.kind === "PRODUCT" ? [...references.values()].find((ref) => ref.kind !== "PRODUCT" && (ref.id === product.supplierId || ref.captureId === product.captureId)) : [...references.values()].find((ref) => ref.kind !== "PRODUCT" && (ref.id === operation.id || ref.captureId === operation.captureId));
        if (!supplier) continue;
        const sourceIds = state.agent.evidence.filter((e) => operation.evidenceIds?.includes(e.id) && e.role === "FACTS").map((e) => e.messageId);
        for (const message of row.messages.filter((message) => sourceIds.includes(message.id))) associations.push({ messageId: message.id, sequence: chronological.findIndex((source) => source.id === message.id) + 1, supplierId: supplier.id });
      }
      memory.push({ lastMessageAt: lastMessageAt.toISOString(), associations, conversationId: row.id, completedAt: row.updatedAt.toISOString(), references: [...references.values()], operations: (state.agent?.receipts ?? []).filter((r) => r.status === "COMPLETED" && references.has(r.id)).map((r) => ({ tool: r.tool, status: r.status, id: r.id })) });
    }
    return memory.sort((a, b) => Date.parse(b.lastMessageAt ?? b.completedAt) - Date.parse(a.lastMessageAt ?? a.completedAt));
  }

  private async currentSupplierContext(snapshot: BurstSnapshot, db: Prisma.TransactionClient, messageId?: string, text?: string) {
    const references: SupplierConversationReference[] = [];
    const state = agentState(snapshot.state);
    const pending = state.agent.pending;
    const answer = pending?.type === "CLARIFICATION" ? snapshot.messages.filter((message) => message.sequence > pending.revision).at(-1)?.envelope.text?.trim() : undefined;
    const selection = answer && /^\d+$/u.test(answer) ? pending?.options[Number(answer) - 1] : undefined;
    if (selection) {
      try { const record = await this.getWith(db, snapshot, "SUPPLIER", selection.id); return { association: { id: record.id, reason: "CLARIFICATION_ANSWER" }, records: [memoryReference(record)] }; }
      catch (error) { if (!(error instanceof AgentToolError)) throw error; }
    }
    const operations = await db.whatsAppAgentOperation.findMany({ where: { burstId: snapshot.id, status: "COMPLETED" } });
    const add = async (id: string, messageIds: string[]) => {
      try {
        const record = await this.getWith(db, snapshot, "SUPPLIER", id);
        const ref = references.find((ref) => ref.id === record.id);
        if (ref) ref.messageIds.push(...messageIds.filter((id) => !ref.messageIds.includes(id)));
        else references.push({ id: record.id, name: record.name, tripId: record.tripId, companyId: record.companyId, messageIds });
      } catch (error) { if (!(error instanceof AgentToolError && ["NOT_FOUND", "UNAUTHORIZED"].includes(error.code))) throw error; }
    };
    for (const load of state.ingestion?.loads ?? []) if (load.type === "SUPPLIER" && load.resourceId) await add(load.resourceId, load.assetIds);
    for (const operation of operations) {
      const result = receipt(operation); const input = operation.arguments as unknown as AgentWrite;
      const id = result.tool.includes("product") ? result.supplierId ?? result.captureId : result.id;
      if (id) await add(id, (input.evidence ?? []).filter((e) => e.role === "FACTS").map((e) => e.messageId));
    }
    const active = state.ingestion?.loads.find((load) => load.id === state.ingestion?.activeLoadId);
    const messages = orderedBurstMessages(snapshot);
    const source = messageId ? messages.find((message) => message.id === messageId) : active ? messages.find((message) => active.assetIds.includes(message.id)) : messages.at(-1);
    const literal = text ?? (active ? messages.filter((message) => active.assetIds.includes(message.id)) : source ? [source] : []).map((message) => factualText(sourceText(snapshot, message.id))).join("\n");
    const association = source ? resolveConversationSupplier(snapshot, source.id, literal, references) : { reason: "NO_PREVIOUS_SUPPLIER" };
    if (association.id) return { association, records: [memoryReference(await this.getWith(db, snapshot, "SUPPLIER", association.id))] };
    if (association.ambiguous && !(association.reason === "UNRESOLVED_ORDINAL_REFERENCE" && !references.length)) return { association, records: [] };
    const memory = await this.recentMemory(snapshot, db);
    const context = await this.contextWith(snapshot, db);
    if (context.focus.cleared) return { association: { reason: "CONTEXT_RESET" }, records: [] };
    const focus = focusCandidates(context, snapshot, "SUPPLIER");
    const implicit = !source?.envelope.quotedMessageId && !hasExplicitSupplierName(literal) && !/\b(?:primer|segundo|tercer|cuarto|quinto|[1-9]) proveedor\b|\bproveedor [1-9]\b/u.test(normalized(literal)) && !/\b(?:para|al|a)\s+(?!(?:el|mismo|ese|este|ultimo|proveedor|producto|usd|eur|cny)\b)[\p{L}\p{N}]+/u.test(normalized(literal));
    if (implicit && source && !context.focus.cleared) {
      const nearest = await this.latestSupplierBefore(snapshot, db, source);
      if (nearest) return { association: { reason: "NEAREST_PREVIOUS_SUPPLIER", id: nearest.id }, records: [memoryReference(nearest)] };
    }
    const records = focus.length && !/\b(?:primer|segundo|tercer|cuarto|quinto|[1-9]) proveedor\b|\bproveedor [1-9]\b/u.test(normalized(literal)) && !hasExplicitSupplierName(literal) && !/\b(?:para|al|a)\s+(?!(?:el|mismo|ese|este|ultimo|proveedor|producto|usd|eur|cny)\b)[\p{L}\p{N}]+/u.test(normalized(literal)) ? focus : recentReferenceCandidates(memory, snapshot, await new PrismaBurstStore(client(db)).catalog(snapshot.userId), "SUPPLIER");
    return { association: { reason: records.length === 1 ? "RECENT_PREVIOUS_SUPPLIER" : association.ambiguous ? association.reason : "NO_PREVIOUS_SUPPLIER", id: records.length === 1 ? records[0].id : undefined }, records };
  }

  async resolveSupplierReference(snapshot: BurstSnapshot) {
    return this.referenceWith(snapshot, "SUPPLIER", this.prisma);
  }

  private async latestSupplierBefore(snapshot: BurstSnapshot, db: Prisma.TransactionClient, source: BurstSnapshot["messages"][number]) {
    const stored = await db.whatsAppBurstMessage.findUnique({ where: { id: source.id } });
    const before = stored?.sentAt ?? source.sentAt ?? (source.envelope.sentAt ? new Date(source.envelope.sentAt) : stored?.receivedAt) ?? sourceTime(snapshot, source);
    const context = snapshot.state.operationalContext;
    const supplierEvents = ["create_supplier_draft", "resolve_existing_resource", "update_supplier", "create_product_draft", "update_product"];
    const rows = await db.whatsAppBurstMessage.findMany({ where: { id: { not: source.id }, OR: [{ sentAt: { lte: before } }, { sentAt: null, receivedAt: { lte: before } }], burst: { ...this.contextKey(snapshot), version: 3, operations: { some: { status: "COMPLETED", tool: { in: supplierEvents } } } } }, include: { burst: { include: { operations: { where: { status: "COMPLETED", tool: { in: supplierEvents } } } } } } });
    rows.sort((a, b) => (b.sentAt ?? b.receivedAt).getTime() - (a.sentAt ?? a.receivedAt).getTime() || b.receivedAt.getTime() - a.receivedAt.getTime() || b.sequence - a.sequence || b.id.localeCompare(a.id));
    for (const row of rows) for (const operation of row.burst.operations) {
      const input = operation.arguments as unknown as AgentWrite;
      if (!(input.evidence ?? []).some(e => e.messageId === row.id && e.role === "FACTS")) continue;
      try {
        const result = receipt(operation);
        const parent = result.tool.includes("product") ? await this.getWith(db, snapshot, "PRODUCT", result.id) : null;
        const target = await this.getWith(db, snapshot, "SUPPLIER", parent?.supplierId ?? parent?.captureId ?? result.id);
        if (target.name?.trim() && (!context || context.tripId === target.tripId && context.companyId === target.companyId)) return target;
      } catch (error) { if (!(error instanceof AgentToolError && ["UNAUTHORIZED", "NOT_FOUND"].includes(error.code))) throw error; }
    }
    return null;
  }

  private async authorize(db: Prisma.TransactionClient, snapshot: BurstSnapshot, tripId: string, companyId?: string) {
    const trip = await db.trip.findFirst({ where: { id: tripId, status: { in: ["ACTIVE", "PLANNED"] }, members: { some: { userId: snapshot.userId, role: "TRAVELER" } } }, select: { id: true } });
    const companies = await db.tripCompany.findMany({ where: { tripId, active: true, members: { some: { userId: snapshot.userId } } }, select: { id: true, catalogCompany: { select: { name: true } } } });
    if (!trip || !companies.length || (companyId && !companies.some((c) => c.id === companyId))) throw new AgentToolError("UNAUTHORIZED", "Contexto no autorizado");
    return companies;
  }
  private async guard(db: Prisma.TransactionClient, snapshot: BurstSnapshot) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`burst:${snapshot.instance}:${snapshot.phone}`}))`;
    const current = await db.whatsAppBurst.findUnique({ where: { id: snapshot.id } });
    if (!current || current.revision !== snapshot.revision || current.leaseId !== snapshot.leaseId || current.status !== "PROCESSING" || current.leaseUntil && current.leaseUntil.getTime() <= Date.now()) throw new AgentSuperseded();
  }
  async get(snapshot: BurstSnapshot, kind: "SUPPLIER" | "PRODUCT", id: string): Promise<AgentRecord> { return this.getWith(this.prisma, snapshot, kind, id); }
  private async getWith(db: Prisma.TransactionClient, snapshot: BurstSnapshot, kind: "SUPPLIER" | "PRODUCT", id: string): Promise<AgentRecord> {
    if (kind === "PRODUCT") {
      const p = await db.supplierProduct.findUnique({ where: { id }, include: { capture: true, images: true } });
      if (!p) throw new AgentToolError("NOT_FOUND", "Producto no encontrado");
      await this.authorize(db, snapshot, p.capture.tripId, p.capture.companyId);
      return { id: p.id, captureId: p.captureId, supplierId: p.supplierId, kind: "PRODUCT", tripId: p.capture.tripId, companyId: p.capture.companyId, name: p.name, status: p.status, version: p.updatedAt.toISOString(), data: productRecord(p) as unknown as Record<string, unknown> };
    }
    const supplier = await db.supplier.findFirst({ where: { OR: [{ id }, { captureId: id }] }, include: { contacts: true } });
    if (supplier) {
      const companies = await this.authorize(db, snapshot, supplier.tripId, supplier.companyId);
      return { companyLabel: companies.find((c) => c.id === supplier.companyId)!.catalogCompany.name, city: supplier.city, id: supplier.id, captureId: supplier.captureId, kind: "SUPPLIER", tripId: supplier.tripId, companyId: supplier.companyId, name: supplier.companyNameLatin ?? supplier.companyName, status: supplier.status, version: supplier.updatedAt.toISOString(), data: json(supplier) as Record<string, unknown> };
    }
    const draft = await db.supplierCapture.findUnique({ where: { id } });
    if (!draft || draft.deletedAt || draft.status !== "DRAFT") throw new AgentToolError("NOT_FOUND", "Proveedor o borrador no encontrado");
    const companies = await this.authorize(db, snapshot, draft.tripId, draft.companyId);
    return { companyLabel: companies.find((c) => c.id === draft.companyId)!.catalogCompany.name, city: draft.city, id, captureId: id, kind: "SUPPLIER_DRAFT", tripId: draft.tripId, companyId: draft.companyId, name: draft.companyNameLatin ?? draft.companyName, status: draft.status, version: draft.updatedAt.toISOString(), data: json(draft) as Record<string, unknown> };
  }
  async search(snapshot: BurstSnapshot, kind: "SUPPLIER" | "PRODUCT", tripId: string, query: string, parentId?: string) {
    const companies = await this.authorize(this.prisma, snapshot, tripId);
    const companyIds = companies.map((c) => c.id);
    const match = (name: string | null) => !query.trim() || (` ${normalized(name ?? "")} `).includes(` ${normalized(query)} `);
    let ids: string[];
    const searchMatches = new Map<string, SupplierSearchMatch>();
    if (kind === "SUPPLIER") {
      // Bounded results returned to the model; normalization also supports accents and aliases.
      const suppliers = await this.prisma.supplier.findMany({ where: { tripId, companyId: { in: companyIds }, status: "CONFIRMED" }, select: { id: true, companyName: true, companyNameLatin: true, website: true, contacts: { select: { type: true, rawText: true } } }, orderBy: [{ companyName: "asc" }, { id: "asc" }] });
      const drafts = await this.prisma.supplierCapture.findMany({ where: { tripId, companyId: { in: companyIds }, status: "DRAFT" }, select: { id: true, companyName: true, companyNameLatin: true, website: true, contactMethods: true }, orderBy: [{ companyName: "asc" }, { id: "asc" }] });
      ids = rankSupplierSearch([...suppliers, ...drafts], query).slice(0, 20).map(({ record, match }) => { searchMatches.set(record.id, match); return record.id; });
    } else {
      if (parentId) await this.get(snapshot, "SUPPLIER", parentId);
      const products = await this.prisma.supplierProduct.findMany({ where: { capture: { tripId, companyId: { in: companyIds } }, ...(parentId ? { OR: [{ supplierId: parentId }, { captureId: parentId }] } : {}) }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
      ids = products.filter((r) => match(r.name)).slice(0, 20).map((r) => r.id);
    }
    let records = await Promise.all(ids.map(async (id) => ({ ...await this.get(snapshot, kind, id), ...(searchMatches.has(id) ? { searchMatch: searchMatches.get(id)! } : {}) })));
    const text = normalized(snapshot.messages.map((m) => factualText(m.envelope.text ?? m.reading?.transcript ?? "")).join("\n"));
    const mentionedCompanies = companies.filter((c) => ` ${text} `.includes(` ${normalized(c.catalogCompany.name).split(" ")[0]} `));
    if (mentionedCompanies.length === 1 && kind === "SUPPLIER") records = records.filter((r) => r.companyId === mentionedCompanies[0].id);
    const cities = [...new Set(records.map((r) => r.city).filter((c): c is string => Boolean(c) && ` ${text} `.includes(` ${normalized(c!)} `)))];
    return (cities.length === 1 ? records.filter((r) => r.city === cities[0]) : records).slice(0, 20);
  }

  /** Automatic ingestion is independent of the conversational model and identity approval. */
  async persistImageLoad(snapshot: BurstSnapshot, loadId: string): Promise<AgentReceipt> {
    const load = snapshot.state.ingestion!.loads.find(l => l.id === loadId)!;
    if (load.type === "PRODUCT") throw new AgentToolError("WRONG_RECORD_KIND", "Una imagen de producto no puede crear un proveedor sustituto");
    const context = snapshot.state.loadContexts?.[loadId] ?? snapshot.state.operationalContext;
    if (!context) throw new AgentToolError("MISSING_COMPANY", "Falta el contexto autorizado de la carga");
    const messages = snapshot.messages.filter(m => load.assetIds.includes(m.id));
    const evidence = messages.map(captureEvidence);
    const input: AgentWrite = { tool: "create_supplier_draft", ...context, evidence };
    const id = `waauto_${createHash("sha256").update(`${snapshot.id}:${loadId}`).digest("hex").slice(0, 40)}`;
    const row = await this.prisma.$transaction(async tx => {
      await this.guard(tx, snapshot);
      await this.authorize(tx, snapshot, context.tripId, context.companyId);
      const previous = await tx.whatsAppAgentOperation.findUnique({ where: { id } });
      if (previous) return previous;
      const trip = await tx.trip.findUniqueOrThrow({ where: { id: context.tripId }, select: { status: true, endDate: true } });
      if (!eligibleTrip(trip)) throw new AgentToolError("TRIP_ENDED", "El viaje ya terminó");
      const extraction = this.extraction.mergeCandidates(evidence.map(e => e.candidate));
      const candidates = await tx.supplier.findMany({ where: { tripId: context.tripId, companyId: context.companyId }, include: { contacts: true } });
      const identity = loadIdentity(snapshot, load);
      const possibleSuppliers = candidates.filter(c => {
        const stored = recordIdentity({ id: c.id, captureId: c.captureId, kind: "SUPPLIER", tripId: c.tripId, companyId: c.companyId, name: c.companyName, status: c.status, version: c.updatedAt.toISOString(), data: c as unknown as Record<string, unknown> });
        return Boolean(extraction.extractedFields.companyName && normalized(c.companyName ?? "") === normalized(extraction.extractedFields.companyName) || ["emails", "phones", "domains"].some(field => identity[field as keyof typeof identity].some(value => stored[field as keyof typeof stored].includes(value))));
      }).map(c => ({ supplierId: c.id, captureId: c.captureId, name: c.companyName }));
      const trace = { ...captureTrace(snapshot, loadId), possibleSuppliers, sourceConflicts: extraction.sourceConflicts ?? [] };
      const requiresConfirmation = Boolean(load.error || load.status === "NEEDS_REVIEW" || extraction.reviewFields.length || extraction.sourceConflicts?.length || possibleSuppliers.length);
      const created = await new PrismaSupplierCaptureRepository(client(tx)).createDraft({ userId: snapshot.userId, ...context, clientCaptureId: `wac_${id}`, notes: captureNotes(messages), explicitProducts: true, extraction });
      await tx.supplierCapture.update({ where: { id: created.id }, data: { companyNameLatin: messages.find(m => m.reading?.ingestion?.nameRomanization?.original === created.fields.companyName)?.reading?.ingestion?.nameRomanization?.latin ?? null, evidence: json([...extraction.evidence, trace]) } });
      const result: AgentReceipt = { operationId: id, tool: input.tool, id: created.id, captureId: created.id, ...context, name: created.fields.companyName, evidenceIds: evidence.map(e => e.id), logicalLoadIds: [loadId], status: "WRITTEN", data: { requiresConfirmation, preservedImageLoad: true, possibleSuppliers } };
      return tx.whatsAppAgentOperation.create({ data: { id, burstId: snapshot.id, revision: snapshot.revision, tool: input.tool, arguments: json(input), result: json(result), status: "WRITTEN" } });
    });
    if (row.status === "WRITTEN") await this.completeMedia(snapshot, row);
    return receipt(await this.prisma.whatsAppAgentOperation.findUniqueOrThrow({ where: { id } }));
  }

  /** Persist caption facts once, even when the card bypasses the conversational loop. */
  async persistCaptions(snapshot: BurstSnapshot): Promise<void> {
    for (const message of orderedBurstMessages(snapshot)) {
      const caption = message.reading?.ingestion?.caption;
      const load = snapshot.state.ingestion?.loads.find(l => ["SUPPLIER", "PRODUCT"].includes(l.type) && l.assetIds.includes(message.id));
      if (!caption || !load || load.type === "SUPPLIER" && !load.resourceId) continue;
      await this.prisma.$transaction(async tx => {
        await this.guard(tx, snapshot);
        const resolved = load.type === "PRODUCT" ? await this.currentSupplierContext(snapshot, tx, message.id, message.envelope.text ?? "") : null;
        if (resolved && resolved.records.length !== 1) return; // Original remains durable, no substitute supplier/question.
        let target = await this.getWith(tx, snapshot, "SUPPLIER", resolved?.records[0].id ?? load.resourceId!);
        if (caption.supplierReference) {
          const context = await this.currentSupplierContext(snapshot, tx, message.id, caption.supplierReference);
          if (!context.association.id) {
            // The original caption remains durable; do not guess an explicit destination or ask again.
            return;
          }
          target = await this.getWith(tx, snapshot, "SUPPLIER", context.association.id);
        }
        if (caption.pendingFacts && Object.values(caption.pendingFacts).some(value => value != null)) {
          const source = await tx.whatsAppBurstMessage.findUniqueOrThrow({ where: { id: message.id } });
          const at = source.sentAt ?? (message.envelope.sentAt ? new Date(message.envelope.sentAt) : source.receivedAt);
          const focus = await this.readFocus(snapshot, tx);
          const superseded = Boolean(focus.sourceAt && new Date(focus.sourceAt) > at && focus.supplierIds.length && !focus.supplierIds.some(id => id === target.id || id === target.captureId));
          const id = `wape_${createHash("sha256").update(`${snapshot.instance}:${snapshot.phone}:${snapshot.userId}:${message.id}`).digest("hex").slice(0, 40)}`;
          await tx.whatsAppPendingEvidence.upsert({ where: { id }, create: { id, ...this.contextKey(snapshot), tripId: target.tripId, companyId: target.companyId, captureId: target.captureId, sourceMessageId: message.id, sourceAt: at, sourceSequence: source.sequence, text: message.envelope.text!, facts: json(caption.pendingFacts), status: superseded ? "DISCARDED" : "PENDING" }, update: {} });
        }
        // Caption observations remain on the capture. Only suppliers created in this burst
        // can be updated automatically; historical supplier edits retain their approval flow.
        if (caption.supplierNotes) {
          const capture = await tx.supplierCapture.findUniqueOrThrow({ where: { id: target.captureId } });
          const notes = mergeNotes(capture.notes, caption.supplierNotes);
          await tx.supplierCapture.update({ where: { id: capture.id }, data: { notes } });
          const createdHere = await tx.whatsAppAgentOperation.findFirst({ where: { burstId: snapshot.id, tool: "create_supplier_draft", result: { path: ["captureId"], equals: target.captureId } } });
          if (createdHere && target.kind === "SUPPLIER") await tx.supplier.update({ where: { id: target.id }, data: { notes } });
        }
        for (const [index, product] of caption.products.entries()) {
          if (load.type === "PRODUCT") continue; // Photo products use write + completeMedia to link their image.
          const id = `wacaption_${createHash("sha256").update(`${snapshot.id}:${message.id}:${index}`).digest("hex").slice(0, 40)}`;
          if (await tx.whatsAppAgentOperation.findUnique({ where: { id } })) continue;
          const pending = await this.pendingWith(snapshot, tx, target, message.id);
          const evidence = pending.map(commercialEvidence);
          const fields = mergeCommercialFacts([...evidence, { id: `${message.id}:caption:${index}`, messageId: message.id, start: 0, end: message.envelope.text!.length, text: message.envelope.text!, role: "FACTS", candidate: { extractedFields: { fob: product.fob, moq: product.moq, leadTime: product.leadTime }, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text: message.envelope.text! } } }]);
          const notes = pending.map(p => (p.facts as CaptionFacts).notes).filter((value): value is string => Boolean(value)).reduce<string | null>((prior, value) => mergeNotes(prior, value), product.notes);
          const data = parseProduct({ ...product, ...fields, notes });
          const status = deriveProductStatus({ ...data, status: "DRAFT" });
          const saved = await tx.supplierProduct.create({ data: { id: `wap_${id}`, ...data, status, captureId: target.captureId, supplierId: target.kind === "SUPPLIER" ? target.id : null, sourceText: [...pending.map(p => p.text), message.envelope.text].join("\n"), sourceEvidence: json([...evidence.map(e => ({ id: e.id, pendingId: e.pendingId, messageId: e.messageId, text: e.text, role: e.role })), { id: `${message.id}:caption:${index}`, messageId: message.id, text: message.envelope.text, role: "FACTS", origin: "IMAGE_CAPTION", originalStorageKey: message.reading?.storageKey }]) } });
          if (pending.length) await tx.whatsAppPendingEvidence.updateMany({ where: { id: { in: pending.map(p => p.id) }, ...this.contextKey(snapshot), captureId: target.captureId, status: "PENDING" }, data: { status: "APPLIED", targetProductId: saved.id, appliedAt: new Date() } });
          const result: AgentReceipt = { operationId: id, tool: "create_product_draft", id: saved.id, captureId: target.captureId, tripId: target.tripId, companyId: target.companyId, name: saved.name, status: "COMPLETED", resourceStatus: status, completedRevision: snapshot.revision, evidenceIds: [`${message.id}:caption:${index}`], ...(status === "CONFIRMED" ? { confirmationReason: "NAME_PRESENT" } : {}) };
          await this.rememberCompleted(tx, snapshot, result);
          await tx.whatsAppAgentOperation.create({ data: { id, burstId: snapshot.id, revision: snapshot.revision, tool: result.tool, status: "COMPLETED", arguments: json({ ...product, messageId: message.id, targetId: target.id }), result: json(result) } });
        }
      });
    }
  }

  async resolveExistingSupplier(snapshot: BurstSnapshot, loadId: string, supplierId?: string): Promise<AgentReceipt | null> {
    const load = snapshot.state.ingestion?.loads.find(l => l.id === loadId);
    if (!load || load.type !== "SUPPLIER" || load.resolution || ["NEEDS_REVIEW", "FAILED", "PENDING_RETRY"].includes(load.status) || !snapshot.state.tripId) return null;
    const row = await this.prisma.$transaction(async tx => {
      await this.guard(tx, snapshot);
      const companies = await this.authorize(tx, snapshot, snapshot.state.tripId!);
      const rows = await tx.supplier.findMany({ where: { tripId: snapshot.state.tripId!, companyId: { in: companies.filter(c => !snapshot.state.operationalContext || c.id === snapshot.state.operationalContext.companyId).map(c => c.id) }, status: "CONFIRMED" }, include: { contacts: true } });
      const identity = loadIdentity(snapshot, load);
      const matches = rows.filter(row => strongSupplierIdentity(identity, recordIdentity({ id: row.id, captureId: row.captureId, kind: "SUPPLIER", tripId: row.tripId, companyId: row.companyId, name: row.companyName, status: row.status, version: row.updatedAt.toISOString(), data: row as unknown as Record<string, unknown> })).matches);
      if (matches.length !== 1 || supplierId && matches[0].id !== supplierId) return null;
      const supplier = matches[0];
      const id = `wares_${createHash("sha256").update(`${snapshot.id}:${load.id}:${supplier.id}`).digest("hex").slice(0, 40)}`;
      const previous = await tx.whatsAppAgentOperation.findUnique({ where: { id } });
      if (previous) return previous;
      const capture = await tx.supplierCapture.findUniqueOrThrow({ where: { id: supplier.captureId } });
      await tx.supplierCapture.update({ where: { id: supplier.captureId }, data: { evidence: json([...(Array.isArray(capture.evidence) ? capture.evidence : []), captureTrace(snapshot, loadId)]) } });
      const result: AgentReceipt = { operationId: id, tool: "resolve_existing_resource", id: supplier.id, captureId: supplier.captureId, tripId: supplier.tripId, companyId: supplier.companyId, name: supplier.companyName, status: "WRITTEN", resourceStatus: "CONFIRMED", logicalLoadIds: [load.id], completedRevision: snapshot.revision, data: { event: "RESOLVED_EXISTING_RESOURCE", assetIds: load.assetIds, identity, preservedImageLoad: true } };
      // Retain the new original on the existing capture without changing supplier fields.
      const row = await tx.whatsAppAgentOperation.create({ data: { id, burstId: snapshot.id, revision: snapshot.revision, tool: result.tool, arguments: json({ tool: result.tool, tripId: supplier.tripId, companyId: supplier.companyId, evidence: snapshot.messages.filter(m => load.assetIds.includes(m.id)).map(captureEvidence) }), result: json(result), status: "WRITTEN" } });
      return row;
    });
    if (!row) return null;
    if (row.status === "WRITTEN") await this.completeMedia(snapshot, row);
    return receipt(await this.prisma.whatsAppAgentOperation.findUniqueOrThrow({ where: { id: row.id } }));
  }

  async resolveHistoricalEvidence(snapshot: BurstSnapshot, loadId: string): Promise<number> {
    const resolved = snapshot.state.ingestion?.loads.find(l => l.id === loadId);
    if (!resolved?.resourceId || resolved.status !== "PROCESSED" || resolved.type !== "SUPPLIER") return 0;
    return this.prisma.$transaction(async tx => {
      await this.guard(tx, snapshot);
      const supplier = await this.getWith(tx, snapshot, "SUPPLIER", resolved.resourceId!);
      if (supplier.status !== "CONFIRMED" || !strongSupplierIdentity(loadIdentity(snapshot, resolved), recordIdentity(supplier)).matches) return 0;
      let count = resolveHistoricalSnapshot(snapshot, snapshot, resolved);
      const rows = await tx.whatsAppBurst.findMany({ where: { id: { not: snapshot.id }, userId: snapshot.userId, instance: snapshot.instance, phone: snapshot.phone, version: 3, status: "WAITING", leaseId: null }, include: { messages: true } });
      for (const row of rows) {
        const state = row.state as unknown as AgentState;
        if (state.tripId !== supplier.tripId || !state.ingestion) continue;
        const historical: BurstSnapshot = { ...row, state, messages: row.messages.map(m => ({ ...m, envelope: m.envelope as unknown as BurstSnapshot["messages"][number]["envelope"], reading: m.reading as unknown as BurstSnapshot["messages"][number]["reading"] })) };
        const changed = resolveHistoricalSnapshot(historical, snapshot, resolved);
        if (!changed) continue;
        await tx.whatsAppBurst.update({ where: { id: row.id }, data: { state: json(historical.state) } });
        for (const message of historical.messages.filter(m => m.reading?.ingestion?.resolution)) await tx.whatsAppBurstMessage.update({ where: { id: message.id }, data: { reading: json(message.reading) } });
        count += changed;
      }
      return count;
    });
  }

  private noteFacts(snapshot: BurstSnapshot, input: AgentWrite, notes: unknown): string[] {
    const facts = input.evidence.filter(e => e.role === "FACTS");
    const sources = facts.map(e => factualText(e.text));
    // Visual observations may describe the photographed sample, never commercial availability.
    const commercial = typeof notes === "string" && /disponib|available|viene\s+en|ofrece|offers|personaliz|customiz|\bOEM\b|tamaños|sizes/iu.test(notes);
    if (!commercial) for (const evidence of facts) {
      const message = snapshot.messages.find(m => m.id === evidence.messageId);
      const description = message?.reading?.ingestion?.classification?.product?.description;
      if (message?.envelope.type === "IMAGE" && message.reading?.productImageVerified === true && description) sources.push(factualText(description));
    }
    return sources;
  }

  private groundPatch(snapshot: BurstSnapshot, input: AgentWrite) {
    const text = normalized(input.evidence.filter((e) => e.role === "FACTS").map((e) => factualText(e.text)).join("\n"));
    const fields = this.extraction.mergeCandidates(input.evidence.filter((e) => e.role === "FACTS").map((e) => e.candidate)).extractedFields;
    for (const [key, value] of Object.entries(input.patch ?? {})) {
      if (value === null) { if (!/\b(borra|borrar|borra el|quita|quitar|vacia|vaciar|elimina|eliminar|sin dato)\b/u.test(text)) throw new AgentToolError("UNGROUNDED_PATCH", "Vaciar un campo requiere un pedido explícito"); continue; }
      if (["fob", "moq", "leadTime"].includes(key)) {
        if (value && typeof value === "object" && Object.values(value).some((v) => v === null) && !/\b(borra|borrar|quita|quitar|vacia|vaciar|elimina|eliminar)\b/u.test(text)) throw new AgentToolError("UNGROUNDED_PATCH", "Omití los componentes no mencionados; null requiere pedido explícito de vaciar");
        const actual = fields[key as Tier1Field];
        if (!actual || typeof value !== "object" || Object.entries(value).some(([k, v]) => k !== "rawText" && canonical(v) !== canonical((actual as Record<string, unknown>)[k]))) throw new AgentToolError("UNGROUNDED_PATCH", `El campo ${key} no coincide con la evidencia`);
      } else if (key === "notes") {
        if (!assertGroundedNotes(value, this.noteFacts(snapshot, input, value), [fields.companyName, fields.city, fields.province, fields.category, fields.contact, input.name].filter((v): v is string => typeof v === "string"))) throw new AgentToolError("UNGROUNDED_PATCH", "Vaciar notes requiere null y un pedido explícito, no texto vacío");
      } else if (key === "interestScore") {
        if (fields.interestScore !== value) throw new AgentToolError("UNGROUNDED_PATCH", "El interés requiere una valoración numérica explícita");
      } else if (key === "supplierType") {
        if (fields.supplierType !== value) throw new AgentToolError("UNGROUNDED_PATCH", "Tipo de proveedor sin evidencia");
      } else if (key === "contacts") {
        if (!Array.isArray(value) || value.some((v) => !text.includes(normalized(String((v as { rawText?: unknown }).rawText))))) throw new AgentToolError("UNGROUNDED_PATCH", "Contacto sin evidencia");
      } else if (!text.includes(normalized(String(value)))) throw new AgentToolError("UNGROUNDED_PATCH", `Valor de ${key} no mencionado por el usuario`);
    }
  }

  async write(snapshot: BurstSnapshot, input: AgentWrite): Promise<AgentReceipt> {
    assertLoadWrite(snapshot, input);
    if (input.notes != null) assertGroundedNotes(input.notes, this.noteFacts(snapshot, input, input.notes));
    const id = operationId(snapshot, input);
    if (input.patch) {
      if (!Object.keys(input.patch).length && !(input.tool === "update_product" && input.evidence.some((e) => e.role === "FACTS" && snapshot.messages.some((m) => m.id === e.messageId && m.envelope.type === "IMAGE" && m.reading?.imageKind === "PRODUCT_IMAGE" && m.reading.productImageVerified === true && m.reading.storageKey)))) throw new AgentToolError("EMPTY_PATCH", "Indicá los campos a cambiar o una foto del producto");
      this.groundPatch(snapshot, input);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await this.guard(tx, snapshot);
      const companies = await this.authorize(tx, snapshot, input.tripId, input.companyId);
      // Promotion changes record kind, not the identity of a technical retry. Read old keys too.
      const legacyKinds = input.targetKind && input.targetKind !== "PRODUCT" ? ["SUPPLIER", "SUPPLIER_DRAFT"] : [input.targetKind];
      const keys = [id, ...legacyKinds.map((targetKind) => operationKey(snapshot, { ...input, targetKind }, true))];
      const existing = await tx.whatsAppAgentOperation.findFirst({ where: { id: { in: [...new Set(keys)] } } });
      if (existing) return existing;
      if (input.tool.startsWith("create_")) {
        const trip = await tx.trip.findUniqueOrThrow({ where: { id: input.tripId }, select: { status: true, endDate: true } });
        if (!eligibleTrip(trip)) throw new AgentToolError("TRIP_ENDED", "El viaje ya terminó. Elegí un contexto vigente para esta nueva carga.");
      }
      if (snapshot.state.legacyBatchId && input.tool === "create_product_draft" && input.name) {
        const name = normalized(input.name);
        const versions = snapshot.messages.filter((m) => m.envelope.type === "TEXT" && /^(?:tengo|producto|carg|agreg)/iu.test(m.envelope.text?.trim() ?? "") && (` ${normalized(sourceText(snapshot, m.id))} `).includes(` ${name} `) && /\b(?:fob|moq|lead\s*time|leed\s*time|plazo)\b/iu.test(sourceText(snapshot, m.id))).sort((a, b) => a.sequence - b.sequence);
        const latest = versions.at(-1);
        if (latest && versions.length > 1 && input.evidence.some((e) => e.role === "FACTS" && versions.some((m) => m.id === e.messageId && m.id !== latest.id))) throw new AgentToolError("STALE_PRODUCT_FACTS", `El lote recuperado contiene versiones repetidas de este producto. Usá la versión más reciente (${latest.id}) como FACTS; conservá la aclaración del proveedor como CONTEXT. No mezcles condiciones de intentos anteriores. Si se trata de productos distintos, preguntá antes de cargar.`);
      }
      if (input.targetId) {
        if (input.tool === "update_product") await tx.$queryRaw`SELECT id FROM "SupplierProduct" WHERE id = ${input.targetId} FOR UPDATE`;
        else {
          await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id = ${input.targetId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "SupplierCapture" WHERE id = ${input.targetId} FOR UPDATE`;
        }
      }
      const target = input.targetId ? await this.getWith(tx, snapshot, input.tool === "update_product" ? "PRODUCT" : "SUPPLIER", input.targetId) : null;
      if (target && (target.tripId !== input.tripId || target.companyId !== input.companyId)) throw new AgentToolError("INVALID_TARGET", "El destino cambió");
      const currentSource = input.evidence.find(e => e.role === "FACTS" && !e.pendingId);
      const pending = target && input.tool === "create_product_draft" ? await this.pendingWith(snapshot, tx, target, currentSource?.messageId) : [];
      for (const evidence of input.evidence.filter(e => e.pendingId)) {
        const row = pending.find(p => p.id === evidence.pendingId);
        if (!row || row.sourceMessageId !== evidence.messageId || !row.text.includes(evidence.text) || evidence.role !== "FACTS") throw new AgentToolError("INVALID_PENDING_EVIDENCE", "Esta evidencia histórica no está pendiente para este proveedor y producto");
      }
      if (pending.length) input = { ...input, evidence: [...pending.map(commercialEvidence), ...input.evidence.filter(e => !e.pendingId)] };
      if (target && input.patch?.notes != null) assertGroundedNotes(input.patch.notes, this.noteFacts(snapshot, input, input.patch.notes), [target.name, ...["city", "province", "category", "contact", "website"].map(k => target.data[k])].filter((v): v is string => typeof v === "string"));
      if (target && input.tool.startsWith("update_")) {
        const literal = normalized(input.evidence.map(e => e.text).join("\n"));
        const refs = await this.referenceWith(snapshot, input.tool === "update_product" ? "PRODUCT" : "SUPPLIER", tx);
        const named = target.name && (` ${literal} `).includes(` ${normalized(target.name)} `);
        if (named && refs.length > 1) throw new AgentToolError("AMBIGUOUS_TARGET", "El nombre identifica varios recursos. Preguntá cuál antes de modificarlo");
        if (!named && !(refs.length === 1 && refs[0].id === target.id)) throw new AgentToolError("AMBIGUOUS_TARGET", "La aclaración no identifica un único recurso. Preguntá cuál antes de modificarlo");
        const observed = agentState(snapshot.state).agent.resolvedRecords?.find(r => r.id === target.id);
        if (observed && observed.version !== target.version) throw new AgentToolError("CONFLICT", "El registro cambió. Volvé a consultarlo antes de aplicar la corrección");
      }
      let association: { id?: string; reason: string } | undefined;
      if (target && input.tool === "create_product_draft") {
        const source = input.evidence.find((e) => e.role === "FACTS" && !e.pendingId);
        const resolved = await this.currentSupplierContext(snapshot, tx, source?.messageId, input.evidence.filter(e => !e.pendingId).map((e) => factualText(e.text)).join("\n"));
        const literalTarget = normalized(input.evidence.map((e) => factualText(e.text)).join("\n"));
        association = target.name && ` ${literalTarget} `.includes(` ${normalized(target.name)} `) ? { id: target.id, reason: "EXPLICIT_SUPPLIER_NAME" } : resolved.association;
        if (["UNRESOLVED_ORDINAL_REFERENCE", "UNRESOLVED_QUOTED_REFERENCE", "UNRESOLVED_EXPLICIT_SUPPLIER", "AMBIGUOUS_PREVIOUS_SUPPLIER", "AMBIGUOUS_SUPPLIER_NAME"].includes(association.reason)) throw new AgentToolError("AMBIGUOUS_TARGET", "La referencia explícita necesita aclaración antes de asociar el producto");
        if (association.id && association.id !== target.id) throw new AgentToolError("WRONG_ASSOCIATED_SUPPLIER", "La referencia o el mensaje anterior identifican otro proveedor");
        const ownDraft = await tx.whatsAppAgentOperation.findFirst({ where: { burstId: snapshot.id, tool: "create_supplier_draft", status: { in: ["WRITTEN", "COMPLETED"] } }, orderBy: { createdAt: "desc" } });
        if (!ownDraft || receipt(ownDraft).captureId !== target.captureId) {
          const literal = normalized(input.evidence.map((e) => factualText(e.text)).join("\n"));
          const pending = agentState(snapshot.state).agent.pending;
          const companyQuestion = pending?.type === "CLARIFICATION" && pending.options.length > 0 && pending.options.every((o) => companies.some((c) => c.id === o.id));
          const companyAlias = companies.some((c) => normalized(c.catalogCompany.name).split(" ")[0] === normalized(target.name ?? ""));
          if (companyQuestion && companyAlias && !literal.includes(`proveedor ${normalized(target.name ?? "")}`)) throw new AgentToolError("MISSING_SUPPLIER", "La respuesta a la pregunta de empresa no identifica al proveedor aunque haya uno homónimo. Para cargar el producto preguntá por el proveedor. La empresa se obtiene del proveedor que el usuario indique");
          const latest = snapshot.messages.filter((m) => m.sequence > (pending?.revision ?? snapshot.revision)).at(-1)?.envelope.text?.trim();
          const selected = pending?.type === "CLARIFICATION" && latest && /^\d+$/u.test(latest) ? pending.options[Number(latest) - 1]?.id : null;
          const peers = await tx.supplier.findMany({ where: { tripId: target.tripId, companyId: { in: companies.map((c) => c.id) } }, select: { id: true, companyName: true, companyId: true, city: true } });
          const full = normalized(target.name ?? ""); const alias = full.split(" ")[0];
          const same = peers.filter((p) => normalized(p.companyName ?? "") === full);
          const uniqueAlias = alias && peers.filter((p) => normalized(p.companyName ?? "").split(" ")[0] === alias).length === 1;
          const companyName = normalized(companies.find((c) => c.id === target.companyId)!.catalogCompany.name).split(" ")[0];
          const city = normalized(String(target.data.city ?? ""));
          const mentions = full && (` ${literal} `.includes(` ${full} `) || uniqueAlias && ` ${literal} `.includes(` ${alias} `));
          const disambiguated = same.length <= 1 || ` ${literal} `.includes(` ${companyName} `) || city && ` ${literal} `.includes(` ${city} `);
          let remembered = association?.id === target.id;
          if (selected !== target.id && !(mentions && disambiguated) && !remembered && hasRecentReference(snapshot)) {
            const candidates = recentReferenceCandidates(await this.recentMemory(snapshot, tx), snapshot, await new PrismaBurstStore(client(tx)).catalog(snapshot.userId), "SUPPLIER");
            remembered = candidates.length === 1 && candidates[0].id === target.id;
          }
          if (selected !== target.id && !(mentions && disambiguated) && !remembered) throw new AgentToolError("AMBIGUOUS_TARGET", "El proveedor no está identificado inequívocamente en las evidencias preparadas. Revisá los mensajes nuevos que responden la pregunta pendiente: si indican el proveedor, preparalos con role CONTEXT e incluí esos evidenceIds junto con los FACTS originales. Si realmente falta destino o hay homónimos sin resolver, preguntá con opciones de búsqueda");
        }
      }
      const literal = input.evidence.map((e) => factualText(e.text)).join("\n");
      const facts = input.evidence.filter((e) => e.role === "FACTS");
      if (input.tool.startsWith("create_")) {
        const previous = await tx.whatsAppAgentOperation.findMany({ where: { burstId: snapshot.id, tool: input.tool, status: { in: ["WRITTEN", "COMPLETED"] } } });
        for (const operation of previous) {
          const prior = operation.arguments as unknown as AgentWrite;
          if (prior.evidence.some((a) => a.role === "FACTS" && facts.some((b) => a.messageId === b.messageId && a.start < b.end && b.start < a.end || a.messageId === b.messageId && a.start === b.start && a.end === b.end))) throw new AgentToolError("EVIDENCE_ALREADY_USED", "Estas evidencias ya se cargaron. Usá el registro existente o separá los fragmentos de otro producto");
        }
      }
      if (input.tool.startsWith("update_")) {
        const pending = await tx.whatsAppAgentOperation.findFirst({ where: { burstId: snapshot.id, status: "PROPOSED", expiresAt: { gt: new Date() } } });
        if (pending) throw new AgentToolError("PENDING_APPROVAL", "Resolvé la propuesta existente antes de aplicar otra corrección");
      }
      const merged = this.extraction.mergeCandidates(facts.map((e) => e.candidate));
      if (input.tool === "create_product_draft") {
        const order = new Map(orderedBurstMessages(snapshot).map((m, index) => [m.id, index]));
        const local = input.evidence.filter(e => !e.pendingId).sort((a, b) => (order.get(a.messageId) ?? 0) - (order.get(b.messageId) ?? 0) || a.start - b.start || a.id.localeCompare(b.id));
        Object.assign(merged.extractedFields, mergeCommercialFacts([...pending.map(commercialEvidence), ...local]));
      }
      const notes = assertGroundedNotes(input.notes, this.noteFacts(snapshot, input, input.notes), [input.name, merged.extractedFields.companyName, merged.extractedFields.city, merged.extractedFields.province, merged.extractedFields.category, merged.extractedFields.contact, merged.website].filter((v): v is string => typeof v === "string"));
      // An omitted name can be recovered only from explicit literal product labels.
      if (input.tool === "create_product_draft" && continuationIntent(snapshot)) {
        const active = await this.referenceWith(snapshot, "PRODUCT", tx);
        const mentionsActive = active.some(r => r.name && normalized(literal).includes(normalized(r.name)));
        if (active.length && (!input.name || mentionsActive || active.some(r => r.name && normalized(r.name) === normalized(input.name!)))) throw new AgentToolError("CONTINUATION_REQUIRES_UPDATE", "Es una aclaración del producto activo. Usá update_product; si hay varios, preguntá cuál");
      }
      if (input.tool === "create_product_draft" && !input.name) {
        const names = [...new Set(facts.flatMap((e) => [...factualText(e.text).matchAll(/\bproducto\s*:?\s+([^:.\n,]+?)(?=\s+(?:al?\s+proveedor|a\s+|para\s+|de\s+)|[:.,\n]|$)/giu)].map((m) => m[1].trim())).filter((name) => !/^(?:a |al |un |el |que |nuevo |del |sin )/iu.test(name)))];
        if (names.length === 1) input = { ...input, name: names[0] };
      }
      let result: AgentReceipt;
      if (input.tool === "create_supplier_draft") {
        if (companies.length > 1) {
          const company = companies.find((c) => c.id === input.companyId)!;
          const mention = normalized(literal + "\n" + snapshot.messages.map((m) => m.envelope.text ?? "").join("\n"));
          const pending = agentState(snapshot.state).agent.pending;
          const answer = snapshot.messages.filter((m) => m.sequence > (pending?.revision ?? snapshot.revision)).at(-1)?.envelope.text?.trim();
          const selected = answer && /^\d+$/u.test(answer) ? pending?.options[Number(answer) - 1]?.id : null;
          if (!mention.includes(normalized(company.catalogCompany.name).split(" ")[0]) && selected !== company.id) throw new AgentToolError("MISSING_COMPANY", "Preguntá para qué empresa es el nuevo proveedor");
        }
        merged.extractedFields.fob = null; merged.extractedFields.moq = null; merged.extractedFields.leadTime = null;
        merged.rawSource = { type: "TEXT", text: literal };
        const created = await new PrismaSupplierCaptureRepository(client(tx)).createDraft({ userId: snapshot.userId, tripId: input.tripId, companyId: input.companyId, clientCaptureId: `wac_${id}`, notes, explicitProducts: true, extraction: merged });
        result = { operationId: id, tool: input.tool, id: created.id, captureId: created.id, tripId: input.tripId, companyId: input.companyId, name: created.fields.companyName, evidenceIds: input.evidence.map((e) => e.id), status: "WRITTEN" };
      } else if (input.tool === "create_product_draft") {
        if (!target) throw new AgentToolError("INVALID_TARGET", "Falta el proveedor destino");
        if (input.name && !normalized(literal).includes(normalized(input.name))) throw new AgentToolError("UNGROUNDED_NAME", "El nombre del producto debe estar en la evidencia");
        const pendingNotes = pending.map(p => (p.facts as CaptionFacts).notes).filter((value): value is string => Boolean(value));
        const productNotes = pendingNotes.reduce<string | null>((prior, value) => mergeNotes(prior, value), notes);
        const data = parseProduct({ notes: productNotes, name: input.name ?? "Producto sin nombre", fob: merged.extractedFields.fob, moq: merged.extractedFields.moq, leadTime: merged.extractedFields.leadTime });
        const p = await tx.supplierProduct.create({ data: { id: `wap_${id}`, captureId: target.captureId, supplierId: target.kind === "SUPPLIER" ? target.id : null, status: "DRAFT", ...data, sourceText: literal, sourceEvidence: json(input.evidence.map((e) => ({ id: e.id, messageId: e.messageId, start: e.start, end: e.end, text: e.text, role: e.role }))), sourceConflicts: json(merged.sourceConflicts ?? []), reviewFields: json(merged.reviewFields.filter((f) => ["fob", "moq", "leadTime"].includes(f))) } });
        result = { operationId: id, tool: input.tool, id: p.id, captureId: target.captureId, supplierId: p.supplierId, tripId: input.tripId, companyId: input.companyId, name: p.name, evidenceIds: input.evidence.map((e) => e.id), status: "WRITTEN", data: { supplierName: target.name, fields: productRecord(p), association } };
        if (pending.length) {
          const consumed = await tx.whatsAppPendingEvidence.updateMany({ where: { id: { in: pending.map(p => p.id) }, status: "PENDING", ...this.contextKey(snapshot), captureId: target.captureId }, data: { status: "APPLIED", targetProductId: p.id, appliedAt: new Date() } });
          if (consumed.count !== pending.length) throw new AgentToolError("CONFLICT", "Las condiciones ya fueron asociadas a otro producto");
        }
      } else {
        if (!target) throw new AgentToolError("INVALID_TARGET", "Falta el registro destino");
        await this.applyPatch(tx, snapshot, target, input.patch!);
        result = { operationId: id, tool: input.tool, id: target.id, captureId: target.captureId, tripId: target.tripId, companyId: target.companyId, name: target.name, evidenceIds: input.evidence.map(e => e.id), status: "WRITTEN", data: { before: Object.fromEntries(Object.keys(input.patch!).map(k => [k, target.data[k] ?? null])), patch: input.patch, priorStatus: target.status } };
      }
      return tx.whatsAppAgentOperation.create({ data: { id, burstId: snapshot.id, revision: snapshot.revision, tool: input.tool, arguments: json(input), result: json(result), status: result.status } });
    });
    if (row.status === "WRITTEN") await this.completeMedia(snapshot, row);
    return receipt(await this.prisma.whatsAppAgentOperation.findUniqueOrThrow({ where: { id: row.id } }));
  }

  private async validatePatch(tx: Prisma.TransactionClient, target: AgentRecord, patch: Record<string, unknown>) {
    if (target.kind === "PRODUCT") {
      const existing = await tx.supplierProduct.findUniqueOrThrow({ where: { id: target.id } }); productUpdateData(existing, patch);
    } else if (target.kind === "SUPPLIER") parseSupplierEdit(patch);
    else {
      const allowed = ["notes", "companyName", "city", "province", "category", "supplierType", "interestScore", "contact", "contacts", "website"];
      if (Object.keys(patch).some((k) => !allowed.includes(k))) throw new AgentToolError("INVALID_PATCH", "Campo de borrador inválido");
      parseSupplierEdit(Object.fromEntries(Object.entries(patch).filter(([k]) => k !== "contact")));
      if ("contact" in patch && patch.contact !== null && typeof patch.contact !== "string") throw new AgentToolError("INVALID_PATCH", "Contacto inválido");
    }
  }
  private async applyPatch(tx: Prisma.TransactionClient, snapshot: BurstSnapshot, target: AgentRecord, patch: Record<string, unknown>) {
    await this.validatePatch(tx, target, patch);
    if (target.kind === "PRODUCT") {
      const p = await tx.supplierProduct.findUniqueOrThrow({ where: { id: target.id } });
      await tx.supplierProduct.update({ where: { id: p.id }, data: productUpdateData(p, patch) });
    } else if (target.kind === "SUPPLIER") {
      const s = await tx.supplier.findUniqueOrThrow({ where: { id: target.id } }); await applySupplierPatch(tx, snapshot.userId, s, patch);
    } else {
      const repo = new PrismaSupplierCaptureRepository(client(tx));
      for (const [key, value] of Object.entries(patch)) {
        if (key === "contacts") {
          const contacts = parseSupplierEdit({ contacts: value }).contacts!;
          await tx.supplierCapture.update({ where: { id: target.id }, data: { contactMethods: json(contacts) } });
        } else if (key === "notes") {
          const capture = await tx.supplierCapture.findUniqueOrThrow({ where: { id: target.id } });
          await tx.supplierCapture.update({ where: { id: target.id }, data: { notes: mergeNotes(capture.notes, value) } });
        } else if (key === "website") await tx.supplierCapture.update({ where: { id: target.id }, data: { website: value as string | null } });
        else await repo.correctField({ userId: snapshot.userId, tripId: target.tripId, captureId: target.id, field: key as Tier1Field, value: value as never, acknowledgedUnknown: value === null });
      }
    }
  }
  /** Caller owns authorization and the burst lock. Status changes share the receipt transaction. */
  private async reconcileConfirmation(tx: Prisma.TransactionClient, result: AgentReceipt): Promise<Partial<AgentReceipt>> {
    if (result.tool.includes("product")) {
      await tx.$queryRaw`SELECT id FROM "SupplierProduct" WHERE id = ${result.id} FOR UPDATE`;
      const product = await tx.supplierProduct.findUniqueOrThrow({ where: { id: result.id }, include: { images: true } });
      const proof = Array.isArray(product.sourceEvidence) ? product.sourceEvidence as Array<{ attachmentId?: string; productImageVerified?: boolean }> : [];
      const images = product.images.map((image) => ({ ...image, verified: proof.some((evidence) => evidence.attachmentId === image.id && evidence.productImageVerified === true) }));
      const status = deriveProductStatus({ ...product, images });
      if (status !== product.status) await tx.supplierProduct.update({ where: { id: product.id }, data: { status } });
      return { name: product.name, resourceStatus: status, ...(status === "CONFIRMED" && (status !== product.status || result.tool === "create_product_draft" || result.data?.priorStatus === "DRAFT") ? { confirmationReason: "NAME_PRESENT" as const } : {}) };
    }
    return reconcileSupplierConfirmation(tx, result.captureId!);
  }

  private async completeMedia(snapshot: BurstSnapshot, operation: WhatsAppAgentOperation) {
    const input = operation.arguments as unknown as AgentWrite; const result = receipt(operation);
    await this.authorize(this.prisma, snapshot, input.tripId, input.companyId);
    const isProduct = input.tool.includes("product");
    const imageProof: Array<{ messageId: string; attachmentId: string; productImageVerified: true }> = [];
    for (const messageId of new Set(input.evidence.filter(e => !e.pendingId).map((e) => e.messageId))) {
      requireTime();
      const message = snapshot.messages.find((m) => m.id === messageId); const reading = message?.reading;
      if (!reading?.storageKey) {
        if (message?.envelope.type === "IMAGE") throw new Error("Falta guardar el original de la imagen");
        continue;
      }
      const object = await this.media.storage.get(reading.storageKey);
      if (!object) throw new Error("Falta el original de la evidencia");
      const bytes = await originalBytes(object);
      const graph = snapshot.state.ingestion;
      const unambiguousImage = !graph || graph.links.some((link) => link.sourceAssetId === messageId && link.relationship === "IMAGE_OF" && link.confidence !== "AMBIGUOUS" && graph.loads.some((load) => load.id === link.targetLoadId && load.type === "PRODUCT" && !["FAILED", "NEEDS_REVIEW"].includes(load.status)));
      const productFacts = unambiguousImage && input.evidence.some((e) => e.messageId === messageId && e.role === "FACTS");
      const type = message!.envelope.type === "AUDIO" ? "AUDIO" : reading.imageKind === "BUSINESS_CARD" ? "BUSINESS_CARD" : reading.imageKind === "PRODUCT_IMAGE" && (!isProduct || productFacts && reading.productImageVerified === true) ? "PRODUCT_IMAGE" : "OTHER";
      const attachment = await this.media.attachments.upload({ userId: snapshot.userId, tripId: input.tripId, captureId: result.captureId!, evidenceForProduct: isProduct, allowDocumentEvidence: true, clientEvidenceId: `waea_${createHash("sha256").update(`${operation.id}:${messageId}`).digest("hex").slice(0, 40)}`, type, mimeType: reading.mimeType!, size: bytes.length, body: bytes });
      if (reading.transcript && reading.model) await this.media.repository.saveTranscription(attachment.id, { text: reading.transcript, model: reading.model });
      if (isProduct) {
        await this.prisma.supplierAttachment.update({ where: { id: attachment.id }, data: { productId: result.id } });
        if (type === "PRODUCT_IMAGE") imageProof.push({ messageId, attachmentId: attachment.id, productImageVerified: true });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await this.guard(tx, snapshot);
      await this.authorize(tx, snapshot, input.tripId, input.companyId);
      const current = await tx.whatsAppAgentOperation.findUniqueOrThrow({ where: { id: operation.id } });
      if (current.status !== "WRITTEN") return;
      if (input.tool === "create_supplier_draft") {
        const attachments = await tx.supplierAttachment.findMany({ where: { supplierCaptureId: result.captureId, productId: null }, select: { id: true } });
        await tx.supplierCapture.update({ where: { id: result.captureId }, data: { sourceAttachmentId: attachments[0]?.id, analyzedAttachmentIds: attachments.map((a) => a.id), needsReanalysis: false } });
      }
      if (isProduct) {
        const product = await tx.supplierProduct.findUniqueOrThrow({ where: { id: result.id } });
        const sources = new Map((Array.isArray(product.sourceEvidence) ? product.sourceEvidence as Array<Record<string, unknown>> : []).map((source) => [source.id, source]));
        for (const evidence of input.evidence) {
          const proof = evidence.role === "FACTS" ? imageProof.find((image) => image.messageId === evidence.messageId) : undefined;
          const source = { id: evidence.id, pendingId: evidence.pendingId, messageId: evidence.messageId, start: evidence.start, end: evidence.end, text: evidence.text, role: evidence.role };
          sources.set(evidence.id, { ...sources.get(evidence.id), ...source, ...proof, logicalLoadIds: logicalLoadIds(snapshot, { ...input, evidence: [evidence] }) });
        }
        await tx.supplierProduct.update({ where: { id: result.id }, data: { sourceEvidence: json([...sources.values()]) } });
      }
      const confirmation = await this.reconcileConfirmation(tx, result);
      await this.rememberCompleted(tx, snapshot, { ...result, ...confirmation, status: "COMPLETED" });
      await tx.whatsAppAgentOperation.update({ where: { id: operation.id }, data: { status: "COMPLETED", result: json({ ...result, ...confirmation, logicalLoadIds: result.logicalLoadIds ?? logicalLoadIds(snapshot, input), completedRevision: snapshot.revision, status: "COMPLETED" }) } });
    });
  }
  private async markMediaFailure(snapshot: BurstSnapshot, operation: WhatsAppAgentOperation) {
    const graph = snapshot.state.ingestion; if (!graph) return;
    const input = operation.arguments as unknown as AgentWrite;
    for (const load of graph.loads.filter((load) => (receipt(operation).logicalLoadIds ?? logicalLoadIds(snapshot, input)).includes(load.id))) { load.status = "PENDING_RETRY"; load.error = { type: "MEDIA_PERSISTENCE_FAILED", retryable: true, stage: "media_persistence" }; }
    for (const asset of graph.assets.filter((asset) => input.evidence.some((e) => e.messageId === asset.id))) {
      asset.status = "PENDING_RETRY"; asset.error = { type: "MEDIA_PERSISTENCE_FAILED", retryable: true, stage: "media_persistence" };
      const message = snapshot.messages.find((m) => m.id === asset.id);
      if (message?.reading?.ingestion) { message.reading.ingestion.status = "PENDING_RETRY"; message.reading.ingestion.error = asset.error; }
    }
  }
  async receipts(snapshot: BurstSnapshot) {
    const rows = await this.prisma.whatsAppAgentOperation.findMany({ where: { burstId: snapshot.id }, orderBy: { createdAt: "asc" } });
    for (const row of rows.filter((r) => r.status === "WRITTEN")) {
      requireTime();
      const input = row.arguments as unknown as AgentWrite;
      if (snapshot.state.ingestion?.activeLoadId && !(receipt(row).logicalLoadIds ?? logicalLoadIds(snapshot, input)).includes(snapshot.state.ingestion.activeLoadId)) continue;
      if (!receipt(row).data?.preservedImageLoad && snapshot.state.ingestion && input.evidence.some((e) => snapshot.state.ingestion!.assets.some((asset) => asset.id === e.messageId && ["FAILED", "NEEDS_REVIEW"].includes(asset.status)))) continue;
      try { await this.completeMedia(snapshot, row); }
      catch (error) { if (!snapshot.state.ingestion || controlError(error) || error instanceof AgentToolError) throw error; await this.markMediaFailure(snapshot, row); }
    }
    return (await this.prisma.whatsAppAgentOperation.findMany({ where: { burstId: snapshot.id }, orderBy: { createdAt: "asc" } })).map(receipt);
  }
  async pending(snapshot: BurstSnapshot) { return (await this.prisma.whatsAppAgentOperation.findMany({ where: { burstId: snapshot.id, status: "PROPOSED", expiresAt: { gt: new Date() } } })).map(receipt); }
  async displayed(snapshot: BurstSnapshot, proposalId: string) { await this.prisma.whatsAppAgentOperation.updateMany({ where: { id: proposalId, burstId: snapshot.id, status: "PROPOSED", displayedRevision: null }, data: { displayedRevision: snapshot.revision } }); }
  async resolve(snapshot: BurstSnapshot, proposalId: string, cancel: boolean) {
    const resolved = await this.prisma.$transaction(async (tx) => {
      await this.guard(tx, snapshot);
      const row = await tx.whatsAppAgentOperation.findUnique({ where: { id: proposalId } });
      if (!row || row.burstId !== snapshot.id) throw new AgentToolError("NOT_FOUND", "Propuesta no encontrada");
      const input = row.arguments as unknown as AgentWrite;
      await this.authorize(tx, snapshot, input.tripId, input.companyId);
      if (row.status === "COMPLETED" || row.status === "CANCELLED" || row.status === "WRITTEN") return receipt(row);
      if (row.status !== "PROPOSED") throw new AgentToolError("EXPIRED_APPROVAL", "Propuesta resuelta; consultá el registro y proponé nuevamente el cambio");
      if (!row.expiresAt || row.expiresAt.getTime() < Date.now()) return { ...receipt(await tx.whatsAppAgentOperation.update({ where: { id: row.id }, data: { status: "EXPIRED" } })), data: { ...receipt(row).data, error: "La propuesta expiró. Consultá el registro, proponé el cambio nuevamente y pedí una nueva aprobación." } };
      const sent = row.displayedRevision !== null && await tx.whatsAppBurstReply.findFirst({ where: { burstId: snapshot.id, revision: row.displayedRevision, status: "SENT" } });
      const answer = sent ? approvalAnswer(snapshot, row.displayedRevision) : null;
      if (!answer || answer.cancel !== cancel) throw new AgentToolError("APPROVAL_REQUIRED", "Falta respuesta explícita del usuario a la propuesta enviada");
      if (input.tool === "update_product") await tx.$queryRaw`SELECT id FROM "SupplierProduct" WHERE id = ${input.targetId!} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id = ${input.targetId!} FOR UPDATE`;
      const target = await this.getWith(tx, snapshot, input.tool === "update_product" ? "PRODUCT" : "SUPPLIER", input.targetId!);
      const result = { ...receipt(row), captureId: target.captureId, tripId: target.tripId, companyId: target.companyId };
      if (!cancel && target.version !== result.data?.version) {
        await tx.whatsAppAgentOperation.update({ where: { id: row.id }, data: { status: "STALE" } });
        return { ...result, status: "STALE", data: { ...result.data, error: "El registro cambió. Volvé a consultarlo y pedí aprobación de la nueva propuesta." } };
      }
      if (!cancel) await this.applyPatch(tx, snapshot, target, input.patch!);
      const status = cancel ? "CANCELLED" : "WRITTEN";
      return receipt(await tx.whatsAppAgentOperation.update({ where: { id: row.id }, data: { status, approvedMessageId: answer.id, result: json({ ...result, status }) } }));
    });
    if (resolved.status !== "WRITTEN") return resolved;
    const operation = await this.prisma.whatsAppAgentOperation.findUniqueOrThrow({ where: { id: proposalId } });
    await this.completeMedia(snapshot, operation);
    return receipt(await this.prisma.whatsAppAgentOperation.findUniqueOrThrow({ where: { id: proposalId } }));
  }
}
