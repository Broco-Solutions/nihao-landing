import test from "node:test";
import assert from "node:assert/strict";
import { requireTripAdmin, requireTripMember, AuthorizationError } from "../../lib/bot/authorization.ts";
import { PrismaTripRepository } from "../../lib/bot/persistence/prisma-trip-repository.ts";
import { PrismaSupplierCaptureRepository } from "../../lib/bot/persistence/prisma-repository.ts";
import { PrismaTripAdministrationRepository } from "../../lib/bot/persistence/prisma-trip-administration-repository.ts";

test("un usuario puede tener roles distintos según el viaje", async () => {
  const repository = {
    async getTripMembership({ tripId, userId }: { tripId: string; userId: string }) {
      if (userId !== "user-a") return null;
      return { role: tripId === "trip-a" ? "ADMIN" as const : "TRAVELER" as const };
    },
  };

  assert.equal((await requireTripMember(repository, { userId: "user-a", tripId: "trip-a" })).role, "ADMIN");
  assert.equal((await requireTripMember(repository, { userId: "user-a", tripId: "trip-b" })).role, "TRAVELER");
  await assert.rejects(requireTripAdmin(repository, { userId: "user-a", tripId: "trip-b" }), AuthorizationError);
  await assert.rejects(requireTripAdmin(repository, { userId: "user-b", tripId: "trip-a" }), AuthorizationError);
});

test("la creación de viaje solicita la membresía ADMIN en la misma operación", async () => {
  let transactionInput: Record<string, unknown> | undefined;
  const trip = {
    id: "trip-a", createdById: "user-a", name: "Cantón", startDate: null, endDate: null,
    status: "PLANNED", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
  };
  const prisma = {
    $transaction: async (operation: (client: { trip: { create: (input: { data: Record<string, unknown> }) => Promise<typeof trip> } }) => Promise<unknown>) => operation(prisma),
    trip: { async create({ data }: { data: Record<string, unknown> }) { transactionInput = data; return trip; } },
  };
  const result = await new PrismaTripRepository(prisma as never).createForUser("user-a", { name: "Cantón", startDate: null, endDate: null });
  assert.equal(result.role, "ADMIN");
  assert.deepEqual(transactionInput?.members, { create: { userId: "user-a", role: "ADMIN" } });
});

test("el listado Prisma limita capturas de TRAVELER y amplía la vista de ADMIN", async () => {
  const queries: Array<Record<string, unknown>> = [];
  const capture = {
    id: "capture-a", tripId: "trip-a", createdById: "user-b", status: "DRAFT", sourceType: "TEXT", sourceText: "nota",
    sourceAttachmentId: null, companyName: null, city: null, province: null, contact: null, category: null, supplierType: "UNKNOWN",
    fobAmount: null, fobCurrency: null, fobUnit: null, fobRawText: null, moqQuantity: null, moqUnit: null, moqNotes: null, moqRawText: null,
    leadTimeRawText: null, leadTimeDays: null, interestScore: null, missingFields: [], reviewFields: [], acknowledgedUnknownFields: [], evidence: [], humanCorrectedFields: [], analyzedAttachmentIds: [], needsReanalysis: false,
    confirmedAt: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), supplier: null,
  };
  const prisma = {
    tripMember: { async findUnique({ where }: { where: unknown }) { return (where as { tripId_userId: { userId: string } }).tripId_userId.userId === "admin" ? { role: "ADMIN" } : { role: "TRAVELER" }; } },
    supplierCapture: { async findMany({ where }: { where: Record<string, unknown> }) { queries.push(where); return [capture]; } },
    supplier: { async findMany({ where }: { where: Record<string, unknown> }) { queries.push(where); return []; } },
  };
  const repository = new PrismaSupplierCaptureRepository(prisma as never);
  await repository.listCaptures({ userId: "admin", tripId: "trip-a" });
  await repository.listCaptures({ userId: "traveler", tripId: "trip-a" });
  await repository.listSuppliers({ userId: "admin", tripId: "trip-a" });
  await repository.listSuppliers({ userId: "traveler", tripId: "trip-a" });
  assert.deepEqual(queries, [
    { tripId: "trip-a" }, { tripId: "trip-a", createdById: "traveler" },
    { tripId: "trip-a" }, { tripId: "trip-a", createdById: "traveler" },
  ]);
});

test("la administración devuelve miembros y métricas sólo para ADMIN", async () => {
  const prisma = {
    tripMember: {
      async findUnique() { return { role: "ADMIN" }; },
      async findMany() { return [
        { userId: "admin", role: "ADMIN", createdAt: new Date("2026-01-01"), user: { name: "Admin", email: "admin@example.com" } },
        { userId: "traveler", role: "TRAVELER", createdAt: new Date("2026-01-02"), user: { name: "Traveler", email: "traveler@example.com" } },
      ]; },
    },
    trip: { async findUnique() { return { id: "trip-a", createdById: "admin", name: "Cantón", startDate: null, endDate: null, status: "PLANNED", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") }; } },
    supplierCapture: {
      async groupBy() { return [{ createdById: "traveler", _count: { _all: 2 } }]; },
      async count() { return 2; },
    },
    supplier: {
      async groupBy() { return [{ createdById: "traveler", _count: { _all: 1 } }]; },
      async count() { return 1; },
    },
    tripInvitation: { async findMany() { return []; } },
  };
  const result = await new PrismaTripAdministrationRepository(prisma as never).getForAdmin("admin", "trip-a");
  assert.equal(result?.metrics.memberCount, 2);
  assert.equal(result?.metrics.travelerCount, 1);
  assert.equal(result?.metrics.captureCount, 2);
  assert.equal(result?.members[1].captureCount, 2);
});

test("ADMIN quita sólo membresías TRAVELER del viaje sin borrar historial ni cuentas", async () => {
  const deleted: unknown[] = [];
  const prisma = {
    tripMember: {
      async findUnique({ where }: { where: { tripId_userId: { tripId: string; userId: string } } }) {
        const { tripId, userId } = where.tripId_userId;
        return tripId === "trip-a" && userId === "admin" ? { role: "ADMIN" } : { role: "TRAVELER" };
      },
      async deleteMany({ where }: { where: { tripId: string; userId: string; role: string } }) {
        deleted.push(where);
        return { count: where.tripId === "trip-a" && where.userId === "traveler" && where.role === "TRAVELER" ? 1 : 0 };
      },
    },
    trip: { async findUnique() { return { createdById: "creator" }; } },
  };
  const repository = new PrismaTripAdministrationRepository(prisma as never);
  assert.equal(await repository.removeTraveler("admin", "trip-a", "traveler"), true);
  assert.deepEqual(deleted, [{ tripId: "trip-a", userId: "traveler", role: "TRAVELER" }]);
  assert.equal(await repository.removeTraveler("admin", "trip-a", "missing"), false);
  assert.equal(await repository.removeTraveler("admin", "trip-a", "another-admin"), false);
  assert.equal(await repository.removeTraveler("admin", "trip-a", "creator"), false);
  assert.equal(await repository.removeTraveler("admin", "trip-a", "admin"), false);
  assert.equal(deleted.length, 3, "creator y admin propio nunca llegan a la mutación; otros roles no pasan el filtro TRAVELER");
  assert.equal("supplierCapture" in prisma, false);
  assert.equal("supplier" in prisma, false);
  assert.equal("user" in prisma, false);
});

test("TRAVELER y ADMIN de otro viaje no pueden quitar viajeros", async () => {
  let deleteCalls = 0;
  const prisma = {
    tripMember: {
      async findUnique({ where }: { where: { tripId_userId: { tripId: string; userId: string } } }) {
        const { tripId, userId } = where.tripId_userId;
        return tripId === "trip-a" && userId === "admin" ? { role: "ADMIN" } : tripId === "trip-a" ? { role: "TRAVELER" } : null;
      },
      async deleteMany() { deleteCalls++; return { count: 1 }; },
    },
    trip: { async findUnique() { return { createdById: "admin" }; } },
  };
  const repository = new PrismaTripAdministrationRepository(prisma as never);
  await assert.rejects(repository.removeTraveler("traveler", "trip-a", "target"), AuthorizationError);
  await assert.rejects(repository.removeTraveler("admin", "trip-b", "target"), AuthorizationError);
  assert.equal(deleteCalls, 0);
});
