import type { BurstSnapshot, BurstState } from "./burst-types.ts";
import type { ExtractionCandidate } from "../../bot/types.ts";

export type AgentEvidence = { pendingId?: string; id: string; messageId: string; start: number; end: number; text: string; role: "FACTS" | "CONTEXT"; candidate: ExtractionCandidate };
export type AgentReceipt = { logicalLoadIds?: string[]; operationId: string; tool: string; id: string; captureId?: string; supplierId?: string | null; companyId?: string; tripId?: string; name?: string | null; evidenceIds?: string[]; completedRevision?: number; resourceStatus?: "DRAFT" | "CONFIRMED"; confirmationReason?: "NAME_PRESENT" | "NAME_AND_CONTACT_PRESENT" | "NAME_AND_IMAGE_PRESENT" | "NAME_AND_FOB_PRESENT"; status: string; data?: Record<string, unknown> };
export type PendingProductLoad = { name: string; supplierQuery?: string; sourceMessageIds?: string[]; evidenceIds?: string[]; supplierIds?: string[] };
export type AgentQuestion = { answer?: { messageId: string; optionId?: string; questionRevision: number }; sourceMessageIds?: string[]; evidenceIds?: string[]; contextSelection?: boolean; loadId?: string; associationSource?: { assetId: string; segmentId?: string }; supplierPicker?: boolean; products?: PendingProductLoad[]; text: string; options: Array<{ id: string; label: string }>; type: "CLARIFICATION" | "APPROVAL"; proposalId?: string; revision: number };
export type AgentCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type AgentChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | null; response_items?: Record<string, unknown>[]; tool_calls?: AgentCall[]; tool_call_id?: string; name?: string };
export type AgentTerminationReason = "completed" | "asked_clarification" | "max_rounds" | "no_progress" | "tool_error" | "model_error";
export type AgentState = BurstState & { agent: { scopeId?: string; queryResponses?: Array<{ revision: number; scopeId?: string; response: string }>; evidence: AgentEvidence[]; receipts: AgentReceipt[]; pending: AgentQuestion | null; history: AgentChatMessage[]; historyRevision: number; rounds: number; resolvedRecords?: Array<{ id: string; kind: AgentRecord["kind"]; version: string }>; watchdog?: { lastOperation: string; lastState: string; repeats: number; stagnantRounds: number; lastProgressRound: number; lastErrorCode?: string }; termination?: { reason: AgentTerminationReason; revision: number; rounds: number; errorCode?: string }; calls: Array<{ name: string; result: unknown; revision?: number; logicalLoadId?: string }>; seenIds: string[]; terminal?: { revision: number; response: string } } };
export function agentState(state: BurstState): AgentState {
  const existing = state as Partial<AgentState>;
  return { ...state, agent: existing.agent ?? { evidence: [], receipts: [], pending: null, history: [], historyRevision: -1, rounds: 0, calls: [], seenIds: [] } };
}
export class AgentToolError extends Error { constructor(public readonly code: string, message: string) { super(message); } }
export class AgentSuperseded extends Error {}
export class AgentCheckpoint extends Error {}
export type AgentRecord = { searchMatch?: import("./supplier-search.ts").SupplierSearchMatch; companyLabel?: string; city?: string | null; id: string; captureId: string; supplierId?: string | null; kind: "SUPPLIER" | "SUPPLIER_DRAFT" | "PRODUCT"; tripId: string; companyId: string; name: string | null; status: string; version: string; data: Record<string, unknown> };
export type AgentWrite = { notes?: string | null; tool: string; tripId: string; companyId: string; targetId?: string; targetKind?: string; name?: string | null; evidence: AgentEvidence[]; patch?: Record<string, unknown> };
export type AgentMessageOutcome = { messageId: string; action: "CREATE_PRODUCT" | "UPDATE_PRODUCT" | "CREATE_SUPPLIER" | "UPDATE_SUPPLIER" | "PRESERVE_PRODUCT_FACTS" | "QUERY" | "NO_ACTION"; evidenceIds: string[] };
export interface AgentDomain {
  preserveProductFacts?(snapshot: BurstSnapshot, supplierId: string, evidence: AgentEvidence[]): Promise<AgentReceipt[]>;
  pendingEvidence?(snapshot: BurstSnapshot): Promise<AgentEvidence[]>;
  preparePendingEvidence?(snapshot: BurstSnapshot, id: string): Promise<AgentEvidence | null>;
  persistProductLoads?(snapshot: BurstSnapshot): Promise<AgentReceipt[]>;
  persistPreviousSupplierComments?(snapshot: BurstSnapshot): Promise<AgentReceipt[]>;
  conversationContext?(snapshot: BurstSnapshot): Promise<import("./conversation-context.ts").ConversationContext>;
  resolveConversationReference?(snapshot: BurstSnapshot, kind: "SUPPLIER" | "PRODUCT"): Promise<import("./agent-memory.ts").MemoryReference[]>;
  resetConversationContext?(snapshot: BurstSnapshot): Promise<void>;
  selectConversationTarget?(snapshot: BurstSnapshot, kind: "SUPPLIER" | "PRODUCT", id: string): Promise<void>;
  persistCaptions?(snapshot: BurstSnapshot): Promise<void>;
  persistImageLoad?(snapshot: BurstSnapshot, loadId: string): Promise<AgentReceipt>;
  resolveExistingSupplier?(snapshot: BurstSnapshot, loadId: string, supplierId?: string): Promise<AgentReceipt | null>;
  resolveHistoricalEvidence?(snapshot: BurstSnapshot, loadId: string): Promise<number>;
  resolveSupplierReference?(snapshot: BurstSnapshot): Promise<import("./agent-memory.ts").MemoryReference[]>;
  recentMemory?(snapshot: BurstSnapshot): Promise<import("./agent-memory.ts").RecentConversation[]>;
  search(snapshot: BurstSnapshot, kind: "SUPPLIER" | "PRODUCT", tripId: string, query: string, parentId?: string): Promise<AgentRecord[]>;
  get(snapshot: BurstSnapshot, kind: "SUPPLIER" | "PRODUCT", id: string): Promise<AgentRecord>;
  write(snapshot: BurstSnapshot, input: AgentWrite): Promise<AgentReceipt>;
  pending(snapshot: BurstSnapshot): Promise<AgentReceipt[]>;
  resolve(snapshot: BurstSnapshot, proposalId: string, cancel: boolean): Promise<AgentReceipt>;
  receipts(snapshot: BurstSnapshot): Promise<AgentReceipt[]>;
  displayed(snapshot: BurstSnapshot, proposalId: string): Promise<void>;
}

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema; enum?: unknown[]; minItems?: number; maxItems?: number; maxLength?: number; minLength?: number; minimum?: number; maximum?: number };
const str: Schema = { type: "string", minLength: 1, maxLength: 4000 };
const obj = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: "object", properties, required, additionalProperties: false });
const arr = (items: Schema, minItems = 0): Schema => ({ type: "array", items, minItems, maxItems: 50 });
const nullableText: Schema = { type: "nullableString", maxLength: 2048 };
const number: Schema = { type: "nullableNumber", minimum: 0 };
const legacyPatch = obj({ notes: nullableText, companyName: nullableText, name: nullableText, city: nullableText, province: nullableText, category: nullableText, supplierType: { enum: ["FACTORY", "TRADING", "UNKNOWN"] }, interestScore: { type: "nullableNumber", minimum: 1, maximum: 10 }, website: nullableText, contact: nullableText, contacts: arr(obj({ type: { enum: ["EMAIL", "PHONE", "FAX", "WECHAT", null] }, rawText: str })), fob: { ...obj({ amount: number, currency: nullableText, unit: nullableText, rawText: str }, []), type: "nullableObject" }, moq: { ...obj({ quantity: number, unit: nullableText, notes: nullableText, rawText: str }, []), type: "nullableObject" }, leadTime: { ...obj({ days: number, rawText: str }, []), type: "nullableObject" } }, []);
const supplierFields = ["notes", "companyName", "city", "province", "category", "supplierType", "interestScore", "website", "contact", "contacts", "fob", "moq", "leadTime"];
const productFields = ["notes", "name", "fob", "moq", "leadTime"];
const patchSchema = (fields: string[]) => obj({
  ...Object.fromEntries(fields.map((key) => [key, legacyPatch.properties![key]])),
  clearFields: arr({ type: "string", enum: fields.flatMap((key) => [key, ...Object.keys(legacyPatch.properties![key].properties ?? {}).map((part) => `${key}.${part}`)]) }),
}, []);
const ids = arr(str, 1);
const specs: Record<string, { description: string; parameters: Schema }> = {
  reset_conversation_context: { description: "Reiniciar el foco sólo si el usuario pide empezar de nuevo, olvidar el contexto o cambiar de tema. No elimina registros ni propuestas pendientes.", parameters: obj({}) },
  get_context: { description: "Consultar contexto autorizado y referencias recientes disponibles. Usá operationalContext del input si ya basta; no es una llamada obligatoria.", parameters: obj({}) },
  resolve_recent_reference: { description: "Resolver identidad contextual con kind SUPPLIER o PRODUCT. Para proveedor sin destino indicado o referencias por nombre, ordinal, cita o mensaje anterior, consulta ráfaga y memoria; para producto consulta ráfaga actual y foco persistente. Devuelve registros actuales y requiresClarification; si no hay identidad única, preguntá. No sustituye destinos explícitos ni preguntas pendientes.", parameters: obj({ kind: { enum: ["SUPPLIER", "PRODUCT"] } }) },
  search_suppliers: { description: "Buscar proveedores y borradores con el nombre/alias literal del usuario, sin expandirlo a una empresa interna. Una coincidencia literal única resuelve proveedor y empresa; varias requieren opciones con empresa/ciudad. Si no hay literales, devuelve candidatos searchMatch.type=FUZZY ordenados por score: requieren selección del usuario incluso si hay uno solo.", parameters: obj({ tripId: str, query: { type: "string", maxLength: 4000 } }) },
  get_supplier: { description: "Obtener datos de un proveedor o borrador autorizado.", parameters: obj({ id: str }) },
  search_products: { description: "Buscar productos por nombre, opcionalmente dentro de un proveedor o borrador.", parameters: obj({ tripId: str, query: { type: "string", maxLength: 4000 }, supplierId: { ...str, type: "nullableString" } }, ["tripId", "query"]) },
  get_product: { description: "Obtener un producto autorizado.", parameters: obj({ id: str }) },
  prepare_evidence: { description: "Preparar evidencia literal usando un messageId actual o el id de pendingEvidence autorizado del input. Devuelve evidenceIds para las escrituras; no uses messageIds como evidenceIds. quote debe ser una cita exacta y única, o null para el mensaje completo. Ante INVALID_MESSAGE_ID corregí con los IDs disponibles sin preguntarle al usuario. FACTS aporta datos propios; CONTEXT sólo identidad compartible. Separá las frases de productos distintos.", parameters: obj({ sources: arr(obj({ messageId: str, quote: { ...str, type: "nullableString" }, role: { enum: ["FACTS", "CONTEXT"] } }, ["messageId", "role"]), 1) }) },
  preserve_product_facts: { description: "Conservar condiciones comerciales pendientes del proveedor resuelto cuando todavía no se identifica un producto. Interpretá el mensaje completo y el contexto: si habla del producto activo, usá update_product; si presenta otro, create_product_draft; si son condiciones generales explícitas del proveedor, update_supplier. No inventa un producto ni modifica precios del proveedor.", parameters: obj({ supplierId: str, evidenceIds: ids }) },
  create_supplier_draft: { description: "Crear un NUEVO proveedor con estado determinado por el servidor; una tarjeta representa un proveedor. FOB/MOQ/plazo sin producto identificado quedan pendientes para ese proveedor, salvo condiciones explícitas generales del proveedor. Si hay un producto identificado, cargarlo por separado con create_product_draft.", parameters: obj({ tripId: str, companyId: str, evidenceIds: ids, notes: nullableText }, ["tripId", "companyId", "evidenceIds"]) },
  create_product_draft: { description: "Crear un producto del proveedor/borrador resuelto, con estado determinado por el servidor. Usá evidenceIds de prepare_evidence. name debe ser literal aunque no diga «producto», o null si falta. No preguntes precio, MOQ ni plazo faltantes: quedan para la web. notes contiene sólo información adicional sustentada; null si no hay. Fotos/audios complementarios van juntos.", parameters: obj({ supplierId: str, notes: nullableText, name: { ...str, type: "nullableString" }, evidenceIds: ids }, ["supplierId", "evidenceIds"]) },
  update_supplier: { description: "Corregir campos explícitos de proveedor/borrador. Aplica directamente con destino validado y evidencia literal; no crea otro recurso. Campos no solicitados=null; clearFields enumera únicamente borrados explícitos.", parameters: obj({ id: str, patch: patchSchema(supplierFields), evidenceIds: ids }) },
  update_product: { description: "Corregir campos explícitos de producto. Aplica directamente con destino validado y evidencia literal; no crea otro recurso. Campos no solicitados=null; clearFields enumera únicamente borrados explícitos.", parameters: obj({ id: str, patch: patchSchema(productFields), evidenceIds: ids }) },
  apply_pending_change: { description: "Aplicar propuesta sólo después de respuesta textual explícita del usuario a la propuesta mostrada. El servidor comprueba autorización y versión.", parameters: obj({ proposalId: str }) },
  cancel_pending_change: { description: "Cancelar una propuesta pendiente tras pedido del usuario.", parameters: obj({ proposalId: str }) },
  ask_clarification: { description: "Pedir decisiones faltantes y terminar el turno, reuniendo dudas breves por punto. options usa IDs de tools con etiquetas que distingan empresa/ciudad. Incluí pendingProducts con nombres literales y supplierQuery mencionado para conservar productos sin destino. Las respuestas numéricas eligen las opciones persistidas.", parameters: obj({ question: str, options: { ...arr(obj({ id: str, label: str })), type: "nullableArray" }, pendingProducts: { ...arr(obj({ name: str, supplierQuery: { ...str, type: "nullableString" } }, ["name"])), type: "nullableArray" } }, ["question"]) },
  finish_turn: { description: "Terminar el turno con outcomes: para cada mensaje de texto/audio, indicá la acción que interpretaste leyendo su contenido completo y la conversación. Las acciones de escritura requieren evidenceIds ya persistidos por la tool correspondiente; preparar evidencia no guarda datos. QUERY y NO_ACTION no requieren escritura: usalos sólo para consultas o mensajes sin información para registrar. Un mensaje con varios pedidos tiene varios outcomes. Para consultas, response contiene la respuesta factual; el servidor informa escrituras desde recibos reales. guidance=true devuelve ayuda oficial.", parameters: obj({ response: { ...str, type: "nullableString" }, guidance: { type: "nullableBoolean" }, outcomes: { ...arr(obj({ messageId: str, action: { enum: ["CREATE_PRODUCT", "UPDATE_PRODUCT", "CREATE_SUPPLIER", "UPDATE_SUPPLIER", "PRESERVE_PRODUCT_FACTS", "QUERY", "NO_ACTION"] }, evidenceIds: arr(str) })), type: "nullableArray" } }, []) },
};
// The wire contract is strict. Sparse historical calls remain readable by the backend validator.
function wire(schema: Schema, optional = false): unknown {
  const result: Record<string, unknown> = { ...schema };
  const base = schema.type?.replace("nullable", "").toLowerCase() ?? (schema.enum ? typeof schema.enum.find((v) => v !== null) : undefined);
  const nullable = optional || schema.type?.startsWith("nullable") || schema.enum?.includes(null);
  if (base) result.type = nullable ? [base, "null"] : base;
  if (schema.enum && nullable) result.enum = [...new Set([...schema.enum, null])];
  if (schema.properties) {
    result.required = Object.keys(schema.properties);
    result.additionalProperties = false;
    result.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, wire(value, !schema.required?.includes(key))]));
  }
  if (schema.items) result.items = wire(schema.items);
  return result;
}
export const AGENT_TOOLS = Object.entries(specs).map(([name, spec]) => ({ type: "function", function: { name, description: spec.description, strict: true, parameters: wire(spec.parameters) } }));

/** Strict nullable patch slots are omissions; clearFields carries explicit deletion intent.
 * Sparse pre-strict checkpoints keep their original null=delete convention. */
export function normalizeAgentPatch(patch: Record<string, unknown>): Record<string, unknown> {
  if (!("clearFields" in patch)) return patch;
  const clear = new Set((patch.clearFields ?? []) as string[]);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "clearFields") continue;
    if (value === null) { if (clear.has(key)) result[key] = key === "contacts" ? [] : key === "supplierType" ? "UNKNOWN" : null; continue; }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = Object.fromEntries(Object.entries(value).filter(([part, v]) => v !== null || clear.has(`${key}.${part}`)));
      if (Object.keys(nested).length) result[key] = nested;
    } else result[key] = value;
  }
  for (const path of clear) {
    const [key, part] = path.split(".");
    const value = part ? (patch[key] as Record<string, unknown> | null)?.[part] : patch[key];
    if (value !== null) throw new AgentToolError("INVALID_ARGUMENTS", "clearFields requiere el valor null del campo indicado");
  }
  return result;
}
export function validateToolArgs(name: string, value: unknown, strict = false): Record<string, unknown> {
  const spec = specs[name];
  if (!spec) throw new AgentToolError("UNKNOWN_TOOL", "Tool no disponible");
  function validate(s: Schema, v: unknown, path: string): void {
    const fail = () => { throw new AgentToolError("INVALID_ARGUMENTS", `Argumento inválido: ${path}`); };
    if (v === null && (s.type?.startsWith("nullable") || s.enum?.includes(null))) return;
    if (s.enum && !s.enum.includes(v)) fail();
    const type = s.type?.replace("nullable", "").toLowerCase();
    if (type === "object") {
      if (!v || typeof v !== "object" || Array.isArray(v)) fail();
      const record = v as Record<string, unknown>;
      if ((strict ? Object.keys(s.properties ?? {}) : s.required)?.some((k) => !(k in record)) || Object.keys(record).some((k) => !s.properties?.[k])) fail();
      for (const [k, field] of Object.entries(record)) {
        if (field === null && !s.required?.includes(k)) continue;
        validate(s.properties![k], field, `${path}.${k}`);
      }
    } else if (type === "array") {
      if (!Array.isArray(v) || v.length < (s.minItems ?? 0) || v.length > (s.maxItems ?? Infinity)) fail();
      for (const item of v as unknown[]) validate(s.items!, item, path);
    } else if (type === "string" && (typeof v !== "string" || v.trim().length < (s.minLength ?? 0) || v.length > (s.maxLength ?? Infinity))) fail();
    else if (type === "number" && (typeof v !== "number" || !Number.isFinite(v) || v < (s.minimum ?? -Infinity) || v > (s.maximum ?? Infinity))) fail();
    else if (type === "boolean" && typeof v !== "boolean") fail();
  }
  validate(spec.parameters, value, name);
  const args = { ...(value as Record<string, unknown>) };
  if (args.patch && typeof args.patch === "object") args.patch = normalizeAgentPatch(args.patch as Record<string, unknown>);
  return args;
}
