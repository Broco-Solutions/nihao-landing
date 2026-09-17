import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { InvitationService } from "@/lib/bot/invitations";
import { invitationLink, serializeInvitation } from "@/lib/bot/invitation-http";
import { PrismaInvitationRepository } from "@/lib/bot/persistence/prisma-invitation-repository";

export async function POST(_request: Request, { params }: { params: Promise<{ tripId: string; invitationId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId, invitationId } = await params;
    const result = await new InvitationService(new PrismaInvitationRepository(getPrisma())).resend(user.id, tripId, invitationId);
    return Response.json({ invitation: serializeInvitation(result.invitation), link: invitationLink(result.token) });
  } catch (error) { return apiError(error); }
}
