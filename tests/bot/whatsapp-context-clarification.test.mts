import test from "node:test";
import assert from "node:assert/strict";
import { eligibleTrip, businessDay } from "../../lib/channels/whatsapp/trip-eligibility.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { agentState, type AgentDomain, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import type { BurstCatalog, BurstSnapshot, BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";
import { operationalContext } from "../../lib/channels/whatsapp/agent-policy.ts";
import { resolveBurstContext, askBurstContext } from "../../lib/channels/whatsapp/burst-context.ts";
import { renderClarification } from "../../lib/channels/whatsapp/clarification-rendering.ts";
import { answersPending } from "../../lib/channels/whatsapp/burst-routing.ts";
import { AgentTools } from "../../lib/channels/whatsapp/agent-tools.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import type { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";

const now = new Date("2026-10-07T02:30:00Z"); // Oct 6 in Argentina.
const catalog: BurstCatalog = { trips: [{ id: "trip", name: "Viaje de Pruebas", companies: [{ id: "broco", name: "Broco Solutions" }] }] };
const multiple: BurstCatalog = { trips: [{ ...catalog.trips[0], companies: [...catalog.trips[0].companies, { id: "kendal", name: "Kendal Salud" }] }] };
function snapshot(count = 3): BurstSnapshot {
  const state = agentState({ tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] });
  const messages: BurstSnapshot["messages"] = Array.from({ length: count }, (_, i) => ({ id: `m${i}`, sequence: i + 1, sentAt: null, envelope: { instance: "test", phone: "123", messageId: `m${i}`, type: "IMAGE", text: null, media: null, sentAt: null }, reading: { complete: true, imageKind: "BUSINESS_CARD", segments: [] } }));
  state.ingestion = { version: 1, revision: count, links: [], derivations: [], assets: messages.map(m => ({ id: m.id, type: "IMAGE", status: "GROUPED", classification: "BUSINESS_CARD", loadIds: [`l${m.id}`] })), loads: messages.map((m, i) => ({ id: `l${m.id}`, type: "SUPPLIER", assetIds: [m.id], name: ["FUJIE TECHNOLOGY", "IWO", "YKO blocks manufactory"][i % 3], status: "GROUPED", reasons: [] })), summary: { totalAssets: count, totalLogicalLoads: count, processed: 0, pending: count, needsReview: 0, failed: 0 } };
  return { id: "burst", instance: "test", phone: "123", userId: "u", revision: count, leaseId: "lease", status: "PROCESSING", state, messages };
}
const domain: AgentDomain = { async search() { return []; }, async get() { throw Error("unused"); }, async write() { throw Error("unused"); }, async pending() { return []; }, async resolve() { throw Error("unused"); }, async receipts() { return []; }, async displayed() {} };
const extraction = { async extractReading(text: string) { return { extractedFields: {}, reviewFields: [], evidence: [], rawSource: { type: "TEXT" as const, text } }; } };

for (const [name, trip, expected] of [
  ["ended ACTIVE trip", { status: "ACTIVE", endDate: "2026-10-05" }, false],
  ["current ACTIVE trip", { status: "ACTIVE", endDate: "2026-10-06" }, true],
  ["future PLANNED trip", { status: "PLANNED", endDate: "2027-01-01" }, true],
  ["undated historical policy", { status: "ACTIVE", endDate: null }, true],
  ["COMPLETED future date", { status: "COMPLETED", endDate: "2027-01-01" }, false],
  ["ARCHIVED trip", { status: "ARCHIVED", endDate: null }, false],
  ["expired explicit timestamp", { status: "ACTIVE", endDate: "2026-10-07T01:00:00Z" }, false],
] as const) test(`eligibility: ${name}`, () => assert.equal(eligibleTrip(trip, now), expected));
test("date-only end is inclusive until business midnight, independently of worker timezone", () => {
  assert.equal(businessDay(now), "2026-10-06");
  assert.equal(eligibleTrip({ endDate: "2026-10-06" }, new Date("2026-10-07T02:59:59Z")), true);
  assert.equal(eligibleTrip({ endDate: "2026-10-06" }, new Date("2026-10-07T03:00:00Z")), false);
});
test("production catalog adds database date/status filter before returning agent options", async () => {
  let query: unknown;
  const db = { tripMember: { async findMany(args: unknown) { query = args; return [
    { trip: { id: "old", name: "Feria Demo", status: "ACTIVE", endDate: new Date("2000-01-01"), companies: [{ id: "oldco", catalogCompany: { name: "Kendal Salud" } }] } },
    { trip: { id: "trip", name: "Viaje de Pruebas", status: "ACTIVE", endDate: null, companies: [{ id: "broco", catalogCompany: { name: "Broco Solutions" } }] } },
    { trip: { id: "future", name: "Futuro", status: "PLANNED", endDate: new Date("2099-01-01"), companies: [{ id: "futureco", catalogCompany: { name: "Broco Solutions" } }] } },
  ]; } } };
  const result = await new PrismaBurstStore(db as unknown as PrismaClient).catalog("u");
  assert.deepEqual(result.trips.map(t => t.id).sort(), ["future", "trip"]);
  const where = (query as { where: { userId: string; role: string; trip: { status: { in: string[] }; OR: unknown[] } } }).where;
  assert.equal(where.userId, "u"); assert.equal(where.role, "TRAVELER"); assert.deepEqual(where.trip.status.in, ["ACTIVE", "PLANNED"]); assert.equal(where.trip.OR.length, 2);
});
test("one eligible combination resolves context and persists it for all suppliers", () => {
  const s = snapshot(); const state = s.state as AgentState;
  assert.deepEqual(resolveBurstContext(s, catalog, state), { tripId: "trip", companyId: "broco" });
  assert.equal(operationalContext(catalog, state).selectedCompanyId, "broco");
});
test("two eligible combinations ask once for the burst, not per supplier", () => {
  const s = snapshot(); const state = s.state as AgentState;
  assert.equal(resolveBurstContext(s, multiple, state), null); askBurstContext(s, multiple, state);
  assert.equal(state.question!.match(/¿En qué/gu)?.length, 1); assert.ok(!/FUJIE|IWO|YKO/u.test(state.question!));
  assert.match(state.question!, /1\. Viaje de Pruebas — Broco Solutions\n2\. Viaje de Pruebas — Kendal Salud/u);
});
test("short number resolves prior context and survives subsequent supplier scopes/restart", () => {
  const s = snapshot(); const state = s.state as AgentState; askBurstContext(s, multiple, state);
  const reply = { ...s.messages[0], id: "answer", sequence: 4, envelope: { ...s.messages[0].envelope, type: "TEXT" as const, text: "2" } }; s.messages.push(reply); s.revision++;
  assert.equal(answersPending(reply.envelope, state), true);
  resolveBurstContext(s, multiple, state); assert.equal(state.operationalContext?.companyId, "kendal"); assert.equal(state.agent.pending, null);
  const restored = JSON.parse(JSON.stringify(state)); assert.equal(operationalContext(multiple, restored).selectedCompanyId, "kendal");
});
test("compound numeric response is accepted only for a context selection", () => {
  const s = snapshot(); const state = s.state as AgentState; askBurstContext(s, multiple, state);
  const reply = { ...s.messages[0].envelope, type: "TEXT" as const, text: "1; Caja YKO; PANLOS Huada" };
  assert.equal(answersPending(reply, state), true);
  state.agent.pending!.contextSelection = false; assert.equal(answersPending(reply, state), false);
});
test("quoted answer preserves WAITING routing, independent images start a new workflow", () => {
  const s = snapshot(); askBurstContext(s, multiple, s.state as AgentState);
  assert.equal(answersPending({ ...s.messages[0].envelope, quotedMessageId: "question" }, s.state, ["question"]), true);
  assert.equal(answersPending(s.messages[0].envelope, s.state, ["question"]), false);
});
test("trip plus associations renders separate sections and one line per product", () => {
  const text = renderClarification({ text: "Contexto y productos", contextSelection: true, options: [{ id: "c1", label: "China — Broco" }, { id: "c2", label: "China — Kendal" }], products: [{ name: "Caja de bloques", supplierQuery: "YKO blocks manufactory" }, { name: "PANLOS" }] });
  assert.match(text, /📍 Viaje\n\n/u); assert.match(text, /Necesito confirmar algunos datos:\n\n• \*\*Caja de bloques:\*\* ¿Pertenece a YKO blocks manufactory\?\n\n• \*\*PANLOS:\*\* ¿A qué proveedor pertenece\?/u);
});
test("resolved trip renders associations only, preserving any additional actual question", () => {
  const text = renderClarification({ text: "Necesito confirmar las asociaciones.", options: [], products: [{ name: "Caja", supplierQuery: "YKO" }, { name: "PANLOS" }] });
  assert.ok(!/Viaje|empresa/u.test(text)); assert.match(text, /• \*\*Caja:.*\n\n• \*\*PANLOS:/u);
});
test("get_context auto-resolves and ask_clarification rejects a redundant unique context question", async () => {
  const s = snapshot(); const state = s.state as AgentState; const tools = new AgentTools({ domain, extraction, catalog, async checkpoint() {} });
  await tools.execute("get_context", {}, s, state);
  await assert.rejects(tools.execute("ask_clarification", { question: "¿Qué viaje?", options: [{ id: "broco", label: "Broco" }] }, s, state), /contexto de toda la ráfaga ya está resuelto/u);
  assert.equal(state.agent.pending, null);
});

async function serviceReplay(selectedCatalog: BurstCatalog) {
  const s = snapshot(6);
  let claims = 0; let modelRuns = 0; let text = "";
  const store = { async claim() { return claims++ === 0 ? [s] : []; }, async catalog() { return selectedCatalog; }, async saveReading() {}, async finish(_s: unknown, next: AgentState, reply: string) { s.state = next; text = reply; }, async flushReplies() {}, async retry() { throw Error("unexpected retry"); } } as unknown as BurstStore;
  const orchestrator = { async run(current: BurstSnapshot) {
    modelRuns++; const next = current.state as AgentState; const load = next.ingestion!.loads.find(l => l.id === next.ingestion!.activeLoadId)!;
    load.status = "PROCESSED"; next.question = null; next.agent.pending = null; return { state: next, text: "" };
  } } as unknown as WhatsAppAgentOrchestrator;
  const service = new WhatsAppAgentService({ store, domain, orchestrator, async save() { return true; }, reader: { async read(m) { return m.reading!; } }, async send() {} });
  await service.processDue(1); return { s, state: s.state as AgentState, text, modelRuns, async resume() { claims = 0; await service.processDue(1); return { state: s.state as AgentState, text, modelRuns }; } };
}
test("six-evidence conceptual replay excludes Feria Demo and auto-resolves sole valid trip", async () => {
  const input: BurstCatalog = { trips: [...catalog.trips, { id: "expired", name: "Feria Demo", status: "ACTIVE", endDate: "2000-01-01", companies: [{ id: "old", name: "Kendal Salud" }] }] };
  const result = await serviceReplay(input); assert.equal(result.modelRuns, 6); assert.doesNotMatch(result.text, /evidencias/u); assert.ok(!result.text.includes("Feria Demo")); assert.equal(result.state.operationalContext?.companyId, "broco"); assert.equal(result.state.question, null);
});
test("service asks once with two valid contexts; assets stay pending instead of NEEDS_REVIEW", async () => {
  const result = await serviceReplay(multiple); assert.equal(result.modelRuns, 0); assert.equal(result.state.agent.pending?.contextSelection, true); assert.equal(result.state.ingestion!.summary.pending, 6); assert.equal(result.state.ingestion!.summary.needsReview, 0);
  assert.equal(result.text.match(/¿En qué/gu)?.length, 1);
});

test("context resolution retains pending products and removes only the trip question", () => {
  const s = snapshot(); const state = s.state as AgentState; askBurstContext(s, multiple, state);
  state.agent.pending!.products = [{ name: "Caja", supplierQuery: "YKO" }, { name: "PANLOS" }];
  s.messages.push({ ...s.messages[0], id: "response", sequence: 4, envelope: { ...s.messages[0].envelope, type: "TEXT", text: "1" } });
  resolveBurstContext(s, multiple, state);
  assert.equal(state.agent.pending!.products!.length, 2); assert.equal(state.agent.pending!.contextSelection, false);
  assert.ok(!/Viaje|empresa/u.test(state.question!)); assert.match(state.question!, /• \*\*Caja:.*\n\n• \*\*PANLOS:/u);
});

test("conceptual six-load fixture: only unresolved product associations reach the outbox", async () => {
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(await readFile(new URL("../../fixtures/whatsapp-context/six-evidence-clarification.json", import.meta.url), "utf8"));
  const s = snapshot(6);
  s.state.ingestion!.loads.forEach((load, i) => { load.name = fixture.loads[i].name; load.type = fixture.loads[i].type; s.messages[i].reading!.ocr = load.name!; });
  let claims = 0; let text = ""; let resolutions = 0;
  const d: AgentDomain = { ...domain, async resolveExistingSupplier(_s, id) {
    resolutions++; const load = s.state.ingestion!.loads.find(l => l.id === id)!;
    return { operationId: `existing-${id}`, tool: "resolve_existing_resource", id: `supplier-${id}`, name: load.name, logicalLoadIds: [id], completedRevision: s.revision, status: "COMPLETED", resourceStatus: "CONFIRMED" };
  } };
  const store = { async claim() { return claims++ ? [] : [s]; }, async catalog() { return fixture.catalog; }, async saveReading() {}, async finish(_s: unknown, _state: AgentState, reply: string) { text = reply; }, async flushReplies() {}, async retry() { throw Error("unexpected retry"); } } as unknown as BurstStore;
  const runner = { async run(current: BurstSnapshot, c: BurstCatalog) {
    const state = current.state as AgentState; const tools = new AgentTools({ domain: d, extraction, catalog: c, async checkpoint() {} });
    await tools.execute("get_context", {}, current, state);
    await tools.execute("ask_clarification", { question: "Necesito confirmar dos asociaciones antes de continuar.", pendingProducts: fixture.pendingProducts }, current, state);
    return { state, text: state.question! };
  } } as unknown as WhatsAppAgentOrchestrator;
  await new WhatsAppAgentService({ store, domain: d, orchestrator: runner, async save() { return true; }, reader: { async read(m) { return m.reading!; } }, async send() {} }).processDue(1);
  assert.equal(resolutions, 4); assert.match(text, /4 proveedores cargados/u);
  assert.ok(!/Feria Demo|📍 Viaje|¿En qué viaje|44 evidencias/u.test(text));
  assert.match(text, /• \*\*Caja de bloques:\*\* ¿Pertenece a YKO blocks manufactory\?\n\n• \*\*PANLOS:\*\* ¿A qué proveedor pertenece\?/u);
  if (process.env.CONTEXT_REPLAY_REPORT) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(process.env.CONTEXT_REPLAY_REPORT, JSON.stringify({ kind: fixture.kind, inputAssets: 6, resolvedContext: s.state.operationalContext, existingSupplierResolutions: resolutions, summary: s.state.ingestion!.summary, pending: (s.state as AgentState).agent.pending, reply: text, passed: true }, null, 2));
  }
});

test("real Prisma catalog preserves authorized future/undated trips and excludes expired statuses", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const { createAgentEnvironment, localAgentDatabase } = await import("../../evals/whatsapp-agent/environment.ts");
  const db = localAgentDatabase(); const env = await createAgentEnvironment(db, { trips: [
    ...catalog.trips,
    { id: "expired", name: "Feria Demo", companies: [{ id: "expired-c", name: "Kendal Salud" }] },
    { id: "future", name: "Feria futura", companies: [{ id: "future-c", name: "Broco" }] },
    { id: "completed", name: "Completada", companies: [{ id: "closed-c", name: "Broco" }] },
  ] });
  try {
    await db.trip.update({ where: { id: env.id("expired") }, data: { endDate: new Date("2000-01-01"), status: "ACTIVE" } });
    await db.trip.update({ where: { id: env.id("future") }, data: { endDate: new Date("2099-01-01"), status: "PLANNED" } });
    await db.trip.update({ where: { id: env.id("completed") }, data: { endDate: new Date("2099-01-01"), status: "COMPLETED" } });
    const actual = await new PrismaBurstStore(db).catalog(env.userId);
    assert.deepEqual(actual.trips.map(t => t.name).sort(), ["Feria futura", "Viaje de Pruebas"]);
  } finally { await env.cleanup(); await db.$disconnect(); }
});

test("explicit different user destinations scope suppliers separately instead of sharing a default", async () => {
  const { explicitLoadContexts } = await import("../../lib/channels/whatsapp/burst-context.ts");
  const s = snapshot(); const state = s.state as AgentState;
  s.messages.push({ ...s.messages[0], id: "destinations", sequence: 4, envelope: { ...s.messages[0].envelope, type: "TEXT", text: "FUJIE TECHNOLOGY — Viaje de Pruebas — Broco Solutions\nIWO — Viaje de Pruebas — Kendal Salud" } });
  state.loadContexts = explicitLoadContexts(s, multiple);
  assert.equal(Object.keys(state.loadContexts!).length, 2);
  state.ingestion!.activeLoadId = "lm0"; assert.equal(resolveBurstContext(s, multiple, state)?.companyId, "broco");
  state.ingestion!.activeLoadId = "lm1"; assert.equal(resolveBurstContext(s, multiple, state)?.companyId, "kendal");
  state.ingestion!.activeLoadId = undefined; assert.equal(resolveBurstContext(s, multiple, state), null);
  askBurstContext(s, multiple, state, "lm2"); state.ingestion!.loads[2].question = state.agent.pending!;
  s.messages.push({ ...s.messages[0], id: "destination-answer", sequence: 5, envelope: { ...s.messages[0].envelope, type: "TEXT", text: "1" } });
  resolveBurstContext(s, multiple, state); assert.equal(state.loadContexts!.lm2.companyId, "broco"); assert.equal(state.ingestion!.loads[2].question, undefined);
});
test("stale persisted context is cleared and re-resolved only among eligible trips", () => {
  const s = snapshot(); const state = s.state as AgentState; state.tripId = "expired"; state.operationalContext = { tripId: "expired", companyId: "old" }; state.loadContexts = { lm0: { tripId: "expired", companyId: "old" } };
  resolveBurstContext(s, catalog, state); assert.deepEqual(state.operationalContext, { tripId: "trip", companyId: "broco" });
});

test("legacy WAITING context options for an expired trip are superseded without numeric reinterpretation", () => {
  const s = snapshot(); const state = s.state as AgentState;
  state.agent.pending = { type: "CLARIFICATION", text: "¿A qué opción corresponde FUJIE?", revision: 3, options: [{ id: "old", label: "Feria Demo — Broco Solutions" }, { id: "broco", label: "Viaje de Pruebas — Broco Solutions" }] };
  state.question = state.agent.pending.text;
  s.messages.push({ ...s.messages[0], id: "old-answer", sequence: 4, envelope: { ...s.messages[0].envelope, type: "TEXT", text: "1" } }); s.revision = 4;
  assert.equal(resolveBurstContext(s, multiple, state), null);
  assert.ok(!state.question!.includes("Feria Demo")); assert.equal(state.agent.pending!.revision, 4);
  assert.equal(state.operationalContext, undefined);
});

test("service resumes every supplier after a single short context answer", async () => {
  const result = await serviceReplay(multiple); assert.equal(result.modelRuns, 0);
  const s = result.s;
  s.messages.push({ id: "short-answer", sequence: 7, sentAt: null, envelope: { instance: s.instance, phone: s.phone, messageId: "answer", type: "TEXT", text: "2", media: null, sentAt: null }, reading: { complete: true, segments: [] } }); s.revision = 7;
  const resumed = await result.resume();
  assert.equal(resumed.modelRuns, 6); assert.equal(resumed.state.operationalContext?.companyId, "kendal");
  assert.equal(resumed.state.ingestion!.summary.processed, 6); assert.equal(resumed.state.question, null); assert.ok(!/¿En qué/u.test(resumed.text));
});
test("domain rejects new effects in expired trips even if a model reuses an old ID", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const { createAgentEnvironment, localAgentDatabase } = await import("../../evals/whatsapp-agent/environment.ts");
  const db = localAgentDatabase(); const env = await createAgentEnvironment(db, catalog);
  try {
    const s = snapshot(1); s.id = env.id("burst"); s.userId = env.userId; s.leaseId = "lease"; s.state.ingestion = undefined;
    await env.persist(s);
    await db.trip.update({ where: { id: env.id("trip") }, data: { endDate: new Date("2000-01-01") } });
    await assert.rejects(env.domain.write(s, { tool: "create_supplier_draft", tripId: env.id("trip"), companyId: env.id("broco"), evidence: [] }), /viaje ya terminó/u);
    assert.equal(await db.supplierCapture.count({ where: { tripId: env.id("trip") } }), 0);
  } finally { await env.cleanup(); await db.$disconnect(); }
});

test("short structured product associations resume WAITING without absorbing an unrelated upload", () => {
  const s = snapshot(); const state = s.state as AgentState;
  state.agent.pending = { type: "CLARIFICATION", text: "¿A qué proveedores pertenecen?", options: [], revision: 3, products: [{ name: "Caja de bloques" }, { name: "PANLOS" }] };
  const reply = { ...s.messages[0].envelope, type: "TEXT" as const, text: "Caja de bloques → YKO; PANLOS → Huada" };
  assert.equal(answersPending(reply, state), true);
  assert.equal(answersPending({ ...reply, text: "Otro producto → YKO" }, state), false);
  assert.equal(answersPending({ ...reply, text: "PANLOS MOQ 500" }, state), false);
  assert.equal(answersPending(s.messages[0].envelope, state), false);
});

test("existing suppliers are resolved before asking context; fully resolved cards need no question", async () => {
  const s = snapshot(); let claims = 0; let modelRuns = 0;
  const store = { async claim() { return claims++ ? [] : [s]; }, async catalog() { return multiple; }, async saveReading() {}, async finish() {}, async flushReplies() {}, async retry() { throw Error("unexpected retry"); } } as unknown as BurstStore;
  const d: AgentDomain = { ...domain, async resolveExistingSupplier(_s, id) { return { operationId: id, tool: "resolve_existing_resource", id: `supplier-${id}`, logicalLoadIds: [id], completedRevision: s.revision, status: "COMPLETED", resourceStatus: "CONFIRMED" }; } };
  const runner = { async run() { modelRuns++; throw Error("no model turn needed"); } } as unknown as WhatsAppAgentOrchestrator;
  await new WhatsAppAgentService({ store, domain: d, orchestrator: runner, async save() { return true; }, reader: { async read(m) { return m.reading!; } }, async send() {} }).processDue(1);
  assert.equal(modelRuns, 0); assert.equal(s.state.ingestion!.summary.processed, 3); assert.equal(s.state.question, null);
});

test("tool-generated context plus products uses one burst question and distinct association lines", async () => {
  const s = snapshot(); const state = s.state as AgentState; s.messages[0].reading!.ocr = "Producto: Caja de bloques\nPANLOS";
  const tools = new AgentTools({ domain, extraction, catalog: multiple, async checkpoint() {} });
  await tools.execute("get_context", {}, s, state);
  await tools.execute("ask_clarification", { question: "¿A qué opción corresponde FUJIE TECHNOLOGY, IWO y YKO? Además, ¿la Caja es YKO y PANLOS de qué proveedor?", options: [{ id: "broco", label: "Broco Solutions" }, { id: "kendal", label: "Kendal Salud" }], pendingProducts: [{ name: "Caja de bloques", supplierQuery: "YKO" }, { name: "PANLOS" }] }, s, state);
  assert.match(state.question!, /📍 Viaje\n\n¿En qué viaje y empresa querés cargar estos datos\?/u);
  assert.match(state.question!, /Necesito confirmar algunos datos:\n\n• \*\*Caja de bloques:.*\n\n• \*\*PANLOS:/u);
  assert.ok(!/FUJIE TECHNOLOGY, IWO/u.test(state.question!));
});
