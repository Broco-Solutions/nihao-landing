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
