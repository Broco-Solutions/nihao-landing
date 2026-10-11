import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { PrismaExistingTravelerAssignment } from "../../lib/bot/persistence/prisma-existing-traveler-assignment.ts";
import { ValidationError } from "../../lib/bot/validation.ts";

function setup(options: { admin?: boolean; membership?: boolean; traveler?: boolean; company?: boolean; tripRole?: "ADMIN" | "TRAVELER" | null; alreadyCompany?: boolean } = {}) {
  const writes: string[] = [];
  const tx = {
    user: { async findUnique() { return options.traveler === false ? null : { role: "TRAVELER", email: "viajero@example.com" }; } },
    tripCompany: { async findFirst() { return options.company === false ? null : { id: "company-a" }; } },
    tripMember: {
      async findUnique() { return options.tripRole ? { role: options.tripRole } : null; },
      async create() { writes.push("trip-member"); },
    },
    tripCompanyMember: {
      async findUnique() { return options.alreadyCompany ? { userId: "traveler-a" } : null; },
      async create() { writes.push("company-member"); },
    },
    tripInvitation: { async updateMany() { writes.push("expire-invitation"); } },
  };
  const prisma = {
    user: {
      async findUnique() { return { role: options.admin === false ? "TRAVELER" : "ADMIN" }; },
      async findMany(input: unknown) {
        assert.deepEqual(input, {
          where: { role: "TRAVELER" },
          select: { id: true, name: true, email: true, whatsappPhone: true, tripMemberships: { where: { tripId: "trip-a" }, select: { role: true } }, companyMemberships: { where: { company: { tripId: "trip-a" } }, select: { companyId: true } } },
          orderBy: [{ name: "asc" }, { email: "asc" }],
        });
        return [
          { id: "new", name: "Nueva", email: "nueva@example.com", whatsappPhone: null, tripMemberships: [], companyMemberships: [] },
          { id: "unassigned", name: "Sin empresa", email: "sin@example.com", whatsappPhone: null, tripMemberships: [{ role: "TRAVELER" }], companyMemberships: [] },
          { id: "assigned", name: "Asignada", email: "asignada@example.com", whatsappPhone: null, tripMemberships: [{ role: "TRAVELER" }], companyMemberships: [{ companyId: "company-b" }] },
        ];
      },
    },
    tripMember: { async findUnique() { return options.membership === false ? null : { role: "ADMIN" }; } },
    tripCompanyMember: { async findUnique() { return options.alreadyCompany ? { userId: "traveler-a" } : null; } },
    $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
  };
  return { repository: new PrismaExistingTravelerAssignment(prisma as never), writes };
}

test("lista viajeros nuevos, sin empresa y ya asignados con estado explícito", async () => {
  const travelers = await setup().repository.available("admin", "trip-a");
  assert.deepEqual(travelers.map(({ id, tripRole, companyIds }) => ({ id, tripRole, companyIds })), [
    { id: "new", tripRole: null, companyIds: [] },
    { id: "unassigned", tripRole: "TRAVELER", companyIds: [] },
    { id: "assigned", tripRole: "TRAVELER", companyIds: ["company-b"] },
  ]);
});

test("asigna una cuenta nueva al viaje y a la empresa en una transacción", async () => {
  const { repository, writes } = setup();
  assert.deepEqual(await repository.assign("admin", "trip-a", "traveler-a", "company-a"), { userId: "traveler-a", companyId: "company-a", createdTripMembership: true, createdCompanyMembership: true });
  assert.deepEqual(writes, ["trip-member", "company-member", "expire-invitation"]);
});

test("asigna empresa a un viajero que ya pertenece al viaje y reintenta sin duplicar", async () => {
  const existingTrip = setup({ tripRole: "TRAVELER" });
  assert.deepEqual(await existingTrip.repository.assign("admin", "trip-a", "traveler-a", "company-a"), { userId: "traveler-a", companyId: "company-a", createdTripMembership: false, createdCompanyMembership: true });
  assert.deepEqual(existingTrip.writes, ["company-member", "expire-invitation"]);
  const alreadyAssigned = setup({ tripRole: "TRAVELER", alreadyCompany: true });
  assert.deepEqual(await alreadyAssigned.repository.assign("admin", "trip-a", "traveler-a", "company-a"), { userId: "traveler-a", companyId: "company-a", createdTripMembership: false, createdCompanyMembership: false });
  assert.deepEqual(alreadyAssigned.writes, []);
});

test("agrega un viajero al viaje sin imponer una empresa y reintenta de forma idempotente", async () => {
  const fresh = setup();
  assert.deepEqual(await fresh.repository.addToTrip("admin", "trip-a", "traveler-a"), { userId: "traveler-a", createdTripMembership: true });
  assert.deepEqual(fresh.writes, ["trip-member", "expire-invitation"]);
  const existing = setup({ tripRole: "TRAVELER" });
  assert.deepEqual(await existing.repository.addToTrip("admin", "trip-a", "traveler-a"), { userId: "traveler-a", createdTripMembership: false });
  assert.deepEqual(existing.writes, []);
});

test("rechaza cuentas ajenas, empresas de otro viaje, administradores y falta de permisos", async () => {
  for (const options of [{ traveler: false }, { company: false }, { tripRole: "ADMIN" as const }]) {
    const { repository, writes } = setup(options);
    await assert.rejects(repository.assign("admin", "trip-a", "traveler-a", "company-a"), ValidationError);
    assert.deepEqual(writes, []);
  }
  for (const options of [{ admin: false }, { membership: false }]) {
    const { repository, writes } = setup(options);
    await assert.rejects(repository.assign("admin", "trip-a", "traveler-a", "company-a"), AuthorizationError);
    assert.deepEqual(writes, []);
  }
});

test("desasigna sólo la empresa, conserva la membresía del viaje y los datos históricos", async () => {
  let deleted = 0;
  const tx = {
    tripCompany: { async findFirst() { return { id: "company-a" }; } },
    tripMember: { async findUnique() { return { role: "TRAVELER" }; } },
    supplierCapture: { async count() { return 3; } },
    supplier: { async count() { return 2; } },
    tripCompanyMember: { async deleteMany() { deleted += 1; return { count: deleted === 1 ? 1 : 0 }; } },
  };
  const prisma = {
    user: { async findUnique() { return { role: "ADMIN" }; } },
    tripMember: { async findUnique() { return { role: "ADMIN" }; } },
    $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
  };
  const repository = new PrismaExistingTravelerAssignment(prisma as never);
  assert.deepEqual(await repository.unassign("admin", "trip-a", "traveler-a", "company-a"), { removed: true, alreadyUnassigned: false, preserved: { captureCount: 3, supplierCount: 2 } });
  assert.deepEqual(await repository.unassign("admin", "trip-a", "traveler-a", "company-a"), { removed: false, alreadyUnassigned: true, preserved: { captureCount: 3, supplierCount: 2 } });
  assert.equal("deleteMany" in tx.tripMember, false, "la membresía del viaje no se elimina");
});
