import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { requireTripAdmin, requireUserAdmin } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { ValidationError } from "@/lib/bot/validation";

export async function DELETE(request: Request, { params }: { params: Promise<{ tripId: string; companyId: string }> }) {
  try {
    const user = await getAuthenticatedUser(); const { tripId, companyId } = await params; const prisma = getPrisma();
    await requireUserAdmin(prisma, user.id);
    await requireTripAdmin(new PrismaTripAccessRepository(prisma), { userId: user.id, tripId });
    const revokePending = new URL(request.url).searchParams.get("revokePending") === "1";
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.tripCompany.findFirst({ where: { id: companyId, tripId, active: true }, select: { id: true } });
      if (!company) throw new ValidationError("La empresa no está asignada a este viaje");
      const pending = await tx.tripInvitation.count({ where: { companyId, tripId, status: "PENDING" } });
      if (pending && !revokePending) throw new ValidationError("Esta empresa tiene invitaciones pendientes. Revocalas al confirmar que querés quitarla del viaje.");
      if (pending) await tx.tripInvitation.updateMany({ where: { companyId, tripId, status: "PENDING" }, data: { status: "EXPIRED" } });
      await tx.tripCompany.update({ where: { id: companyId }, data: { active: false } });
      return { revokedInvitations: pending };
    });
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
