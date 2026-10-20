import assert from "node:assert/strict";
import test from "node:test";
import { evidencePreview, negotiationPreview } from "../../lib/channels/whatsapp/evidence-preview.ts";
import type { CommercialFacts } from "../../lib/channels/whatsapp/commercial-review.ts";

const facts = (patch: Partial<CommercialFacts> = {}): CommercialFacts => ({ companyName: null, city: null, category: null, contact: null, productName: null, fob: null, quotedPrice: null, moq: null, leadTime: null, notes: null, ...patch });

test("las tarjetas muestran proveedor, producto y precio cotizado sin convertirlo en FOB", () => {
  const preview = evidencePreview({ type: "AUDIO", transcript: "China TV cotizó un televisor", facts: facts({ companyName: "China TV", productName: "Televisor", quotedPrice: { amount: 200, currency: "USD", unit: "unidad", rawText: "200 dólares la unidad" } }) });
  assert.equal(preview.title, "Televisor — China TV");
  assert.equal(preview.summary, "Precio cotizado: USD 200 / unidad.");
});

test("la información parcial y las fotografías conservan contexto literal sin inventar campos", () => {
  assert.deepEqual(evidencePreview({ type: "IMAGE", facts: facts({ companyName: "Shenzhen Electronics" }) }), { title: "Shenzhen Electronics", summary: "Fotografía. Se identificó un proveedor, pero no un producto.", kind: "Fotografía" });
  assert.equal(evidencePreview({ type: "AUDIO", transcript: "Pregunté por vasos transparentes", facts: facts({ category: "vasos" }) }).title, "Consulta sobre vasos");
  assert.equal(evidencePreview({ type: "IMAGE", facts: facts() }).title, "Fotografía pendiente de identificar");
  assert.equal(evidencePreview({ type: "IMAGE", visual: "Caja azul con etiqueta", facts: facts() }).summary, "Caja azul con etiqueta");
});

test("las negociaciones distinguen nombres diferentes y resumen tipos de mensajes", () => {
  const one = { type: "AUDIO", transcript: "Precio de vasos", facts: facts({ companyName: "Proveedor A", productName: "Vasos" }) };
  const two = { type: "IMAGE", ocr: "Tarjeta B", facts: facts({ companyName: "Proveedor B", productName: "Tazas" }) };
  const preview = negotiationPreview([one, two]);
  assert.equal(preview.ambiguous, true);
  assert.match(preview.summary, /Seleccioná las fuentes/);
  assert.equal(preview.kinds, "Audio · Fotografía");
  assert.equal(negotiationPreview([one, { ...one, type: "TEXT" }]).title, "Vasos — Proveedor A");
});
