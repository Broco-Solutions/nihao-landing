import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { parseNegotiationCommand, resolveTripNegotiation } from "@/lib/channels/whatsapp/resolve-negotiation";

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    const result = await resolveTripNegotiation(getPrisma(), user.id, tripId, parseNegotiationCommand(await request.json()));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
