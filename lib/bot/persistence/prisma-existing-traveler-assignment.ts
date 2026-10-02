import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { requireTripAdmin, requireUserAdmin } from "../authorization.ts";
import { ValidationError } from "../validation.ts";
import { PrismaTripAccessRepository } from "./prisma-trip-access-repository.ts";

export class PrismaExistingTravelerAssignment {
  constructor(private readonly prisma: PrismaClient) {}

  private async authorize(adminUserId: string, tripId: string) {
    await requireUserAdmin(this.prisma, adminUserId);
    await requireTripAdmin(new PrismaTripAccessRepository(this.prisma), { userId: adminUserId, tripId });
  }

  async available(adminUserId: string, tripId: string) {
    await this.authorize(adminUserId, tripId);
    return this.prisma.user.findMany({
      where: { role: "TRAVELER", tripMemberships: { none: { tripId } } },
      select: { id: true, name: true, email: true, whatsappPhone: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
  }

  async assign(adminUserId: string, tripId: string, userId: string, companyId: string) {
    await this.authorize(adminUserId, tripId);
    if (!userId || !companyId) throw new ValidationError("Elegí un viajero y una empresa");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [traveler, company, membership] = await Promise.all([
          tx.user.findUnique({ where: { id: userId }, select: { email: true, role: true } }),
          tx.tripCompany.findFirst({ where: { id: companyId, tripId, active: true }, select: { id: true } }),
          tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { role: true } }),
        ]);
        if (!traveler || traveler.role !== "TRAVELER") throw new ValidationError("El viajero no está disponible");
        if (!company) throw new ValidationError("Elegí una empresa asignada a este viaje");
        if (membership) throw new ValidationError("El viajero ya pertenece a este viaje");
        await tx.tripMember.create({ data: { tripId, userId, role: "TRAVELER" } });
        await tx.tripCompanyMember.create({ data: { companyId, userId } });
        await tx.tripInvitation.updateMany({ where: { tripId, email: traveler.email, status: "PENDING" }, data: { status: "EXPIRED" } });
        return { userId, companyId };
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ValidationError("El viajero ya pertenece a este viaje");
      throw error;
    }
  }
}
