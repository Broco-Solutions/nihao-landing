import type { AgentState } from "./agent-contract.ts";
import type { BurstSnapshot } from "./burst-types.ts";
import type { LogicalLoad, EvidenceResolution } from "./ingestion-types.ts";
import { loadIdentity, messageIdentity, strongSupplierIdentity } from "./supplier-identity.ts";
import { updateGraphSummary, nextIngestionQuestion } from "./evidence-grouping.ts";

/** Preserve OCR, vision, error and original status. Resolution is an independent audit annotation. */
export function resolveHistoricalSnapshot(historical: BurstSnapshot, current: BurstSnapshot, resolved: LogicalLoad, timestamp = new Date().toISOString()): number {
  const graph = historical.state.ingestion;
  if (!graph || resolved.status !== "PROCESSED" || !resolved.resourceId || resolved.type !== "SUPPLIER") return 0;
  const identity = loadIdentity(current, resolved);
  let count = 0;
  for (const load of graph.loads) {
    if (load.id === resolved.id || load.resolution || load.status !== "NEEDS_REVIEW" || load.error?.type !== "AMBIGUOUS_CARD_READING") continue;
    const messages = historical.messages.filter(m => load.assetIds.includes(m.id));
    const match = strongSupplierIdentity(loadIdentity(historical, load), identity);
    // Later evidence must identify each asset, not just one member of a group.
    if (!match.matches || messages.some(m => !strongSupplierIdentity(messageIdentity(m), identity).matches)) continue;
    const metadata: EvidenceResolution = { status: "RESOLVED_BY_LATER_EVIDENCE", originalStatus: load.status, originalError: load.error, resolvedByAssetId: resolved.assetIds[0], resolvedByLoadId: resolved.id, resolvedByBurstId: current.id, resourceId: resolved.resourceId, timestamp, reason: "STRONG_SUPPLIER_IDENTITY", signals: match.reasons };
    load.resolution = metadata;
    for (const message of messages) {
      if (message.reading?.ingestion) message.reading.ingestion.resolution = { ...metadata, originalStatus: message.reading.ingestion.status, originalError: message.reading.ingestion.error };
      const asset = graph.assets.find(a => a.id === message.id); if (asset) asset.resolution = metadata;
    }
    count += messages.length;
  }
  updateGraphSummary(graph);
  const state = historical.state as AgentState;
  // Refresh only the pipeline's generated review question; preserve business/approval questions.
  if (count && state.agent?.pending?.type === "CLARIFICATION" && /^Quedaron \d+ evidencias para revisar/u.test(state.agent.pending.text)) {
    const question = nextIngestionQuestion(historical);
    state.agent.pending = question ? { ...state.agent.pending, text: question.question, options: question.options, associationSource: question.associationSource } : null;
    state.question = question?.question ?? null;
  }
  return count;
}
