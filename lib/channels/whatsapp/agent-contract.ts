import type { BurstSnapshot, BurstState } from "./burst-types.ts";
import type { ExtractionCandidate } from "../../bot/types.ts";

export type AgentEvidence = { id: string; messageId: string; start: number; end: number; text: string; role: "FACTS" | "CONTEXT"; candidate: ExtractionCandidate };
export type AgentReceipt = { operationId: string; tool: string; id: string; captureId?: string; supplierId?: string | null; companyId?: string; tripId?: string; name?: string | null; evidenceIds?: string[]; status: string; data?: Record<string, unknown> };
export type AgentQuestion = { products?: Array<{ name: string; supplierQuery?: string }>; text: string; options: Array<{ id: string; label: string }>; type: "CLARIFICATION" | "APPROVAL"; proposalId?: string; revision: number };
export type AgentCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type AgentChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: AgentCall[]; tool_call_id?: string; name?: string };
export type AgentState = BurstState & { agent: { evidence: AgentEvidence[]; receipts: AgentReceipt[]; pending: AgentQuestion | null; history: AgentChatMessage[]; historyRevision: number; rounds: number; calls: Array<{ name: string; result: unknown }>; seenIds: string[]; terminal?: { revision: number; response: string } } };
export function agentState(state: BurstState): AgentState {
  const existing = state as Partial<AgentState>;
  return { ...state, agent: existing.agent ?? { evidence: [], receipts: [], pending: null, history: [], historyRevision: -1, rounds: 0, calls: [], seenIds: [] } };
}
export class AgentToolError extends Error { constructor(public readonly code: string, message: string) { super(message); } }
export class AgentSuperseded extends Error {}
export class AgentCheckpoint extends Error {}
export type AgentRecord = { companyLabel?: string; city?: string | null; id: string; captureId: string; supplierId?: string | null; kind: "SUPPLIER" | "SUPPLIER_DRAFT" | "PRODUCT"; tripId: string; companyId: string; name: string | null; status: string; version: string; data: Record<string, unknown> };
export type AgentWrite = { tool: string; tripId: string; companyId: string; targetId?: string; targetKind?: string; name?: string | null; evidence: AgentEvidence[]; patch?: Record<string, unknown> };
export interface AgentDomain {
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
const patch = obj({ companyName: nullableText, name: nullableText, city: nullableText, province: nullableText, category: nullableText, supplierType: { enum: ["FACTORY", "TRADING", "UNKNOWN"] }, interestScore: { type: "nullableNumber", minimum: 1, maximum: 10 }, website: nullableText, contact: nullableText, contacts: arr(obj({ type: { enum: ["EMAIL", "PHONE", "FAX", "WECHAT", null] }, rawText: str })), fob: { ...obj({ amount: number, currency: nullableText, unit: nullableText, rawText: str }, []), type: "nullableObject" }, moq: { ...obj({ quantity: number, unit: nullableText, notes: nullableText, rawText: str }, []), type: "nullableObject" }, leadTime: { ...obj({ days: number, rawText: str }, []), type: "nullableObject" } }, []);
const ids = arr(str, 1);
const specs: Record<string, { description: string; parameters: Schema }> = {
  get_context: { description: "Obtener viajes y empresas autorizados; si sólo hay un viaje usalo sin preguntar.", parameters: obj({}) },
  search_suppliers: { description: "Buscar proveedores confirmados y borradores por nombre o alias literal. Elegí sólo coincidencia única; homónimos requieren aclaración.", parameters: obj({ tripId: str, query: { type: "string", maxLength: 4000 } }) },
  get_supplier: { description: "Obtener datos de un proveedor o borrador autorizado.", parameters: obj({ id: str }) },
  search_products: { description: "Buscar productos por nombre, opcionalmente dentro de un proveedor o borrador.", parameters: obj({ tripId: str, query: { type: "string", maxLength: 4000 }, supplierId: str }, ["tripId", "query"]) },
  get_product: { description: "Obtener un producto autorizado.", parameters: obj({ id: str }) },
  prepare_evidence: { description: "Preparar evidencia literal para UNA carga/producto. quote debe ser substring exacto del original; omitilo para usar todo el mensaje. FACTS son datos de esta carga, CONTEXT sólo identifica proveedor/empresa y puede compartirse. Si hay varios productos, separá sus frases comerciales. No inventes ni reescribas citas.", parameters: obj({ sources: arr(obj({ messageId: str, quote: str, role: { enum: ["FACTS", "CONTEXT"] } }, ["messageId", "role"]), 1) }) },
  create_supplier_draft: { description: "Crear un NUEVO proveedor como borrador; no usar para agregar productos a un proveedor existente. Condiciones comerciales se cargan por separado con create_product_draft.", parameters: obj({ tripId: str, companyId: str, evidenceIds: ids }) },
  create_product_draft: { description: "Crear UN producto como borrador asociado al proveedor o borrador indicado. Fotos y audios complementarios usan la misma llamada. Nunca crear proveedor sustituto ante una búsqueda sin coincidencias. name debe ser literal o se omite si falta.", parameters: obj({ supplierId: str, name: str, evidenceIds: ids }, ["supplierId", "evidenceIds"]) },
  update_supplier: { description: "Corregir campos explícitos de proveedor/borrador. Para confirmado genera propuesta, no aplica aún. No incluir campos no solicitados.", parameters: obj({ id: str, patch, evidenceIds: ids }) },
  update_product: { description: "Corregir campos explícitos de producto. Para confirmado genera propuesta, no aplica aún. Omitidos se conservan; null requiere pedido de borrar.", parameters: obj({ id: str, patch, evidenceIds: ids }) },
  apply_pending_change: { description: "Aplicar propuesta sólo después de respuesta textual explícita del usuario a la propuesta mostrada. El servidor comprueba autorización y versión.", parameters: obj({ proposalId: str }) },
  cancel_pending_change: { description: "Cancelar una propuesta pendiente tras pedido del usuario.", parameters: obj({ proposalId: str }) },
  ask_clarification: { description: "Preguntar por destino, asociación o cambio pendiente. options deben ser IDs devueltos por tools con etiquetas; su numeración queda persistida. Una sola pregunta por turno; incluir todas las dudas pendientes.", parameters: obj({ question: str, options: arr(obj({ id: str, label: str })), pendingProducts: arr(obj({ name: str, supplierQuery: str }, ["name"])) }, ["question"]) },
  finish_turn: { description: "Terminar el turno. El servidor informa operaciones realmente completadas. Para consultas response debe usar sólo datos obtenidos por tools. guidance=true devuelve la ayuda oficial.", parameters: obj({ response: str, guidance: { type: "boolean" } }, []) },
};
// Translate internal nullable validators to standard JSON Schema accepted by Mistral.
function wire(schema: Schema): unknown {
  const result: Record<string, unknown> = { ...schema };
  if (schema.type?.startsWith("nullable")) result.type = [schema.type.slice(8).toLowerCase(), "null"];
  if (schema.properties) result.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, wire(v)]));
  if (schema.items) result.items = wire(schema.items);
  return result;
}
export const AGENT_TOOLS = Object.entries(specs).map(([name, spec]) => ({ type: "function", function: { name, description: spec.description, parameters: wire(spec.parameters) } }));
export function validateToolArgs(name: string, value: unknown): Record<string, unknown> {
  const spec = specs[name];
  if (!spec) throw new AgentToolError("UNKNOWN_TOOL", "Tool no disponible");
  function validate(s: Schema, v: unknown, path: string): void {
    const fail = () => { throw new AgentToolError("INVALID_ARGUMENTS", `Argumento inválido: ${path}`); };
    if (s.enum && !s.enum.includes(v)) fail();
    if (v === null && s.type?.startsWith("nullable")) return;
    const type = s.type?.replace("nullable", "").toLowerCase();
    if (type === "object") {
      if (!v || typeof v !== "object" || Array.isArray(v)) fail();
      const record = v as Record<string, unknown>;
      if (s.required?.some((k) => !(k in record)) || Object.keys(record).some((k) => !s.properties?.[k])) fail();
      for (const [k, field] of Object.entries(record)) validate(s.properties![k], field, `${path}.${k}`);
    } else if (type === "array") {
      if (!Array.isArray(v) || v.length < (s.minItems ?? 0) || v.length > (s.maxItems ?? Infinity)) fail();
      for (const item of v as unknown[]) validate(s.items!, item, path);
    } else if (type === "string" && (typeof v !== "string" || v.trim().length < (s.minLength ?? 0) || v.length > (s.maxLength ?? Infinity))) fail();
    else if (type === "number" && (typeof v !== "number" || !Number.isFinite(v) || v < (s.minimum ?? -Infinity) || v > (s.maximum ?? Infinity))) fail();
    else if (type === "boolean" && typeof v !== "boolean") fail();
  }
  validate(spec.parameters, value, name);
  return value as Record<string, unknown>;
}
