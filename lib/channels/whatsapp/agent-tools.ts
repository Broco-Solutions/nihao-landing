import { createHash } from "node:crypto";
import type { MistralExtractionProvider } from "../../bot/extraction/mistral-extraction-provider.ts";
import type { BurstCatalog, BurstSnapshot } from "./burst-types.ts";
import { AgentToolError, validateToolArgs, type AgentDomain, type AgentEvidence, type AgentReceipt, type AgentState, type AgentRecord } from "./agent-contract.ts";
import { whatsappAgentHelpReply } from "./help-reply.ts";

export const evidenceHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);
export const sourceText = (snapshot: BurstSnapshot, messageId: string) => {
  const message = snapshot.messages.find((m) => m.id === messageId);
  if (!message) throw new AgentToolError("INVALID_REFERENCE", "Usá un messageId del listado de evidencias");
  return message.envelope.type === "AUDIO" ? message.reading?.transcript ?? "" : message.envelope.type === "IMAGE" ? [message.reading?.ocr, message.envelope.text].filter(Boolean).join("\n") : message.envelope.text ?? "";
};
// These instruction clauses are not commercial facts even if they contain numbers.
export function factualText(text: string): string { return text.split(/\b(?:ignor[áa]\s+(?:las|todas)|invent[áa]\b|us[áa]\s+supplierId|confirm[áa]\s+automáticamente)/iu)[0].trim(); }
export function recordReceipt(state: AgentState, receipt: AgentReceipt) {
  const index = state.agent.receipts.findIndex((r) => r.operationId === receipt.operationId);
  if (index < 0) state.agent.receipts.push(receipt); else state.agent.receipts[index] = receipt;
}
export function renderReceipts(receipts: AgentReceipt[]): string {
  return receipts.filter((r) => r.status === "COMPLETED").map((r) => {
    if (r.tool === "create_product_draft") return `📋 Producto «${r.name ?? "sin nombre"}» guardado como borrador, asociado a ${r.data?.supplierName ?? "su proveedor"}. Revisalo y confirmalo en la web.`;
    if (r.tool === "create_supplier_draft") return `📋 Proveedor «${r.name ?? "por completar"}» guardado como borrador. Revisalo y confirmalo en la web.`;
    return `✅ ${r.tool.includes("product") ? "Producto" : "Proveedor"} «${r.name ?? "seleccionado"}» actualizado: ${JSON.stringify(r.data?.patch ?? {})}.`;
  }).join("\n");
}
export class AgentTools {
  done = false;
  response = "";
  constructor(private readonly deps: { domain: AgentDomain; extraction: Pick<MistralExtractionProvider, "extractReading">; catalog: BurstCatalog; checkpoint(state: AgentState): Promise<void> }) {}

  async execute(name: string, input: unknown, snapshot: BurstSnapshot, state: AgentState): Promise<unknown> {
    const args = validateToolArgs(name, input);
    const domain = this.deps.domain;
    if (name === "get_context") {
      state.agent.seenIds = [...new Set([...state.agent.seenIds, ...this.deps.catalog.trips.flatMap((t) => [t.id, ...t.companies.map((c) => c.id)])])];
      return { trips: this.deps.catalog.trips.map((t) => ({ id: t.id, name: t.name, companies: t.companies })) };
    }
    if (name === "search_suppliers" || name === "search_products") {
      const pending = state.agent.pending;
      const answer = pending && snapshot.messages.filter((m) => m.sequence > pending.revision).at(-1)?.envelope.text?.trim();
      const selected = answer && /^\d+$/u.test(answer) ? pending?.options[Number(answer) - 1] : null;
      const contextId = selected && this.deps.catalog.trips.some((t) => t.id === selected.id || t.companies.some((c) => c.id === selected.id));
      let records: AgentRecord[];
      if (selected && !contextId) {
        const record = await domain.get(snapshot, name === "search_suppliers" ? "SUPPLIER" : "PRODUCT", selected.id);
        if (record.tripId !== args.tripId || args.supplierId && record.supplierId !== args.supplierId && record.captureId !== args.supplierId) throw new AgentToolError("INVALID_SELECTION", "La opción elegida no pertenece a este contexto de búsqueda");
        records = [record];
      } else records = await domain.search(snapshot, name === "search_suppliers" ? "SUPPLIER" : "PRODUCT", args.tripId as string, args.query as string, args.supplierId as string | undefined);
      state.agent.seenIds = [...new Set([...state.agent.seenIds, ...records.map((r) => r.id)])];
      return { records: selected && records.some((r) => r.id === selected.id) ? records.filter((r) => r.id === selected.id) : records, selected, truncated: records.length === 20 };
    }
    if (name === "get_supplier" || name === "get_product") {
      if (this.deps.catalog.trips.some((t) => t.id === args.id || t.companies.some((c) => c.id === args.id))) throw new AgentToolError("WRONG_RECORD_KIND", "Ese ID pertenece a un viaje o empresa interna. Usá search_suppliers con el nombre literal y el tripId; luego get_supplier con el id del proveedor devuelto");
      const record = await domain.get(snapshot, name === "get_supplier" ? "SUPPLIER" : "PRODUCT", args.id as string);
      state.agent.seenIds = [...new Set([...state.agent.seenIds, record.id])]; return record;
    }
    if (name === "prepare_evidence") {
      const prepared: AgentEvidence[] = [];
      for (const source of args.sources as Array<{ messageId: string; quote?: string; role: "FACTS" | "CONTEXT" }>) {
        const original = sourceText(snapshot, source.messageId); const text = source.quote ?? original;
        const start = original.indexOf(text);
        if (start < 0 || (text && original.indexOf(text, start + 1) >= 0)) throw new AgentToolError("INVALID_QUOTE", "La cita debe ser literal y aparecer una sola vez; ampliá la cita para distinguirla");
        const id = `waev_${evidenceHash(`${source.messageId}:${start}:${start + text.length}:${source.role}`)}`;
        let evidence = state.agent.evidence.find((e) => e.id === id);
        if (!evidence) {
          const literal = factualText(text);
          if (source.role === "FACTS" && (literal.match(/\bproducto\s*:?[ \t]+[\p{L}]/giu)?.length ?? 0) > 1) throw new AgentToolError("MULTIPLE_PRODUCTS", "Esta evidencia contiene varios productos. Usá quotes separadas con las frases comerciales de cada producto, y la introducción del proveedor sólo como CONTEXT");
          const candidate = literal ? await this.deps.extraction.extractReading(literal, { type: "TEXT", text: literal }) : { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text: "" } };
          evidence = { id, messageId: source.messageId, start, end: start + text.length, text, role: source.role, candidate };
          state.agent.evidence.push(evidence);
        }
        prepared.push(evidence);
      }
      await this.deps.checkpoint(state);
      return { evidence: prepared };
    }
    if (name.startsWith("create_") || name.startsWith("update_")) {
      let evidence = (args.evidenceIds as string[]).map((id) => {
        const found = state.agent.evidence.find((e) => e.id === id);
        if (!found) throw new AgentToolError("INVALID_REFERENCE", "Prepará las evidencias primero"); return found;
      });
      if (new Set(evidence.map((e) => e.id)).size !== evidence.length) throw new AgentToolError("DUPLICATE_REFERENCE", "No repitas evidencias");
      if (!evidence.some((e) => e.role === "FACTS")) throw new AgentToolError("MISSING_FACTS", "La carga necesita evidencia propia");
      const targetId = (args.supplierId ?? args.id) as string | undefined;
      let tripId = args.tripId as string; let companyId = args.companyId as string;
      let targetKind: string | undefined;
      if (targetId) {
        if (!state.agent.seenIds.includes(targetId) && !state.agent.receipts.some((r) => r.id === targetId)) throw new AgentToolError("UNKNOWN_TARGET", "Buscá y obtené el destino antes de escribir");
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
      const receipt = await domain.write(snapshot, { tool: name, tripId, companyId, targetId, targetKind, name: args.name as string | undefined, evidence, patch: args.patch as Record<string, unknown> | undefined });
      recordReceipt(state, receipt); state.agent.seenIds = [...new Set([...state.agent.seenIds, receipt.id])];
      if (receipt.status === "PROPOSED") {
        state.agent.pending = { type: "APPROVAL", proposalId: receipt.operationId, options: [], revision: snapshot.revision, text: `¿Confirmás este cambio en «${receipt.name ?? "el registro"}»?\nActual: ${JSON.stringify(receipt.data?.before)}\nNuevo: ${JSON.stringify(receipt.data?.patch)}\nRespondé sí para aplicar o cancelar para descartarlo. Esta aprobación no confirma borradores.` };
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
      let options = (args.options ?? []) as Array<{ id: string; label: string }>;
      const recentSearch = state.agent.calls.findLast((c) => c.name === "search_suppliers" && Array.isArray((c.result as { records?: unknown })?.records));
      const candidates = (recentSearch?.result as { records?: AgentRecord[] } | undefined)?.records ?? [];
      const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
      const requested = (args.pendingProducts ?? []) as Array<{ supplierQuery?: string }>;
      const original = normalize(snapshot.messages.map((m) => factualText(sourceText(snapshot, m.id))).join("\n"));
      const sameNamedSuppliers = candidates.length > 1 && Boolean(candidates[0].name) && candidates.every((r) => normalize(r.name ?? "") === normalize(candidates[0].name!)) && original.includes(normalize(candidates[0].name!));
      if ((args.pendingProducts as unknown[] | undefined)?.length && sameNamedSuppliers || !options.length && candidates.length > 1 && requested.some((p) => p.supplierQuery && candidates.every((r) => normalize(r.name ?? "").includes(normalize(p.supplierQuery!))))) options = candidates.map((r) => ({ id: r.id, label: [r.name, r.companyLabel, r.city].filter(Boolean).join(" · ") }));
      const previous = state.agent.pending;
      const answer = previous && snapshot.messages.filter((m) => m.sequence > previous.revision).at(-1)?.envelope.text?.trim();
      const selected = answer && /^\d+$/u.test(answer) ? previous?.options[Number(answer) - 1] : null;
      if (selected && options.length === previous!.options.length && options.every((o) => previous!.options.some((p) => p.id === o.id))) throw new AgentToolError("SELECTION_ALREADY_RESOLVED", "El usuario ya eligió una opción. Obtené el registro por selected.id y continuá la carga pendiente; no repitas la misma pregunta");
      if (options.some((o) => !state.agent.seenIds.includes(o.id)) || new Set(options.map((o) => o.id)).size !== options.length) throw new AgentToolError("INVALID_OPTIONS", "Las opciones deben ser IDs obtenidos por tools, sin duplicados. Si no hay coincidencias, omití options y preguntá el nombre del proveedor; no inventes opciones de acciones");
      if (!args.pendingProducts && snapshot.messages.some((m) => /(?:agreg|carg|sum|producto:).*producto|producto:/iu.test(sourceText(snapshot, m.id)))) throw new AgentToolError("MISSING_PENDING_PRODUCT", "Incluí pendingProducts con el nombre literal y supplierQuery si se mencionó. La carga queda pendiente mientras se aclara el destino");
      const products = (args.pendingProducts ?? []) as Array<{ name: string; supplierQuery?: string }>;
      const literal = snapshot.messages.map((m) => factualText(sourceText(snapshot, m.id))).join("\n").toLowerCase();
      if (products.some((p) => !literal.includes(p.name.toLowerCase()))) throw new AgentToolError("UNGROUNDED_NAME", "El producto pendiente debe aparecer en la evidencia");
      state.agent.pending = { type: "CLARIFICATION", text: args.question as string, products, options, revision: snapshot.revision };
      state.question = [args.question, options.map((o, i) => `${i + 1}. ${o.label}`).join("\n")].filter(Boolean).join("\n");
      this.done = true; state.agent.terminal = { revision: snapshot.revision, response: "" }; await this.deps.checkpoint(state); return { waiting: true, question: state.question };
    }
    if (name === "finish_turn") {
      const response = args.response as string | undefined;
      if (!response && !args.guidance && !state.agent.receipts.some((r) => ["COMPLETED", "CANCELLED"].includes(r.status)) && state.agent.calls.some((c) => ["search_suppliers", "search_products", "get_supplier", "get_product"].includes(c.name) && !(c.result as { error?: string })?.error)) throw new AgentToolError("MISSING_QUERY_RESPONSE", "La consulta obtuvo resultados. Pasá la respuesta factual en finish_turn.response; el contenido fuera de argumentos no se envía. No agregues preguntas de cortesía");
      const operationRequested = snapshot.messages.some((m) => /^(?:agreg|carg|sum|correg|actualiz|borra|quit|elimin|quiero (?:agregar|cargar|corregir|actualizar))/iu.test(factualText(sourceText(snapshot, m.id)).trim()));
      if (operationRequested && !state.agent.receipts.some((r) => ["COMPLETED", "CANCELLED"].includes(r.status))) throw new AgentToolError("UNFINISHED_OPERATION", "Hay un pedido de carga o cambio sin resolver. Usá las tools de escritura o ask_clarification; no termines ni envíes ayuda antes de resolverlo");
      if (state.agent.receipts.some((r) => ["STALE", "EXPIRED"].includes(r.status)) && !state.agent.receipts.some((r) => r.status === "PROPOSED")) throw new AgentToolError("UNRESOLVED_CHANGE", "El cambio requiere una propuesta nueva con los datos actuales y otra aprobación. Obtené el registro y llamá update nuevamente; no cierres el pedido");
      // Mutating success claims are always rendered from receipts, never free model prose.
      if (response && response.includes("?")) throw new AgentToolError("USE_CLARIFICATION", "Una pregunta debe usar ask_clarification para conservar el estado pendiente");
      if (response && (state.agent.receipts.some((r) => r.status === "COMPLETED") || /guardad|cread|actualizad|confirmad|asociad|se creó|se guardó|se actualizó/iu.test(response))) throw new AgentToolError("UNVERIFIED_RESPONSE", "El servidor informa las operaciones guardadas. Usá response sólo para consultas y explicaciones.");
      this.response = args.guidance ? whatsappAgentHelpReply() : response ?? "";
      state.agent.pending = null; state.question = null; this.done = true; state.agent.terminal = { revision: snapshot.revision, response: this.response };
      await this.deps.checkpoint(state); return { finished: true };
    }
    throw new AgentToolError("UNKNOWN_TOOL", "Tool no disponible");
  }
}
