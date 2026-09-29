import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { requireTripAdmin, requireUserAdmin } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { ValidationError } from "@/lib/bot/validation";

export async function DELETE(_request: Request, { params }: { params: Promise<{ tripId: string; companyId: string }> }) {
  try {
    const user = await getAuthenticatedUser(); const { tripId, companyId } = await params; const prisma = getPrisma();
    await requireUserAdmin(prisma, user.id);
    await requireTripAdmin(new PrismaTripAccessRepository(prisma), { userId: user.id, tripId });
    const pending = await prisma.tripInvitation.count({ where: { companyId, tripId, status: "PENDING", expiresAt: { gt: new Date() } } });
    if (pending) throw new ValidationError("Esta empresa tiene invitaciones pendientes. Esperá a que se acepten o venzan antes de quitarla.");
    const result = await prisma.tripCompany.updateMany({ where: { id: companyId, tripId, active: true }, data: { active: false } });
    if (!result.count) throw new ValidationError("La empresa no está asignada a este viaje");
    return new Response(null, { status: 204 });
  } catch (error) { return apiError(error); }
}
