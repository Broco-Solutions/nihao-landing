import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { parseEvidenceDecision, resolveTripWhatsAppEvidence } from "@/lib/channels/whatsapp/resolve-web-evidence";

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string; messageId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId, messageId } = await params;
    const decision = await resolveTripWhatsAppEvidence(getPrisma(), user.id, tripId, messageId, parseEvidenceDecision(await request.json()));
    return Response.json({ decision }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
