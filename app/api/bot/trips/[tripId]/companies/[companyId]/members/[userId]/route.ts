import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { requireTripAdmin } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { ValidationError } from "@/lib/bot/validation";

export async function DELETE(_request: Request, { params }: { params: Promise<{ tripId: string; companyId: string; userId: string }> }) {
  try {
    const admin = await getAuthenticatedUser(); const { tripId, companyId, userId } = await params; const prisma = getPrisma();
    await requireTripAdmin(new PrismaTripAccessRepository(prisma), { userId: admin.id, tripId });
    const company = await prisma.tripCompany.findFirst({ where: { id: companyId, tripId }, select: { id: true } });
    if (!company) throw new ValidationError("Empresa no encontrada");
    const result = await prisma.$transaction(async (tx) => {
      const removed = await tx.tripCompanyMember.deleteMany({ where: { companyId, userId } });
      if (!removed.count) return 0;
      const remaining = await tx.tripCompanyMember.count({ where: { userId, company: { tripId } } });
      if (!remaining) await tx.tripMember.deleteMany({ where: { tripId, userId, role: "TRAVELER" } });
      return removed.count;
    });
    if (!result) throw new ValidationError("El viajero no pertenece a esta empresa");
    return Response.json({ removed: true });
  } catch (error) { return apiError(error); }
}
