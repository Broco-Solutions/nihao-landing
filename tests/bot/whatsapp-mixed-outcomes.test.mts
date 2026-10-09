import test from "node:test";
import assert from "node:assert/strict";
import { AgentTools } from "../../lib/channels/whatsapp/agent-tools.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { agentState, type AgentDomain, type AgentMessageOutcome, type AgentReceipt } from "../../lib/channels/whatsapp/agent-contract.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

const extraction = { async extractReading(text: string) { return { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text } }; } };
function setup(text = "Actualizá MOQ 500 a Botellas. ¿Cuál es su FOB?") {
  const snapshot: BurstSnapshot = { id: "mixed", instance: "test", phone: "123", userId: "user", revision: 1, leaseId: "lease", status: "PROCESSING", state: { tripId: "trip", groups: [], pendingRefs: [], controlIds: [], question: null }, messages: [{ id: "m", sequence: 1, sentAt: null, envelope: { instance: "test", phone: "123", messageId: "m", type: "TEXT", text, media: null, sentAt: null }, reading: { complete: true, segments: [] } }] };
  const state = agentState(snapshot.state); snapshot.state = state;
  const domain: AgentDomain = { async search() { return []; }, async get() { return { id: "p", captureId: "capture", kind: "PRODUCT", tripId: "trip", companyId: "company", name: "Botellas", status: "CONFIRMED", version: "v", data: { fob: { amount: 8, currency: "USD", unit: "unidad" } } }; }, async write() { throw new Error("not used"); }, async pending() { return []; }, async resolve() { throw new Error("not used"); }, async receipts() { return state.agent.receipts; }, async displayed() {} };
  const tools = new AgentTools({ domain, extraction, catalog: { trips: [] }, async checkpoint() {} });
  const prepare = async (quote?: string) => (await tools.execute("prepare_evidence", { sources: [{ messageId: "m", role: "FACTS", ...(quote ? { quote } : {}) }] }, snapshot, state) as { evidence: { id: string }[] }).evidence.map(e => e.id);
  const read = async () => {
    const result = await tools.execute("get_product", { id: "p" }, snapshot, state);
    state.agent.calls.push({ name: "get_product", result, revision: snapshot.revision, logicalLoadId: state.ingestion?.activeLoadId });
    return result;
  };
  const receipt = (tool: string, evidenceIds: string[], id = "p", status = "COMPLETED") => state.agent.receipts.push({ operationId: id, tool, id, name: "Botellas", status, evidenceIds, completedRevision: 1 } satisfies AgentReceipt);
  const render = async () => (await new WhatsAppAgentOrchestrator({ domain, extraction, client: { async post() { assert.fail("A terminal checkpoint must not call the model"); } } }).run(snapshot, { trips: [] }, async () => {})).text;
  return { snapshot, state, tools, prepare, read, receipt, render };
}
const query: AgentMessageOutcome = { messageId: "m", action: "QUERY", evidenceIds: [] };

for (const [tool, action, text, answer] of [
  ["update_product", "UPDATE_PRODUCT", "Actualizá MOQ 500 a Botellas. ¿Cuál es su FOB?", "FOB registrado: USD 8 por unidad"],
  ["create_product_draft", "CREATE_PRODUCT", "Creá Escritorio FOB 45. ¿Qué ciudad tiene este proveedor?", "Ciudad: Shenzhen"],
] as const) test(`${action} + QUERY composes receipt summary and factual response exactly once`, async () => {
  const f = setup(text); const evidenceIds = await f.prepare(); f.receipt(tool, evidenceIds); await f.read();
  await f.tools.execute("finish_turn", { response: answer, outcomes: [{ messageId: "m", action, evidenceIds }, query] }, f.snapshot, f.state);
  const textOut = await f.render();
  assert.match(textOut, tool === "update_product" ? /actualizado/ : /1 producto cargado/);
  assert.equal(textOut.split(answer).length - 1, 1);
  assert.equal(f.tools.response, answer);
});

test("multiple writes and multiple queries retain every completed effect", async () => {
  const f = setup("Botellas MOQ 500. Escritorio FOB 45. ¿Cuál es el FOB? ¿Y la ciudad?");
  const first = await f.prepare("Botellas MOQ 500."); const second = await f.prepare("Escritorio FOB 45.");
  f.receipt("update_product", first); f.receipt("create_product_draft", second, "desk"); await f.read();
  const response = "FOB de Botellas: USD 8. Ciudad del proveedor: Shenzhen.";
  await f.tools.execute("finish_turn", { response, outcomes: [{ messageId: "m", action: "UPDATE_PRODUCT", evidenceIds: first }, { messageId: "m", action: "CREATE_PRODUCT", evidenceIds: second }, query, query] }, f.snapshot, f.state);
  const rendered = await f.render(); assert.match(rendered, /actualizado/); assert.match(rendered, /1 producto cargado/); assert.equal(rendered.split(response).length - 1, 1);
});

test("query cannot mask another unresolved FACTS slice in a compound write", async () => {
  const f = setup("Botellas MOQ 500. Escritorio FOB 45. ¿Cuál es el FOB?");
  const first = await f.prepare("Botellas MOQ 500."); await f.prepare("Escritorio FOB 45."); f.receipt("update_product", first); await f.read();
  await assert.rejects(f.tools.execute("finish_turn", { response: "FOB: USD 8", outcomes: [{ messageId: "m", action: "UPDATE_PRODUCT", evidenceIds: first }, query] }, f.snapshot, f.state), { code: "UNFINISHED_OPERATION" });
});

test("write only has no empty query block, query only keeps its current rendering", async () => {
  const write = setup("El MOQ es 300"); const evidenceIds = await write.prepare(); write.receipt("update_product", evidenceIds);
  await write.tools.execute("finish_turn", { response: null, outcomes: [{ messageId: "m", action: "UPDATE_PRODUCT", evidenceIds }] }, write.snapshot, write.state);
  assert.equal(write.tools.response, ""); assert.equal(await write.render(), "✅ Producto «Botellas» actualizado.");
  const read = setup("¿Cuál es el FOB?"); await read.read();
  await read.tools.execute("finish_turn", { response: "✅ FOB: USD 8", outcomes: [query] }, read.snapshot, read.state);
  assert.equal(await read.render(), "✅ FOB: USD 8");
});

test("missing query data does not undo a valid write or invent a value", async () => {
  const f = setup(); const evidenceIds = await f.prepare(); f.receipt("update_product", evidenceIds);
  const outcomes = [{ messageId: "m", action: "UPDATE_PRODUCT" as const, evidenceIds }, query];
  await assert.rejects(f.tools.execute("finish_turn", { response: "FOB: USD 999", outcomes }, f.snapshot, f.state), { code: "UNVERIFIED_QUERY_RESPONSE" });
  f.state.agent.calls.push({ name: "get_product", revision: 1, result: { error: "UNAVAILABLE" } });
  await f.tools.execute("finish_turn", { response: null, outcomes }, f.snapshot, f.state);
  const rendered = await f.render(); assert.match(rendered, /actualizado/); assert.match(rendered, /No pude verificar los datos de la consulta/); assert.doesNotMatch(rendered, /USD/);
});

test("a failed write has no success receipt; safe independent query can still answer", async () => {
  const f = setup(); const evidenceIds = await f.prepare(); f.receipt("update_product", evidenceIds, "p", "FAILED"); await f.read();
  await assert.rejects(f.tools.execute("finish_turn", { response: "FOB: USD 8", outcomes: [{ messageId: "m", action: "UPDATE_PRODUCT", evidenceIds }, query] }, f.snapshot, f.state), { code: "UNFINISHED_OPERATION" });
  await f.tools.execute("finish_turn", { response: "FOB: USD 8", outcomes: [query] }, f.snapshot, f.state);
  assert.equal(await f.render(), "FOB: USD 8");
});

test("completed write still requires a factual response when QUERY got results", async () => {
  const f = setup(); const evidenceIds = await f.prepare(); f.receipt("update_product", evidenceIds); await f.read();
  await assert.rejects(f.tools.execute("finish_turn", { outcomes: [{ messageId: "m", action: "UPDATE_PRODUCT", evidenceIds }, query] }, f.snapshot, f.state), { code: "MISSING_QUERY_RESPONSE" });
});

test("queries from separate logical loads survive checkpoints and retries without duplicates", async () => {
  const f = setup("¿Cuál es el FOB?");
  f.snapshot.messages.push({ ...f.snapshot.messages[0], id: "m2", sequence: 2 });
  f.state.ingestion = { version: 1, revision: 1, activeLoadId: "L1", loads: [{ id: "L1", type: "EVIDENCE", assetIds: ["m"], name: null, status: "PARSED", reasons: [] }, { id: "L2", type: "EVIDENCE", assetIds: ["m2"], name: null, status: "PARSED", reasons: [] }], assets: [], links: [], derivations: [], summary: { totalAssets: 2, totalLogicalLoads: 2, processed: 0, pending: 2, needsReview: 0, failed: 0 } };
  await f.read();
  await f.tools.execute("finish_turn", { response: "FOB: USD 8", outcomes: [query] }, f.snapshot, f.state);
  f.state.ingestion.activeLoadId = "L2"; await f.read();
  const args = { response: "Ciudad: Shenzhen", outcomes: [{ ...query, messageId: "m2" }] };
  await f.tools.execute("finish_turn", args, f.snapshot, f.state);
  await f.tools.execute("finish_turn", args, f.snapshot, f.state);
  assert.deepEqual(f.state.agent.queryResponses, [{ revision: 1, scopeId: "L1", response: "FOB: USD 8" }, { revision: 1, scopeId: "L2", response: "Ciudad: Shenzhen" }]);
  const checkpoint = JSON.parse(JSON.stringify(f.state));
  assert.deepEqual(agentState(checkpoint).agent.queryResponses, f.state.agent.queryResponses);
});

for (const response of ["Guardé MOQ 500", "Se actualizó Botellas", "✅ Botellas: MOQ 999 guardado", "Apliqué el cambio; FOB: USD 8"]) test(`model write prose is rejected even with a QUERY outcome: ${response}`, async () => {
  const f = setup(); const evidenceIds = await f.prepare(); f.receipt("update_product", evidenceIds); await f.read();
  await assert.rejects(f.tools.execute("finish_turn", { response, outcomes: [{ messageId: "m", action: "UPDATE_PRODUCT", evidenceIds }, query] }, f.snapshot, f.state), { code: "UNVERIFIED_RESPONSE" });
  assert.equal(f.state.agent.terminal, undefined);
});
