import type { AgentReceipt, AgentState } from "./agent-contract.ts";

/** Ingestion progress is never a commercial receipt. All consumers use the
 * same precedence; the caller supplies durable operations when reading Web. */
export function processingOutcome(state: Partial<AgentState>, receipts: AgentReceipt[] = state.agent?.receipts ?? []) {
  const termination = state.agent?.termination;
  const pending = state.agent?.pending;
  const summary = state.ingestion?.summary;
  const done = [...new Map(receipts.filter(r => r.status === "COMPLETED").map(r => [r.operationId, r])).values()];
  const supplierWrites = done.filter(r => ["create_supplier_draft", "update_supplier", "resolve_existing_resource"].includes(r.tool)).length;
  const productWrites = done.filter(r => ["create_product_draft", "update_product", "resolve_existing_product"].includes(r.tool)).length;
  const preserved = done.filter(r => r.tool === "preserve_product_facts");
  const preservedFacts = preserved.length;
  const pendingFacts = preserved.filter(r => r.data?.pendingStatus !== "APPLIED").length;
  const drafts = done.filter(r => r.resourceStatus === "DRAFT").length;
  const transient = state.ingestion?.loads.some(l => l.status === "PENDING_RETRY" && l.error?.retryable);
  const failed = termination && ["tool_error", "no_progress", "max_rounds", "model_error"].includes(termination.reason);
  const commercialStatus = pending?.terminalFailure || failed && !transient ? "REVIEW_REQUIRED"
    : transient ? "RETRY_PENDING"
    : state.question || pending ? "AWAITING_CLARIFICATION"
    : summary?.failed || summary?.needsReview ? "REVIEW_REQUIRED"
    : summary?.pending ? "PROCESSING"
    : pendingFacts ? "FACTS_PRESERVED"
    : drafts ? "DRAFT_RECORDED"
    : supplierWrites + productWrites > 0 ? "RECORDED"
    : termination?.reason === "completed" ? "NO_COMMERCIAL_WRITE" : "PROCESSING";
  const ingestionStatus = !summary ? "UNKNOWN" : summary.failed ? "FAILED" : summary.needsReview ? "NEEDS_REVIEW" : summary.pending ? "PARTIAL" : "COMPLETED";
  return { ingestionStatus, commercialStatus, supplierWrites, productWrites, preservedFacts, pendingFacts, drafts };
}
