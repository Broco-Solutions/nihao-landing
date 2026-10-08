import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_TOOLS, AgentCheckpoint, AgentToolError, agentState, validateToolArgs, type AgentDomain, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { availableAgentTools, operationalContext, pendingDecision } from "../../lib/channels/whatsapp/agent-policy.ts";
import { AgentTools } from "../../lib/channels/whatsapp/agent-tools.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { FetchOpenAIHttpClient } from "../../lib/channels/whatsapp/agent-provider.ts";
import type { BurstCatalog, BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

const catalog: BurstCatalog = { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }] }] };
const supplier = { id: "supplier", captureId: "capture", kind: "SUPPLIER" as const, tripId: "trip", companyId: "company", name: "Alfa", status: "CONFIRMED", version: "1", data: {} };
const domain: AgentDomain = { async search() { return [supplier]; }, async get() { return supplier; }, async write(_snapshot, input) { return { operationId: `op-${input.name}`, tool: input.tool, id: `product-${input.name}`, name: input.name, resourceStatus: "DRAFT", status: "COMPLETED" }; }, async pending() { return []; }, async resolve() { return { operationId: "proposal", tool: "update_product", id: "product", status: "CANCELLED" }; }, async receipts() { return []; }, async displayed() {} };
const extraction = { async extractReading(text: string) { return { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text } }; } };
function snapshot(text = "Ayuda", count = 1): BurstSnapshot {
  return { id: "burst", instance: "test", phone: "123", userId: "user", revision: count, leaseId: "lease", status: "PROCESSING", state: { tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: Array.from({ length: count }, (_, index) => ({ id: `m${index + 1}`, sequence: index + 1, sentAt: null, envelope: { instance: "test", messageId: `m${index + 1}`, phone: "123", type: "TEXT", text: count === 1 ? text : `${text} ${index + 1}`, media: null, sentAt: null }, reading: { complete: true, segments: [] } })) };
}
const output = (name: string, args: unknown, index = 0) => ({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `call-${index}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] });
const names = (s: BurstSnapshot, state: AgentState) => availableAgentTools(s, state, catalog).map((tool) => tool.function.name);

test("las 16 tools tienen strict=true y todos los objetos cerrados con required completo", () => {
  function check(schema: unknown) {
    const value = schema as { type?: string | string[]; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean; items?: unknown };
    if (value.properties) {
      assert.equal(value.additionalProperties, false);
      assert.deepEqual([...value.required!].sort(), Object.keys(value.properties).sort());
      for (const field of Object.values(value.properties)) check(field);
    }
    if (value.items) check(value.items);
  }
  assert.equal(AGENT_TOOLS.length, 16);
  for (const tool of AGENT_TOOLS) { assert.equal(tool.function.strict, true); check(tool.function.parameters); }
});

test("nullable opcional y contratos cerrados se validan también en servidor", () => {
  for (const [name, args] of [
    ["search_products", { tripId: "trip", query: "", supplierId: null }],
    ["create_product_draft", { notes: null, supplierId: "supplier", name: null, evidenceIds: ["e"] }],
    ["prepare_evidence", { sources: [{ messageId: "m1", quote: null, role: "FACTS" }] }],
    ["ask_clarification", { question: "¿Proveedor?", options: null, pendingProducts: [{ name: "Taladro", supplierQuery: null }] }],
    ["finish_turn", { response: null, guidance: null }],
  ] as const) {
    assert.doesNotThrow(() => validateToolArgs(name, args, true));
    assert.throws(() => validateToolArgs(name, { ...args, arbitrary: true }, true), AgentToolError);
  }
  assert.throws(() => validateToolArgs("search_products", { tripId: "trip", query: "" }, true), AgentToolError);
  assert.throws(() => validateToolArgs("prepare_evidence", { sources: [{ messageId: "m1", quote: null, role: "FAKE" }] }, true), AgentToolError);
  assert.throws(() => validateToolArgs("ask_clarification", { question: "q", options: [{ id: "x", label: "x", status: "CONFIRMED" }], pendingProducts: null }, true), AgentToolError);
  // Historical sparse calls remain readable for durable recovery.
  assert.doesNotThrow(() => validateToolArgs("finish_turn", {}));
});

test("patch nullable conserva campos; clearFields exige borrado explícito y no permite status", () => {
  const patch = { notes: null, name: null, fob: { amount: 12, currency: null, unit: null, rawText: null }, moq: null, leadTime: null, clearFields: null };
  assert.deepEqual(validateToolArgs("update_product", { id: "p", patch, evidenceIds: ["e"] }, true).patch, { fob: { amount: 12 } });
  assert.deepEqual(validateToolArgs("update_product", { id: "p", patch: { ...patch, fob: null, clearFields: ["fob"] }, evidenceIds: ["e"] }, true).patch, { fob: null });
  assert.throws(() => validateToolArgs("update_product", { id: "p", patch: { ...patch, clearFields: ["fob.amount"] }, evidenceIds: ["e"] }, true), /clearFields/);
  assert.throws(() => validateToolArgs("update_product", { id: "p", patch: { ...patch, status: "CONFIRMED" }, evidenceIds: ["e"] }, true), AgentToolError);
  assert.throws(() => validateToolArgs("update_supplier", { id: "s", patch: { name: "wrong kind" }, evidenceIds: ["e"] }), AgentToolError);
});

test("contexto operacional se inyecta antes de Luna sin leer memoria ni forzar get_context", async () => {
  let memoryReads = 0;
  const runner = new WhatsAppAgentOrchestrator({ domain: { ...domain, async recentMemory() { memoryReads++; return []; } }, extraction, client: { async post(_path, body) {
    const request = body as { messages: Array<{ content: string }>; tool_choice: unknown; tools: typeof AGENT_TOOLS };
    const input = JSON.parse(request.messages[1].content);
    assert.equal(input.operationalContext.selectedTripId, "trip");
    assert.equal(input.operationalContext.selectedCompanyId, "company");
    assert.equal(input.recentConversations, undefined);
    assert.equal(request.tool_choice, "any");
    assert.ok(request.tools.some((tool) => tool.function.name === "resolve_recent_reference"));
    return output("finish_turn", { response: null, guidance: true });
  } } });
  const result = await runner.run(snapshot(), catalog, async () => {});
  assert.equal(memoryReads, 0); assert.equal(result.state.agent.termination?.reason, "completed");
});

test("varios viajes/empresas no generan una selección arbitraria y get_context consulta memoria sin filtro por palabras", async () => {
  const s = snapshot(); const state = agentState(s.state);
  const multiple = { trips: [...catalog.trips, { id: "other", name: "Otro", companies: [{ id: "c2", name: "Kendal" }] }] };
  assert.equal(operationalContext(multiple, state).selectedTripId, null);
  assert.equal(operationalContext(multiple, state).selectedCompanyId, null);
  assert.equal(operationalContext({ trips: [{ ...catalog.trips[0], companies: [...catalog.trips[0].companies, { id: "c2", name: "Kendal" }] }] }, state).selectedCompanyId, null);
  let reads = 0;
  const tools = new AgentTools({ domain: { ...domain, async recentMemory() { reads++; return []; } }, extraction, catalog, async checkpoint() {} });
  await tools.execute("get_context", {}, s, state); assert.equal(reads, 1);
  s.messages[0].envelope.text = "Agregale al mismo proveedor";
  await tools.execute("get_context", {}, s, state); assert.equal(reads, 2);
});

test("gating elimina escrituras sin FACTS/destino y habilita sólo los tipos resueltos", () => {
  const s = snapshot(); const state = agentState(s.state);
  assert.ok(!names(s, state).some((name) => name.startsWith("create_") || name.startsWith("update_") || name.includes("pending_change")));
  state.agent.evidence.push({ id: "e", role: "FACTS" } as never);
  assert.ok(names(s, state).includes("create_supplier_draft"));
  assert.ok(!names(s, state).includes("create_product_draft"));
  state.agent.resolvedRecords = [{ id: "s", kind: "SUPPLIER", version: "1" }];
  assert.ok(names(s, state).includes("create_product_draft")); assert.ok(names(s, state).includes("update_supplier"));
  assert.ok(!names(s, state).includes("update_product"));
  state.agent.resolvedRecords.push({ id: "p", kind: "PRODUCT", version: "1" }); assert.ok(names(s, state).includes("update_product"));
});

test("propuesta: aprobación autónoma reduce tools, cancelación compuesta conserva nuevas operaciones", () => {
  const s = snapshot("sí"); s.messages[0].sequence = 2; s.revision = 2;
  const state = agentState(s.state); state.agent.pending = { type: "APPROVAL", proposalId: "proposal", revision: 1, text: "¿Confirmás?", options: [] };
  assert.deepEqual(names(s, state), ["apply_pending_change", "cancel_pending_change", "finish_turn"]);
  s.messages[0].envelope.text = "No confirmes eso. Además agregá otro producto al proveedor Alfa.";
  state.agent.evidence.push({ id: "e", role: "FACTS" } as never); state.agent.resolvedRecords = [{ id: "s", kind: "SUPPLIER", version: "1" }];
  assert.equal(pendingDecision(s, 1)?.cancel, true); assert.equal(pendingDecision(s, 1)?.standalone, false);
  assert.ok(names(s, state).includes("create_product_draft")); assert.ok(names(s, state).includes("cancel_pending_change"));
  s.messages[0].envelope.text = "Sí. Además agregá otro producto."; assert.equal(pendingDecision(s, 1), null);
  s.messages[0].envelope.text = "sí"; s.messages[0].envelope.quotedMessageId = "foreign"; assert.equal(pendingDecision(s, 1), null);
});

test("10 productos completan 22 rondas: progreso permite superar el soft limit", async () => {
  const s = snapshot("Producto", 10); let calls = 0;
  const runner = new WhatsAppAgentOrchestrator({ domain, extraction, client: { async post(_path, body) {
    calls++;
    if (calls === 1) return output("search_suppliers", { tripId: "trip", query: "Alfa" }, calls);
    if (calls === 22) return output("finish_turn", { response: null, guidance: null }, calls);
    const index = Math.floor((calls - 2) / 2) + 1;
    if (calls % 2 === 0) return output("prepare_evidence", { sources: [{ messageId: `m${index}`, quote: null, role: "FACTS" }] }, calls);
    const messages = (body as { messages: Array<{ content: string }> }).messages;
    const evidence = JSON.parse(messages.at(-1)!.content).evidence;
    return output("create_product_draft", { notes: null, supplierId: "supplier", name: `Producto ${index}`, evidenceIds: evidence.map((e: { id: string }) => e.id) }, calls);
  } } });
  const result = await runner.run(s, catalog, async () => {});
  assert.equal(calls, 22); assert.equal(result.state.agent.receipts.length, 10); assert.equal(result.state.agent.termination?.reason, "completed");
});

test("hard limit 24 y soft limit sin progreso dejan un motivo explícito y recibos intactos", async () => {
  let calls = 0;
  const runner = new WhatsAppAgentOrchestrator({ domain, extraction, client: { async post() { calls++; return output("prepare_evidence", { sources: [{ messageId: `m${calls}`, quote: null, role: "FACTS" }] }, calls); } } });
  const result = await runner.run(snapshot("Datos", 30), catalog, async () => {});
  assert.equal(calls, 24); assert.equal(result.state.agent.termination?.reason, "max_rounds"); assert.match(result.text, /Respondé reintentar/); assert.match(result.state.agent.pending!.text, /límite de rondas/);
  const s = snapshot(); const state = agentState(s.state); s.state = state;
  state.agent.historyRevision = s.revision; state.agent.rounds = 12; state.agent.watchdog = { lastOperation: "x", lastState: "x", repeats: 0, stagnantRounds: 0, lastProgressRound: 9 };
  const limited = await runner.run(s, catalog, async () => {});
  assert.equal(calls, 24); assert.equal(limited.state.agent.termination?.reason, "max_rounds");
});

test("watchdog detiene repetición sin progreso y se conserva después de un checkpoint", async () => {
  let calls = 0; let interrupt = true; const s = snapshot();
  const runner = new WhatsAppAgentOrchestrator({ domain, extraction, client: { async post() { calls++; return output("get_context", {}, calls); } } });
  await assert.rejects(runner.run(s, catalog, async (state) => { if (interrupt && state.agent.watchdog?.repeats === 1) { interrupt = false; throw new AgentCheckpoint(); } }), AgentCheckpoint);
  const result = await runner.run(s, catalog, async () => {});
  assert.equal(calls, 2); assert.equal(result.state.agent.termination?.reason, "no_progress"); assert.match(result.text, /sin avanzar/);
});

test("errores de tools/modelo quedan registrados con motivos distintos", async () => {
  const s = snapshot();
  const toolRunner = new WhatsAppAgentOrchestrator({ domain: { ...domain, async get() { throw new AgentToolError("NOT_FOUND", "No existe"); } }, extraction, client: { async post() { return output("get_supplier", { id: "missing" }); } } });
  const failed = await toolRunner.run(s, catalog, async () => {});
  assert.equal(failed.state.agent.termination?.reason, "tool_error"); assert.equal(failed.state.agent.termination?.errorCode, "NOT_FOUND");
  const modelSnapshot = snapshot();
  const modelRunner = new WhatsAppAgentOrchestrator({ domain, extraction, client: { async post() { throw new Error("API unavailable"); } } });
  await assert.rejects(modelRunner.run(modelSnapshot, catalog, async () => {}), /API unavailable/);
  assert.equal(agentState(modelSnapshot.state).agent.termination?.reason, "model_error");
});

test("aclaración nullable termina con motivo persistido y recuperación completa el motivo faltante", async () => {
  let calls = 0;
  const s = snapshot();
  const runner = new WhatsAppAgentOrchestrator({ domain, extraction, client: { async post() {
    calls++; return output("ask_clarification", { question: "¿A qué evidencia te referís?", options: null, pendingProducts: null });
  } } });
  const result = await runner.run(s, catalog, async () => {});
  assert.equal(result.state.agent.termination?.reason, "asked_clarification");
  result.state.agent.termination = undefined;
  const recovered = await runner.run(s, catalog, async () => {});
  assert.equal(recovered.state.agent.termination?.reason, "asked_clarification");
  assert.equal(calls, 1);
});

test("backend rechaza una tool no ofrecida aunque el modelo intente invocarla", async () => {
  let writes = 0;
  const runner = new WhatsAppAgentOrchestrator({ domain: { ...domain, async write(snapshot, input) { writes++; return domain.write(snapshot, input); } }, extraction, client: { async post() {
    return output("create_supplier_draft", { notes: null, tripId: "trip", companyId: "company", evidenceIds: ["unprepared"] });
  } } });
  const result = await runner.run(snapshot(), catalog, async () => {});
  assert.equal(writes, 0);
  assert.equal(result.state.agent.termination?.reason, "tool_error");
  assert.equal(result.state.agent.termination?.errorCode, "TOOL_NOT_AVAILABLE");
});

test("Responses API recibe tools estrictas y ejecuta argumentos nullable reales", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const request = JSON.parse(String(options?.body));
    assert.deepEqual(request.reasoning, { effort: "medium" }); assert.equal(request.temperature, undefined);
    assert.ok(request.tools.every((tool: { strict: boolean }) => tool.strict === true));
    assert.equal(request.tool_choice, "required");
    return Response.json({ status: "completed", output: [{ type: "reasoning", summary: [], encrypted_content: "safe-checkpoint" }, { type: "function_call", call_id: "call", name: "finish_turn", arguments: '{"response":null,"guidance":true}' }] });
  };
  try {
    const result = await new WhatsAppAgentOrchestrator({ domain, extraction, client: new FetchOpenAIHttpClient("test") }).run(snapshot(), catalog, async () => {});
    assert.match(result.text, /Hola, soy Nihao/); assert.equal(result.state.agent.termination?.reason, "completed");
    assert.ok(result.state.agent.history.some((message) => message.response_items?.some((item) => item.type === "reasoning")));
  } finally { globalThis.fetch = original; }
});
