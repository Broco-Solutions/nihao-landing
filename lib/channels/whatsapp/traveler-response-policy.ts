import type { AgentReceipt } from "./agent-contract.ts";
import { renderSavedResults } from "./clarification-rendering.ts";

const internalMarkers = [
  "UNFINISHED_OPERATION", "UNVERIFIED_RESPONSE", "INVALID_REFERENCE", "MISSING_FACTS",
  "finish_turn", "create_supplier_draft", "create_product_draft", "update_supplier", "update_product",
  "/app/viajes/", "burstId", "operationId", "stack trace",
];

const completed = (receipts: AgentReceipt[]) => receipts.filter((receipt) => receipt.status === "COMPLETED");

/** All operational failures are translated from durable receipts, never from an internal error payload. */
export function renderReviewRequiredOutcome(receipts: AgentReceipt[]): string {
  const saved = renderSavedResults(completed(receipts));
  if (saved) return `${saved}\n\nNo hace falta volver a enviar el mensaje.`;
  return "No pude completar el registro de esta información. Abrí Nihao → tu viaje → Pendientes para revisarla. No hace falta volver a enviar el mensaje.";
}

export function renderRetryableProcessingOutcome(receipts: AgentReceipt[]): string {
  const saved = renderSavedResults(completed(receipts));
  const retry = "El procesamiento necesita continuar. Respondé *REINTENTAR* y voy a retomar lo pendiente.";
  return [saved, retry].filter(Boolean).join("\n\n");
}

/** Defense in depth for legacy/error paths. Normal responses are built safely above. */
export function safeTravelerResponse(text: string, receipts: AgentReceipt[]): string {
  const carriesInternalPayload = internalMarkers.some((marker) => text.toLocaleLowerCase("es").includes(marker.toLocaleLowerCase("es")))
    || /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/iu.test(text)
    || /\{\s*"[^"\n]+"\s*:/u.test(text);
  return carriesInternalPayload
    ? renderReviewRequiredOutcome(receipts)
    : text;
}
