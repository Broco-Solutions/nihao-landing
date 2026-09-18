import test from "node:test";
import assert from "node:assert/strict";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { PrismaTripSupplierReportRepository } from "../../lib/bot/persistence/prisma-trip-supplier-report-repository.ts";

function prisma(role: "ADMIN" | "TRAVELER" = "ADMIN") {
  const calls: Array<{ model: string; input: Record<string, unknown> }> = [];
  return { calls,
    tripMember: {
      async findUnique() { return { role }; },
      async findMany() { return [{ userId: "traveler-a", user: { name: "Ana" } }]; },
    },
    supplier: {
      async count(input: Record<string, unknown>) { calls.push({ model: "supplier.count", input }); return 13; },
      async findMany(input: Record<string, unknown>) {
        calls.push({ model: "supplier.findMany", input });
        if ((input.where as { id?: { in?: string[] } }).id) return [{ id: "supplier-a", companyName: "ABC", contacts: [] }];
        return [{ id: "supplier-a", companyName: "ABC", city: "Shenzhen", category: "Luces", supplierType: "FACTORY", fobAmount: null, fobCurrency: null, fobUnit: null, moqQuantity: null, moqUnit: null, leadTimeDays: null, leadTimeRawText: null, interestScore: 4, createdBy: { id: "traveler-a", name: "Ana", email: "ana@example.com" }, contacts: [] }];
      },
      async groupBy(input: Record<string, unknown>) { calls.push({ model: "supplier.groupBy", input }); return [{ category: "Luces", _count: { _all: 13 } }]; },
    },
    supplierCapture: { async count(input: Record<string, unknown>) { calls.push({ model: "capture.count", input }); return 2; } },
  };
}

const filters = { search: "li", category: "Luces", supplierType: "FACTORY" as const, travelerId: "traveler-a", interest: 4, incomplete: true, page: 2, limit: 12, order: "company" as const, compareIds: ["supplier-a", "foreign"] };

test("ADMIN obtiene sólo proveedores confirmados del viaje con filtros, paginación y comparación aislada", async () => {
  const mock = prisma();
  const result = await new PrismaTripSupplierReportRepository(mock as never).getForAdmin("admin", "trip-a", filters);
  assert.equal(result.total, 13);
  assert.equal(result.draftCount, 2);
  assert.equal(result.confirmedIncompleteCount, 13);
  assert.equal(result.comparisonComplete, false);
  const list = mock.calls.find((call) => call.model === "supplier.findMany" && !(call.input.where as { id?: unknown }).id)?.input;
  assert.deepEqual({ tripId: (list?.where as { tripId: string }).tripId, skip: list?.skip, take: list?.take, orderBy: list?.orderBy }, { tripId: "trip-a", skip: 12, take: 12, orderBy: { companyName: "asc" } });
  const where = list?.where as { OR: Array<{ contacts?: unknown }> };
  assert.equal(where.OR.some((condition) => Boolean(condition.contacts)), true);
  assert.equal(mock.calls.some((call) => call.model === "capture.count" && (call.input.where as { tripId: string }).tripId === "trip-a"), true);
});

test("TRAVELER y miembro de otro viaje no acceden al reporte global", async () => {
  await assert.rejects(() => new PrismaTripSupplierReportRepository(prisma("TRAVELER") as never).getForAdmin("traveler-a", "trip-a", filters), AuthorizationError);
  const foreign = prisma(); foreign.tripMember.findUnique = (async () => null) as never;
  await assert.rejects(() => new PrismaTripSupplierReportRepository(foreign as never).getForAdmin("admin", "trip-b", filters), AuthorizationError);
});
