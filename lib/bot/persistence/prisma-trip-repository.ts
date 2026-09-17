import type { PrismaClient, Trip } from "../../../generated/prisma/client.ts";
import type { TripRecord, TripStatus } from "../types.ts";

export type CreateTripInput = {
  name: string;
  startDate: Date | null;
  endDate: Date | null;
};

function toTripRecord(trip: Trip): TripRecord {
  return {
    id: trip.id,
    userId: trip.createdById,
    name: trip.name,
    startDate: trip.startDate?.toISOString() ?? null,
    endDate: trip.endDate?.toISOString() ?? null,
    status: trip.status as TripStatus,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  };
}

export class PrismaTripRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createForUser(userId: string, input: CreateTripInput): Promise<TripRecord> {
    const trip = await this.prisma.$transaction((transaction) => transaction.trip.create({
      data: {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        createdById: userId,
        members: { create: { userId } },
      },
    }));
    return toTripRecord(trip);
  }

  async listForUser(userId: string): Promise<TripRecord[]> {
    const trips = await this.prisma.trip.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: "desc" },
    });
    return trips.map(toTripRecord);
  }
}
