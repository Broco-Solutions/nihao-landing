import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMissingFields,
  calculateQuestionFields,
  normalizeLeadTimeToDays,
  normalizeTier1Data,
} from "../../lib/bot/tier1.ts";

test("normaliza semanas y días a días", () => {
  assert.equal(normalizeLeadTimeToDays("4 semanas"), 28);
  assert.equal(normalizeLeadTimeToDays("cuatro semanas"), 28);
  assert.equal(normalizeLeadTimeToDays("20 días"), 20);
});

test("normaliza el modelo Tier 1 sin perder FOB ni aclaraciones del MOQ", () => {
  const fields = normalizeTier1Data({
    companyName: "  ABC Lighting ",
    supplierType: "FACTORY",
    fob: { amount: 7, currency: "usd", unit: " unidad ", rawText: "FOB 7 dólares" },
    moq: { quantity: 200, unit: "unidades", notes: "100 negras + 100 rojas", rawText: "mínimo 200" },
    leadTime: { rawText: "4 semanas", days: null },
    interestScore: 8,
  });
  assert.equal(fields.companyName, "ABC Lighting");
  assert.deepEqual(fields.fob, { amount: 7, currency: "USD", unit: "unidad", rawText: "FOB 7 dólares" });
  assert.equal(fields.moq?.notes, "100 negras + 100 rojas");
  assert.equal(fields.leadTime?.days, 28);
  assert.equal(fields.interestScore, null);
});

test("UNKNOWN y No sé permanecen pendientes sin repetir preguntas reconocidas", () => {
  const fields = normalizeTier1Data({ supplierType: "UNKNOWN" });
  assert.ok(calculateMissingFields(fields).includes("supplierType"));
  assert.deepEqual(calculateQuestionFields(fields), ["category", "interestScore"]);
  assert.deepEqual(calculateQuestionFields(fields, ["category"]), ["interestScore"]);
});
