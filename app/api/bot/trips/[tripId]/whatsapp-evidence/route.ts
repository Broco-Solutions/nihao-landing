import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { listTripWhatsAppEvidence } from "@/lib/channels/whatsapp/web-evidence";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    const travelerId = new URL(request.url).searchParams.get("travelerId")?.trim() || undefined;
    return Response.json({ evidence: await listTripWhatsAppEvidence(getPrisma(), user.id, tripId, travelerId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
