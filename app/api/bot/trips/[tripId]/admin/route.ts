import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { isUserAdmin } from "@/lib/bot/authorization";
import { PrismaTripAdministrationRepository } from "@/lib/bot/persistence/prisma-trip-administration-repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    const prisma = getPrisma();
    const administration = await new PrismaTripAdministrationRepository(prisma).getForAdmin(user.id, tripId);
    if (!administration) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });
    return Response.json({ ...administration, canInviteTravelers: await isUserAdmin(prisma, user.id) });
  } catch (error) {
    return apiError(error);
  }
}
