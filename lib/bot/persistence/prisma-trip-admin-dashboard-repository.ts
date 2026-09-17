import { CaptureStatus, TripInvitationStatus, type PrismaClient } from "../../../generated/prisma/client.ts";
import { requireTripAdmin } from "../authorization.ts";
import type { TripAdminDashboardRecord } from "../types.ts";
import { PrismaTripAccessRepository } from "./prisma-trip-access-repository.ts";

const RECENT_LIMIT = 5;

/** Constant-size aggregate query set for one ADMIN and one Trip. */
export class PrismaTripAdminDashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getForAdmin(userId: string, tripId: string, now = new Date()): Promise<TripAdminDashboardRecord> {
    await requireTripAdmin(new PrismaTripAccessRepository(this.prisma), { userId, tripId });
    const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [members, pendingInvitations, expiredInvitations, captureCount, confirmedSupplierCount, pendingCaptureCount, todayCaptureCount, confirmedByUser, pendingByUser, recent] = await Promise.all([
      this.prisma.tripMember.findMany({ where: { tripId }, select: { userId: true, role: true, user: { select: { name: true, email: true } } } }),
      this.prisma.tripInvitation.count({ where: { tripId, status: TripInvitationStatus.PENDING } }),
      this.prisma.tripInvitation.count({ where: { tripId, status: TripInvitationStatus.EXPIRED } }),
      this.prisma.supplierCapture.count({ where: { tripId } }),
      this.prisma.supplier.count({ where: { tripId } }),
      this.prisma.supplierCapture.count({ where: { tripId, status: CaptureStatus.DRAFT } }),
      this.prisma.supplierCapture.count({ where: { tripId, createdAt: { gte: startUtc } } }),
      this.prisma.supplier.groupBy({ by: ["createdById"], where: { tripId }, _count: { _all: true } }),
      this.prisma.supplierCapture.groupBy({ by: ["createdById"], where: { tripId, status: CaptureStatus.DRAFT }, _count: { _all: true } }),
      this.prisma.supplierCapture.findMany({ where: { tripId }, orderBy: { updatedAt: "desc" }, take: RECENT_LIMIT, select: { id: true, companyName: true, status: true, needsReanalysis: true, updatedAt: true, createdBy: { select: { name: true } } } }),
    ]);
    const confirmed = new Map(confirmedByUser.map((entry) => [entry.createdById, entry._count._all]));
    const pending = new Map(pendingByUser.map((entry) => [entry.createdById, entry._count._all]));
    return {
      metrics: { memberCount: members.length, activeTravelerCount: members.filter((member) => member.role === "TRAVELER").length, pendingInvitationCount: pendingInvitations, expiredInvitationCount: expiredInvitations, captureCount, confirmedSupplierCount, pendingCaptureCount, todayCaptureCount },
      progress: members.filter((member) => member.role === "TRAVELER").map((member) => ({ userId: member.userId, name: member.user.name, email: member.user.email, confirmedCount: confirmed.get(member.userId) ?? 0, pendingCount: pending.get(member.userId) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name, "es")),
      recent: recent.map((capture) => ({ captureId: capture.id, companyName: capture.companyName, name: capture.createdBy.name, status: capture.status, needsReanalysis: capture.needsReanalysis, updatedAt: capture.updatedAt.toISOString() })),
    };
  }
}
