import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { InvitationService } from "@/lib/bot/invitations";
import { serializeInvitation } from "@/lib/bot/invitation-http";
import { PrismaInvitationRepository } from "@/lib/bot/persistence/prisma-invitation-repository";

export async function DELETE(_request: Request, { params }: { params: Promise<{ tripId: string; invitationId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId, invitationId } = await params;
    const invitation = await new InvitationService(new PrismaInvitationRepository(getPrisma())).revoke(user.id, tripId, invitationId);
    return Response.json({ invitation: serializeInvitation(invitation) });
  } catch (error) {
    return apiError(error);
  }
}
