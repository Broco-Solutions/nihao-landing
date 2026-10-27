import { createHash } from "node:crypto";
import type { AgentDomain, AgentQuestion, AgentState } from "./agent-contract.ts";
import type { BurstCatalog, BurstSnapshot } from "./burst-types.ts";
import { canonicalJson } from "./agent-policy.ts";
import { renderClarification } from "./clarification-rendering.ts";
import { updateGraphSummary } from "./evidence-summary.ts";

export type ToolDisposition = "CLARIFICATION_REQUIRED" | "REPAIR_ARGUMENTS" | "REVIEW_REQUIRED";
const ambiguous = new Set(["AMBIGUOUS_TARGET", "AMBIGUOUS_REFERENCE", "CONTRADICTORY_USER_INSTRUCTION"]);
const review = new Set(["FORBIDDEN", "UNAUTHORIZED", "PENDING_TARGET_CONFLICT", "CLASSIFICATION_CORRECTION_REQUIRES_REVIEW", "TRIP_ENDED", "TOOL_BUDGET_EXHAUSTED"]);
export function toolDisposition(code: string): ToolDisposition {
  return ambiguous.has(code) ? "CLARIFICATION_REQUIRED" : review.has(code) ? "REVIEW_REQUIRED" : "REPAIR_ARGUMENTS";
}

/** Hashes only: never copy private arguments into metrics or rejection logs. */
export function rejectionKey(name: string, args: unknown, semanticState: string): string {
  return createHash("sha256").update(canonicalJson({ name, args, semanticState })).digest("hex");
}

/** A rejected business association suspends a durable task. It is not another
 * instruction for the model to retry, and cannot be vetoed by ask_clarification.
 * Candidate options are read again through the authorized domain. */
export async function suspendForBusinessDecision(input: {
  snapshot: BurstSnapshot; state: AgentState; catalog: BurstCatalog; domain: AgentDomain;
  tool: string; args: Record<string, unknown>; code: string;
}): Promise<void> {
  const { snapshot, state, catalog, domain, tool, args, code } = input;
  const kind = tool === "update_product" ? "PRODUCT" : "SUPPLIER";
  const active = state.ingestion?.loads.find(l => l.id === state.ingestion?.activeLoadId);
  const evidenceIds = Array.isArray(args.evidenceIds) ? args.evidenceIds.filter((id): id is string => typeof id === "string" && state.agent.evidence.some(e => e.id === id))
    : state.agent.evidence.filter(e => !active || active.assetIds.includes(e.messageId)).map(e => e.id);
  const sourceMessageIds = [...new Set(state.agent.evidence.filter(e => evidenceIds.includes(e.id)).map(e => e.messageId))];
  if (!sourceMessageIds.length) sourceMessageIds.push(...(active?.assetIds ?? snapshot.messages.filter(m => !state.controlIds.includes(m.id)).map(m => m.id)));
  const trip = catalog.trips.find(t => t.id === state.tripId) ?? (catalog.trips.length === 1 ? catalog.trips[0] : undefined);
  // The user must choose, even when a search happens to return one candidate.
  // A search hit is not evidence that this source belongs to that record.
  const candidates = code === "CONTRADICTORY_USER_INSTRUCTION" || !trip ? [] : await domain.search(snapshot, kind, trip.id, "");
  const options = candidates.filter(r => r.name?.trim()).slice(0, 20).map(r => ({ id: r.id, label: [r.name, r.companyLabel, r.city].filter(Boolean).join(" · ") }));
  const question: AgentQuestion = {
    type: "CLARIFICATION", revision: snapshot.revision, options, sourceMessageIds, evidenceIds,
    businessDecision: { code, tool, targetKind: kind },
    ...(active ? { loadId: active.id } : {}),
    text: code === "CONTRADICTORY_USER_INSTRUCTION"
      ? "¿Querés registrar esta información o conservarla sin registrar?"
      : `¿A qué ${kind === "PRODUCT" ? "producto" : "proveedor"} corresponden estos datos?${options.length ? " Elegí una opción o escribí su nombre." : " Escribí su nombre."} La información recibida queda conservada.`,
  };
  state.agent.pending = question;
  state.agent.seenIds = [...new Set([...state.agent.seenIds, ...options.map(o => o.id)])];
  state.question = renderClarification(question);
  // One completed effect cannot settle all intentions in the same source.
  for (const load of state.ingestion?.loads ?? []) {
    if (load.resolution || !load.assetIds.some(id => sourceMessageIds.includes(id))) continue;
    load.status = "GROUPED"; load.question = question; load.questionText = state.question;
    load.error = undefined;
  }
  if (state.ingestion) updateGraphSummary(state.ingestion);
  state.agent.terminal = { revision: snapshot.revision, response: "" };
}
