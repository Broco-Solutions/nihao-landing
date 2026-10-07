import type { BurstSnapshot, BurstState } from "./burst-types.ts";
import type { ExtractionCandidate } from "../../bot/types.ts";

export type AgentEvidence = { id: string; messageId: string; start: number; end: number; text: string; role: "FACTS" | "CONTEXT"; candidate: ExtractionCandidate };
export type AgentReceipt = { logicalLoadIds?: string[]; operationId: string; tool: string; id: string; captureId?: string; supplierId?: string | null; companyId?: string; tripId?: string; name?: string | null; evidenceIds?: string[]; completedRevision?: number; resourceStatus?: "DRAFT" | "CONFIRMED"; confirmationReason?: "NAME_AND_CONTACT_PRESENT" | "NAME_AND_IMAGE_PRESENT"; status: string; data?: Record<string, unknown> };
export type AgentQuestion = { loadId?: string; associationSource?: { assetId: string; segmentId?: string }; supplierPicker?: boolean; products?: Array<{ name: string; supplierQuery?: string }>; text: string; options: Array<{ id: string; label: string }>; type: "CLARIFICATION" | "APPROVAL"; proposalId?: string; revision: number };
export type AgentCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type AgentChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | null; response_items?: Record<string, unknown>[]; tool_calls?: AgentCall[]; tool_call_id?: string; name?: string };
export type AgentTerminationReason = "completed" | "asked_clarification" | "max_rounds" | "no_progress" | "tool_error" | "model_error";
export type AgentState = BurstState & { agent: { scopeId?: string; evidence: AgentEvidence[]; receipts: AgentReceipt[]; pending: AgentQuestion | null; history: AgentChatMessage[]; historyRevision: number; rounds: number; resolvedRecords?: Array<{ id: string; kind: AgentRecord["kind"]; version: string }>; watchdog?: { lastOperation: string; lastState: string; repeats: number; stagnantRounds: number; lastProgressRound: number; lastErrorCode?: string }; termination?: { reason: AgentTerminationReason; revision: number; rounds: number; errorCode?: string }; calls: Array<{ name: string; result: unknown; revision?: number; logicalLoadId?: string }>; seenIds: string[]; terminal?: { revision: number; response: string } } };
export function agentState(state: BurstState): AgentState {
  const existing = state as Partial<AgentState>;
  return { ...state, agent: existing.agent ?? { evidence: [], receipts: [], pending: null, history: [], historyRevision: -1, rounds: 0, calls: [], seenIds: [] } };
}
export class AgentToolError extends Error { constructor(public readonly code: string, message: string) { super(message); } }
export class AgentSuperseded extends Error {}
export class AgentCheckpoint extends Error {}
export type AgentRecord = { companyLabel?: string; city?: string | null; id: string; captureId: string; supplierId?: string | null; kind: "SUPPLIER" | "SUPPLIER_DRAFT" | "PRODUCT"; tripId: string; companyId: string; name: string | null; status: string; version: string; data: Record<string, unknown> };
export type AgentWrite = { notes?: string | null; tool: string; tripId: string; companyId: string; targetId?: string; targetKind?: string; name?: string | null; evidence: AgentEvidence[]; patch?: Record<string, unknown> };
export interface AgentDomain {
  resolveExistingSupplier?(snapshot: BurstSnapshot, loadId: string, supplierId?: string): Promise<AgentReceipt | null>;
  resolveHistoricalEvidence?(snapshot: BurstSnapshot, loadId: string): Promise<number>;
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
const supplierFields = ["notes", "companyName", "city", "province", "category", "supplierType", "interestScore", "website", "contact", "contacts"];
const productFields = ["notes", "name", "fob", "moq", "leadTime"];
const patchSchema = (fields: string[]) => obj({
  ...Object.fromEntries(fields.map((key) => [key, legacyPatch.properties![key]])),
  clearFields: arr({ type: "string", enum: fields.flatMap((key) => [key, ...Object.keys(legacyPatch.properties![key].properties ?? {}).map((part) => `${key}.${part}`)]) }),
}, []);
const ids = arr(str, 1);
const specs: Record<string, { description: string; parameters: Schema }> = {
  get_context: { description: "Obtener viajes y empresas autorizados; si sólo hay un viaje usalo sin preguntar.", parameters: obj({}) },
  resolve_recent_reference: { description: "Resolver referencias como agregale, mismo proveedor o último producto usando las últimas 5 conversaciones de 24 horas. Devuelve registros actuales autorizados; varias coincidencias requieren aclaración. No reemplaza el destino explícito ni una pregunta pendiente.", parameters: obj({ kind: { enum: ["SUPPLIER", "PRODUCT"] } }) },
  search_suppliers: { description: "Buscar proveedores confirmados y borradores por nombre o alias literal. Elegí sólo coincidencia única; homónimos requieren aclaración.", parameters: obj({ tripId: str, query: { type: "string", maxLength: 4000 } }) },
  get_supplier: { description: "Obtener datos de un proveedor o borrador autorizado.", parameters: obj({ id: str }) },
  search_products: { description: "Buscar productos por nombre, opcionalmente dentro de un proveedor o borrador.", parameters: obj({ tripId: str, query: { type: "string", maxLength: 4000 }, supplierId: { ...str, type: "nullableString" } }, ["tripId", "query"]) },
  get_product: { description: "Obtener un producto autorizado.", parameters: obj({ id: str }) },
  prepare_evidence: { description: "Preparar evidencia literal para UNA carga/producto. quote debe ser substring exacto del original; usá null para usar todo el mensaje. FACTS son datos de esta carga, CONTEXT sólo identifica proveedor/empresa y puede compartirse. Si hay varios productos, separá sus frases comerciales. No inventes ni reescribas citas.", parameters: obj({ sources: arr(obj({ messageId: str, quote: { ...str, type: "nullableString" }, role: { enum: ["FACTS", "CONTEXT"] } }, ["messageId", "role"]), 1) }) },
  create_supplier_draft: { description: "Crear un NUEVO proveedor con estado determinado por el servidor; no usar para agregar productos a un proveedor existente. Condiciones comerciales se cargan por separado con create_product_draft.", parameters: obj({ tripId: str, companyId: str, evidenceIds: ids, notes: nullableText }, ["tripId", "companyId", "evidenceIds"]) },
  create_product_draft: { description: "Crear UN producto asociado al proveedor o borrador indicado, con estado determinado por el servidor. Fotos y audios complementarios usan la misma llamada. Nunca crear proveedor sustituto ante una búsqueda sin coincidencias. name debe ser literal o null si falta.", parameters: obj({ supplierId: str, notes: nullableText, name: { ...str, type: "nullableString" }, evidenceIds: ids }, ["supplierId", "evidenceIds"]) },
  update_supplier: { description: "Corregir campos explícitos de proveedor/borrador. Para confirmado genera propuesta, no aplica aún. Campos no solicitados=null; clearFields enumera únicamente borrados explícitos.", parameters: obj({ id: str, patch: patchSchema(supplierFields), evidenceIds: ids }) },
  update_product: { description: "Corregir campos explícitos de producto. Para confirmado genera propuesta, no aplica aún. Campos no solicitados=null; clearFields enumera únicamente borrados explícitos.", parameters: obj({ id: str, patch: patchSchema(productFields), evidenceIds: ids }) },
  apply_pending_change: { description: "Aplicar propuesta sólo después de respuesta textual explícita del usuario a la propuesta mostrada. El servidor comprueba autorización y versión.", parameters: obj({ proposalId: str }) },
  cancel_pending_change: { description: "Cancelar una propuesta pendiente tras pedido del usuario.", parameters: obj({ proposalId: str }) },
  ask_clarification: { description: "Preguntar por destino, asociación o cambio pendiente. options deben ser IDs devueltos por tools con etiquetas; su numeración queda persistida. Una sola pregunta por turno; incluir todas las dudas pendientes.", parameters: obj({ question: str, options: { ...arr(obj({ id: str, label: str })), type: "nullableArray" }, pendingProducts: { ...arr(obj({ name: str, supplierQuery: { ...str, type: "nullableString" } }, ["name"])), type: "nullableArray" } }, ["question"]) },
  finish_turn: { description: "Terminar el turno. El servidor informa operaciones realmente completadas. Para consultas response debe usar sólo datos obtenidos por tools. guidance=true devuelve la ayuda oficial.", parameters: obj({ response: { ...str, type: "nullableString" }, guidance: { type: "nullableBoolean" } }, []) },
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
