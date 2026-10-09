import { assertMessageOutcomes } from "./message-outcomes.ts";
import { questionAnswer, selectedQuestionOption } from "./followup-resolution.ts";
import { resolveBurstContext, contextOptions } from "./burst-context.ts";
import { renderClarification, formatQuestion, renderSavedResults } from "./clarification-rendering.ts";
import { assertLoadWrite, describeEvidence, evidenceLinks, logicalLoadIds, nextIngestionQuestion, recordLoadReceipt, updateGraphSummary } from "./evidence-grouping.ts";
import { createHash } from "node:crypto";
import type { MistralExtractionProvider } from "../../bot/extraction/mistral-extraction-provider.ts";
import type { BurstCatalog, BurstSnapshot } from "./burst-types.ts";
import { AgentToolError, validateToolArgs, type AgentDomain, type AgentEvidence, type AgentReceipt, type AgentState, type AgentRecord, type AgentMessageOutcome } from "./agent-contract.ts";
import { operationalContext, pendingDecision } from "./agent-policy.ts";
import { recentReferenceCandidates } from "./agent-memory.ts";
import { whatsappAgentHelpReply } from "./help-reply.ts";
import { observedProduct } from "./product-observation.ts";

export const evidenceHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);
export const sourceText = (snapshot: BurstSnapshot, messageId: string) => {
  const message = snapshot.messages.find((m) => m.id === messageId);
  if (!message) throw new AgentToolError("INVALID_REFERENCE", "Usá un messageId del listado de evidencias");
  if (message.envelope.type === "AUDIO") return message.reading?.transcript ?? "";
  if (message.envelope.type !== "IMAGE") return message.envelope.text ?? "";
  const original = [message.reading?.ingestion?.trustedText ?? message.reading?.ocr, message.envelope.text].filter(Boolean).join("\n");
  const name = observedProduct(message)?.name;
  return name && !original.includes(name) ? [original, name].filter(Boolean).join("\n") : original;
};
// These instruction clauses are not commercial facts even if they contain numbers.
export function factualText(text: string): string { return text.split(/\b(?:ignor[áa]\s+(?:las|todas)|invent[áa]\b|us[áa]\s+supplierId|confirm[áa]\s+automáticamente)/iu)[0].trim(); }
export function recordReceipt(state: AgentState, receipt: AgentReceipt) {
  const index = state.agent.receipts.findIndex((r) => r.operationId === receipt.operationId);
  // Older proposal rows may lack the attribution checkpointed by the caller.
  if (index >= 0 && !receipt.logicalLoadIds && state.agent.receipts[index].logicalLoadIds) receipt = { ...receipt, logicalLoadIds: state.agent.receipts[index].logicalLoadIds };
  recordLoadReceipt(state, receipt);
  if (index < 0) state.agent.receipts.push(receipt); else state.agent.receipts[index] = receipt;
}
export function currentReceipts(snapshot: BurstSnapshot, state: AgentState): AgentReceipt[] {
  const active = state.ingestion?.activeLoadId;
  return state.agent.receipts.filter(r => active ? r.logicalLoadIds?.includes(active) : r.operationId === state.agent.pending?.proposalId || (!state.ingestion && r.completedRevision === undefined) || r.completedRevision === snapshot.revision);
}
export function renderReceipts(receipts: AgentReceipt[], revision?: number): string {
  return renderSavedResults(receipts, null, revision);
}
export class AgentTools {
  done = false;
  response = "";
  constructor(private readonly deps: { domain: AgentDomain; extraction: Pick<MistralExtractionProvider, "extractReading">; catalog: BurstCatalog; checkpoint(state: AgentState): Promise<void> }) {}

  async execute(name: string, input: unknown, snapshot: BurstSnapshot, state: AgentState): Promise<unknown> {
    const args = validateToolArgs(name, input);
    const domain = this.deps.domain;
    const remember = (records: AgentRecord[]) => {
      const known = new Map((state.agent.resolvedRecords ?? []).map((record) => [record.id, record]));
      for (const { id, kind, version } of records) known.set(id, { id, kind, version });
      state.agent.resolvedRecords = [...known.values()];
    };
    if (name === "get_context") {
      resolveBurstContext(snapshot, this.deps.catalog, state);
      await this.deps.checkpoint(state);
      state.agent.seenIds = [...new Set([...state.agent.seenIds, ...this.deps.catalog.trips.flatMap((t) => [t.id, ...t.companies.map((c) => c.id)])])];
      const memory = await domain.recentMemory?.(snapshot) ?? [];
      return { ...operationalContext(this.deps.catalog, state), conversationContext: await domain.conversationContext?.(snapshot), ...(memory.length ? { recentConversations: memory } : {}) };
    }
    if (name === "reset_conversation_context") {
      if (!domain.resetConversationContext) throw new AgentToolError("UNSUPPORTED", "Este entorno no tiene contexto persistente");
      await domain.resetConversationContext(snapshot);
      return { reset: true };
    }
    if (name === "resolve_recent_reference") {
      const memory = domain.resolveConversationReference ? [] : await domain.recentMemory?.(snapshot) ?? [];
      const refs = domain.resolveConversationReference ? await domain.resolveConversationReference(snapshot, args.kind as "SUPPLIER" | "PRODUCT") : args.kind === "SUPPLIER" && domain.resolveSupplierReference ? await domain.resolveSupplierReference(snapshot) : recentReferenceCandidates(memory, snapshot, this.deps.catalog, args.kind as "SUPPLIER" | "PRODUCT");
      const records = await Promise.all(refs.map((r) => domain.get(snapshot, args.kind as "SUPPLIER" | "PRODUCT", r.id)));
      state.agent.seenIds = [...new Set([...state.agent.seenIds, ...records.map((r) => r.id)])];
      remember(records);
      return { reason: "CONVERSATION_REFERENCE", records, requiresClarification: records.length !== 1 };
    }
    if (name === "search_suppliers" || name === "search_products") {
      const pending = state.agent.pending;
      const selected = selectedQuestionOption(snapshot, pending);
      const contextId = selected && this.deps.catalog.trips.some((t) => t.id === selected.id || t.companies.some((c) => c.id === selected.id));
      let records: AgentRecord[];
      if (selected && !contextId) {
        const record = await domain.get(snapshot, name === "search_suppliers" ? "SUPPLIER" : "PRODUCT", selected.id);
        if (record.tripId !== args.tripId || args.supplierId && record.supplierId !== args.supplierId && record.captureId !== args.supplierId) throw new AgentToolError("INVALID_SELECTION", "La opción elegida no pertenece a este contexto de búsqueda");
        records = [record];
      } else {
        const normalizeQuery = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
        const query = normalizeQuery(args.query as string);
        const internalCompany = this.deps.catalog.trips.some((t) => t.companies.some((c) => normalizeQuery(c.name) === query));
        const literal = normalizeQuery(snapshot.messages.map((m) => factualText(sourceText(snapshot, m.id))).join("\n"));
        if (name === "search_suppliers" && internalCompany && !literal.includes(query)) throw new AgentToolError("LITERAL_SUPPLIER_NAME", "Buscá el nombre literal que respondió el usuario; no lo expandas al nombre de la empresa interna. Ejemplo: si responde a broco, query=Broco, no Broco Solutions. La empresa se deriva del proveedor encontrado");
        records = await domain.search(snapshot, name === "search_suppliers" ? "SUPPLIER" : "PRODUCT", args.tripId as string, args.query as string, (args.supplierId ?? undefined) as string | undefined);
      }
      state.agent.seenIds = [...new Set([...state.agent.seenIds, ...records.map((r) => r.id)])];
      remember(records);
      if (selected && records.length === 1) await domain.selectConversationTarget?.(snapshot, name === "search_suppliers" ? "SUPPLIER" : "PRODUCT", records[0].id);
      return { tripId: args.tripId, records: selected && records.some((r) => r.id === selected.id) ? records.filter((r) => r.id === selected.id) : records, selected, truncated: records.length === 20 };
    }
    if (name === "get_supplier" || name === "get_product") {
      if (this.deps.catalog.trips.some((t) => t.id === args.id || t.companies.some((c) => c.id === args.id))) throw new AgentToolError("WRONG_RECORD_KIND", "Ese ID pertenece a un viaje o empresa interna. Usá search_suppliers con el nombre literal y el tripId; luego get_supplier con el id del proveedor devuelto");
      const record = await domain.get(snapshot, name === "get_supplier" ? "SUPPLIER" : "PRODUCT", args.id as string);
      state.agent.seenIds = [...new Set([...state.agent.seenIds, record.id])]; remember([record]);
      if (name === "get_supplier" && state.ingestion?.activeLoadId && domain.resolveExistingSupplier) {
        const resolved = await domain.resolveExistingSupplier(snapshot, state.ingestion.activeLoadId, record.id);
        if (resolved) { recordReceipt(state, resolved); await this.deps.checkpoint(state); }
      }
      return record;
    }
    if (name === "prepare_evidence") {
      const graph = state.ingestion;
      const requested = args.sources as Array<{ messageId: string; quote?: string | null; role: "FACTS" | "CONTEXT" }>;
      const historical = new Map<string, AgentEvidence>();
      for (const source of requested) {
        if (snapshot.messages.some(message => message.id === source.messageId)) continue;
        const pending = await domain.preparePendingEvidence?.(snapshot, source.messageId);
        if (pending) { historical.set(source.messageId, pending); continue; }
        throw new AgentToolError("INVALID_MESSAGE_ID", `Ese messageId no pertenece a las evidencias disponibles. Copiá un ID del input actual: ${JSON.stringify(snapshot.messages.map(message => ({ id: message.id, text: factualText(sourceText(snapshot, message.id)) })))}. Para evidencia pendiente, copiá su ID del listado pendingEvidence. Corregí los argumentos y reintentá; no pidas al usuario resolver este error interno de referencias.`);
      }
      if (graph) for (const source of [...requested]) {
        if (historical.has(source.messageId)) continue; // authorized by the pending-evidence domain
        const asset = graph.assets.find((a) => a.id === source.messageId);
        if (!asset) throw new AgentToolError("INVALID_MESSAGE_ID", `Ese messageId no existe en el grafo actual. IDs disponibles: ${JSON.stringify(graph.assets.map(asset => asset.id))}. Corregí el ID y reintentá prepare_evidence; esto no indica que la imagen sea ilegible.`);
        const selectedLinks = evidenceLinks(snapshot, { messageId: source.messageId, text: source.quote ?? sourceText(snapshot, source.messageId) });
        if (asset.status === "FAILED" || asset.status === "NEEDS_REVIEW" && asset.error?.stage !== "association" || selectedLinks.some((link) => link.confidence === "AMBIGUOUS")) throw new AgentToolError("ASSET_NEEDS_REVIEW", "Esta evidencia no tiene lectura/asociación confiable; pedí aclaración");
        const load = graph.loads.find((l) => l.type === "SUPPLIER" && l.assetIds.includes(source.messageId));
        if (load && source.role === "FACTS") for (const id of load.assetIds.filter((id) => graph.assets.some((asset) => asset.id === id && asset.status !== "NEEDS_REVIEW" && asset.loadIds.length === 1))) {
          if (!requested.some((s) => s.messageId === id)) requested.push({ messageId: id, quote: null, role: "FACTS" });
        }
      }
      const prepared: AgentEvidence[] = [];
      for (const source of args.sources as Array<{ messageId: string; quote?: string | null; role: "FACTS" | "CONTEXT" }>) {
        const pending = historical.get(source.messageId);
        const original = pending?.text ?? sourceText(snapshot, source.messageId); const text = source.quote ?? original;
        const start = original.indexOf(text);
        if (start < 0 || (text && original.indexOf(text, start + 1) >= 0)) throw new AgentToolError("INVALID_QUOTE", "La cita debe ser literal y aparecer una sola vez; ampliá la cita para distinguirla");
        const id = `waev_${evidenceHash(`${source.messageId}:${start}:${start + text.length}:${source.role}`)}`;
        let evidence = state.agent.evidence.find((e) => e.id === id);
        if (!evidence) {
          const literal = factualText(text);
          if (source.role === "FACTS" && (literal.match(/\bproducto\s*:?[ \t]+[\p{L}]/giu)?.length ?? 0) > 1) throw new AgentToolError("MULTIPLE_PRODUCTS", "Esta evidencia contiene varios productos. Usá quotes separadas con las frases comerciales de cada producto, y la introducción del proveedor sólo como CONTEXT");
          const message = snapshot.messages.find((m) => m.id === source.messageId);
          const cached = pending && literal === pending.text ? pending.candidate : message?.reading?.complete && message.reading.segments.length === 1 && message.reading.segments[0].text === literal ? message.reading.segments[0].candidate : undefined;
          const candidate = cached ? structuredClone(cached) : literal ? await this.deps.extraction.extractReading(literal, { type: "TEXT", text: literal }) : { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text: "" } };
          // A currency-only clarification is evidence for that component, never a new price.
          const currencyAnswer = literal.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().match(/^(?:en )?(dolares|euros|yuanes|usd|eur|cny)[.!]?$/u);
          if (source.role === "FACTS" && currencyAnswer) {
            const currencies: Record<string, string> = { dolares: "USD", usd: "USD", euros: "EUR", eur: "EUR", yuanes: "CNY", cny: "CNY" };
            candidate.extractedFields.fob = { amount: null, currency: currencies[currencyAnswer[1]], unit: null, rawText: literal };
          }
          const offset = pending?.start ?? 0;
          evidence = { id, messageId: pending?.messageId ?? source.messageId, start: offset + start, end: offset + start + text.length, text, role: source.role, candidate, ...(pending?.pendingId ? { pendingId: pending.pendingId } : {}) };
          state.agent.evidence.push(evidence);
        }
        // Keep original offsets/text for audit; do not reintroduce discarded instructions to the model.
        prepared.push({ ...evidence, text: factualText(evidence.text) });
      }
      await this.deps.checkpoint(state);
      return { evidence: prepared };
    }
    if (name === "preserve_product_facts") {
      if (!domain.preserveProductFacts) throw new AgentToolError("UNSUPPORTED", "Este entorno no conserva condiciones pendientes");
      if (!state.agent.seenIds.includes(args.supplierId as string)) throw new AgentToolError("UNRESOLVED_TARGET", "Resolvé el proveedor antes de conservar sus condiciones");
      const evidence = (args.evidenceIds as string[]).map(id => {
        const found = state.agent.evidence.find(e => e.id === id && e.role === "FACTS");
        if (!found) throw new AgentToolError("INVALID_REFERENCE", "Usá evidenceIds preparados como FACTS");
        return found;
      });
      const receipts = await domain.preserveProductFacts(snapshot, args.supplierId as string, evidence);
      for (const receipt of receipts) recordReceipt(state, receipt);
      await this.deps.checkpoint(state); return { receipts };
    }
    if (name.startsWith("create_") || name.startsWith("update_")) {
      if (name === "create_supplier_draft") {
        const request = snapshot.messages.map((m) => factualText(sourceText(snapshot, m.id))).join("\n").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
        const productRequest = /(?:agreg|carg|sum|guard|registr).*producto|\btengo (?:un|una)\b/u.test(request);
        const newSupplier = /\b(?:nuevo proveedor|proveedor nuevo|carga(?:r)? (?:un )?proveedor|carga el proveedor)\b/u.test(request) || snapshot.messages.some((m) => m.reading?.imageKind === "BUSINESS_CARD");
        if (productRequest && !newSupplier) throw new AgentToolError("PRODUCT_REQUIRES_SUPPLIER", "El usuario pidió cargar un producto, no crear un proveedor nuevo. Buscá el proveedor indicado; si falta, preguntá por el proveedor. La empresa del producto se deriva del proveedor existente y no autoriza a crear uno sustituto");
      }
      let evidence = (args.evidenceIds as string[]).map((id) => {
        const found = state.agent.evidence.find((e) => e.id === id);
        if (!found) throw new AgentToolError("INVALID_REFERENCE", state.agent.evidence.length
          ? `Ese evidenceId no existe. Copiá exactamente los IDs preparados: ${JSON.stringify(state.agent.evidence.map((e) => ({ id: e.id, messageId: e.messageId, role: e.role })))}. Si falta evidencia, usá prepare_evidence. Corregí los argumentos y reintentá la tool; no pidas al usuario resolver un error interno de referencias.`
          : "Prepará las evidencias primero y copiá exactamente sus IDs; no uses messageIds como evidenceIds"); return found;
      });
      if (new Set(evidence.map((e) => e.id)).size !== evidence.length) throw new AgentToolError("DUPLICATE_REFERENCE", "No repitas evidencias");
      if (!evidence.some((e) => e.role === "FACTS")) throw new AgentToolError("MISSING_FACTS", "La carga necesita FACTS. Prepará otra vez el mensaje actual con role FACTS e incluí el nombre literal del producto aunque no tenga precio, MOQ ni plazo. CONTEXT sólo identifica el proveedor/empresa; no contiene los datos del producto. Después reintentá la escritura, no finish_turn.");
      const targetId = (args.supplierId ?? args.id) as string | undefined;
      let tripId = args.tripId as string; let companyId = args.companyId as string;
      let targetKind: string | undefined;
      if (targetId) {
        if (!state.agent.seenIds.includes(targetId) && !state.agent.receipts.some((r) => r.id === targetId)) throw new AgentToolError("UNKNOWN_TARGET", "Buscá y obtené el destino antes de escribir");
        const search = state.agent.calls.findLast((c) => c.name === "search_suppliers" && Array.isArray((c.result as { records?: unknown })?.records));
        const candidate = (search?.result as { records?: AgentRecord[] } | undefined)?.records?.find((r) => r.id === targetId);
        if (candidate?.searchMatch?.type === "FUZZY") {
          const pending = state.agent.pending;
          const selected = selectedQuestionOption(snapshot, pending)?.id;
          if (selected !== targetId) throw new AgentToolError("FUZZY_SUPPLIER_REQUIRES_SELECTION", "La búsqueda encontró un proveedor aproximado. Usá ask_clarification con opciones de búsqueda y esperá la selección del usuario antes de escribir.");
        }
        const target = await domain.get(snapshot, name === "update_product" ? "PRODUCT" : "SUPPLIER", targetId);
        tripId = target.tripId; companyId = target.companyId; targetKind = target.kind;
        if (name === "create_product_draft") {
          const relatedContext = state.agent.evidence.filter((e) => e.role === "CONTEXT" && target.name && factualText(e.text).toLowerCase().includes(target.name.toLowerCase()));
          evidence = [...evidence, ...relatedContext.filter((e) => !evidence.some((f) => f.id === e.id))];
          const selectedMessages = snapshot.messages.filter((m) => evidence.some((e) => e.messageId === m.id));
          const min = Math.min(...selectedMessages.map((m) => m.sequence)); const max = Math.max(...selectedMessages.map((m) => m.sequence));
          const explicitPhoto = evidence.some((e) => /(?:foto.*(?:siguen|sigue)|de la foto)/iu.test(e.text));
          const missing = snapshot.messages.filter((m) => m.envelope.type === "IMAGE" && m.sequence >= min && m.sequence <= max && !selectedMessages.some((s) => s.id === m.id));
          if (explicitPhoto && missing.length) throw new AgentToolError("MISSING_MEDIA", `Prepará e incluí las fotos referidas por esta carga: ${missing.map((m) => m.id).join(", ")}`);
        }
      }
      if (name === "create_supplier_draft" && state.operationalContext && (tripId !== state.operationalContext.tripId || companyId !== state.operationalContext.companyId)) throw new AgentToolError("BURST_CONTEXT_MISMATCH", "La ráfaga ya tiene viaje y empresa resueltos. Usá ese contexto; otro destino requiere evidencia explícita del usuario.");
      const write = { ...(args.notes != null ? { notes: args.notes as string } : {}), tool: name, tripId, companyId, targetId, targetKind, name: (args.name ?? undefined) as string | undefined, evidence, patch: args.patch as Record<string, unknown> | undefined };
      assertLoadWrite(snapshot, write);
      const receipt = await domain.write(snapshot, write);
      receipt.evidenceIds ??= evidence.map(e => e.id);
      receipt.logicalLoadIds ??= logicalLoadIds(snapshot, write);
      recordReceipt(state, receipt);
      if (name === "create_supplier_draft" && receipt.status === "COMPLETED" && !state.operationalContext) { state.tripId = tripId; state.operationalContext = { tripId, companyId }; }
      state.agent.seenIds = [...new Set([...state.agent.seenIds, receipt.id])];
      if (receipt.status === "PROPOSED") {
        state.agent.pending = { type: "APPROVAL", proposalId: receipt.operationId, options: [], revision: snapshot.revision, text: `¿Confirmás este cambio en «${receipt.name ?? "el registro"}»?\nActual: ${JSON.stringify(receipt.data?.before)}\nNuevo: ${JSON.stringify(receipt.data?.patch)}\nRespondé sí para aplicar o cancelar para descartarlo. El servidor determina el estado final del registro.` };
        state.question = state.agent.pending.text;
        this.done = true; state.agent.terminal = { revision: snapshot.revision, response: "" };
      }
      await this.deps.checkpoint(state);
      return receipt;
    }
    if (name === "apply_pending_change" || name === "cancel_pending_change") {
      const receipt = await domain.resolve(snapshot, args.proposalId as string, name === "cancel_pending_change");
      recordReceipt(state, receipt);
      state.agent.pending = null; state.question = null;
      await this.deps.checkpoint(state); return receipt;
    }
    if (name === "ask_clarification") {
      const activeProduct = state.ingestion?.loads.find(load => load.id === state.ingestion?.activeLoadId && load.type === "PRODUCT");
      const visualProduct = activeProduct?.assetIds.map(id => snapshot.messages.find(m => m.id === id)).find(m => m && observedProduct(m));
      if (visualProduct && /nombre.*producto|(?:qué|que|cuál|cual).*producto/iu.test(args.question as string) && !/proveedor/iu.test(args.question as string)) throw new AgentToolError("PRODUCT_ALREADY_IDENTIFIED", "Usá el nombre del usuario o el nombre interpretado de la foto. Resolvé el proveedor y registrá el producto sin volver a preguntar su nombre.");
      const ingestionQuestion = nextIngestionQuestion(snapshot);
      if (ingestionQuestion?.associationSource && !state.ingestion?.activeLoadId && !selectedQuestionOption(snapshot, state.agent.pending)) {
        state.agent.pending = { type: "CLARIFICATION", text: ingestionQuestion.question, options: ingestionQuestion.options, associationSource: ingestionQuestion.associationSource, revision: snapshot.revision };
        state.question = renderClarification({ text: ingestionQuestion.question, options: ingestionQuestion.options });
        this.done = true; state.agent.terminal = { revision: snapshot.revision, response: "" }; await this.deps.checkpoint(state); return { waiting: true, question: state.question };
      }
      let options = (args.options ?? []) as Array<{ id: string; label: string }>;
      const recentSearch = state.agent.calls.findLast((c) => ["search_suppliers", "resolve_recent_reference"].includes(c.name) && Array.isArray((c.result as { records?: unknown })?.records));
      const candidates = (recentSearch?.result as { records?: AgentRecord[] } | undefined)?.records ?? [];
      if (!options.length && candidates.some((r) => r.searchMatch?.type === "FUZZY")) options = candidates.map((r) => ({ id: r.id, label: [r.name, r.companyLabel, r.city].filter(Boolean).join(" · ") }));
      if (!options.length && recentSearch?.name === "resolve_recent_reference" && candidates.length > 1) options = candidates.map((r) => ({ id: r.id, label: [r.name, r.companyLabel, r.city].filter(Boolean).join(" · ") }));
      const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
      const requested = (args.pendingProducts ?? []) as Array<{ supplierQuery?: string }>;
      const original = normalize(snapshot.messages.map((m) => factualText(sourceText(snapshot, m.id))).join("\n"));
      const productRequest = requested.length > 0 || /(?:agreg|carg|sum|guard|registr).*producto|\btengo (?:un|una)\b/u.test(original);
      const newSupplier = /\b(?:nuevo proveedor|proveedor nuevo|carga(?:r)? (?:un )?proveedor|carga el proveedor)\b/u.test(original) || snapshot.messages.some((m) => m.reading?.imageKind === "BUSINESS_CARD");
      const companyOptions = options.some((o) => this.deps.catalog.trips.some((t) => t.companies.some((c) => c.id === o.id)));
      const companyQuestion = /\b(?:para que empresa|a que empresa|cual empresa|que empresa)\b/u.test(normalize(args.question as string));
      const mentionedCompanies = this.deps.catalog.trips.flatMap((t) => t.companies).filter((c) => (` ${original} `).includes(` ${normalize(c.name)} `) || new RegExp(`\\b${normalize(c.name).split(" ")[0]}\\b`, "u").test(original));
      if (mentionedCompanies.length === 1 && options.some((o) => this.deps.catalog.trips.some((t) => t.companies.some((c) => c.id === o.id)))) throw new AgentToolError("COMPANY_ALREADY_IDENTIFIED", `El usuario ya indicó la empresa ${mentionedCompanies[0].name}. No preguntes la empresa otra vez. Para producto de proveedor existente, usá search_suppliers con el nombre literal del proveedor y elegí la coincidencia de esa empresa; prepará el producto como FACTS y completá la carga.`);
      if (productRequest && !newSupplier && (companyOptions || companyQuestion)) throw new AgentToolError("PRODUCT_REQUIRES_SUPPLIER", "La empresa se obtiene del proveedor asociado al producto. No preguntes la empresa: buscá el proveedor indicado con search_suppliers; si falta o hay homónimos, preguntá por el proveedor con opciones de búsqueda. Usá la empresa del registro elegido");
      const sameNamedSuppliers = candidates.length > 1 && Boolean(candidates[0].name) && candidates.every((r) => normalize(r.name ?? "") === normalize(candidates[0].name!)) && original.includes(normalize(candidates[0].name!));
      if ((args.pendingProducts as unknown[] | undefined)?.length && sameNamedSuppliers || !options.length && candidates.length > 1 && requested.some((p) => p.supplierQuery && candidates.every((r) => normalize(r.name ?? "").includes(normalize(p.supplierQuery!))))) options = candidates.map((r) => ({ id: r.id, label: [r.name, r.companyLabel, r.city].filter(Boolean).join(" · ") }));
      const previous = state.agent.pending;
      const answer = questionAnswer(snapshot, previous)?.envelope.text?.trim();
      const previousCompanyQuestion = previous?.options.length && previous.options.every((o) => this.deps.catalog.trips.some((t) => t.companies.some((c) => c.id === o.id)));
      if (!previousCompanyQuestion && previous?.type === "CLARIFICATION" && answer && requested.length && candidates.length === 1 && candidates[0].name && normalize(answer).includes(normalize(candidates[0].name!)) && options.length === 1 && options[0].id === candidates[0].id) throw new AgentToolError("SUPPLIER_ALREADY_IDENTIFIED", "El usuario acaba de indicar ese proveedor y la búsqueda tiene una coincidencia única. Prepará el mensaje nuevo como CONTEXT y los datos originales del producto como FACTS; incluí ambos evidenceIds en create_product_draft. No pidas confirmar otra vez el destino de un borrador");
      const lastContext = state.agent.calls.findLastIndex((c) => c.name === "get_context");
      const searchedThisTurn = state.agent.calls.slice(lastContext + 1).some((c) => c.name === "search_suppliers" && Array.isArray((c.result as { records?: unknown })?.records));
      const namedAnswer = answer && answer.length <= 120 && !/^(?:no|si|cancelar|no se|no tengo)\b/u.test(normalize(answer)) && !/^\d+$/u.test(answer);
      if (previous?.type === "CLARIFICATION" && (previous.supplierPicker || /(?:que|qué|cual|cuál|a qué|a que).*proveedor/iu.test(previous.text)) && previous.products?.length && !previous.options.length && namedAnswer && !searchedThisTurn) throw new AgentToolError("SEARCH_SUPPLIER_BEFORE_ASKING", "La respuesta a la pregunta de proveedor puede ser el nombre de un proveedor, aunque coincida con una empresa interna. Usá search_suppliers con ese nombre literal antes de preguntar otra vez. Si responde a broco, buscá Broco. Una coincidencia única permite cargar el producto pendiente; cero coincidencias permite pedir otro nombre");
      const selected = answer && /^\d+$/u.test(answer) ? previous?.options[Number(answer) - 1] : null;
      if (selected && options.length === previous!.options.length && options.every((o) => previous!.options.some((p) => p.id === o.id))) throw new AgentToolError("SELECTION_ALREADY_RESOLVED", "El usuario ya eligió una opción. Obtené el registro por selected.id y continuá la carga pendiente; no repitas la misma pregunta");
      if (options.some((o) => !state.agent.seenIds.includes(o.id)) || new Set(options.map((o) => o.id)).size !== options.length) throw new AgentToolError("INVALID_OPTIONS", "Las opciones deben ser IDs obtenidos por tools, sin duplicados. Si no hay coincidencias, omití options y preguntá el nombre del proveedor; no inventes opciones de acciones");
      if (!args.pendingProducts && snapshot.messages.some((m) => /(?:agreg|carg|sum|guard|registr|producto:).*producto|producto:/iu.test(sourceText(snapshot, m.id)))) throw new AgentToolError("MISSING_PENDING_PRODUCT", "Incluí pendingProducts con el nombre literal y supplierQuery si se mencionó. La carga queda pendiente mientras se aclara el destino");
      const productNameAnswer = previous?.type === "CLARIFICATION" && /nombre|producto/iu.test(previous.text)
        ? answer?.match(/^(.+?)\s+es el nombre[.!]?$/iu)?.[1]?.trim() : undefined;
      const products = (((Array.isArray(args.pendingProducts) && args.pendingProducts.length ? args.pendingProducts : undefined) ?? (previous?.products?.length ? previous.products : undefined) ?? (productNameAnswer ? [{ name: productNameAnswer }] : [])) as Array<{ name: string; supplierQuery?: string | null }>).map((product) => ({ name: product.name, ...(product.supplierQuery ? { supplierQuery: product.supplierQuery } : {}) }));
      const literal = snapshot.messages.map((m) => factualText(sourceText(snapshot, m.id))).join("\n").toLowerCase();
      if (products.some((p) => !literal.includes(p.name.toLowerCase()))) throw new AgentToolError("UNGROUNDED_NAME", "El producto pendiente debe aparecer en la evidencia");
      // Optional fields never postpone a named product. Keep identity questions available.
      const optionalQuestion = /\b(?:moneda|currency|descripcion|modelo|moq|cantidad minima|plazo|lead time|precio|fob|datos|detalles|informacion|caracteristicas|nombre|identificar)\b/u.test(normalize(args.question as string)) && !/proveedor|viaje|empresa/iu.test(args.question as string);
      const activeLoad = state.ingestion?.loads.find(l => l.id === state.ingestion?.activeLoadId);
      if (activeLoad?.type === "SUPPLIER" && activeLoad.status === "PROCESSED" && /que queres hacer|como (?:puedo|te puedo) ayudar/u.test(normalize(args.question as string))) throw new AgentToolError("LOAD_ALREADY_PROCESSED", "El proveedor, las notas y las condiciones de esta carga ya están guardados. Mostrá el resultado y terminá sin pedir otra acción genérica.");
      if (!products.length && !options.length && candidates.length === 1 && /que queres (?:hacer|registrar|consultar)|como (?:puedo|te puedo) ayudar/u.test(normalize(args.question as string))) throw new AgentToolError("QUERY_ALREADY_RESOLVED", "La consulta ya tiene una coincidencia autorizada. Mostrá el proveedor encontrado y terminá sin preguntar por otra acción.");
      const identityQuestion = /\b(?:que|cual|a que|con que) (?:producto|proveedor|viaje|empresa)\b|\ba que proveedor\b/u.test(normalize(args.question as string));
      const confirmationQuestion = /\b(?:queres|confirmas|confirmar)\b.*\b(?:registr|carg|cre|agreg|guard)/u.test(normalize(args.question as string));
      const supplierIdentified = candidates.length === 1 && candidates[0].kind !== "PRODUCT" && candidates[0].searchMatch?.type !== "FUZZY"
        || state.agent.resolvedRecords?.filter(record => record.kind !== "PRODUCT").length === 1;
      if (products.length === 1 && supplierIdentified && options.length <= 1 && candidates.length === 1 && recentSearch?.revision === snapshot.revision && /proveedor/iu.test(args.question as string) && candidates[0].searchMatch?.type !== "FUZZY") throw new AgentToolError("SUPPLIER_ALREADY_IDENTIFIED", "Las tools ya resolvieron un proveedor único. Prepará el producto y sus evidencias y registralo sin pedir seleccionar ni confirmar ese mismo proveedor.");
      const unresolvedCount = state.ingestion?.loads.filter(load => load.type === "PRODUCT" && !load.resourceId && !load.resolution).length ?? products.length;
      if (products.length === 1 && !options.length && supplierIdentified && unresolvedCount <= 1 && /(?:que|cual).*producto|nombre.*producto/u.test(normalize(args.question as string))) {
        throw new AgentToolError("PRODUCT_ALREADY_IDENTIFIED", "El producto ya tiene nombre y proveedor resuelto. Prepará sus evidencias originales y registralo sin pedir otra vez el nombre ni una confirmación.");
      }
      if (products.length === 1 && !options.length && !identityQuestion && (optionalQuestion || confirmationQuestion)) {
        throw new AgentToolError("OPTIONAL_PRODUCT_DETAILS", "El nombre alcanza para registrar el producto si su proveedor está resuelto. No preguntes moneda, precio, descripción, modelo, MOQ ni plazo: conservá los valores literales informados y dejá los ausentes vacíos. Resolvé el proveedor con las tools, prepará el nombre y las evidencias originales, y ejecutá create_product_draft. Si ya existe, actualizá el mismo producto.");
      }
      const sourceMessageIds = [...new Set([...(previous?.sourceMessageIds ?? []), ...snapshot.messages.map(m => m.id)])];
      const evidenceIds = [...new Set([...(previous?.evidenceIds ?? []), ...state.agent.evidence.map(e => e.id)])];
      const productLoads = products.map(product => {
        const previousProduct = previous?.products?.find(p => normalize(p.name) === normalize(product.name));
        const namedMessages = snapshot.messages.filter(m => normalize(factualText(sourceText(snapshot, m.id))).includes(normalize(product.name))).map(m => m.id);
        const loads = state.ingestion?.loads.filter(load => load.type === "PRODUCT" && (load.name && normalize(load.name) === normalize(product.name) || load.assetIds.some(id => namedMessages.includes(id)))) ?? [];
        const productSources = [...new Set([...(previousProduct?.sourceMessageIds ?? []), ...namedMessages, ...loads.flatMap(load => load.assetIds)])];
        return { ...product, sourceMessageIds: productSources,
          evidenceIds: [...new Set([...(previousProduct?.evidenceIds ?? []), ...state.agent.evidence.filter(e => productSources.includes(e.messageId)).map(e => e.id)])],
          supplierIds: candidates.filter(r => r.kind !== "PRODUCT" && r.searchMatch?.type !== "FUZZY" && (!product.supplierQuery || normalize(r.name ?? "") === normalize(product.supplierQuery))).map(r => r.id) };
      });
      let pickerRecords = candidates;
      const supplierOptions = options.length > 0 && options.every((o) => candidates.some((r) => r.id === o.id && ["SUPPLIER", "SUPPLIER_DRAFT"].includes(r.kind)));
      const supplierQuestion = productRequest && !newSupplier && !companyQuestion && !companyOptions && (/proveedor/iu.test(args.question as string) || supplierOptions);
      const automaticPicker = supplierQuestion && products.length && !options.length;
      if (automaticPicker) {
        const searchedTrip = (recentSearch?.result as { tripId?: string } | undefined)?.tripId;
        const trip = this.deps.catalog.trips.find((t) => t.id === (state.tripId ?? searchedTrip)) ?? (this.deps.catalog.trips.length === 1 ? this.deps.catalog.trips[0] : null);
        if (trip) {
          pickerRecords = await domain.search(snapshot, "SUPPLIER", trip.id, "");
          options = pickerRecords.filter((r) => r.name?.trim()).map((r) => ({ id: r.id, label: [r.name, r.companyLabel, r.city].filter(Boolean).join(" · ") }));
          state.agent.seenIds = [...new Set([...state.agent.seenIds, ...options.map((o) => o.id)])];
        }
      }
      const supplierPicker = Boolean(supplierQuestion && products.length && options.length && options.every((o) => pickerRecords.some((r) => r.id === o.id && r.kind !== "PRODUCT")));
      const isContextQuestion = options.length > 0 && options.every(o => this.deps.catalog.trips.some(t => t.id === o.id || t.companies.some(c => c.id === o.id))) || /(?:qué|que|cuál|cual).*viaje|viaje.*(?:empresa|opción|opcion)/iu.test(args.question as string);
      if (isContextQuestion) {
        const context = resolveBurstContext(snapshot, this.deps.catalog, state);
        if (context) throw new AgentToolError("CONTEXT_ALREADY_RESOLVED", `El contexto de toda la ráfaga ya está resuelto: tripId=${context.tripId}, companyId=${context.companyId}. Continuá y preguntá sólo las asociaciones aún ambiguas.`);
        options = contextOptions(this.deps.catalog, state).map(({ id, label }) => ({ id, label }));
      }
      let question = isContextQuestion ? "¿En qué viaje y empresa querés cargar esta ráfaga?" : supplierPicker && automaticPicker ? "¿A qué proveedor pertenece el producto? Elegí una opción o escribí su nombre." : args.question as string;
      if (!isContextQuestion) {
        const imageIds = activeProduct?.assetIds ?? (state.ingestion?.activeLoadId ? state.ingestion.loads.find(l => l.id === state.ingestion!.activeLoadId)?.assetIds : productLoads.flatMap(p => p.sourceMessageIds));
        const image = snapshot.messages.find(m => m.envelope.type === "IMAGE" && imageIds?.includes(m.id));
        if (image) question = `${describeEvidence(snapshot, image.id)}\n${question}`;
      }
      const unresolvedProducts = state.ingestion?.loads.filter(load => load.type === "PRODUCT" && !load.resourceId && !load.resolution) ?? [];
      const factLoads = [...new Set(state.agent.evidence.filter(e => e.role === "FACTS").flatMap(e => logicalLoadIds(snapshot, { tool: "update_product", tripId: "", companyId: "", evidence: [e] })))];
      const pendingLoadId = state.ingestion?.activeLoadId ?? previous?.loadId ?? (unresolvedProducts.length === 1 ? unresolvedProducts[0].id : factLoads.length === 1 ? factLoads[0] : undefined);
      state.agent.pending = { loadId: pendingLoadId, type: "CLARIFICATION", text: question, products: productLoads, sourceMessageIds, evidenceIds, options, revision: snapshot.revision, ...(isContextQuestion ? { contextSelection: true } : {}), ...(supplierPicker ? { supplierPicker: true } : {}) };
      state.question = renderClarification(state.agent.pending);
      this.done = true; state.agent.terminal = { revision: snapshot.revision, response: "" }; await this.deps.checkpoint(state); return { waiting: true, question: state.question };
    }
    if (name === "finish_turn") {
      const receipts = currentReceipts(snapshot, state);
      const calls = state.agent.calls.filter(call => call.revision === snapshot.revision && (!state.ingestion?.activeLoadId || call.logicalLoadId === state.ingestion.activeLoadId) || call.revision === undefined && !state.ingestion);
      if (!state.ingestion?.activeLoadId) {
        const question = nextIngestionQuestion(snapshot);
        if (question) return this.execute("ask_clarification", { question: question.question, options: question.options, pendingProducts: null }, snapshot, state);
      }
      const response = args.response as string | null | undefined;
      const cancelIndex = calls.findLastIndex((call) => call.name === "cancel_pending_change" && (call.result as AgentReceipt)?.status === "CANCELLED");
      const cancelledCompound = cancelIndex >= 0 && pendingDecision(snapshot, snapshot.revision - 1)?.standalone === false && /(?:adem[aá]s|tamb[ií][eé]n).*(?:agreg|carg|sum|actualiz|correg)/iu.test(snapshot.messages.at(-1)?.envelope.text ?? "");
      if (cancelledCompound && !calls.slice(cancelIndex + 1).some((call) => (call.name.startsWith("create_") || call.name.startsWith("update_")) && (call.result as AgentReceipt)?.status === "COMPLETED")) throw new AgentToolError("UNFINISHED_OPERATION", "La propuesta se canceló, pero falta resolver el pedido adicional del mensaje actual");
      if (!response && !args.guidance && !receipts.some((r) => ["COMPLETED", "CANCELLED"].includes(r.status)) && calls.some((c) => ["search_suppliers", "search_products", "get_supplier", "get_product"].includes(c.name) && !(c.result as { error?: string })?.error)) throw new AgentToolError("MISSING_QUERY_RESPONSE", "La consulta obtuvo resultados. Pasá la respuesta factual en finish_turn.response; el contenido fuera de argumentos no se envía. No agregues preguntas de cortesía");
      const pendingProduct = state.agent.pending?.products?.some((p) => !receipts.some((r) => r.tool === "create_product_draft" && r.status === "COMPLETED" && r.name?.toLowerCase() === p.name.toLowerCase()));
      if (pendingProduct) throw new AgentToolError("UNFINISHED_OPERATION", "Hay un producto pendiente. La respuesta breve es una aclaración de su proveedor: buscá ese nombre, prepará el mensaje como CONTEXT y los datos originales como FACTS, y cargá el producto. No envíes ayuda ni descartes la carga; si falta destino, preguntá por el proveedor");
      assertMessageOutcomes(snapshot, state, receipts, (args.outcomes as AgentMessageOutcome[] | null) ?? []);
      if (receipts.some((r) => ["STALE", "EXPIRED"].includes(r.status)) && !receipts.some((r) => r.status === "PROPOSED")) throw new AgentToolError("UNRESOLVED_CHANGE", "El cambio requiere una propuesta nueva con los datos actuales y otra aprobación. Obtené el registro y llamá update nuevamente; no cierres el pedido");
      // Mutating success claims are always rendered from receipts, never free model prose.
      if (response && response.includes("?")) throw new AgentToolError("USE_CLARIFICATION", "Una pregunta debe usar ask_clarification para conservar el estado pendiente");
      if (response && (receipts.some((r) => r.status === "COMPLETED" && r.tool !== "resolve_existing_resource") || /guardad|cread|actualizad|confirmad|asociad|se creó|se guardó|se actualizó/iu.test(response))) throw new AgentToolError("UNVERIFIED_RESPONSE", "El servidor informa las operaciones guardadas. Usá response sólo para consultas y explicaciones.");
      const graph = state.ingestion;
      if (graph?.loads.some((load) => (!graph.activeLoadId || load.id === graph.activeLoadId) && ["SUPPLIER", "PRODUCT"].includes(load.type) && !load.resolution && !["PROCESSED", "FAILED", "NEEDS_REVIEW"].includes(load.status))) throw new AgentToolError("UNFINISHED_LOGICAL_LOAD", "Hay una carga lógica pendiente; resolvela o pedí aclaración antes de terminar");
      if (graph && (response || args.guidance)) {
        for (const load of graph.loads.filter((load) => load.type === "EVIDENCE" && !["FAILED", "NEEDS_REVIEW"].includes(load.status))) { load.status = "PROCESSED"; load.reasons.push("QUERY_OR_GUIDANCE_COMPLETED"); }
        updateGraphSummary(graph);
      }
      this.response = args.guidance ? whatsappAgentHelpReply() : formatQuestion(response ?? "");
      state.agent.pending = null; state.question = null; this.done = true; state.agent.terminal = { revision: snapshot.revision, response: this.response };
      await this.deps.checkpoint(state); return { finished: true };
    }
    throw new AgentToolError("UNKNOWN_TOOL", "Tool no disponible");
  }
}
