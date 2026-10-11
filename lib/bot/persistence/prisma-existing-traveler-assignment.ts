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
    const travelers = await this.prisma.user.findMany({
      where: { role: "TRAVELER" },
      select: {
        id: true,
        name: true,
        email: true,
        whatsappPhone: true,
        tripMemberships: { where: { tripId }, select: { role: true } },
        companyMemberships: { where: { company: { tripId } }, select: { companyId: true } },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    return travelers.map(({ tripMemberships, companyMemberships, ...traveler }) => ({
      ...traveler,
      tripRole: tripMemberships[0]?.role ?? null,
      companyIds: companyMemberships.map((membership) => membership.companyId),
    }));
  }

  async assign(adminUserId: string, tripId: string, userId: string, companyId: string) {
    await this.authorize(adminUserId, tripId);
    if (!userId || !companyId) throw new ValidationError("Elegí un viajero y una empresa");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const traveler = await tx.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
        const company = await tx.tripCompany.findFirst({ where: { id: companyId, tripId, active: true }, select: { id: true } });
        const membership = await tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { role: true } });
        if (!traveler || traveler.role !== "TRAVELER") throw new ValidationError("El viajero no está disponible");
        if (!company) throw new ValidationError("Elegí una empresa asignada a este viaje");
        if (membership?.role === "ADMIN") throw new ValidationError("Una cuenta administradora no puede asignarse como viajero");
        const existingCompany = await tx.tripCompanyMember.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { userId: true } });
        if (!membership) await tx.tripMember.create({ data: { tripId, userId, role: "TRAVELER" } });
        if (!existingCompany) await tx.tripCompanyMember.create({ data: { companyId, userId } });
        if (!membership || !existingCompany) await tx.tripInvitation.updateMany({ where: { tripId, email: traveler.email, status: "PENDING" }, data: { status: "EXPIRED" } });
        return { userId, companyId, createdTripMembership: !membership, createdCompanyMembership: !existingCompany };
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        const existing = await this.prisma.tripCompanyMember.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { userId: true } });
        if (existing) return { userId, companyId, createdTripMembership: false, createdCompanyMembership: false };
        throw new ValidationError("No pudimos completar la asignación. Volvé a intentarlo.");
      }
      throw error;
    }
  }

  async addToTrip(adminUserId: string, tripId: string, userId: string) {
    await this.authorize(adminUserId, tripId);
    if (!userId) throw new ValidationError("Elegí un viajero");
    return this.prisma.$transaction(async (tx) => {
      const traveler = await tx.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
      if (!traveler || traveler.role !== "TRAVELER") throw new ValidationError("El viajero no está disponible");
      const membership = await tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { role: true } });
      if (membership?.role === "ADMIN") throw new ValidationError("Una cuenta administradora no puede asignarse como viajero");
      if (!membership) await tx.tripMember.create({ data: { tripId, userId, role: "TRAVELER" } });
      if (!membership) await tx.tripInvitation.updateMany({ where: { tripId, email: traveler.email, status: "PENDING" }, data: { status: "EXPIRED" } });
      return { userId, createdTripMembership: !membership };
    });
  }

  async unassign(adminUserId: string, tripId: string, userId: string, companyId: string) {
    await this.authorize(adminUserId, tripId);
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.tripCompany.findFirst({ where: { id: companyId, tripId, active: true }, select: { id: true } });
      const member = await tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { role: true } });
      if (!company) throw new ValidationError("Empresa no encontrada en este viaje");
      if (!member || member.role !== "TRAVELER") throw new ValidationError("El viajero no pertenece a este viaje");
      const captureCount = await tx.supplierCapture.count({ where: { tripId, companyId, createdById: userId } });
      const supplierCount = await tx.supplier.count({ where: { tripId, companyId, createdById: userId } });
      const removed = await tx.tripCompanyMember.deleteMany({ where: { companyId, userId } });
      return { removed: Boolean(removed.count), alreadyUnassigned: !removed.count, preserved: { captureCount, supplierCount } };
    });
  }
}
