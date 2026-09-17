import test from "node:test";
import assert from "node:assert/strict";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { PrismaTravelerDashboardRepository } from "../../lib/bot/persistence/prisma-traveler-dashboard-repository.ts";

const now = new Date("2026-09-17T15:30:00.000Z");
const trip = { id: "trip-a", createdById: "admin", name: "Cantón", startDate: new Date("2026-10-15"), endDate: new Date("2026-10-19"), status: "ACTIVE", createdAt: now, updatedAt: now };
const supplier = { id: "supplier-a", tripId: "trip-a", createdById: "traveler-a", captureId: "capture-confirmed", status: "CONFIRMED", companyName: "ABC Lighting", city: "Shenzhen", province: null, contact: null, category: "Iluminación", supplierType: "FACTORY", fobAmount: null, fobCurrency: null, fobUnit: null, fobRawText: null, moqQuantity: null, moqUnit: null, moqNotes: null, moqRawText: null, leadTimeRawText: null, leadTimeDays: null, interestScore: null, pendingFields: [], createdAt: now, updatedAt: now };
const pending = { id: "capture-draft", companyName: "Shenzhen Tools", city: "Shenzhen", reviewFields: ["contact"], missingFields: ["category", "interestScore"], acknowledgedUnknownFields: ["category"], needsReanalysis: false, updatedAt: now };

function prisma(role: "ADMIN" | "TRAVELER" = "TRAVELER") {
  const queries: Array<{ model: string; input: Record<string, unknown> }> = [];
  return {
    queries,
    tripMember: { async findUnique() { return { role }; } },
    trip: { async findUnique() { return trip; } },
    supplier: {
      async count(input: { where: Record<string, unknown> }) { queries.push({ model: "supplier.count", input }); return input.where.createdAt ? 1 : 4; },
      async findMany(input: Record<string, unknown>) { queries.push({ model: "supplier.findMany", input }); return [supplier]; },
    },
    supplierCapture: {
      async count(input: { where: Record<string, unknown> }) { queries.push({ model: "capture.count", input }); return 2; },
      async findMany(input: Record<string, unknown>) { queries.push({ model: "capture.findMany", input }); return [pending]; },
    },
  };
}

test("el dashboard del viajero usa sólo sus datos y consultas acotadas", async () => {
  const mock = prisma();
  const result = await new PrismaTravelerDashboardRepository(mock as never).getForTraveler("traveler-a", "trip-a", now);
  assert.equal(result?.metrics.confirmedCount, 4);
  assert.equal(result?.metrics.pendingCount, 2);
  assert.equal(result?.metrics.todayCount, 1);
  assert.equal(result?.recent[0]?.companyName, "ABC Lighting");
  assert.equal(result?.pending[0]?.missingCount, 1, "no cuenta categoría marcada como No sé");
  assert.equal(result?.pending[0]?.reviewCount, 1);
  const ownerQueries = mock.queries.filter(({ model }) => model !== "supplier.count" || true);
  assert.ok(ownerQueries.every(({ input }) => {
    const where = input.where as Record<string, unknown> | undefined;
    return !where || (where.tripId === "trip-a" && where.createdById === "traveler-a");
  }));
  const recentQuery = mock.queries.find(({ model }) => model === "supplier.findMany")?.input;
  assert.deepEqual({ take: recentQuery?.take, orderBy: recentQuery?.orderBy }, { take: 5, orderBy: { updatedAt: "desc" } });
  const todayQuery = mock.queries.find(({ model, input }) => model === "supplier.count" && Boolean((input.where as Record<string, unknown>).createdAt))?.input;
  assert.equal(((todayQuery?.where as Record<string, { gte: Date }>).createdAt.gte).toISOString(), "2026-09-17T00:00:00.000Z");
});

test("ADMIN conserva el home operativo sin heredar la actividad de otros viajeros", async () => {
  const mock = prisma("ADMIN");
  await new PrismaTravelerDashboardRepository(mock as never).getForTraveler("admin", "trip-a", now);
  const captures = mock.queries.find(({ model }) => model === "capture.findMany")?.input.where as Record<string, unknown>;
  assert.equal(captures.createdById, "admin");
});

test("un usuario sin membresía del viaje no puede pedir el dashboard", async () => {
  const mock = prisma();
  mock.tripMember.findUnique = (async () => null) as never;
  await assert.rejects(() => new PrismaTravelerDashboardRepository(mock as never).getForTraveler("traveler-b", "trip-a", now), AuthorizationError);
});
