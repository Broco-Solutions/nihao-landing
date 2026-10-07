import test from "node:test";
import assert from "node:assert/strict";
import { parseProduct, parseSupplierEdit } from "../../lib/bot/supplier-edit.ts";

test("productos separan sus condiciones comerciales y requieren nombre", () => {
  const product = parseProduct({ name: " Lámpara ", fob: { amount: 7, currency: "USD", unit: "unidad", rawText: "" }, moq: { quantity: 200, unit: "unidades", notes: null, rawText: "" }, leadTime: { rawText: "4 semanas", days: 28 } });
  assert.equal(product.name, "Lámpara");
  assert.equal(product.fobAmount, 7);
  assert.equal(product.moqQuantity, 200);
  assert.equal(product.leadTimeDays, 28);
  assert.throws(() => parseProduct({ name: "" }), /nombre/i);
  assert.throws(() => parseProduct({ name: "Lámpara", moq: { quantity: 2.5 } }), /MOQ/);
});

test("proveedor acepta varios medios del mismo tipo y escala de 1 a 10", () => {
  const parsed = parseSupplierEdit({ interestScore: 10, website: "https://ejemplo.com", contacts: [{ type: "EMAIL", rawText: "a@ejemplo.com" }, { type: "EMAIL", rawText: "b@ejemplo.com" }, { type: "PHONE", rawText: "+86 123" }] });
  assert.equal(parsed.contacts?.length, 3);
  assert.equal(parsed.data.interestScore, 10);
  assert.throws(() => parseSupplierEdit({ interestScore: 11 }), /Interés/);
  assert.throws(() => parseSupplierEdit({ contacts: [{ type: "EMAIL", rawText: "incorrecto" }] }), /Email/);
});

test("producto se confirma con nombre y FOB, sin exigir proveedor confirmado", async () => {
  const { productUpdateData } = await import("../../lib/bot/supplier-edit.ts");
  const existing = { id: "product", captureId: "capture", supplierId: "supplier", status: "DRAFT" as const, name: "Taladro", sourceText: "Taladro FOB USD 9", sourceEvidence: [], reviewFields: ["fob"], sourceConflicts: [], fobAmount: 7 as never, fobCurrency: "USD", fobUnit: null, fobRawText: null, moqQuantity: null, moqUnit: null, moqNotes: null, moqRawText: null, leadTimeRawText: null, leadTimeDays: null, createdAt: new Date(), updatedAt: new Date() };
  assert.equal(productUpdateData(existing, { confirm: true }).status, "CONFIRMED");
  assert.deepEqual(productUpdateData(existing, { confirm: true }).reviewFields, []);
  assert.equal(productUpdateData(existing, { name: "Taladro corregido", status: "CONFIRMED" }).status, "CONFIRMED");
  assert.equal(productUpdateData({ ...existing, supplierId: null }, { confirm: true }).status, "CONFIRMED");
  assert.throws(() => productUpdateData({ ...existing, name: "Producto sin nombre" }, { confirm: true }), /Completá el nombre/);
  assert.throws(() => productUpdateData(existing, { confirm: "true" }), /Confirmación inválida/);
});
