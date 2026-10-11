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

async function run(current: BurstSnapshot, pendingInbox: Array<{ tripId: string; tripName: string; burstId: string; messageIds?: string[]; status: string; reference: string; summary: string; href: string; failureCode?: string | null }> = []) {
  let claimed = false;
  let reply = "";
  let modelRuns = 0;
  let reads = 0;
  let writes = 0;
  const domain: AgentDomain = {
    async pendingInbox() { return pendingInbox; },
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
  assert.equal(deterministicConversationIntent("No no nada olvidate")?.kind, "CANCEL_CLARIFICATION");
  assert.equal(deterministicConversationIntent("Podes guardar todo en la webb??")?.kind, "CAPABILITIES");
  assert.equal(deterministicConversationIntent("Sin registrar y no continúes, dale avanzamos")?.kind, "CONTRADICTORY_CONTROL");
  assert.equal(deterministicConversationIntent("PANLOS FOB USD 9 y MOQ 500"), null);
});

test("las consultas generales exactas sobre web y formatos terminan como consulta, no como evidencias", async () => {
  const current = snapshot("Podes guardar todo en la webb??");
  current.revision = 2;
  current.messages.push({ id: "message-2", sequence: 2, sentAt: null, envelope: { ...current.messages[0].envelope, messageId: "external-2", text: "Audios fotos videos todo?" }, reading: null });
  assert.equal(buildEvidenceGraph(current).loads.length, 2, "reproduce el conteo anterior sin controles determinísticos");
  const result = await run(current);
  assert.match(result.reply, /texto, fotos, audios y documentos/u);
  assert.match(result.reply, /videos todavía no se procesan/u);
  assert.match(result.reply, /Evidencias de WhatsApp/u);
  assert.deepEqual(result.state.controlIds, ["message-1", "message-2"]);
  assert.equal(result.state.ingestion, undefined);
  assert.equal(result.modelRuns, 0);
  assert.equal(result.reads, 0);
  assert.equal(result.writes, 0);
  const graph = buildEvidenceGraph({ ...current, state: result.state });
  assert.equal(graph.loads.length, 0);
  assert.equal(graph.summary.pending, 0);
});

test("secuencia textual del incidente 17:57: dos consultas no crean cargas y REINTENTAR no repite el bloqueo", async () => {
  const current = snapshot("Podes guardar todo en la webb??");
  current.revision = 2;
  current.messages.push({ id: "message-2", sequence: 2, sentAt: null, envelope: { ...current.messages[0].envelope, messageId: "external-2", text: "Audios fotos videos todo?" }, reading: null });
  const answered = await run(current);
  assert.deepEqual(answered.state.controlIds, ["message-1", "message-2"]);
  assert.equal(buildEvidenceGraph({ ...current, state: answered.state }).summary.pending, 0);

  const retryBase = structuredClone(answered.state);
  retryBase.agent.pending = { type: "CLARIFICATION", terminalFailure: true, revision: 2, text: "Error funcional", options: [] };
  retryBase.agent.termination = { reason: "tool_error", revision: 2, rounds: 4, errorCode: "UNFINISHED_OPERATION", failedTool: "finish_turn" };
  retryBase.ingestion = {
    version: 1, revision: 2, links: [], derivations: [],
    assets: [{ id: "preserved-commercial-evidence", type: "IMAGE", status: "GROUPED", loadIds: ["preserved-load"] }],
    loads: [{ id: "preserved-load", type: "PRODUCT", assetIds: ["preserved-commercial-evidence"], name: "Producto previo", status: "GROUPED", reasons: [] }],
    summary: { totalAssets: 1, totalLogicalLoads: 1, processed: 0, pending: 1, needsReview: 0, failed: 0 },
  };
  const retry = snapshot("REINTENTAR", retryBase);
  retry.messages.unshift(...current.messages);
  retry.revision = 3;
  retry.messages.at(-1)!.sequence = 3;
  retry.messages.at(-1)!.id = "message-3";
  retry.messages.at(-1)!.envelope.messageId = "external-3";
  const retried = await run(retry);
  assert.equal(retried.modelRuns, 0);
  assert.equal(retried.writes, 0);
  assert.equal(retried.state.ingestion?.loads.length, 1);
  assert.equal(retried.state.ingestion?.summary.needsReview, 1);
  assert.match(retried.reply, /Evidencias de WhatsApp/u);
  assert.doesNotMatch(retried.reply, /respond[eé] reintentar/iu);
});

test("cancelar una aclaración conserva la carga como revisión humana y no crea una evidencia nueva", async () => {
  const previous = agentState({ tripId: "trip", groups: [], question: "¿A qué proveedor corresponde la foto?", controlIds: [], pendingRefs: [], evaluatedRevision: 1 });
  previous.agent.pending = { type: "CLARIFICATION", revision: 1, text: previous.question!, options: [], loadId: "old-load", products: [{ name: "Limpia pileta", sourceMessageIds: ["old-image"] }] };
  previous.ingestion = {
    version: 1, revision: 1, activeLoadId: "old-load", links: [], derivations: [],
    assets: [{ id: "old-image", type: "IMAGE", status: "GROUPED", loadIds: ["old-load"] }],
    loads: [{ id: "old-load", type: "PRODUCT", assetIds: ["old-image"], name: "Limpia pileta", status: "GROUPED", reasons: [] }],
    summary: { totalAssets: 1, totalLogicalLoads: 1, processed: 0, pending: 1, needsReview: 0, failed: 0 },
  };
  const current = snapshot("No no nada olvidate", previous);
  current.messages.unshift({ id: "old-image", sequence: 1, sentAt: null, envelope: { instance: "test", phone: current.phone, messageId: "old-external", type: "IMAGE", text: null, media: null, sentAt: null }, reading: null });
  const result = await run(current);
  assert.match(result.reply, /evidencia.*conserva/u);
  assert.equal(result.modelRuns, 0);
  assert.equal(result.writes, 0);
  assert.deepEqual(result.state.controlIds, ["message-2"]);
  assert.equal(result.state.agent.pending, null);
  assert.equal(result.state.question, null);
  assert.equal(result.state.ingestion?.loads.length, 1);
  assert.equal(result.state.ingestion?.loads[0].status, "NEEDS_REVIEW");
  assert.equal(result.state.ingestion?.summary.pending, 0);
  assert.equal(result.state.ingestion?.summary.needsReview, 1);
});

test("consultar evidencias pendientes usa el inbox persistido, incluso sin proveedores, y no devuelve otros viajes", async () => {
  const current = snapshot("Decime qué evidencia está pendiente");
  const result = await run(current, [
    { tripId: "trip", tripName: "Feria", burstId: "failed-image-audio", messageIds: ["quoted-image"], status: "Error de herramienta; evidencia conservada", reference: "Sin proveedor asociado", summary: "image + audio + text: Limpia pileta, FOB USD 200, MOQ 50", href: "/app/viajes/trip", failureCode: "UNFINISHED_OPERATION" },
    { tripId: "other-trip", tripName: "Otro viaje", burstId: "other-evidence", status: "Pendiente de revisión", reference: "Otro proveedor", summary: "Texto privado ajeno", href: "/app/viajes/other-trip" },
  ]);
  assert.match(result.reply, /Evidencias pendientes/u);
  assert.match(result.reply, /Limpia pileta, FOB USD 200, MOQ 50/u);
  assert.match(result.reply, /UNFINISHED_OPERATION/u);
  assert.match(result.reply, /\/app\/viajes\/trip/u);
  assert.doesNotMatch(result.reply, /Otro viaje|Texto privado ajeno/u);
  assert.doesNotMatch(result.reply, /Información registrada|Proveedores/u);
  assert.equal(result.modelRuns, 0);
  assert.equal(result.writes, 0);
});

test("consulta de pendientes sin resultados responde claramente que no hay evidencias", async () => {
  const result = await run(snapshot("¿Qué falta procesar?"));
  assert.match(result.reply, /No hay evidencias pendientes/u);
  assert.equal(result.modelRuns, 0);
  assert.equal(result.writes, 0);
});

test("una consulta citada se limita a la evidencia del mensaje citado", async () => {
  const current = snapshot("¿Qué evidencia está pendiente?");
  current.messages[0].envelope.quotedMessageId = "quoted-image";
  const result = await run(current, [
    { tripId: "trip", tripName: "Feria", burstId: "cited", messageIds: ["quoted-image"], status: "Pendiente de revisión", reference: "Proveedor A", summary: "image: tarjeta conservada", href: "/app/viajes/trip" },
    { tripId: "trip", tripName: "Feria", burstId: "uncited", messageIds: ["other-image"], status: "Pendiente de revisión", reference: "Proveedor B", summary: "image: otra tarjeta", href: "/app/viajes/trip" },
  ]);
  assert.match(result.reply, /Proveedor A/u);
  assert.doesNotMatch(result.reply, /Proveedor B/u);
  assert.equal(result.modelRuns, 0);
});

test("REINTENTAR no vuelve a ejecutar finish_turn con un error determinístico", async () => {
 for (const errorCode of ["UNFINISHED_OPERATION", "UNVERIFIED_RESPONSE"] as const) {
  const previous = agentState({ tripId: "trip", groups: [], question: "Error funcional", controlIds: [], pendingRefs: [], evaluatedRevision: 1 });
  previous.agent.pending = { type: "CLARIFICATION", terminalFailure: true, text: previous.question!, options: [], revision: 1 };
  previous.agent.termination = { reason: "tool_error", revision: 1, rounds: 4, errorCode, failedTool: "finish_turn" };
  previous.ingestion = {
    version: 1, revision: 1, activeLoadId: "product-load", links: [], derivations: [],
    assets: [{ id: "commercial-text", type: "TEXT", status: "GROUPED", loadIds: ["product-load"] }],
    loads: [{ id: "product-load", type: "PRODUCT", assetIds: ["commercial-text"], name: "Limpia pileta", status: "GROUPED", reasons: [] }],
    summary: { totalAssets: 1, totalLogicalLoads: 1, processed: 0, pending: 1, needsReview: 0, failed: 0 },
  };
  const current = snapshot("REINTENTAR", previous);
  current.messages.unshift({ id: "commercial-text", sequence: 1, sentAt: null, envelope: { ...current.messages[0].envelope, messageId: "commercial", text: "Limpia pileta FOB USD 200 MOQ 50" }, reading: null });
  const result = await run(current);
  assert.match(result.reply, /no puedo resolver este bloqueo repitiendo/iu);
  assert.doesNotMatch(result.reply, /respond[eé] reintentar/iu);
  assert.equal(result.modelRuns, 0);
  assert.equal(result.reads, 0);
  assert.equal(result.writes, 0);
  assert.equal(result.state.agent.pending?.terminalFailure, true);
  assert.equal(result.state.ingestion?.summary.needsReview, 1);
  assert.equal(result.state.ingestion?.loads[0].error?.type, errorCode);
  assert.equal(result.state.ingestion?.loads[0].error?.retryable, false);
 }
});

test("REINTENTAR no repite UNVERIFIED_RESPONSE y ofrece revisión Web", async () => {
  const previous = agentState({ tripId: "trip", groups: [], question: "No pude completar el registro", controlIds: [], pendingRefs: [], evaluatedRevision: 1 });
  previous.agent.pending = { type: "CLARIFICATION", terminalFailure: true, text: previous.question!, options: [], revision: 1 };
  previous.agent.termination = { reason: "tool_error", revision: 1, rounds: 7, errorCode: "UNVERIFIED_RESPONSE", failedTool: "finish_turn" };
  previous.ingestion = {
    version: 1, revision: 1, activeLoadId: "glass-load", links: [], derivations: [],
    assets: [{ id: "glass-photo", type: "IMAGE", status: "GROUPED", loadIds: ["glass-load"] }],
    loads: [{ id: "glass-load", type: "EVIDENCE", assetIds: ["glass-photo"], name: null, status: "GROUPED", reasons: [] }],
    summary: { totalAssets: 1, totalLogicalLoads: 1, processed: 0, pending: 1, needsReview: 0, failed: 0 },
  };
  const current = snapshot("REINTENTAR", previous);
  const result = await run(current);
  assert.match(result.reply, /no puedo resolver este bloqueo repitiendo/iu);
  assert.match(result.reply, /Evidencias de WhatsApp/u);
  assert.doesNotMatch(result.reply, /respond[eé] reintentar/iu);
  assert.equal(result.modelRuns, 0);
  assert.equal(result.writes, 0);
  assert.equal(result.state.agent.pending?.terminalFailure, true);
  assert.equal(result.state.ingestion?.loads[0].error?.retryable, false);
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
