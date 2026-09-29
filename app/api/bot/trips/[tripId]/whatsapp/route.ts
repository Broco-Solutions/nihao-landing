import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaTripWhatsAppRepository } from "@/lib/bot/persistence/prisma-trip-whatsapp-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try { const user = await getAuthenticatedUser(); const { tripId } = await params; return Response.json(await new PrismaTripWhatsAppRepository(getPrisma()).getForMember(user.id, tripId)); }
  catch (error) { return apiError(error); }
}
