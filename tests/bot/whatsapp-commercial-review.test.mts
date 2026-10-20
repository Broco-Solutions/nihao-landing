import assert from "node:assert/strict";
import test from "node:test";
import { commercialFactsFromMessage, commercialFactsFromReading, decisionStatus, isCommercialMessage } from "../../lib/channels/whatsapp/commercial-review.ts";

test("las cinco consultas del caso real quedan únicamente en historial", () => {
  for (const text of ["Y ahora?", "Hay evidencias pendientes?", "Y", "Y", "Y"]) {
    assert.equal(isCommercialMessage("TEXT", text, { segments: [] }), false);
  }
  assert.equal(isCommercialMessage("TEXT", "Y", { segments: [{ candidate: { extractedFields: { companyName: "Y" } } }] }), false);
});

test("cinco mensajes de televisores conservan proveedor, MOQ sin unidad y precio cotizado separado de FOB", () => {
  const messages = ["Una empresa vende televisores", "Se llama tvsellerschina", "Moq 250", "Valen 600 usd cada uno"];
  const facts = messages.map((text) => commercialFactsFromMessage("TEXT", text, { segments: [] }));
  assert.equal(facts[0].category, "televisores");
  assert.equal(facts[1].companyName, "tvsellerschina");
  assert.deepEqual(facts[2].moq, { quantity: 250, unit: null, notes: null });
  assert.deepEqual(facts[3].quotedPrice, { amount: 600, currency: "USD", unit: "unidad", rawText: "600 usd cada uno" });
  assert.equal(facts[3].fob, null);
  assert.ok(messages.every((text) => isCommercialMessage("TEXT", text, { segments: [] })));
  assert.equal(decisionStatus(facts[3], [{ action: "LINK_SUPPLIER" }]), "pending");
  assert.equal(decisionStatus(facts[3], [{ action: "APPLY_NEGOTIATION", appliedFields: ["quotedPrice"] }]), "resolved");
});

test("un audio conserva un precio literal genérico sin inferir FOB", () => {
  const facts = commercialFactsFromMessage("AUDIO", null, { transcript: "Cargame un televisor. 200 dólares la unidad.", segments: [] });
  assert.deepEqual(facts.quotedPrice, { amount: 200, currency: "USD", unit: "unidad", rawText: "200 dólares la unidad" });
  assert.equal(facts.fob, null);
  assert.equal(commercialFactsFromMessage("AUDIO", null, { transcript: "El FOB es 200 dólares la unidad", segments: [] }).quotedPrice, null);
});

test("el audio comercial conserva importes y unidades ausentes sin inventar producto", () => {
  const reading = { segments: [{ candidate: { extractedFields: { category: "zapatillas", fob: { amount: 12, currency: "USD", unit: null }, moq: { quantity: 200, unit: null }, leadTime: { days: 21 } } } }] };
  const facts = commercialFactsFromReading(reading);
  assert.equal(isCommercialMessage("AUDIO", null, reading), true);
  assert.equal(facts.productName, null);
  assert.equal(facts.category, "zapatillas");
  assert.deepEqual(facts.fob, { amount: 12, currency: "USD", unit: null, rawText: "" });
  assert.deepEqual(facts.moq, { quantity: 200, unit: null, notes: null });
  assert.equal(facts.leadTime?.days, 21);
  assert.equal(isCommercialMessage("TEXT", "Nike", { segments: [] }), false);
  assert.equal(decisionStatus(facts, [{ action: "LINK_SUPPLIER" }]), "pending");
  assert.equal(decisionStatus(facts, [{ action: "APPLY_PRODUCT", appliedFields: ["fob", "moq"] }]), "pending");
  assert.equal(decisionStatus(facts, [{ action: "APPLY_PRODUCT", appliedFields: ["fob", "moq", "leadTime"] }]), "pending");
  assert.equal(decisionStatus(facts, [{ action: "APPLY_PRODUCT", appliedFields: ["category", "fob", "moq", "leadTime"] }]), "resolved");
  assert.equal(decisionStatus(facts, [{ action: "DISCARD" }]), "discarded");
  assert.equal(decisionStatus(facts, [{ action: "DISCARD" }, { action: "RECOVER" }]), "pending");
  assert.equal(decisionStatus(facts, [{ action: "DISCARD" }, { action: "RECOVER" }, { action: "DISCARD" }]), "discarded");
});
