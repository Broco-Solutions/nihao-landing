import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { InvitationService } from "@/lib/bot/invitations";
import { invitationLink, serializeInvitation } from "@/lib/bot/invitation-http";
import { PrismaInvitationRepository } from "@/lib/bot/persistence/prisma-invitation-repository";

function service() { return new InvitationService(new PrismaInvitationRepository(getPrisma())); }

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    return Response.json({ invitations: (await service().list(user.id, tripId)).map(serializeInvitation) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    const body = await request.json() as { email?: unknown; name?: unknown };
    const result = await service().create({ adminUserId: user.id, tripId, email: String(body.email ?? ""), name: typeof body.name === "string" ? body.name : null });
    return Response.json({ invitation: serializeInvitation(result.invitation), reused: result.reused, link: result.token ? invitationLink(result.token) : null }, { status: result.reused ? 200 : 201 });
  } catch (error) { return apiError(error); }
}
