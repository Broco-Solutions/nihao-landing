import assert from "node:assert/strict";
import test from "node:test";
import { burstBelongsToTrip } from "../../lib/channels/whatsapp/web-evidence.ts";

test("la bandeja usa el viaje persistido y limita asociaciones a las empresas autorizadas", () => {
  const ops: Array<{ arguments: unknown }> = [];
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a", companyId: "company-a" } }, ops, "trip-a", ["company-a"]), true);
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a", companyId: "company-b" } }, ops, "trip-a", ["company-a"]), false);
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", groups: [], agent: { receipts: [] } }, ops, "trip-a", []), true);
  assert.equal(burstBelongsToTrip({ tripId: "trip-b" }, ops, "trip-a", null), false);
  assert.equal(burstBelongsToTrip({}, [{ arguments: { tripId: "trip-a", companyId: "company-a" } }], "trip-a", ["company-a"]), true);
  assert.equal(burstBelongsToTrip({}, [{ arguments: { tripId: "trip-a", companyId: "company-b" } }], "trip-a", ["company-a"]), false);
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a", companyId: "company-a" }, webReview: { tripId: "trip-a", companyId: "company-b" } }, [], "trip-a", ["company-a"]), false);
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a", companyId: "company-a" }, webReview: { tripId: "trip-b", companyId: "company-a" } }, [], "trip-a", ["company-a"]), false);
});

test("los lotes sin empresa se muestran como evidencia pendiente, sin inferir proveedor", () => {
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a" }, loadContexts: {} }, [], "trip-a", ["company-a"]), true);
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a", companyId: "company-other" } }, [], "trip-a", ["company-a"]), false);
});
