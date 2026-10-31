import test from "node:test";
import assert from "node:assert/strict";
import { processingOutcome } from "../../lib/channels/whatsapp/processing-outcome.ts";
import { agentState, AgentCheckpoint, AgentToolError, type AgentDomain } from "../../lib/channels/whatsapp/agent-contract.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { resolveConversationSupplier } from "../../lib/channels/whatsapp/conversation-association.ts";
import { recordReceipt } from "../../lib/channels/whatsapp/agent-tools.ts";
import { suspendForBusinessDecision, toolDisposition } from "../../lib/channels/whatsapp/business-transition.ts";
import { functionalToolErrorFinding } from "../../lib/channels/whatsapp/operational-monitor.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

function snapshot(): BurstSnapshot {
  return { id: "burst", userId: "user", instance: "test", phone: "123", revision: 1, leaseId: "lease", status: "PROCESSING", state: { tripId: "trip", groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: [{ id: "message", sequence: 1, sentAt: null, reading: null, envelope: { instance: "test", messageId: "external", phone: "123", type: "TEXT", text: "Proveedor Telar Azul. MOQ 300 unidades", media: null, sentAt: null } }] };
}
const extraction = { async extractReading(text: string) { return { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text } }; } };
const domain: AgentDomain = { async search() { return []; }, async get() { throw new AgentToolError("NOT_FOUND", "missing"); }, async write() { assert.fail("no writes authorized"); }, async receipts() { return []; }, async pending() { return []; }, async displayed() {}, async resolve() { assert.fail(); } };

test("supplier identity business errors become durable clarification instead of functional failure", () => {
  for (const code of ["PRODUCT_CANNOT_CREATE_SUPPLIER", "PRODUCT_REQUIRES_SUPPLIER", "MISSING_SUPPLIER", "FUZZY_SUPPLIER_REQUIRES_SELECTION"]) {
    assert.equal(toolDisposition(code), "CLARIFICATION_REQUIRED", code);
  }
  for (const code of ["INVALID_REFERENCE", "MISSING_FACTS", "SUPPLIER_ALREADY_IDENTIFIED"]) {
    assert.equal(toolDisposition(code), "REPAIR_ARGUMENTS", code);
  }
});

test("a product source that cannot create a supplier becomes an authorized supplier clarification", async () => {
  const s = snapshot();
  const state = agentState(s.state);
  state.tripId = "trip";
  state.agent.evidence = [{
    id: "evidence",
    messageId: "message",
    start: 0,
    end: 20,
    text: "Producto Taladro",
    role: "FACTS",
    candidate: { extractedFields: {}, reviewFields: [], evidence: [], rawSource: { type: "TEXT", text: "Producto Taladro" } },
  }];
  await suspendForBusinessDecision({
    snapshot: s,
    state,
    catalog: { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }] }] },
    domain: {
      ...domain,
      async search() {
        return [{ id: "supplier", captureId: "capture", kind: "SUPPLIER", tripId: "trip", companyId: "company", name: "Proveedor Alfa", status: "CONFIRMED", version: "1", data: {} }];
      },
    },
    tool: "create_supplier_draft",
    args: { evidenceIds: ["evidence"] },
    code: "PRODUCT_CANNOT_CREATE_SUPPLIER",
  });
  assert.equal(state.agent.pending?.businessDecision?.code, "PRODUCT_CANNOT_CREATE_SUPPLIER");
  assert.equal(state.agent.pending?.businessDecision?.targetKind, "SUPPLIER");
  assert.equal(state.agent.pending?.options[0]?.id, "supplier");
  assert.deepEqual(state.agent.pending?.sourceMessageIds, ["message"]);
  assert.match(state.question ?? "", /proveedor/u);
});

test("same-source identity requires explicit unique name, never source proximity or a homonym", () => {
  const s = snapshot(); const refs = [{ id: "a", name: "Telar Azul", messageIds: ["message"] }];
  assert.equal(resolveConversationSupplier(s, "message", s.messages[0].envelope.text!, refs).id, "a");
  assert.equal(resolveConversationSupplier(s, "message", "MOQ 300 unidades", refs).id, undefined);
  assert.equal(resolveConversationSupplier(s, "message", "Proveedor Telar Azul", [...refs, { ...refs[0], id: "b" }]).ambiguous, true);
  assert.equal(resolveConversationSupplier(s, "message", "Proveedor Otro", refs).id, undefined);
  s.messages.unshift({ ...s.messages[0], id: "earlier", sequence: 0 });
  assert.equal(resolveConversationSupplier(s, "message", "Telar Azul y Otro", [...refs, { id: "b", name: "Otro", messageIds: ["earlier"] }]).ambiguous, true);
});

test("ingestion COMPLETED plus a supplier receipt cannot declare a product or commercial completion on error", () => {
  const state = agentState(snapshot().state);
  state.ingestion = { version: 1, revision: 1, assets: [], loads: [], links: [], derivations: [], summary: { totalAssets: 1, totalLogicalLoads: 1, processed: 1, pending: 0, failed: 0, needsReview: 0 } };
  state.agent.receipts = [{ operationId: "op", id: "supplier", tool: "create_supplier_draft", status: "COMPLETED", resourceStatus: "DRAFT" }];
  state.agent.termination = { reason: "tool_error", errorCode: "AMBIGUOUS_TARGET", revision: 1, rounds: 11 };
  assert.deepEqual(processingOutcome(state), { ingestionStatus: "COMPLETED", commercialStatus: "REVIEW_REQUIRED", supplierWrites: 1, productWrites: 0, preservedFacts: 0, pendingFacts: 0, drafts: 1 });
});

test("preserving terms is not a product receipt and cannot complete a PRODUCT load", () => {
  const state = agentState(snapshot().state);
  state.ingestion = { version: 1, revision: 1, assets: [{ id: "message", type: "TEXT", status: "GROUPED", loadIds: ["product"] }], loads: [{ id: "product", type: "PRODUCT", name: null, assetIds: ["message"], status: "GROUPED", reasons: [] }], links: [], derivations: [], summary: { totalAssets: 1, totalLogicalLoads: 1, processed: 0, pending: 1, failed: 0, needsReview: 0 } };
  recordReceipt(state, { operationId: "pending", id: "pending", tool: "preserve_product_facts", status: "COMPLETED", logicalLoadIds: ["product"] });
  assert.equal(state.ingestion.loads[0].status, "GROUPED");
  assert.equal(processingOutcome(state).productWrites, 0);
});

test("deterministic rejected calls survive restart and are never executed twice with unchanged semantic state", async () => {
  const s = snapshot(); let reads = 0; let crash = true; let calls = 0;
  const runner = new WhatsAppAgentOrchestrator({ domain: { ...domain, async get() { reads++; throw new AgentToolError("NOT_FOUND", "missing"); } }, extraction, client: { async post() {
    return { choices: [{ message: { role: "assistant", tool_calls: [{ id: `call-${++calls}`, type: "function", function: { name: "get_supplier", arguments: '{"id":"missing"}' } }] } }] };
  } } });
  await assert.rejects(runner.run(s, { trips: [] }, async state => { if (crash && state.agent.rejections?.length) { crash = false; throw new AgentCheckpoint(); } }), AgentCheckpoint);
  const final = await runner.run(s, { trips: [] }, async () => {});
  assert.equal(reads, 1);
  assert.equal(calls, 2);
  assert.equal(final.state.agent.termination?.reason, "tool_error");
  assert.equal(final.state.agent.termination?.errorCode, "NOT_FOUND");
  assert.equal(final.state.agent.pending?.terminalFailure, true);
  assert.equal(final.state.agent.budget?.modelCalls, 2);
});

test("a repeated INVALID_QUOTE degrades to durable review without a critical functional alert", async () => {
  const s = snapshot();
  s.messages[0].envelope.text = "Taladro Taladro";
  let calls = 0;
  const runner = new WhatsAppAgentOrchestrator({ domain, extraction, client: { async post() {
    calls++;
    return { choices: [{ message: { role: "assistant", tool_calls: [{ id: `quote-${calls}`, type: "function", function: { name: "prepare_evidence", arguments: JSON.stringify({ sources: [{ messageId: "message", quote: "Taladro", role: "FACTS" }] }) } }] } }] };
  } } });
  const final = await runner.run(s, { trips: [] }, async () => {});
  assert.equal(calls, 2);
  assert.equal(final.state.agent.termination?.reason, "no_progress");
  assert.equal(final.state.agent.termination?.errorCode, "INVALID_QUOTE");
  assert.equal(final.state.agent.pending?.terminalFailure, true);
  assert.equal(functionalToolErrorFinding({ id: "burst", status: "WAITING", createdAt: new Date(), processingFinishedAt: new Date(), lastErrorAt: null, state: final.state, operations: [], replies: [] }, new Date()), null);
});

test("a second UNFINISHED_OPERATION degrades to durable review without a critical functional alert", async () => {
  const s = snapshot();
  const state = agentState(s.state); s.state = state;
  state.agent.evidence = [{
    id: "evidence",
    messageId: "message",
    start: 0,
    end: s.messages[0].envelope.text!.length,
    text: s.messages[0].envelope.text!,
    role: "FACTS",
    candidate: { extractedFields: {}, reviewFields: [], evidence: [], rawSource: { type: "TEXT", text: s.messages[0].envelope.text! } },
  }];
  state.agent.resolvedRecords = [{ id: "supplier", kind: "SUPPLIER", version: "1" }];
  let calls = 0;
  const runner = new WhatsAppAgentOrchestrator({ domain, extraction, client: { async post() {
    calls++;
    return { choices: [{ message: { role: "assistant", tool_calls: [{ id: `finish-${calls}`, type: "function", function: { name: "finish_turn", arguments: JSON.stringify({ response: null, guidance: null, outcomes: [{ messageId: "message", action: "CREATE_PRODUCT", evidenceIds: ["evidence"] }] }) } }] } }] };
  } } });
  const final = await runner.run(s, { trips: [] }, async () => {});
  assert.equal(calls, 2);
  assert.equal(final.state.agent.termination?.reason, "no_progress");
  assert.equal(final.state.agent.termination?.errorCode, "UNFINISHED_OPERATION");
  assert.equal(final.state.agent.pending?.terminalFailure, true);
  assert.equal(functionalToolErrorFinding({ id: "burst", status: "WAITING", createdAt: new Date(), processingFinishedAt: new Date(), lastErrorAt: null, state: final.state, operations: [], replies: [] }, new Date()), null);
});

test("request spend is reserved before a crash and a saturated budget cannot reset at restart", async () => {
  const s = snapshot(); const state = agentState(s.state); s.state = state;
  state.agent.historyRevision = 1;
  state.agent.budget = { revision: 1, modelCalls: 12, inputTokens: 42, outputTokens: 10, durationMs: 1, usageComplete: false };
  const runner = new WhatsAppAgentOrchestrator({ domain, extraction, client: { async post() { assert.fail("budget already consumed"); } } });
  const result = await runner.run(s, { trips: [] }, async () => {});
  assert.equal(result.state.agent.budget?.modelCalls, 12);
  assert.equal(result.state.agent.termination?.errorCode, "AGENT_BUDGET_EXHAUSTED");
  assert.equal(result.state.agent.pending?.terminalFailure, true);
});

test("normal durable clarification does not become a functional critical incident", () => {
  assert.equal(functionalToolErrorFinding({ id: "burst", status: "WAITING", createdAt: new Date(), processingFinishedAt: new Date(), lastErrorAt: null, state: { agent: { termination: { reason: "asked_clarification" }, pending: { businessDecision: { code: "AMBIGUOUS_TARGET" } } } }, operations: [], replies: [] }, new Date()), null);
});

test("an already applied preservation is counted separately from still pending facts", () => {
  const state = agentState(snapshot().state);
  state.agent.termination = { revision: 1, rounds: 0, reason: "completed" };
  state.agent.receipts = [{ id: "pending", operationId: "pending", tool: "preserve_product_facts", status: "COMPLETED", data: { pendingStatus: "APPLIED" } }];
  const outcome = processingOutcome(state);
  assert.equal(outcome.preservedFacts, 1);
  assert.equal(outcome.pendingFacts, 0);
  assert.equal(outcome.productWrites, 0);
  assert.equal(outcome.commercialStatus, "NO_COMMERCIAL_WRITE");
});

test("a retryable provider failure remains a recovery state rather than a completed write or terminal review", () => {
  const state = agentState(snapshot().state);
  state.agent.termination = { reason: "model_error", revision: 1, rounds: 1 };
  state.ingestion = { version: 1, revision: 1, assets: [], links: [], derivations: [], loads: [{ id: "load", assetIds: ["message"], type: "EVIDENCE", name: null, status: "PENDING_RETRY", reasons: [], error: { type: "PROVIDER_TIMEOUT", retryable: true, stage: "business" } }], summary: { totalAssets: 1, totalLogicalLoads: 1, pending: 1, processed: 0, needsReview: 0, failed: 0 } };
  assert.equal(processingOutcome(state).commercialStatus, "RETRY_PENDING");
  assert.equal(processingOutcome(state).productWrites, 0);
});

test("a provider returning many tool calls cannot exceed the tool budget inside one response", async () => {
  let reads = 0;
  const runner = new WhatsAppAgentOrchestrator({ domain: { ...domain, async get(_snapshot, _kind, id) {
    reads++;
    return { id, captureId: id, kind: "SUPPLIER", name: id, tripId: "trip", companyId: "company", version: "1", status: "CONFIRMED", data: {} };
  } }, extraction, client: { async post() {
    return { choices: [{ message: { role: "assistant", tool_calls: Array.from({ length: 20 }, (_, i) => ({ id: `call-${i}`, type: "function", function: { name: "get_supplier", arguments: JSON.stringify({ id: `supplier-${i}` }) } })) } }] };
  } } });
  const final = await runner.run(snapshot(), { trips: [] }, async () => {});
  assert.equal(reads, 16);
  assert.equal(final.state.agent.termination?.errorCode, "TOOL_BUDGET_EXHAUSTED");
  assert.equal(final.state.agent.pending?.terminalFailure, true);
});
