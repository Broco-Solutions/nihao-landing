import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { AGENT_TOOLS, agentState, type AgentChatMessage, type AgentDomain } from "../../lib/channels/whatsapp/agent-contract.ts";
import { WhatsAppAgentOrchestrator, WHATSAPP_AGENT_PROMPT, WHATSAPP_AGENT_CLARIFICATION_PROMPT, WHATSAPP_AGENT_MEMORY_PROMPT } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { buildEvidenceGraph } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

test("prompt refactor preserves all fifteen tool names, strict flags and argument schemas", () => {
  const contract = AGENT_TOOLS.map(({ function: tool }) => ({ name: tool.name, strict: tool.strict, parameters: tool.parameters }));
  assert.equal(contract.length, 15);
  // Fingerprint captured before editing descriptions; no business contract change is allowed.
  assert.equal(createHash("sha256").update(JSON.stringify(contract)).digest("hex"), "002a7feedecfa87c247ef32452996fcd82dcdb03f532d6dbfde27d6fdb7fa371");
});

for (const scenario of [
  { pending: false, memory: false, supportsMemory: true },
  { pending: true, memory: false, supportsMemory: true },
  { pending: false, memory: true, supportsMemory: true },
  { pending: true, memory: true, supportsMemory: true },
  { pending: false, memory: true, supportsMemory: false },
]) test(`system composition and initial context: ${JSON.stringify(scenario)}`, async () => {
  const text = scenario.memory ? "Consulta sobre ese producto" : "Consulta de ayuda";
  const snapshot: BurstSnapshot = {
    id: "burst", instance: "test", phone: "5491112345678", userId: "user", revision: 1, status: "PROCESSING", leaseId: "lease",
    state: { tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] },
    messages: [{ id: "message", sequence: 1, sentAt: null, envelope: { instance: "test", phone: "5491112345678", messageId: "message", type: "TEXT", text, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: "segment", text }] } }],
  };
  const state = agentState(snapshot.state);
  if (scenario.pending) state.agent.pending = { type: "CLARIFICATION", text: "¿Qué proveedor?", revision: 0, options: [] };
  snapshot.state = state;
  state.ingestion = buildEvidenceGraph(snapshot);
  state.ingestion.activeLoadId = state.ingestion.loads[0].id;
  const domain: AgentDomain = {
    async search() { assert.fail("Initial operationalContext is sufficient"); },
    async get() { assert.fail("No record read needed for guidance"); },
    async write() { assert.fail("No writes in prompt composition test"); },
    async pending() { return []; }, async resolve() { assert.fail("No proposal"); }, async receipts() { return []; }, async displayed() {},
    ...(scenario.supportsMemory ? { async recentMemory() { return []; } } : {}),
  };
  let calls = 0;
  const runner = new WhatsAppAgentOrchestrator({ domain, extraction: { async extractReading() { assert.fail("Evidence is already read"); } }, client: { async post(_path, body) {
    calls++;
    const messages = (body as { messages: AgentChatMessage[] }).messages;
    const expected = [WHATSAPP_AGENT_PROMPT, ...(scenario.pending ? [WHATSAPP_AGENT_CLARIFICATION_PROMPT] : []), ...(scenario.memory && scenario.supportsMemory ? [WHATSAPP_AGENT_MEMORY_PROMPT] : [])].join("\n");
    assert.equal(messages[0].role, "system");
    assert.equal(messages[0].content, expected);
    const input = JSON.parse(messages[1].content!);
    assert.equal(input.operationalContext.selectedTripId, "trip");
    assert.equal(input.operationalContext.selectedCompanyId, "company");
    assert.equal(input.activeLoadId, state.ingestion!.activeLoadId);
    assert.deepEqual(input.logicalLoads, JSON.parse(JSON.stringify(state.ingestion!.loads)));
    assert.equal(input.evidence[0].text, text);
    assert.equal(input.evidence[0].contextOnly, false);
    return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "finish", type: "function", function: { name: "finish_turn", arguments: JSON.stringify({ response: null, guidance: true }) } }] } }] };
  } } });
  await runner.run(snapshot, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco Solutions" }] }] }, async updated => { snapshot.state = updated; });
  assert.equal(calls, 1);
});
