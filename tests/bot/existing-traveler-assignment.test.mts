import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { PrismaExistingTravelerAssignment } from "../../lib/bot/persistence/prisma-existing-traveler-assignment.ts";
import { ValidationError } from "../../lib/bot/validation.ts";

function setup(options: { admin?: boolean; membership?: boolean; traveler?: boolean; company?: boolean; alreadyAssigned?: boolean } = {}) {
  const writes: string[] = [];
  const tx = {
    user: { async findUnique() { return options.traveler === false ? null : { role: "TRAVELER", email: "viajero@example.com" }; } },
    tripCompany: { async findFirst() { return options.company === false ? null : { id: "company-a" }; } },
    tripMember: {
      async findUnique() { return options.alreadyAssigned ? { role: "TRAVELER" } : null; },
      async create() { writes.push("trip-member"); },
    },
    tripCompanyMember: { async create() { writes.push("company-member"); } },
    tripInvitation: { async updateMany() { writes.push("expire-invitation"); } },
  };
  const prisma = {
    user: {
      async findUnique() { return { role: options.admin === false ? "TRAVELER" : "ADMIN" }; },
      async findMany(input: unknown) { assert.deepEqual(input, { where: { role: "TRAVELER", tripMemberships: { none: { tripId: "trip-a" } } }, select: { id: true, name: true, email: true, whatsappPhone: true }, orderBy: [{ name: "asc" }, { email: "asc" }] }); return [{ id: "traveler-a", name: "Viajero", email: "viajero@example.com", whatsappPhone: "5493412345678" }]; },
    },
    tripMember: { async findUnique() { return options.membership === false ? null : { role: "ADMIN" }; } },
    $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
  };
  return { repository: new PrismaExistingTravelerAssignment(prisma as never), writes };
}

test("lista cuentas existentes fuera del viaje y las asigna a empresa y viaje juntos", async () => {
  const { repository, writes } = setup();
  assert.equal((await repository.available("admin", "trip-a")).length, 1);
  assert.deepEqual(await repository.assign("admin", "trip-a", "traveler-a", "company-a"), { userId: "traveler-a", companyId: "company-a" });
  assert.deepEqual(writes, ["trip-member", "company-member", "expire-invitation"]);
});

test("rechaza cuentas ajenas, empresas de otro viaje, duplicados y falta de permisos sin escribir", async () => {
  for (const options of [{ traveler: false }, { company: false }, { alreadyAssigned: true }]) {
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
