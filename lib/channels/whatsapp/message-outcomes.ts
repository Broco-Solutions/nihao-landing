import { AgentToolError, type AgentMessageOutcome, type AgentReceipt, type AgentState } from "./agent-contract.ts";
import type { BurstSnapshot } from "./burst-types.ts";

const writeTools = {
  CREATE_PRODUCT: "create_product_draft", UPDATE_PRODUCT: "update_product",
  CREATE_SUPPLIER: "create_supplier_draft", UPDATE_SUPPLIER: "update_supplier",
  PRESERVE_PRODUCT_FACTS: "preserve_product_facts",
} as const;

/** Intent belongs to the agent. The server verifies provenance and execution, never wording. */
export function assertMessageOutcomes(snapshot: BurstSnapshot, state: AgentState, receipts: AgentReceipt[], outcomes: AgentMessageOutcome[] = []) {
  const graph = state.ingestion;
  const active = graph?.loads.find(load => load.id === graph.activeLoadId);
  const messages = snapshot.messages.filter(m => ["TEXT", "AUDIO"].includes(m.envelope.type) && (!active || active.assetIds.includes(m.id)));
  const facts = state.agent.evidence.filter(e => e.role === "FACTS" && messages.some(m => m.id === e.messageId));
  const completed = receipts.filter(r => r.status === "COMPLETED");
  // Earlier revisions may already have completed part of a compound request.
  const resolved = (id: string) => state.agent.receipts.some(r => ["COMPLETED", "CANCELLED"].includes(r.status) && r.evidenceIds?.includes(id));
  for (const outcome of outcomes) {
    if (!messages.some(m => m.id === outcome.messageId)) throw new AgentToolError("INVALID_MESSAGE_ID", "outcomes requiere IDs de texto/audio del contexto actual");
    const tool = writeTools[outcome.action as keyof typeof writeTools];
    if (!tool) continue;
    const ownFacts = outcome.evidenceIds.filter(id => facts.some(e => e.id === id && e.messageId === outcome.messageId));
    if (!ownFacts.length || outcome.evidenceIds.some(id => !state.agent.evidence.some(e => e.id === id))) throw new AgentToolError("INVALID_REFERENCE", "Cada acción de escritura necesita sus FACTS preparados; copiá sus evidenceIds");
    if (!outcome.evidenceIds.every(id => completed.some(r => r.tool === tool && r.evidenceIds?.includes(id)))) throw new AgentToolError("UNFINISHED_OPERATION", "La acción interpretada todavía no tiene una escritura propia de ese tipo. Ejecutá la tool correspondiente o pedí aclaración; preparar evidencia o escribir otro recurso no completa el pedido");
  }
  for (const message of messages) {
    const decisions = outcomes.filter(o => o.messageId === message.id);
    const ownFacts = facts.filter(e => e.messageId === message.id);
    const nonWriting = decisions.some(o => o.action === "QUERY" || o.action === "NO_ACTION");
    const handled = ownFacts.length > 0 && ownFacts.every(e => resolved(e.id));
    const alreadyProcessed = graph?.loads.some(l => l.assetIds.includes(message.id) && (l.status === "PROCESSED" || l.resolution));
    if ((!decisions.length && !handled && !alreadyProcessed) || (!nonWriting && ownFacts.some(e => !resolved(e.id)))) throw new AgentToolError("UNFINISHED_OPERATION", "Interpretá el contenido completo del mensaje y la conversación. Indicá sus acciones en finish_turn.outcomes y ejecutá las escrituras pendientes. QUERY/NO_ACTION sólo corresponden a consultas o mensajes sin datos para registrar; una condición o comentario útil requiere guardar o pedir aclaración");
  }
}
