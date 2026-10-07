import type { BurstEnvelope, BurstState } from "./burst-types.ts";
import type { AgentState } from "./agent-contract.ts";

/** WAITING is a suspended workflow, not an inbox for independent uploads. */
export function answersPending(envelope: BurstEnvelope, state: BurstState, questionMessageIds: string[] = []): boolean {
  const pending = (state as Partial<AgentState>).agent?.pending;
  if (!pending && !state.question) return false;
  if (envelope.quotedMessageId && questionMessageIds.includes(envelope.quotedMessageId)) return true;
  if (envelope.type !== "TEXT") return false;
  const text = envelope.text?.trim() ?? "";
  if (envelope.selectionId && pending?.options.length) return true; // signed picker is validated by selectedSupplierNumber
  if (/^\d+$/u.test(text)) return Boolean(pending?.options[Number(text) - 1]);
  if (pending?.type === "APPROVAL") return /^(?:sí|si|confirmo|confirmar|aprobar|cancelar|cancelo|no)[.!]?$/iu.test(text);
  if (/^reintentar[.!]?$/iu.test(text)) return true;
  // Exact displayed option or an explicit reference; never guess a free-form upload's intent.
  if (pending?.options.some(o => o.label.trim().toLowerCase() === text.toLowerCase())) return true;
  return /^(?:respuesta a (?:la |tu )?(?:pregunta|aclaración|aclaracion)|sobre (?:la |tu )?(?:pregunta|aclaración|aclaracion))\s*[:：]/iu.test(text);
}
