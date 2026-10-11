import test from "node:test";
import assert from "node:assert/strict";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { agentState, type AgentDomain, type AgentRecord, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { answerPersistedCatalogQuery, purePersistedCatalogQuery } from "../../lib/channels/whatsapp/persisted-query.ts";
import type { BurstCatalog, BurstSnapshot, BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";

const catalog: BurstCatalog = { trips: [{ id: "trip", name: "Feria", companies: [{ id: "company", name: "Empresa" }] }] };
const record = (kind: AgentRecord["kind"], id: string, name: string | null, status = kind === "SUPPLIER" ? "CONFIRMED" : "DRAFT"): AgentRecord => ({ id, captureId: `capture-${id}`, supplierId: kind === "PRODUCT" ? "supplier-1" : null, kind, tripId: "trip", companyId: "company", name, status, version: "1", data: {} });

function snapshot(texts: string[]): BurstSnapshot {
  const state = agentState({ tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] });
  return {
    id: "query-burst", instance: "test", phone: "5490000000000", userId: "user", revision: texts.length, leaseId: "lease", status: "PROCESSING", state,
    messages: texts.map((text, index) => ({ id: `message-${index + 1}`, sequence: index + 1, sentAt: null, envelope: { instance: "test", phone: "5490000000000", messageId: `external-${index + 1}`, type: "TEXT", text, media: null, sentAt: null }, reading: null })),
  };
}

async function run(texts: string[], options: { products?: AgentRecord[]; suppliers?: AgentRecord[]; searchError?: Error } = {}) {
  const current = snapshot(texts);
  let claimed = false;
  let reply = "";
  let modelRuns = 0;
  let reads = 0;
  let writes = 0;
  let maintenanceWrites = 0;
  const searches: string[] = [];
  const domain: AgentDomain = {
    async search(_snapshot, kind) { searches.push(kind); if (options.searchError) throw options.searchError; return kind === "PRODUCT" ? options.products ?? [] : options.suppliers ?? []; },
    async get() { throw new Error("unused"); },
    async write() { writes++; throw new Error("A read query must not write"); },
    async pending() { return []; },
    async resolve() { throw new Error("unused"); },
    async receipts() { return []; },
    async displayed() {},
    async persistCaptions() { maintenanceWrites++; },
    async persistProductLoads() { maintenanceWrites++; return []; },
    async persistPreviousSupplierComments() { maintenanceWrites++; return []; },
  };
  const store = {
    async claim() { if (claimed) return []; claimed = true; return [current]; },
    async catalog() { return catalog; },
    async saveReading(id: string, reading: BurstSnapshot["messages"][number]["reading"]) { current.messages.find((message) => message.id === id)!.reading = reading; },
    async finish(_snapshot: BurstSnapshot, state: AgentState, text: string) { current.state = structuredClone(state); reply = text; },
    async retry() { assert.fail("A persisted read query must finish without retrying"); },
    async flushReplies() {},
  } as unknown as BurstStore;
  const service = new WhatsAppAgentService({
    ingestion: true,
    store,
    domain,
    orchestrator: { async run() { modelRuns++; throw new Error("A pure persisted query must not call the model"); } } as never,
    async save(_id, _revision, _lease, state) { current.state = structuredClone(state); return true; },
    reader: { async read(message, save) { reads++; const reading = { complete: true, segments: [{ id: `${message.id}:1`, text: message.envelope.text ?? "" }] }; await save(reading); return reading; } },
    async send() { assert.fail("No real WhatsApp delivery"); },
  });
  await service.processDue(1);
  return { reply, state: current.state as AgentState, searches, modelRuns, reads, writes, maintenanceWrites };
}

test("product query reads confirmed and draft products without running recovery or writes", async () => {
  const result = await run(["¿Qué productos guardé?"], { products: [record("PRODUCT", "p1", "AT-200", "CONFIRMED"), record("PRODUCT", "p2", "Módulo X", "DRAFT")] });
  assert.deepEqual(result.searches, ["PRODUCT"]);
  assert.equal(result.modelRuns, 0);
  assert.equal(result.reads, 0);
  assert.equal(result.writes, 0);
  assert.equal(result.maintenanceWrites, 0);
  assert.match(result.reply, /Productos guardados/u);
  assert.match(result.reply, /Confirmados \(1\):\n• AT-200/u);
  assert.match(result.reply, /Pendientes de revisión \(1\):\n• Módulo X/u);
  assert.doesNotMatch(result.reply, /reintentar|evidencias siguen pendientes|sin avanzar/iu);
  assert.equal(result.state.ingestion, undefined);
  assert.deepEqual(result.state.controlIds, ["message-1"]);
});

test("zero products is explicit and does not confuse pending evidence with saved products", async () => {
  const result = await run(["Mm", "Mostrame mis productos"], { products: [] });
  assert.match(result.reply, /Todavía no hay productos registrados en este viaje/u);
  assert.equal(result.state.ingestion, undefined);
  assert.deepEqual(result.state.controlIds, ["message-1", "message-2"]);
});

test("catalog read failure reports an unverifiable result without claiming an empty catalog", async () => {
  const result = await run(["¿Qué proveedores tengo?"], { searchError: new Error("database unavailable") });
  assert.match(result.reply, /No pude verificar tus proveedores ahora/u);
  assert.match(result.reply, /No hice cambios ni inicié un reprocesamiento/u);
  assert.doesNotMatch(result.reply, /no hay proveedores/iu);
  assert.equal(result.writes, 0);
  assert.equal(result.maintenanceWrites, 0);
});

test("mixed persisted summary queries use the real catalog and stay read-only", async () => {
  const result = await run(["¿Qué proveedores tengo?", "¿Qué productos guardé?"], {
    suppliers: [record("SUPPLIER", "s1", "PANLOS")],
    products: [record("PRODUCT", "p1", "AT-200", "CONFIRMED")],
  });
  assert.deepEqual(result.searches.sort(), ["PRODUCT", "SUPPLIER"]);
  assert.match(result.reply, /Información registrada/u);
  assert.match(result.reply, /PANLOS/u);
  assert.match(result.reply, /AT-200/u);
  assert.equal(result.writes, 0);
});

test("compound commercial commands are not misclassified as pure read queries", () => {
  const current = snapshot(["Mostrame mis productos y agregá uno nuevo"]);
  assert.equal(purePersistedCatalogQuery(current), null);
});

test("natural catalog wording stays a persisted read intent", () => {
  assert.equal(purePersistedCatalogQuery(snapshot(["¿Cuáles son mis productos?"])), "PRODUCTS");
  assert.equal(purePersistedCatalogQuery(snapshot(["¿Cuáles son los proveedores registrados?"])), "SUPPLIERS");
});

test("a read query completes only its own load and cannot multiply or erase an older pending evidence", async () => {
  const current = snapshot(["Evidencia anterior", "¿Qué productos guardé?"]);
  const state = current.state as AgentState;
  state.evaluatedRevision = 1;
  state.agent.pending = { type: "CLARIFICATION", revision: 1, text: "¿Qué dato falta?", options: [], loadId: "old-load" };
  state.question = state.agent.pending.text;
  state.ingestion = {
    version: 1, revision: 2, links: [], derivations: [],
    assets: [
      { id: "message-1", type: "TEXT", status: "GROUPED", loadIds: ["old-load"] },
      { id: "message-2", type: "TEXT", status: "GROUPED", loadIds: ["query-load"] },
    ],
    loads: [
      { id: "old-load", type: "EVIDENCE", assetIds: ["message-1"], name: null, status: "GROUPED", reasons: [] },
      { id: "query-load", type: "EVIDENCE", assetIds: ["message-2"], name: null, status: "GROUPED", reasons: [] },
    ],
    summary: { totalAssets: 2, totalLogicalLoads: 2, processed: 0, pending: 2, needsReview: 0, failed: 0 },
  };
  const domain = { async search() { return [record("PRODUCT", "p1", "AT-200", "CONFIRMED")]; } } as unknown as AgentDomain;
  const reply = await answerPersistedCatalogQuery({ snapshot: current, state, catalog, domain });
  assert.match(reply!, /AT-200/u);
  assert.equal(state.ingestion.summary.pending, 1);
  assert.equal(state.ingestion.summary.processed, 1);
  assert.equal(state.ingestion.loads.find((load) => load.id === "old-load")?.status, "GROUPED");
  assert.equal(state.ingestion.loads.find((load) => load.id === "query-load")?.status, "PROCESSED");
  assert.equal(state.agent.pending?.loadId, "old-load");
  assert.doesNotMatch(reply!, /evidencia anterior pendiente|evidencias? pendiente/u);
});
