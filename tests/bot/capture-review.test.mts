import assert from "node:assert/strict";
import test from "node:test";
import { needsCaptureReview, needsProductReview } from "../../lib/bot/capture-review.ts";

test("pendientes incluyen borradores, nueva evidencia y conflictos sin convertir faltantes en revisión", () => {
  assert.equal(needsCaptureReview({ status: "DRAFT" }), true);
  assert.equal(needsCaptureReview({ status: "CONFIRMED", needsReanalysis: true }), true);
  assert.equal(needsCaptureReview({ status: "CONFIRMED", reviewFields: ["contact"] }), true);
  assert.equal(needsCaptureReview({ status: "CONFIRMED", reviewFields: [] }), false);
  assert.equal(needsCaptureReview({ status: "CONFIRMED", reviewFields: null }), false);
});

test("producto confirmado sólo vuelve a revisión por conflictos, evidencia sin depender del estado del proveedor", () => {
  const product = { status: "CONFIRMED", supplierId: "supplier", reviewFields: [], capture: { needsReanalysis: false } };
  assert.equal(needsProductReview(product), false);
  assert.equal(needsProductReview({ ...product, status: "DRAFT" }), true);
  assert.equal(needsProductReview({ ...product, supplierId: null }), false);
  assert.equal(needsProductReview({ ...product, reviewFields: ["fob"] }), true);
  assert.equal(needsProductReview({ ...product, capture: { needsReanalysis: true } }), true);
});
