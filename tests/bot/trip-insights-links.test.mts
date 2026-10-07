import assert from "node:assert/strict";
import test from "node:test";
import { pendingCaptureHref } from "../../components/app/trip-insights-links.ts";

test("un pendiente abre la captura existente en la ruta de edición", () => {
  assert.equal(pendingCaptureHref("trip/a", "capture?1"), "/app/viajes/trip%2Fa/proveedores/nuevo?captureId=capture%3F1");
});

test("un producto pendiente apunta a su captura y producto específico", () => {
  assert.equal(pendingCaptureHref("trip/a", "capture?1", "product/2"), "/app/viajes/trip%2Fa/proveedores/nuevo?captureId=capture%3F1&productId=product%2F2");
});
