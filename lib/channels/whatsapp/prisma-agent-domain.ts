Warning: truncated output (original token count: 15912)
Total output lines: 622

import { resolveConversationSupplier, type SupplierConversationReference } from "./conversation-association.ts";
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
import { RECENT_CONVERSATION_LIMIT, RECENT_MEMORY_MS, rememberedIds, memoryReference, hasExplicitRecentReference, hasRecentReference, recentReferenceCandidates, type RecentConversation } from "./agent-memory.ts";
import { PrismaBurstStore } from "./prisma-burst-store.ts";
import { canonicalJson, pendingDecision } from "./agent-policy.ts";
import { factualText, sourceText } from "./agent-tools.ts";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const normalized = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const canonical = canonicalJson;
const operationKey = (snapshot: BurstSnapshot, input: AgentWrite, legacy = false) => `waop_${createHash("sha256").update(`${snapshot.id}:${canonical({ ...input, ...(!legacy ? { targetKind: undefined } : {}), evidence: input.evidence.map((e) => e.id).sort(), revision: input.tool.startsWith("update_") ? snapshot.revision : undefined })}`).digest("hex").slice(0, 40)}`;
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
    const records = recentReferenceCandidates(memory, snapshot, await new PrismaBurstStore(client(db)).catalog(snapshot.userId), "SUPPLIER");
    return { association: { reason: records.length === 1 ? "RECENT_PREVIOUS_SUPPLIER" : association.ambiguous ? association.reason : "NO_PREVIOUS_SUPPLIER", id: records.length === 1 ? records[0].id : undefined }, records };
  }

  async resolveSupplierReference(snapshot: BurstSnapshot) {
    return (await this.currentSupplierContext(snapshot, this.prisma)).records;
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
      const trace = { ...captureTrace(snapshot, loadId), possibleSuppliers, sourceConflicts: extraction.sourceConflicts ?…5912 tokens truncated….tool.startsWith("update_") && target?.status === "CONFIRMED") {
        const pending = await tx.whatsAppAgentOperation.findFirst({ where: { burstId: snapshot.id, status: "PROPOSED", expiresAt: { gt: new Date() } } });
        if (pending) throw new AgentToolError("PENDING_APPROVAL", "Resolvé la propuesta pendiente antes de proponer otro cambio");
        await this.validatePatch(tx, target, input.patch!);
        const proposedPatch = { ...input.patch, ...("notes" in input.patch! ? { notes: mergeNotes(target.data.notes as string | null, input.patch!.notes) } : {}) };
        const result: AgentReceipt = { operationId: id, tool: input.tool, id: target.id, captureId: target.captureId, tripId: target.tripId, companyId: target.companyId, name: target.name, status: "PROPOSED", data: { before: Object.fromEntries(Object.keys(input.patch!).map((k) => [k, target.data[k] ?? null])), patch: proposedPatch, version: target.version, targetKind: target.kind } };
        return tx.whatsAppAgentOperation.create({ data: { id, burstId: snapshot.id, revision: snapshot.revision, tool: input.tool, arguments: json(input), result: json(result), status: "PROPOSED", expiresAt: new Date(Date.now() + 86_400_000) } });
      }
      const merged = this.extraction.mergeCandidates(facts.map((e) => e.candidate));
      const notes = assertGroundedNotes(input.notes, this.noteFacts(snapshot, input, input.notes), [input.name, merged.extractedFields.companyName, merged.extractedFields.city, merged.extractedFields.province, merged.extractedFields.category, merged.extractedFields.contact, merged.website].filter((v): v is string => typeof v === "string"));
      // An omitted name can be recovered only from explicit literal product labels.
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
        const data = parseProduct({ notes, name: input.name ?? "Producto sin nombre", fob: merged.extractedFields.fob, moq: merged.extractedFields.moq, leadTime: merged.extractedFields.leadTime });
        const p = await tx.supplierProduct.create({ data: { id: `wap_${id}`, captureId: target.captureId, supplierId: target.kind === "SUPPLIER" ? target.id : null, status: "DRAFT", ...data, sourceText: literal, sourceEvidence: json(input.evidence.map((e) => ({ id: e.id, messageId: e.messageId, start: e.start, end: e.end, text: e.text, role: e.role }))), sourceConflicts: json(merged.sourceConflicts ?? []), reviewFields: json(merged.reviewFields.filter((f) => ["fob", "moq", "leadTime"].includes(f))) } });
        result = { operationId: id, tool: input.tool, id: p.id, captureId: target.captureId, supplierId: p.supplierId, tripId: input.tripId, companyId: input.companyId, name: p.name, evidenceIds: input.evidence.map((e) => e.id), status: "WRITTEN", data: { supplierName: target.name, fields: productRecord(p), association } };
      } else {
        if (!target) throw new AgentToolError("INVALID_TARGET", "Falta el registro destino");
        await this.applyPatch(tx, snapshot, target, input.patch!);
        result = { operationId: id, tool: input.tool, id: target.id, captureId: target.captureId, tripId: target.tripId, companyId: target.companyId, name: target.name, status: "WRITTEN", data: { patch: input.patch, priorStatus: target.status } };
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
      return { name: product.name, resourceStatus: status, ...(status === "CONFIRMED" && (status !== product.status || result.tool === "create_product_draft" || result.data?.priorStatus === "DRAFT") ? { confirmationReason: "NAME_AND_FOB_PRESENT" as const } : {}) };
    }
    return reconcileSupplierConfirmation(tx, result.captureId!);
  }

  private async completeMedia(snapshot: BurstSnapshot, operation: WhatsAppAgentOperation) {
    const input = operation.arguments as unknown as AgentWrite; const result = receipt(operation);
    await this.authorize(this.prisma, snapshot, input.tripId, input.companyId);
    const isProduct = input.tool.includes("product");
    const imageProof: Array<{ messageId: string; attachmentId: string; productImageVerified: true }> = [];
    for (const messageId of new Set(input.evidence.map((e) => e.messageId))) {
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
          const source = { id: evidence.id, messageId: evidence.messageId, start: evidence.start, end: evidence.end, text: evidence.text, role: evidence.role };
          sources.set(evidence.id, { ...sources.get(evidence.id), ...source, ...proof, logicalLoadIds: logicalLoadIds(snapshot, { ...input, evidence: [evidence] }) });
        }
        await tx.supplierProduct.update({ where: { id: result.id }, data: { sourceEvidence: json([...sources.values()]) } });
      }
      const confirmation = await this.reconcileConfirmation(tx, result);
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
