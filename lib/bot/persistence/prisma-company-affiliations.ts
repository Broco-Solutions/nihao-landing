import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { requireUserAdmin } from "../authorization.ts";

export class PrismaCompanyAffiliations {
  constructor(private readonly prisma: PrismaClient) {}

  async getForAdmin(adminUserId: string, companyId: string) {
    await requireUserAdmin(this.prisma, adminUserId);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        trips: {
          where: { active: true },
          select: {
            tripId: true,
            trip: { select: { name: true } },
            members: { select: { user: { select: { id: true, name: true, email: true } } } },
          },
          orderBy: { trip: { name: "asc" } },
        },
      },
    });
    if (!company) return null;
    return {
      id: company.id,
      name: company.name,
      trips: company.trips.map((assignment) => ({
        id: assignment.tripId,
        name: assignment.trip.name,
        travelers: assignment.members.map((member) => member.user).sort((a, b) => a.name.localeCompare(b.name, "es")),
      })),
    };
  }
}
