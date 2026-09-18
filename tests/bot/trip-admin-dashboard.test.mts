import test from "node:test";
import assert from "node:assert/strict";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { PrismaTripAdminDashboardRepository } from "../../lib/bot/persistence/prisma-trip-admin-dashboard-repository.ts";

const now = new Date("2026-09-17T12:00:00.000Z");
function prisma(role: "ADMIN" | "TRAVELER" = "ADMIN") {
  const calls: Array<{ model: string; input: Record<string, unknown> }> = [];
  return { calls,
    tripMember: { async findUnique() { return { role }; }, async findMany() { return [{ userId: "traveler-a", role: "TRAVELER", user: { name: "Ana", email: "ana@example.com" } }, { userId: "traveler-b", role: "TRAVELER", user: { name: "Beto", email: "beto@example.com" } }, { userId: "admin", role: "ADMIN", user: { name: "Admin", email: "admin@example.com" } }]; } },
    tripInvitation: { async count(input: Record<string, unknown>) { calls.push({ model: "invitation", input }); return (input.where as { status: string }).status === "PENDING" ? 2 : 1; } },
    supplier: { async count(input: Record<string, unknown>) { calls.push({ model: "supplier.count", input }); return 7; }, async groupBy() { return [{ createdById: "traveler-a", _count: { _all: 5 } }, { createdById: "traveler-b", _count: { _all: 2 } }]; } },
    supplierCapture: { async count(input: Record<string, unknown>) { calls.push({ model: "capture.count", input }); return 3; }, async groupBy() { return [{ createdById: "traveler-a", _count: { _all: 1 } }]; }, async findMany(input: Record<string, unknown>) { calls.push({ model: "capture.findMany", input }); return [{ id: "capture-a", companyName: "ABC", status: "DRAFT", needsReanalysis: true, updatedAt: now, createdBy: { name: "Ana" } }]; } },
  };
}

test("ADMIN obtiene métricas globales, progreso batch y actividad limitada a su viaje", async () => {
  const mock = prisma(); const result = await new PrismaTripAdminDashboardRepository(mock as never).getForAdmin("admin", "trip-a", now);
  assert.deepEqual(result.metrics, { memberCount: 3, activeTravelerCount: 2, pendingInvitationCount: 2, expiredInvitationCount: 1, captureCount: 3, confirmedSupplierCount: 7, pendingCaptureCount: 3, todayCaptureCount: 3 });
  assert.deepEqual(result.progress.map((item) => [item.name, item.confirmedCount, item.pendingCount]), [["Ana", 5, 1], ["Beto", 2, 0]]);
  assert.equal(result.recent[0]?.needsReanalysis, true);
  const recent = mock.calls.find((call) => call.model === "capture.findMany")?.input;
  assert.deepEqual({ take: recent?.take, orderBy: recent?.orderBy, where: (recent?.where as { tripId: string }).tripId }, { take: 5, orderBy: { updatedAt: "desc" }, where: "trip-a" });
  const today = mock.calls.filter((call) => call.model === "capture.count").find((call) => Boolean((call.input.where as Record<string, unknown>).createdAt));
  assert.equal(((today?.input.where as { createdAt: { gte: Date } }).createdAt.gte).toISOString(), "2026-09-17T00:00:00.000Z");
});

test("TRAVELER y miembro de otro viaje no acceden al dashboard administrativo", async () => {
  await assert.rejects(() => new PrismaTripAdminDashboardRepository(prisma("TRAVELER") as never).getForAdmin("traveler-a", "trip-a", now), AuthorizationError);
  const foreign = prisma(); foreign.tripMember.findUnique = (async () => null) as never;
  await assert.rejects(() => new PrismaTripAdminDashboardRepository(foreign as never).getForAdmin("admin", "trip-b", now), AuthorizationError);
});
