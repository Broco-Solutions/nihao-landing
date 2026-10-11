import { createHash } from "node:crypto";
import { AgentToolError, type AgentState } from "./agent-contract.ts";
import type { BurstSnapshot } from "./burst-types.ts";

export const intentKinds = ["CREATE_SUPPLIER", "UPDATE_SUPPLIER", "CREATE_PRODUCT", "UPDATE_PRODUCT", "PRESERVE_PRODUCT_FACTS", "QUERY", "GUIDANCE", "OUT_OF_SCOPE", "NO_ACTION"] as const;
export const intentStatuses = ["PENDING", "COMPLETED", "ANSWERED", "WAITING", "UNAVAILABLE", "FORBIDDEN", "OUT_OF_SCOPE", "NO_ACTION"] as const;
export type TurnIntent = { id: string; revision: number; scopeId?: string; messageId: string; quote: string | null; label: string; kind: typeof intentKinds[number]; status: typeof intentStatuses[number]; blocks: string[]; receiptIds: string[] };
export function currentIntents(snapshot: BurstSnapshot, state: AgentState): TurnIntent[] {
  return (state.agent.intents ?? []).filter(intent => intent.revision === snapshot.revision && intent.scopeId === state.ingestion?.activeLoadId);
}
export function registerIntents(snapshot: BurstSnapshot, state: AgentState, inputs: Array<Pick<TurnIntent, "messageId" | "quote" | "label" | "kind">>): TurnIntent[] {
  state.agent.intents ??= [];
  return inputs.map(input => {
    const message = snapshot.messages.find(m => m.id === input.messageId);
    const source = message?.envelope.type === "AUDIO" ? message.reading?.transcript ?? "" : message?.envelope.text ?? message?.reading?.ocr ?? "";
    if (!message || input.quote && !source.includes(input.quote)) throw new AgentToolError("INVALID_INTENT_SOURCE", "El pedido necesita un mensaje disponible y un fragmento literal de ese mensaje.");
    const scopeId = state.ingestion?.activeLoadId;
    const id = createHash("sha256").update(JSON.stringify([snapshot.id, snapshot.revision, scopeId, input])).digest("hex").slice(0, 40);
    let intent = state.agent.intents!.find(item => item.id === id);
    if (!intent) { intent = { ...input, id, revision: snapshot.revision, scopeId, status: "PENDING", blocks: [], receiptIds: [] }; state.agent.intents!.push(intent); }
    return intent;
  });
}
const writeTools: Partial<Record<TurnIntent["kind"], string>> = { CREATE_SUPPLIER: "create_supplier_draft", UPDATE_SUPPLIER: "update_supplier", CREATE_PRODUCT: "create_product_draft", UPDATE_PRODUCT: "update_product", PRESERVE_PRODUCT_FACTS: "preserve_product_facts" };
export function resolveIntent(snapshot: BurstSnapshot, state: AgentState, input: { intentId: string; status: TurnIntent["status"]; response?: string | null; receiptIds?: string[] | null }): TurnIntent {
  const intent = currentIntents(snapshot, state).find(item => item.id === input.intentId);
  if (!intent) throw new AgentToolError("INVALID_INTENT", "Usá un pedido registrado en este contexto y revisión.");
  const tool = writeTools[intent.kind];
  if (input.status === "COMPLETED") {
    const receipts = (input.receiptIds ?? []).map(id => state.agent.receipts.find(receipt => receipt.operationId === id));
    if (!tool || !receipts.length || receipts.some(receipt => !receipt || receipt.status !== "COMPLETED" || receipt.tool !== tool || !receipt.evidenceIds?.some(id => state.agent.evidence.some(evidence => evidence.id === id && evidence.messageId === intent.messageId && evidence.role === "FACTS")))) throw new AgentToolError("UNVERIFIED_INTENT", "Una operación completada necesita recibos reales de su herramienta y evidencia propia del pedido.");
  } else if (tool && ["ANSWERED", "OUT_OF_SCOPE", "NO_ACTION"].includes(input.status)) throw new AgentToolError("UNRESOLVED_INTENT", "Una escritura requiere ejecución, aclaración o una limitación concreta.");
  if (input.status === "OUT_OF_SCOPE" && intent.kind !== "OUT_OF_SCOPE") throw new AgentToolError("INVALID_INTENT_STATUS", "Sólo un pedido clasificado ajeno puede terminar fuera del ámbito.");
  if (intent.kind === "QUERY" && input.status === "ANSWERED" && !state.agent.calls.some(call => call.revision === snapshot.revision && ["search_suppliers", "search_products", "get_supplier", "get_product", "get_context"].includes(call.name) && !(call.result as { error?: string })?.error)) throw new AgentToolError("UNVERIFIED_QUERY_RESPONSE", "Consultá primero los datos autorizados del pedido.");
  if (["ANSWERED", "WAITING", "UNAVAILABLE", "FORBIDDEN", "OUT_OF_SCOPE"].includes(input.status) && !input.response?.trim()) throw new AgentToolError("MISSING_INTENT_RESPONSE", "Explicá la respuesta, el pendiente o la limitación de este pedido.");
  if (input.response?.trim() && intent.blocks.at(-1) !== input.response.trim()) intent.blocks.push(input.response.trim());
  intent.status = input.status;
  intent.receiptIds = [...new Set([...intent.receiptIds, ...(input.receiptIds ?? [])])];
  return intent;
}
export function assertIntentCoverage(snapshot: BurstSnapshot, state: AgentState): void {
  const intents = currentIntents(snapshot, state);
  if (!intents.length) return; // Historical checkpoints remain readable during rollout.
  if (intents.some(intent => intent.status === "PENDING")) throw new AgentToolError("UNFINISHED_INTENTS", "Resolvé todos los pedidos registrados; una aclaración sólo bloquea los pedidos que dependan de ella.");
  const missing = snapshot.messages.filter(message => ["TEXT", "AUDIO"].includes(message.envelope.type) && !message.envelope.unsupportedType && !intents.some(intent => intent.messageId === message.id));
  if (missing.length) throw new AgentToolError("MISSING_INTENTS", `Falta interpretar estos mensajes completos: ${missing.map(message => message.id).join(", ")}`);
}
export function renderIntentResponses(snapshot: BurstSnapshot, state: AgentState): string {
  // Writes render from receipts and WAITING renders from the pending clarification.
  return currentIntents(snapshot, state).filter(intent => intent.status !== "COMPLETED" && intent.status !== "WAITING").flatMap(intent => intent.blocks).join("\n\n");
}
