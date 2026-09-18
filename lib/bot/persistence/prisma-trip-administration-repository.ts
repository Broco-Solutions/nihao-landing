import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { requireTripAdmin } from "../authorization.ts";
import type { TripAdministrationRecord, TripInvitationStatus, TripMemberRole, TripRecord, TripStatus } from "../types.ts";
import { PrismaTripAccessRepository } from "./prisma-trip-access-repository.ts";

function toTripRecord(trip: {
  id: string;
  createdById: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): TripRecord {
  return {
    id: trip.id,
    userId: trip.createdById,
    name: trip.name,
    startDate: trip.startDate?.toISOString() ?? null,
    endDate: trip.endDate?.toISOString() ?? null,
    status: trip.status as TripStatus,
    role: "ADMIN",
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  };
}

export class PrismaTripAdministrationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getForAdmin(userId: string, tripId: string): Promise<TripAdministrationRecord | null> {
    await requireTripAdmin(new PrismaTripAccessRepository(this.prisma), { userId, tripId });
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        createdById: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!trip) return null;

    const [members, captureCounts, supplierCounts, captureCount, supplierCount, invitations] = await Promise.all([
      this.prisma.tripMember.findMany({
        where: { tripId },
        orderBy: { createdAt: "asc" },
        select: { userId: true, role: true, createdAt: true, user: { select: { name: true, email: true } } },
      }),
      this.prisma.supplierCapture.groupBy({ by: ["createdById"], where: { tripId }, _count: { _all: true } }),
      this.prisma.supplier.groupBy({ by: ["createdById"], where: { tripId }, _count: { _all: true } }),
      this.prisma.supplierCapture.count({ where: { tripId } }),
      this.prisma.supplier.count({ where: { tripId } }),
      this.prisma.tripInvitation.findMany({ where: { tripId }, orderBy: { createdAt: "desc" } }),
    ]);
    const captureCountByUser = new Map(captureCounts.map((entry) => [entry.createdById, entry._count._all]));
    const supplierCountByUser = new Map(supplierCounts.map((entry) => [entry.createdById, entry._count._all]));

    return {
      trip: toTripRecord(trip),
      members: members.map((member) => ({
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        role: member.role as TripMemberRole,
        captureCount: captureCountByUser.get(member.userId) ?? 0,
        supplierCount: supplierCountByUser.get(member.userId) ?? 0,
        createdAt: member.createdAt.toISOString(),
      })),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        status: invitation.status as TripInvitationStatus,
        expiresAt: invitation.expiresAt.toISOString(),
        acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
        createdAt: invitation.createdAt.toISOString(),
        updatedAt: invitation.updatedAt.toISOString(),
      })),
      metrics: {
        memberCount: members.length,
        travelerCount: members.filter((member) => member.role === "TRAVELER").length,
        captureCount,
        supplierCount,
      },
    };
  }
}
