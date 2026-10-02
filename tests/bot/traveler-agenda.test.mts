import assert from "node:assert/strict";
import test from "node:test";
import { agendaCopyRows, agendaOwner, parseAgendaInput } from "../../lib/bot/traveler-agenda.ts";

test("la agenda conserva fecha y hora literales y exige lugar y dirección", () => {
  const entry = parseAgendaInput({ date: "2026-10-05", time: "09:30", place: "  Museo  ", address: "  Calle 123  ", instructions: "Llegar temprano" });
  assert.equal(entry.date.toISOString(), "2026-10-05T00:00:00.000Z");
  assert.equal(entry.time, "09:30");
  assert.equal(entry.place, "Museo");
  assert.equal(entry.address, "Calle 123");
  assert.throws(() => parseAgendaInput({ date: "2026-02-30", time: "09:30", place: "Museo", address: "Calle" }));
  assert.throws(() => parseAgendaInput({ date: "2026-10-05", time: "25:30", place: "Museo", address: "Calle" }));
});

test("copiar agrega filas independientes para cada viajero y viaje", () => {
  const source = { date: new Date("2026-10-05T00:00:00.000Z"), time: "09:30", place: "Museo", address: "Calle 123", instructions: null };
  const rows = agendaCopyRows([source], [{ tripId: "trip-a", userId: "one" }, { tripId: "trip-b", userId: "two" }]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => [row.tripId, row.userId]), [["trip-a", "one"], ["trip-b", "two"]]);
  rows[0].place = "Otro lugar";
  assert.equal(rows[1].place, "Museo");
  assert.equal(source.place, "Museo");
  assert.equal("id" in rows[0], false);
});

test("un viajero solo accede a su agenda y el admin a viajeros asignados", async () => {
  const prisma = {
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ role: where.id === "admin" ? "ADMIN" : "TRAVELER" }) },
    tripMember: { findUnique: async ({ where }: { where: { tripId_userId: { userId: string } } }) => where.tripId_userId.userId === "other" ? null : { role: "TRAVELER" } },
  };
  assert.equal(await agendaOwner(prisma as never, "traveler", "trip"), "traveler");
  await assert.rejects(() => agendaOwner(prisma as never, "traveler", "trip", "target"), /No tenés acceso/);
  assert.equal(await agendaOwner(prisma as never, "admin", "trip", "target"), "target");
  await assert.rejects(() => agendaOwner(prisma as never, "admin", "trip", "other"), /no pertenece/);
});
