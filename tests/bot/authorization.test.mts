import test from "node:test";
import assert from "node:assert/strict";
import { AuthorizationError, requireTripAccess } from "../../lib/bot/authorization.ts";
import { PrismaTripAccessRepository } from "../../lib/bot/persistence/prisma-trip-access-repository.ts";

test("TripMember permite sólo el viaje autorizado", async () => {
  const queried: Array<{ tripId: string; userId: string }> = [];
  const repository = new PrismaTripAccessRepository({
    tripMember: {
      async findUnique({ where }) {
        queried.push(where.tripId_userId);
        return where.tripId_userId.tripId === "trip-authorized" && where.tripId_userId.userId === "user-a" ? { tripId: "trip-authorized" } : null;
      },
    },
  });

  await requireTripAccess(repository, { userId: "user-a", tripId: "trip-authorized" });
  await assert.rejects(
    requireTripAccess(repository, { userId: "user-a", tripId: "trip-other" }),
    AuthorizationError,
  );
  assert.deepEqual(queried, [
    { userId: "user-a", tripId: "trip-authorized" },
    { userId: "user-a", tripId: "trip-other" },
  ]);
});
