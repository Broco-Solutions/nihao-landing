import type { CaptureContext, TripAccessRepository, TripMembership, TripRoleRepository } from "./repository.ts";

export type TripMemberQueryClient = {
  tripMember: {
    findUnique(args: { where: { tripId_userId: CaptureContext }; select?: { role: true } }): Promise<{ role: "ADMIN" | "TRAVELER" } | null>;
  };
};

/** Narrow Prisma-backed boundary used by every capture operation. */
export class PrismaTripAccessRepository implements TripAccessRepository, TripRoleRepository {
  constructor(private readonly prisma: TripMemberQueryClient) {}

  async hasTripAccess(context: CaptureContext): Promise<boolean> {
    return Boolean(await this.getTripMembership(context));
  }

  async getTripMembership(context: CaptureContext): Promise<TripMembership | null> {
    const { tripId, userId } = context;
    return this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: { role: true },
    });
  }
}
