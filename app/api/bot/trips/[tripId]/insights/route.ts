import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { getTripInsights } from "@/lib/bot/trip-insights";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    return Response.json({ insights: await getTripInsights(getPrisma(), user.id, tripId) });
  } catch (error) { return apiError(error); }
}
