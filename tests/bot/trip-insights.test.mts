import assert from "node:assert/strict";
import test from "node:test";
import { getTripInsights } from "../../lib/bot/trip-insights.ts";

test("el resumen del viajero limita proveedores y capturas a sus empresas, y agenda a su usuario", async () => {
  const seen: Record<string, unknown> = {};
  const prisma = {
    tripMember: { findUnique: async () => ({ role: "TRAVELER" }) },
    tripCompanyMember: { findMany: async () => [{ companyId: "company-a" }] },
    trip: { findUniqueOrThrow: async () => ({ id: "trip", name: "Feria Demo", startDate: null, endDate: null, status: "ACTIVE" }) },
    tripCompany: { findMany: async ({ where }: { where: unknown }) => { seen.companies = where; return [{ id: "company-a", catalogCompany: { name: "Broco" }, members: [{ userId: "traveler" }] }]; } },
    supplier: { findMany: async ({ where }: { where: unknown }) => { seen.suppliers = where; return [{ id: "supplier", companyId: "company-a", companyName: "Proveedor", city: "Shenzhen", province: null, category: "Hogar", supplierType: "FACTORY", website: null, interestScore: 8, createdAt: new Date(), updatedAt: new Date(), createdBy: { id: "traveler", name: "Viajero" }, contacts: [{ id: "contact", type: "EMAIL", rawText: "info@example.com" }], products: [{ id: "product", name: "Mesa", fobAmount: null, fobCurrency: null, fobUnit: null, moqQuantity: null, moqUnit: null, leadTimeDays: null, leadTimeRawText: null, images: [] }] }]; } },
    supplierProduct: { findMany: async ({ where }: { where: unknown }) => {
      seen.pendingProducts = where;
      return [
        { status: "CONFIRMED", reviewFields: [], id: "standalone", captureId: "capture-new", supplierId: null, name: "Mesa", fobAmount: "7.0000", fobCurrency: "USD", moqQuantity: null, leadTimeDays: null, capture: { companyId: "company-a", companyName: "Proveedor nuevo", needsReanalysis: false }, supplier: null },
        { status: "DRAFT", reviewFields: [], id: "draft-existing", captureId: "capture-existing", supplierId: "supplier", name: "Vaso", fobAmount: "30.0000", fobCurrency: "USD", moqQuantity: null, leadTimeDays: 60, capture: { companyId: "company-a", companyName: "Nombre anterior" }, supplier: { companyName: "Proveedor" } },
        { status: "DRAFT", reviewFields: [], id: "draft-new", captureId: "capture-new", supplierId: null, name: "Silla", fobAmount: null, fobCurrency: null, moqQuantity: null, leadTimeDays: null, capture: { companyId: "company-a", companyName: "Proveedor nuevo" }, supplier: null },
      ];
    } },
    supplierCapture: { findMany: async ({ where }: { where: unknown }) => { seen.captures = where; return []; } },
    tripAgendaEntry: { findMany: async ({ where }: { where: unknown }) => { seen.agenda = where; return []; } },
    tripFeedback: { findMany: async ({ where }: { where: unknown }) => { seen.feedback = where; return []; } },
  };
  const result = await getTripInsights(prisma as never, "traveler", "trip");
  for (const key of ["companies", "suppliers", "captures"]) assert.deepEqual(seen[key], { tripId: "trip", ...(key === "companies" ? { active: true, id: { in: ["company-a"] } } : { companyId: { in: ["company-a"] }, ...(key === "captures" ? { deletedAt: null } : {}) }) });
  assert.deepEqual(seen.agenda, { tripId: "trip", userId: "traveler" });
  assert.deepEqual(seen.feedback, { tripId: "trip", userId: "traveler" });
  assert.deepEqual(seen.pendingProducts, { capture: { tripId: "trip", companyId: { in: ["company-a"] }, deletedAt: null } });
  assert.equal(result.pendingProducts.length, 2);
  assert.equal(result.products.length, 3);
  assert.equal(result.products[0].pendingReview, false);
  assert.equal(result.products[0].supplierId, null);
  assert.equal(result.metrics.pendingCount, 2);
  assert.equal(result.pendingProducts[0].supplierName, "Proveedor");
  assert.equal(result.pendingProducts[0].fobAmount, 30);
  assert.equal(result.pendingProducts[0].company, "Broco");
  assert.equal(result.pendingProducts[1].supplierId, null);
  assert.equal(result.pendingProducts[1].captureId, "capture-new");
  assert.equal(result.pendingProducts[1].supplierName, "Proveedor nuevo");
  assert.equal(result.metrics.productCount, 1);
  assert.equal(result.metrics.contactCount, 1);
  assert.equal(result.metrics.cityCount, 1);
  assert.equal(result.suppliers[0].company, "Broco");
});

test("un usuario sin membresía no puede consultar el resumen", async () => {
  const prisma = { tripMember: { findUnique: async () => null } };
  await assert.rejects(() => getTripInsights(prisma as never, "outsider", "trip"), /No tenés acceso/);
});
