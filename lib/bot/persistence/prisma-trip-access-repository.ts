import type { CaptureContext, TripAccessRepository } from "./repository.ts";

export type TripMemberQueryClient = {
  tripMember: {
    findUnique(args: { where: { tripId_userId: CaptureContext } }): Promise<unknown>;
  };
};

/** Narrow Prisma-backed boundary used by every capture operation. */
export class PrismaTripAccessRepository implements TripAccessRepository {
  constructor(private readonly prisma: TripMemberQueryClient) {}

  async hasTripAccess(context: CaptureContext): Promise<boolean> {
    const { tripId, userId } = context;
    return Boolean(await this.prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } }));
  }
}
