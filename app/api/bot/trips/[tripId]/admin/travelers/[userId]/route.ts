import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaTripAdministrationRepository } from "@/lib/bot/persistence/prisma-trip-administration-repository";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tripId: string; userId: string }> },
) {
  try {
    const admin = await getAuthenticatedUser();
    const { tripId, userId } = await params;
    const removed = await new PrismaTripAdministrationRepository(getPrisma()).removeTraveler(admin.id, tripId, userId);
    if (!removed) return Response.json({ error: "Viajero no encontrado en este viaje" }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
