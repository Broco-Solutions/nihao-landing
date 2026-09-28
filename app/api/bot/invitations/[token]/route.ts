import { apiError } from "@/lib/bot/http";
import { InvitationService } from "@/lib/bot/invitations";
import { PrismaInvitationRepository } from "@/lib/bot/persistence/prisma-invitation-repository";
import { getPrisma } from "@/lib/auth/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invitation = await new InvitationService(new PrismaInvitationRepository(getPrisma())).getPublic(token);
    return Response.json(invitation);
  } catch (error) { return apiError(error); }
}
