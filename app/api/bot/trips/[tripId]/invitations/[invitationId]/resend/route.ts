import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { InvitationService } from "@/lib/bot/invitations";
import { invitationEmailNames, sendTripInvitationEmail } from "@/lib/bot/invitation-email";
import { invitationLink, serializeInvitation } from "@/lib/bot/invitation-http";
import { PrismaInvitationRepository } from "@/lib/bot/persistence/prisma-invitation-repository";

export async function POST(_request: Request, { params }: { params: Promise<{ tripId: string; invitationId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId, invitationId } = await params;
    const result = await new InvitationService(new PrismaInvitationRepository(getPrisma())).resend(user.id, tripId, invitationId);
    const link = invitationLink(result.token);
    const emailNames = await invitationEmailNames(getPrisma(), result.invitation.id);
    const emailDelivery = emailNames
      ? await sendTripInvitationEmail({ invitationId: result.invitation.id, recipientEmail: result.invitation.email, invitationUrl: link, expiresAt: result.invitation.expiresAt, updatedAt: result.invitation.updatedAt, operation: "RESEND", ...emailNames })
      : "FAILED";
    return Response.json({ invitation: serializeInvitation(result.invitation), link, emailDelivery });
  } catch (error) { return apiError(error); }
}
