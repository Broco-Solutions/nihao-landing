import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { requireTripMember } from "../authorization.ts";
import { PrismaTripAccessRepository } from "./prisma-trip-access-repository.ts";

export type TripOnboardingState = {
  tripId: string;
  tripName: string;
  role: "ADMIN" | "TRAVELER";
  onboardingCompletedAt: Date | null;
};

export class PrismaTripOnboardingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getForMember(userId: string, tripId: string): Promise<TripOnboardingState> {
    await requireTripMember(new PrismaTripAccessRepository(this.prisma), { userId, tripId });
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: { role: true, onboardingCompletedAt: true, trip: { select: { name: true } } },
    });
    if (!member) throw new Error("La membresía no está disponible");
    return { tripId, tripName: member.trip.name, role: member.role, onboardingCompletedAt: member.onboardingCompletedAt };
  }

  async complete(userId: string, tripId: string): Promise<TripOnboardingState> {
    await requireTripMember(new PrismaTripAccessRepository(this.prisma), { userId, tripId });
    await this.prisma.tripMember.updateMany({
      where: { tripId, userId, onboardingCompletedAt: null },
      data: { onboardingCompletedAt: new Date() },
    });
    return this.getForMember(userId, tripId);
  }
}
