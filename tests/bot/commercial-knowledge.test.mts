import test from "node:test";
import assert from "node:assert/strict";
import { applyCommercialFacts, extractCommercialFacts } from "../../lib/bot/commercial-knowledge.ts";
import type { ExtractionCandidate } from "../../lib/bot/types.ts";

const candidate = (text: string, fields: ExtractionCandidate["extractedFields"] = {}): ExtractionCandidate => ({
  rawSource: { type: "AUDIO_TRANSCRIPT", text }, extractedFields: fields, reviewFields: [], evidence: [],
});

test("evals Comex A/B/D/F: extrae MOQ, composición, FOB literal y lead time", () => {
  const a = extractCommercialFacts("Zapatillas, MOQ 200, FOB 12 dólares por par");
  assert.deepEqual(a.moq, { quantity: 200, unit: "unidades", notes: null, rawText: "MOQ 200" });
  assert.deepEqual(a.fob, { amount: 12, currency: "USD", unit: "par", rawText: "FOB 12 dólares por par" });
  const b = extractCommercialFacts("El MOQ es 200: 100 negras y 100 rojas");
  assert.equal(b.moq?.quantity, 200);
  assert.match(b.moq?.notes ?? "", /100 negras/iu);
  assert.equal(extractCommercialFacts("El FOB es 8,50 USD por unidad").fob?.amount, 8.5);
  assert.equal(extractCommercialFacts("Lead time tres semanas").leadTime?.days, 21);
});

test("evals C/E/J: separa modelo MOC, CIF y ambigüedad", () => {
  const model = applyCommercialFacts("Este modelo se llama MOC-200", candidate("Este modelo se llama MOC-200", { category: "MOC-200" }));
  assert.equal(model.extractedFields.moq, undefined);
  assert.equal(model.extractedFields.category, undefined);
  assert.ok(model.reviewFields.includes("category"));
  assert.equal(extractCommercialFacts("El precio es CIF 10 dólares").fob, undefined);
  const ambiguous = extractCommercialFacts("No sé si dijo MOQ 200 o modelo MOC-200");
  assert.equal(ambiguous.moq, undefined);
  assert.ok(ambiguous.ambiguousMoq);
});

test("una consulta conceptual no produce hechos comerciales", () => {
  const facts = extractCommercialFacts("¿Qué significa MOQ y FOB?");
  assert.equal(facts.moq, undefined);
  assert.equal(facts.fob, undefined);
  assert.equal(facts.leadTime, undefined);
});

test("fon sólo se normaliza en la capa previa existente, no desde una cadena libre", () => {
  const facts = extractCommercialFacts("Mi teléfono es fon 15");
  assert.equal(facts.fob, undefined);
  assert.equal(facts.ambiguousMoq, undefined);
});
