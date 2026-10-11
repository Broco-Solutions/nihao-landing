import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { InvitationService } from "@/lib/bot/invitations";
import { PrismaInvitationRepository } from "@/lib/bot/persistence/prisma-invitation-repository";
import { getPrisma } from "@/lib/auth/prisma";
import { PrismaTravelerWelcomeService } from "@/lib/channels/whatsapp/traveler-welcome";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { token } = await params;
    const prisma = getPrisma();
    const result = await new InvitationService(new PrismaInvitationRepository(prisma)).accept(token, user.id, user.email);
    await new PrismaTravelerWelcomeService(prisma).reevaluate(user.id, result.tripId).catch((error) => console.error("WhatsApp welcome reevaluation failed after invitation acceptance", { error: error instanceof Error ? error.name : "UnknownError" }));
    return Response.json({ result });
  } catch (error) { return apiError(error); }
}
