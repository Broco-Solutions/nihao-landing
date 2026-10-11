import type { PrismaClient, Trip } from "../../../generated/prisma/client.ts";
import type { TripMemberRole, TripRecord, TripStatus } from "../types.ts";
import { isUserAdmin, requireUserAdmin } from "../authorization.ts";
import { slugifyRouteLabel } from "../../app-routes.ts";

export type CreateTripInput = {
  name: string;
  startDate: Date | null;
  endDate: Date | null;
};

function toTripRecord(trip: Trip, role: TripMemberRole): TripRecord {
  return {
    id: trip.id,
    publicSlug: trip.publicSlug,
    userId: trip.createdById,
    name: trip.name,
    startDate: trip.startDate?.toISOString() ?? null,
    endDate: trip.endDate?.toISOString() ?? null,
    status: trip.status as TripStatus,
    role,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  };
}

export class PrismaTripRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createForUser(userId: string, input: CreateTripInput): Promise<TripRecord> {
    const publicSlug = await this.uniqueSlug(input.name);
    const trip = await this.prisma.$transaction(async (transaction) => {
      await requireUserAdmin(transaction, userId);
      return transaction.trip.create({
        data: {
          publicSlug,
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
          createdById: userId,
          members: { create: { userId, role: "ADMIN" } },
        },
      });
    });
    return toTripRecord(trip, "ADMIN");
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugifyRouteLabel(name);
    if (!await this.prisma.trip.findUnique({ where: { publicSlug: base }, select: { id: true } })) return base;
    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const candidate = `${base}-${suffix}`;
      if (!await this.prisma.trip.findUnique({ where: { publicSlug: candidate }, select: { id: true } })) return candidate;
    }
    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }

  async canCreateTrip(userId: string): Promise<boolean> {
    return isUserAdmin(this.prisma, userId);
  }

  async listForUser(userId: string): Promise<TripRecord[]> {
    const trips = await this.prisma.trip.findMany({
      where: { members: { some: { userId } } },
      include: { members: { where: { userId }, select: { role: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return trips.map((trip) => toTripRecord(trip, trip.members[0]?.role as TripMemberRole));
  }
}
