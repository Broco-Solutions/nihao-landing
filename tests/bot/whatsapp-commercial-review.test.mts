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

test("el precio requiere moneda inequívoca o una señal explícita junto al símbolo", () => {
  assert.equal(commercialFactsFromMessage("TEXT", "El modelo es $200", { segments: [] }).quotedPrice, null);
  assert.deepEqual(commercialFactsFromMessage("TEXT", "El precio es $200 por unidad", { segments: [] }).quotedPrice, { amount: 200, currency: "USD", unit: "unidad", rawText: "$200 por unidad" });
  assert.equal(commercialFactsFromMessage("TEXT", "Televisor 200 USD y radio 100 USD", { segments: [] }).quotedPrice, null);
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
  assert.equal(decisionStatus(facts, [{ action: "APPLY_PRODUCT", appliedFields: ["fob", "moq", "leadTime"] }]), "resolved");
  assert.equal(decisionStatus(facts, [{ action: "APPLY_PRODUCT", appliedFields: ["category", "fob", "moq", "leadTime"] }]), "resolved");
  assert.equal(decisionStatus(facts, [{ action: "DISCARD" }]), "discarded");
  assert.equal(decisionStatus(facts, [{ action: "DISCARD" }, { action: "RECOVER" }]), "pending");
  assert.equal(decisionStatus(facts, [{ action: "DISCARD" }, { action: "RECOVER" }, { action: "DISCARD" }]), "discarded");
});

test("las categorías nuevas, ausentes y arbitrarias son datos opcionales", () => {
  const base = commercialFactsFromMessage("TEXT", "Precio 200 USD la unidad", { segments: [] });
  for (const category of [null, "hardware cuántico", "categoría inventada por el proveedor"]) {
    const facts = { ...base, category };
    assert.equal(decisionStatus(facts, [{ action: "APPLY_PRODUCT", appliedFields: ["quotedPrice"] }]), "resolved");
  }
});

test("preguntas de uso quedan en historial sin ocultar hechos ni instrucciones comerciales", () => {
  for (const text of ["Tipo de proveedor que tipos hay?", "¿Qué tipos de proveedor hay?", "¿Cómo cargo un proveedor?", "¿Qué hago ahora?", "¿Hay evidencias pendientes?", "Gracias", "¿Cómo funciona esto?"]) {
    assert.equal(isCommercialMessage("TEXT", text, { segments: [] }), false, text);
  }
  assert.equal(isCommercialMessage("TEXT", "¿Qué tipos de proveedor hay?", { segments: [{ candidate: { extractedFields: { category: "proveedor" } } }] }), false);
  for (const text of ["Encontré un proveedor de vasos", "Cargá esta tarjeta", "Este proveedor vende televisores", "Registrá almohadones como producto", "El MOQ es 200", "El precio es 200 USD por unidad"]) {
    assert.equal(isCommercialMessage("TEXT", text, { segments: [] }), true, text);
  }
});

test("un vínculo automático necesita revisión humana y el cierre se puede reabrir", () => {
  const cushions = commercialFactsFromMessage("TEXT", "Aca encontre almohadones que me interesan cargalos como producto", { segments: [{ candidate: { extractedFields: { category: "almohadones" } } }] });
  assert.equal(cushions.productName, null);
  assert.equal(decisionStatus(cushions, [{ action: "AUTO_PRODUCT" }]), "pending");
  assert.equal(decisionStatus(cushions, [{ action: "AUTO_PRODUCT" }, { action: "FINISH_REVIEW" }]), "resolved");
  assert.equal(decisionStatus(cushions, [{ action: "AUTO_PRODUCT" }, { action: "FINISH_REVIEW" }, { action: "REOPEN_REVIEW" }]), "pending");
  const photo = commercialFactsFromMessage("IMAGE", null, { ocr: "B. 1", segments: [] });
  assert.equal(decisionStatus(photo, [{ action: "AUTO_SUPPLIER" }]), "pending");
  assert.equal(decisionStatus(photo, [{ action: "AUTO_SUPPLIER" }, { action: "FINISH_REVIEW" }]), "resolved");
});
