import test from "node:test";
import assert from "node:assert/strict";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { agentState, type AgentDomain, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { buildEvidenceGraph } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import { deterministicConversationIntent, pureDeterministicConversationIntent } from "../../lib/channels/whatsapp/conversation-intent.ts";
import type { BurstCatalog, BurstSnapshot, BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";

const catalog: BurstCatalog = { trips: [{ id: "trip", name: "Feria", companies: [{ id: "company", name: "Empresa" }] }] };

function snapshot(text: string, previous?: AgentState): BurstSnapshot {
  const sequence = (previous?.evaluatedRevision ?? 0) + 1;
  const state = previous ?? agentState({ tripId: "trip", groups: [], question: null, controlIds: [], pendingRefs: [] });
  return {
    id: "conversation", instance: "test", phone: "5490000000000", userId: "user", revision: sequence, leaseId: "lease", status: "PROCESSING", state,
    messages: [{ id: `message-${sequence}`, sequence, sentAt: null, envelope: { instance: "test", phone: "5490000000000", messageId: `external-${sequence}`, type: "TEXT", text, media: null, sentAt: null }, reading: null }],
  };
}

async function run(current: BurstSnapshot) {
  let claimed = false;
  let reply = "";
  let modelRuns = 0;
  let reads = 0;
  let writes = 0;
  const domain: AgentDomain = {
    async search() { return []; },
    async get() { throw new Error("unused"); },
    async write() { writes++; throw new Error("A conversation control must not write"); },
    async pending() { return []; },
    async resolve() { throw new Error("unused"); },
    async receipts() { return []; },
    async displayed() {},
  };
  const store = {
    async claim() { if (claimed) return []; claimed = true; return [current]; },
    async catalog() { return catalog; },
    async saveReading() { reads++; },
    async finish(_snapshot: BurstSnapshot, state: AgentState, text: string) { current.state = structuredClone(state); reply = text; },
    async retry() { assert.fail("A deterministic conversation must finish"); },
    async flushReplies() {},
  } as unknown as BurstStore;
  const service = new WhatsAppAgentService({
    ingestion: true,
    store,
    domain,
    orchestrator: { async run() { modelRuns++; throw new Error("A deterministic conversation must not call the model"); } } as never,
    async save(_id, _revision, _lease, state) { current.state = structuredClone(state); return true; },
    reader: { async read() { reads++; throw new Error("A deterministic conversation must not enter ingestion"); } },
    async send() {},
  });
  await service.processDue(1);
  return { reply, state: current.state as AgentState, modelRuns, reads, writes };
}

test("presence, out-of-scope and negative controls are typed without replacing semantic capture", () => {
  assert.equal(deterministicConversationIntent("¿Estás ahí?")?.kind, "PRESENCE");
  assert.equal(deterministicConversationIntent("Quiero un itinerario turístico por China con hoteles y trenes")?.kind, "OUT_OF_SCOPE");
  assert.equal(deterministicConversationIntent("No lo registres y no continúes")?.kind, "DO_NOT_STORE");
  assert.equal(deterministicConversationIntent("Sin registrar y no continúes, dale avanzamos")?.kind, "CONTRADICTORY_CONTROL");
  assert.equal(deterministicConversationIntent("PANLOS FOB USD 9 y MOQ 500"), null);
});

test("a presence query bypasses ingestion, model and writes while an older clarification stays intact", async () => {
  const previous = agentState({ tripId: "trip", groups: [], question: "¿A qué proveedor corresponde la foto?", controlIds: [], pendingRefs: [], evaluatedRevision: 1 });
  previous.agent.pending = { type: "CLARIFICATION", revision: 1, text: previous.question!, options: [], loadId: "old-load" };
  previous.ingestion = {
    version: 1, revision: 1, links: [], derivations: [],
    assets: [{ id: "old-image", type: "IMAGE", status: "GROUPED", loadIds: ["old-load"] }],
    loads: [{ id: "old-load", type: "EVIDENCE", assetIds: ["old-image"], name: null, status: "GROUPED", reasons: [] }],
    summary: { totalAssets: 1, totalLogicalLoads: 1, processed: 0, pending: 1, needsReview: 0, failed: 0 },
  };
  const current = snapshot("¿Estás ahí?", previous);
  current.messages.unshift({ id: "old-image", sequence: 1, sentAt: null, envelope: { instance: "test", phone: current.phone, messageId: "old-external", type: "IMAGE", text: null, media: null, sentAt: null }, reading: null });
  const result = await run(current);
  assert.match(result.reply, /Sí, acá estoy/u);
  assert.equal(result.modelRuns, 0);
  assert.equal(result.reads, 0);
  assert.equal(result.writes, 0);
  assert.deepEqual(result.state.controlIds, ["message-2"]);
  assert.equal(result.state.ingestion?.summary.pending, 1);
  assert.equal(result.state.agent.pending?.loadId, "old-load");
});

test("the real non-commercial sequence never becomes commercial evidence", async () => {
  for (const [text, kind] of [
    ["Quiero organizar un viaje a China. Necesito un itinerario completo con hoteles, trenes y actividades turísticas.", "OUT_OF_SCOPE"],
    ["Sin registrar y no continúes, dale avanzamos", "CONTRADICTORY_CONTROL"],
    ["¿Estás ahí?", "PRESENCE"],
    ["Y???", "FOLLOW_UP"],
  ] as const) {
    const current = snapshot(text);
    assert.equal(pureDeterministicConversationIntent(current)?.intent.kind, kind);
    const result = await run(current);
    assert.equal(result.modelRuns, 0, text);
    assert.equal(result.reads, 0, text);
    assert.equal(result.writes, 0, text);
    assert.equal(result.state.ingestion, undefined, text);
    assert.deepEqual(result.state.controlIds, ["message-1"], text);
  }
});

test("control messages remain processed and load-free if a later commercial turn rebuilds the graph", () => {
  const current = snapshot("¿Estás ahí?");
  current.state.controlIds = ["message-1"];
  current.messages[0].reading = { complete: true, segments: [] };
  current.state.ingestion = buildEvidenceGraph(current);
  assert.equal(current.state.ingestion.loads.length, 0);
  assert.equal(current.state.ingestion.assets[0].id, "message-1");
  assert.equal(current.state.ingestion.assets[0].status, "PROCESSED");
  assert.deepEqual(current.state.ingestion.assets[0].loadIds, []);
  assert.equal(current.state.ingestion.summary.pending, 0);
});
