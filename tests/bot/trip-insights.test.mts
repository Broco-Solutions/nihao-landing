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
    supplierCapture: { findMany: async ({ where }: { where: unknown }) => { seen.captures = where; return []; } },
    tripAgendaEntry: { findMany: async ({ where }: { where: unknown }) => { seen.agenda = where; return []; } },
    tripFeedback: { findMany: async ({ where }: { where: unknown }) => { seen.feedback = where; return []; } },
  };
  const result = await getTripInsights(prisma as never, "traveler", "trip");
  for (const key of ["companies", "suppliers", "captures"]) assert.deepEqual(seen[key], { tripId: "trip", ...(key === "companies" ? { active: true, id: { in: ["company-a"] } } : { companyId: { in: ["company-a"] } }) });
  assert.deepEqual(seen.agenda, { tripId: "trip", userId: "traveler" });
  assert.deepEqual(seen.feedback, { tripId: "trip", userId: "traveler" });
  assert.equal(result.metrics.productCount, 1);
  assert.equal(result.metrics.contactCount, 1);
  assert.equal(result.metrics.cityCount, 1);
  assert.equal(result.suppliers[0].company, "Broco");
});

test("un usuario sin membresía no puede consultar el resumen", async () => {
  const prisma = { tripMember: { findUnique: async () => null } };
  await assert.rejects(() => getTripInsights(prisma as never, "outsider", "trip"), /No tenés acceso/);
});
