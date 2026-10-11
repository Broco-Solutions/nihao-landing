import { EMPTY_TIER_1_DATA, type SupplierRecord } from "./types.ts";

export function demoReadOnlyResponse() {
  return Response.json({ error: "La demostración usa datos de ejemplo y no guarda información. Ingresá con tu cuenta para capturar.", code: "DEMO_READ_ONLY" }, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}

export const DEMO_SUPPLIERS: readonly SupplierRecord[] = [{
  ...EMPTY_TIER_1_DATA, id: "demo-sample-lighting", userId: "demo-sample", tripId: "demo-trip", captureId: "demo-sample-capture", status: "CONFIRMED", companyName: "Proveedor de iluminación · ejemplo", category: "Iluminación", city: "Guangzhou", notes: "Datos de muestra. No corresponden a una captura de un visitante.", pendingFields: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
}];
