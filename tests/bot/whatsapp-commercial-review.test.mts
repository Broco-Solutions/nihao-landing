import assert from "node:assert/strict";
import test from "node:test";
import { commercialFactsFromReading, decisionStatus, isCommercialMessage } from "../../lib/channels/whatsapp/commercial-review.ts";

test("las cinco consultas del caso real quedan únicamente en historial", () => {
  for (const text of ["Y ahora?", "Hay evidencias pendientes?", "Y", "Y", "Y"]) {
    assert.equal(isCommercialMessage("TEXT", text, { segments: [] }), false);
  }
  assert.equal(isCommercialMessage("TEXT", "Y", { segments: [{ candidate: { extractedFields: { companyName: "Y" } } }] }), false);
});

test("el audio comercial conserva importes y unidades ausentes sin inventar producto", () => {
  const reading = { segments: [{ candidate: { extractedFields: { category: "zapatillas", fob: { amount: 12, currency: "USD", unit: null }, moq: { quantity: 200, unit: null }, leadTime: { days: 21 } } } }] };
  const facts = commercialFactsFromReading(reading);
  assert.equal(isCommercialMessage("AUDIO", null, reading), true);
  assert.equal(facts.productName, null);
  assert.equal(facts.category, "zapatillas");
  assert.deepEqual(facts.fob, { amount: 12, currency: "USD", unit: null });
  assert.deepEqual(facts.moq, { quantity: 200, unit: null, notes: null });
  assert.equal(facts.leadTime?.days, 21);
  assert.equal(isCommercialMessage("TEXT", "Nike", { segments: [] }), false);
  assert.equal(decisionStatus(facts, [{ action: "LINK_SUPPLIER" }]), "pending");
  assert.equal(decisionStatus(facts, [{ action: "APPLY_PRODUCT", appliedFields: ["fob", "moq"] }]), "pending");
  assert.equal(decisionStatus(facts, [{ action: "APPLY_PRODUCT", appliedFields: ["fob", "moq", "leadTime"] }]), "pending");
  assert.equal(decisionStatus(facts, [{ action: "APPLY_PRODUCT", appliedFields: ["category", "fob", "moq", "leadTime"] }]), "resolved");
  assert.equal(decisionStatus(facts, [{ action: "DISCARD" }]), "resolved");
});
