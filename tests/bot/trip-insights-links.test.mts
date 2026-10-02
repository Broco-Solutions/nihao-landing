import assert from "node:assert/strict";
import test from "node:test";
import { pendingCaptureHref } from "../../components/app/trip-insights-links.ts";

test("un pendiente abre la captura existente en la ruta de edición", () => {
  assert.equal(pendingCaptureHref("trip/a", "capture?1"), "/app/viajes/trip%2Fa/proveedores/nuevo?captureId=capture%3F1");
});
