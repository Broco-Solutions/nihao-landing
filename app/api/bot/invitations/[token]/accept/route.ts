import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { InvitationService } from "@/lib/bot/invitations";
import { PrismaInvitationRepository } from "@/lib/bot/persistence/prisma-invitation-repository";
import { getPrisma } from "@/lib/auth/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { token } = await params;
    return Response.json({ result: await new InvitationService(new PrismaInvitationRepository(getPrisma())).accept(token, user.id, user.email) });
  } catch (error) { return apiError(error); }
}
