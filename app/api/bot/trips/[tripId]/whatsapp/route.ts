import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaTravelerWelcomeService } from "@/lib/channels/whatsapp/traveler-welcome";
import { ValidationError } from "@/lib/bot/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try { const user = await getAuthenticatedUser(); const { tripId } = await params; return Response.json(await new PrismaTravelerWelcomeService(getPrisma()).state(user.id, tripId)); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    const body = await request.json() as { consent?: unknown };
    if (typeof body.consent !== "boolean") throw new ValidationError("Indicá si autorizás las comunicaciones operativas por WhatsApp");
    return Response.json(await new PrismaTravelerWelcomeService(getPrisma()).setConsent(user.id, tripId, body.consent, "TRIP_WEB"));
  } catch (error) { return apiError(error); }
}
