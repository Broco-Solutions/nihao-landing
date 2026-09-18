import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaTravelerDashboardRepository } from "@/lib/bot/persistence/prisma-traveler-dashboard-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    const dashboard = await new PrismaTravelerDashboardRepository(getPrisma()).getForTraveler(user.id, tripId);
    if (!dashboard) return Response.json({ error: "Viaje no encontrado" }, { status: 404 });
    return Response.json({ dashboard });
  } catch (error) {
    return apiError(error);
  }
}
