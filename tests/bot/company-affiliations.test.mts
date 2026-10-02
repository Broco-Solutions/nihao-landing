import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { PrismaCompanyAffiliations } from "../../lib/bot/persistence/prisma-company-affiliations.ts";

test("la empresa muestra viajeros por viaje activo y no incluye asignaciones retiradas", async () => {
  const prisma = {
    user: { async findUnique() { return { role: "ADMIN" }; } },
    company: { async findUnique(query: { where: { id: string }; select: { trips: { where: { active: boolean } } } }) {
      assert.equal(query.where.id, "company-a");
      assert.deepEqual(query.select.trips.where, { active: true });
      return { id: "company-a", name: "Broco", trips: [
        { tripId: "trip-a", trip: { name: "Feria Demo" }, members: [{ user: { id: "u2", name: "Zoe", email: "zoe@example.com" } }, { user: { id: "u1", name: "Ana", email: "ana@example.com" } }] },
        { tripId: "trip-b", trip: { name: "Cantón" }, members: [] },
      ] };
    } },
  };
  const company = await new PrismaCompanyAffiliations(prisma as never).getForAdmin("admin", "company-a");
  assert.deepEqual(company?.trips.map((trip) => [trip.name, trip.travelers.map((user) => user.name)]), [["Feria Demo", ["Ana", "Zoe"]], ["Cantón", []]]);
});

test("solo un administrador global puede ver afiliaciones", async () => {
  let queried = false;
  const prisma = {
    user: { async findUnique() { return { role: "TRAVELER" }; } },
    company: { async findUnique() { queried = true; return null; } },
  };
  await assert.rejects(new PrismaCompanyAffiliations(prisma as never).getForAdmin("traveler", "company-a"), AuthorizationError);
  assert.equal(queried, false);
});
