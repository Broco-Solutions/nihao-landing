import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaTripAdminDashboardRepository } from "@/lib/bot/persistence/prisma-trip-admin-dashboard-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try { const user = await getAuthenticatedUser(); const { tripId } = await params; return Response.json({ dashboard: await new PrismaTripAdminDashboardRepository(getPrisma()).getForAdmin(user.id, tripId) }); }
  catch (error) { return apiError(error); }
}
