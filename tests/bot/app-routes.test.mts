import assert from "node:assert/strict";
import test from "node:test";
import { safeDownloadStem, slugifyRouteLabel, tripExportFilename, tripManagementPath, tripPath } from "../../lib/app-routes.ts";

test("las rutas de viaje usan un slug estable y conservan secciones", () => {
  const trip = { id: "88462ad4-4643-4f5a-a417-cb623ca8a8cd", publicSlug: "nihao-piloto-interno-broco" };
  assert.equal(tripPath(trip), "/app/viajes/nihao-piloto-interno-broco");
  assert.equal(tripPath(trip, "proveedores"), "/app/viajes/nihao-piloto-interno-broco?section=proveedores");
  assert.equal(tripManagementPath(trip), "/app/viajes/nihao-piloto-interno-broco/gestion");
  assert.equal(tripPath({ id: trip.id }), `/app/viajes/${trip.id}`);
});

test("slug y archivos toleran nombres internacionales y encabezados inseguros", () => {
  assert.equal(slugifyRouteLabel("  Feria de Cantón 2027  "), "feria-de-canton-2027");
  assert.equal(safeDownloadStem('Viaje 北京 / Cantón\r\n"Q4"'), "Viaje-Canton-Q4");
  assert.equal(tripExportFilename("Feria de Cantón 2027", "pdf", "2026-10-11"), "Nihao_Informe_Feria-de-Canton-2027_2026-10-11.pdf");
  assert.equal(tripExportFilename("Feria de Cantón 2027", "xlsx", "2026-10-11"), "Nihao_Datos_Feria-de-Canton-2027_2026-10-11.xlsx");
});
