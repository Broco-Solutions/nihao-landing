import test from "node:test";
import assert from "node:assert/strict";
import { validateBurstPlan } from "../../lib/channels/whatsapp/burst-interpreter.ts";
import type { BurstCatalog, BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

const suppliers = [
  { id: "alfa", name: "Alfa Tools", companyId: "broco", captureId: "capture-alfa", city: "Shenzhen" },
  { id: "beta", name: "Beta Medical", companyId: "kendal", captureId: "capture-beta", city: "Shanghai" },
];
const catalog: BurstCatalog = { trips: [{ id: "trip", name: "China", companies: [{ id: "broco", name: "Broco Solutions" }, { id: "kendal", name: "Kendal Salud" }], suppliers }] };
const snapshot = (text = "Agregá producto Lámpara a Alfa Tools. FOB USD 7 por unidad."): BurstSnapshot => ({ id: "burst", instance: "nihao", phone: "5491112345678", userId: "user", revision: 1, status: "PROCESSING", leaseId: "lease", state: { tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: [{ id: "m1", sequence: 1, sentAt: null, envelope: { instance: "nihao", phone: "5491112345678", messageId: "m1", type: "TEXT", text, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: "m1:1", text }] } }] });
const proposal = () => ({ tripId: "trip", groups: [{ kind: "PRODUCT", name: "Alfa Tools", supplierQuery: "Alfa Tools", supplierId: "alfa", productName: "Lámpara", refs: ["m1:1"], companyId: null, certain: true, reason: "Pedido explícito de agregar un producto a un proveedor existente" }], pendingRefs: [], controlIds: [] });

test("producto de un proveedor único hereda su empresa sin crear nueva carga de proveedor", () => {
  const result = validateBurstPlan(proposal(), snapshot(), catalog);
  assert.equal(result.groups[0].kind, "PRODUCT");
  assert.equal(result.groups[0].supplierId, "alfa");
  assert.equal(result.groups[0].companyId, "broco");
  assert.equal(result.groups[0].productName, "Lámpara");
  assert.equal(result.question, null);
});

test("proveedor inexistente conserva la carga de producto y pregunta el destino", () => {
  const raw = proposal(); raw.groups[0].supplierQuery = "Gamma"; raw.groups[0].supplierId = null as never;
  const result = validateBurstPlan(raw, snapshot("Agregá producto Lámpara a Gamma"), catalog);
  assert.equal(result.groups[0].supplierId, null);
  assert.equal(result.groups[0].kind, "PRODUCT");
  assert.match(result.question!, /no encontré un proveedor guardado/);
});

test("no acepta IDs arbitrarios ni nombres de productos inventados", () => {
  const raw = proposal(); raw.groups[0].supplierId = "foreign";
  assert.throws(() => validateBurstPlan(raw, snapshot(), catalog), /no autorizado/);
  raw.groups[0].supplierId = "beta";
  assert.throws(() => validateBurstPlan(raw, snapshot(), catalog), /no coincide/);
  raw.groups[0].supplierId = "alfa"; raw.groups[0].productName = "Taladro";
  assert.equal(validateBurstPlan(raw, snapshot(), catalog).groups[0].productName, null);
});

test("homónimos preguntan proveedor y empresa; respuesta numérica usa opciones persistidas", () => {
  const ambiguous: BurstCatalog = { trips: [{ ...catalog.trips[0], suppliers: [suppliers[0], { ...suppliers[0], id: "alfa-kendal", captureId: "capture-other", companyId: "kendal", city: "Shanghai" }] }] };
  const batch = snapshot(); const first = validateBurstPlan(proposal(), batch, ambiguous);
  assert.equal(first.groups[0].supplierId, null);
  assert.match(first.question!, /1\. Alfa Tools — Broco Solutions/);
  assert.match(first.question!, /2\. Alfa Tools — Kendal Salud/);
  assert.doesNotMatch(first.question!, /¿Para qué empresa/);
  batch.state = first; batch.revision = 2;
  batch.messages.push({ ...snapshot("2").messages[0], id: "answer", sequence: 2, reading: { complete: true, segments: [{ id: "answer:1", text: "2" }] } });
  const result = validateBurstPlan({ ...proposal(), groups: [{ ...first.groups[0], supplierId: "alfa-kendal" }], controlIds: ["answer"] }, batch, ambiguous);
  assert.equal(result.groups[0].supplierId, "alfa-kendal");
  assert.equal(result.groups[0].companyId, "kendal");
  assert.equal(result.question, null);
});

test("nombre parcial ambiguo no asocia por similitud; ciudad explícita puede desambiguar", () => {
  const raw = proposal(); raw.groups[0].supplierQuery = "Alfa";
  const ambiguous: BurstCatalog = { trips: [{ ...catalog.trips[0], suppliers: [suppliers[0], { ...suppliers[0], id: "alfa-medical", name: "Alfa Medical", city: "Shanghai" }] }] };
  assert.equal(validateBurstPlan(raw, snapshot("Producto Lámpara para Alfa"), ambiguous).groups[0].supplierId, null);
  assert.equal(validateBurstPlan(raw, snapshot("Producto Lámpara para Alfa, el de Shenzhen"), ambiguous).groups[0].supplierId, "alfa");
});

test("producto sin nombre conserva borrador y proveedor; el nombre se completa en web", () => {
  const raw = proposal(); raw.groups[0].productName = null as never;
  const result = validateBurstPlan(raw, snapshot("Agregá este producto a Alfa Tools"), catalog);
  assert.equal(result.groups[0].supplierId, "alfa");
  assert.equal(result.groups[0].productName, null);
  assert.equal(result.question, null);
});
