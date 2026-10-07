import test from "node:test";
import assert from "node:assert/strict";
import { renderBatchSummary, renderClarification, renderSavedResults, renderTechnicalSummary, userQuestion } from "../../lib/channels/whatsapp/clarification-rendering.ts";
import { agentState, type AgentReceipt } from "../../lib/channels/whatsapp/agent-contract.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import { selectedSupplierNumber, sendSupplierReply, supplierRowId } from "../../lib/channels/whatsapp/supplier-picker.ts";

const receipt = (id: string, product = false, draft = false): AgentReceipt => ({ operationId: id, id, name: id, tool: product ? "create_product_draft" : "create_supplier_draft", status: "COMPLETED", resourceStatus: draft ? "DRAFT" : "CONFIRMED", completedRevision: 3 });
const summary = { totalAssets: 7, totalLogicalLoads: 5, processed: 3, pending: 0, needsReview: 2, failed: 0 };
const forbidden = /evidencias|\bcargas\b|processed|needs_review|failed|logical loads?|revisions/iu;

test("3 proveedores y 2 productos sin dudas muestran sólo resultados y Todo listo", () => {
  assert.equal(renderBatchSummary(summary, [receipt("A"), receipt("B"), receipt("C"), receipt("P", true), receipt("Q", true)]), "✅ 3 proveedores cargados\n📦 2 productos cargados\n\nTodo listo.");
});
test("omite tipos sin resultados y usa singular", () => {
  assert.equal(renderSavedResults([receipt("A")]), "✅ 1 proveedor cargado\n\nTodo listo.");
  assert.equal(renderSavedResults([receipt("P", true)]), "📦 1 producto cargado\n\nTodo listo.");
});
test("borrador sin dudas concretas muestra sólo el resultado", () => {
  const reply = renderSavedResults([receipt("YKO", false, true)]);
  assert.match(reply, /1 proveedor cargado/); assert.match(reply, /Todo listo/);
  assert.doesNotMatch(reply, /pendiente de resolución|borrador|Necesito confirmar|datos extraídos/);
});
test("proveedor nuevo automático se describe como guardado sin pedir autorización", () => {
  const reply = renderSavedResults([{ ...receipt("WATERSY", false, true), data: { preservedImageLoad: true, possibleSuppliers: [] } }]);
  assert.match(reply, /1 proveedor cargado/); assert.doesNotMatch(reply, /borrador|datos extraídos|Necesito confirmar|¿|Querés|querés/);
});
test("una duda concreta por bullet; conserva opciones y preguntas adicionales", () => {
  const question = { text: "¿Cuál es el teléfono? Además: ¿Cuál es el correo?", options: [] };
  const reply = renderClarification(question);
  assert.equal(reply.split("\n").filter(l => l.startsWith("• ")).length, 2);
  assert.match(reply, /• ¿Cuál es el teléfono\?\n\n• ¿Cuál es el correo\?/);
  assert.match(renderClarification({ text: "No encontré ese proveedor. ¿Cuál es su nombre completo?", options: [], products: [{ name: "Vaso" }] }), /nombre completo/);
});
test("viaje separado de resumen y dudas de productos", () => {
  const question = renderClarification({ text: "¿En qué viaje y empresa querés cargar esta ráfaga?", contextSelection: true, options: [{ id: "company", label: "China — Broco" }], products: [{ name: "Caja", supplierQuery: "YKO" }] });
  const reply = renderSavedResults([receipt("A")], question);
  assert.ok(reply.indexOf("📍 Viaje") > reply.indexOf("1 proveedor cargado"));
  assert.match(reply, /📍 Viaje\n\n¿En qué viaje/); assert.match(reply, /Necesito confirmar algunos datos:\n\n• \*\*Caja:\*\*/);
  assert.doesNotMatch(reply, forbidden); assert.doesNotMatch(reply, /Todo listo/);
});
test("resultados parciales no muestran contadores técnicos ni pierden saltos de línea", () => {
  const reply = renderBatchSummary(summary, [receipt("A"), receipt("B", false, true)], renderClarification({ text: "Quedaron 2 evidencias para revisar (mensaje 3: needs_review). Las demás cargas se conservaron.", options: [] }));
  assert.doesNotMatch(reply, forbidden); assert.match(reply, /2 proveedores cargados\n\nNecesito confirmar/);
  assert.doesNotMatch(reply, /borrador|los datos extraídos/); assert.match(reply, /originales siguen guardados/);
});
test("rendering conserva estados y contadores para tracing y debug explícito", () => {
  const inputs = { summary: { ...summary }, receipts: [receipt("A", false, true)] };
  const before = structuredClone(inputs);
  renderBatchSummary(inputs.summary, inputs.receipts);
  assert.deepEqual(inputs, before); assert.equal(inputs.receipts[0].resourceStatus, "DRAFT");
  assert.deepEqual(JSON.parse(renderTechnicalSummary(inputs.summary)), summary);
});
test("respuesta corta a aclaración no vuelve a contar operaciones anteriores", () => {
  assert.equal(renderSavedResults([receipt("A")], "¿Cuál es el teléfono?", 4), "¿Cuál es el teléfono?");
});
test("borrador agrupa todos los campos dudosos en un bullet sin alterar lecturas originales", () => {
  const state = agentState({ tripId: "trip", groups: [], question: null, controlIds: [], pendingRefs: [] });
  state.ingestion = { version: 1, revision: 3, assets: [], links: [], derivations: [], summary, loads: [{ id: "load", type: "SUPPLIER", assetIds: ["image"], name: "YKO", status: "NEEDS_REVIEW", reasons: [] }] };
  const snapshot: BurstSnapshot = { id: "burst", instance: "test", phone: "123", userId: "user", revision: 3, status: "WAITING", leaseId: null, state, messages: [{ id: "image", sequence: 1, sentAt: null, envelope: { instance: "test", phone: "123", messageId: "image", type: "IMAGE", text: null, media: null, sentAt: null }, reading: { segments: [], ingestion: { status: "NEEDS_REVIEW", stage: "vision", attempts: [], loadIds: ["load"], classification: { type: "BUSINESS_CARD", side: "FRONT", confidence: .5, readability: "ambiguous", visual: "YKO", product: null, card: { companyName: "YKO", personName: null, role: null, phones: [], emails: [], websites: [], address: null, visibleText: [], uncertainFields: ["phones", "emails"], branding: null } } } } }] };
  const before = structuredClone(snapshot);
  const reply = renderSavedResults([{ ...receipt("YKO", false, true), logicalLoadIds: ["load"] }], null, undefined, snapshot);
  assert.match(reply, /Necesito confirmar el teléfono y el correo electrónico/);
  assert.equal(reply.split("\n").filter(l => l.startsWith("• ")).length, 1); assert.deepEqual(snapshot, before);
  const sixSnapshot = structuredClone(snapshot);
  sixSnapshot.messages = Array.from({ length: 6 }, (_, i) => ({ ...structuredClone(snapshot.messages[0]), id: `image${i}`, sequence: i + 1, envelope: { ...snapshot.messages[0].envelope, messageId: `image${i}` } }));
  sixSnapshot.state.ingestion!.loads = sixSnapshot.messages.map((m, i) => ({ id: `load${i}`, type: "SUPPLIER", assetIds: [m.id], name: `Proveedor ${i + 1}`, status: "NEEDS_REVIEW", reasons: [] }));
  const sixCards = Array.from({ length: 6 }, (_, i) => ({ ...receipt(`Proveedor ${i + 1}`, false, true), logicalLoadIds: [`load${i}`] }));
  const sixReply = renderSavedResults(sixCards, null, undefined, sixSnapshot);
  assert.match(sixReply, /6 proveedores cargados/);
  assert.equal(sixReply.split("\n").filter(l => l.startsWith("• ")).length, 6);
  for (const r of sixCards) {
    assert.equal(sixReply.split("\n").filter(l => l.startsWith(`• **${r.name}:**`)).length, 1);
  }
});
test("outbox con lista entrega el texto renderizado y mantiene respuesta numérica", async () => {
  const state = agentState({ tripId: "trip", groups: [], question: null, controlIds: [], pendingRefs: [] });
  state.agent.pending = { text: "¿A qué proveedor pertenece la caja?", type: "CLARIFICATION", revision: 3, supplierPicker: true, options: [{ id: "supplier", label: "YKO" }], products: [{ name: "Caja" }] };
  const context = { burstId: "burst", revision: 3, state };
  const reply = renderClarification(state.agent.pending);
  state.question = reply; state.agent.pending.text = "Texto interno";
  const sent: string[] = [];
  await sendSupplierReply({ async sendText({ text }) { sent.push(text); }, async sendList({ description }) { sent.push(description); } }, "123", reply, context);
  assert.ok(sent[0].startsWith(reply)); assert.doesNotMatch(sent[0], /Texto interno/);
  assert.equal(selectedSupplierNumber(supplierRowId("burst", 3, 0), context), "1");
  const fallback: string[] = [];
  await sendSupplierReply({ async sendText({ text }) { fallback.push(text); } }, "123", reply, context);
  assert.equal(fallback[0], reply);
});
test("aprobación muestra campos legibles y conserva decisión sí/cancelar", () => {
  const reply = userQuestion('¿Confirmás el cambio en «YKO»?\nActual: {"status":"DRAFT","phone":null}\nNuevo: {"status":"CONFIRMED","phone":"123"}\nRespondé sí o cancelar.');
  assert.match(reply, /Estado: borrador/); assert.match(reply, /Estado: confirmado/); assert.match(reply, /Teléfono: 123/); assert.match(reply, /sí o cancelar/);
  assert.doesNotMatch(reply, /\{|DRAFT|CONFIRMED/);
});

test("producto con varias preguntas recibe un solo bullet con todas sus necesidades", () => {
  const reply = renderClarification({ text: "¿Cuál es el teléfono? Además: ¿Cuál es el correo?", options: [], products: [{ name: "Caja de bloques" }] });
  assert.equal(reply.split("\n").filter(l => l.startsWith("• ")).length, 1);
  assert.match(reply, /• \*\*Caja de bloques:\*\* ¿Cuál es el teléfono\? ¿Cuál es el correo\?/);
});

test("aclaración de un producto guardado se incorpora a su único bullet", () => {
  const question = renderClarification({ text: "¿Cuál es el precio? Además: ¿Cuál es el plazo?", options: [], products: [{ name: "Caja" }] });
  const reply = renderSavedResults([receipt("Caja", true, true)], question);
  assert.equal(reply.split("\n").filter(l => l.startsWith("• ")).length, 1);
  assert.match(reply, /• \*\*Caja:\*\* ¿Cuál es el precio\? ¿Cuál es el plazo\?/);
  assert.doesNotMatch(reply, /los datos extraídos/);
});
test("registros distintos con el mismo nombre no generan preguntas por su estado", () => {
  const reply = renderSavedResults([{ ...receipt("uno", false, true), name: "ABC" }, { ...receipt("dos", false, true), name: "ABC" }]);
  assert.equal(reply.split("\n").filter(l => l.startsWith("• ")).length, 0);
  assert.match(reply, /2 proveedores cargados/);
});

test("servilletas de papel no pide confirmar datos extraídos por ser borrador", () => {
  const saved = { ...receipt("servilletas de papel", true, true), data: { missingFields: ["fob", "moq", "leadTime"] } };
  assert.equal(renderSavedResults([saved]), "📦 1 producto cargado\n\nTodo listo.");
  assert.equal(saved.resourceStatus, "DRAFT");
});

test("la asociación ambigua de una tarjeta sigue solicitando el destino concreto", () => {
  const reply = renderSavedResults([{ ...receipt("ABC", false, true), data: { possibleSuppliers: [{ id: "a" }, { id: "b" }] } }]);
  assert.match(reply, /Necesito confirmar a qué proveedor corresponde esta tarjeta/);
  assert.doesNotMatch(reply, /borrador|datos extraídos|Todo listo/);
});

test("producto sin nombre conserva la pregunta concreta aunque se omitan avisos de borrador", () => {
  const reply = renderSavedResults([receipt("Producto sin nombre", true, true)]);
  assert.match(reply, /Necesito confirmar el nombre del producto/);
  assert.doesNotMatch(reply, /borrador|datos extraídos|Todo listo/);
});
