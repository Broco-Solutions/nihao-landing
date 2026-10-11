import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { getStorageProvider } from "@/lib/bot/storage";
import { getTripWhatsAppEvidenceMedia } from "@/lib/channels/whatsapp/web-evidence";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string; messageId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId, messageId } = await params;
    const media = await getTripWhatsAppEvidenceMedia(getPrisma(), user.id, tripId, messageId);
    if (!media) return Response.json({ error: "La evidencia original no está disponible" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const url = await getStorageProvider().signedUrl({ key: media.key, expiresInSeconds: 90 });
    return Response.redirect(url, 302);
  } catch (error) { return apiError(error); }
}
