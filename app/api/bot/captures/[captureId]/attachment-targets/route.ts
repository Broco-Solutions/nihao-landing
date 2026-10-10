import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { parseTripContext } from "@/lib/bot/validation";
import { listAttachmentMoveTargets } from "@/lib/nihao/operations/move-attachment";

export async function GET(request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    const targets = await getPrisma().$transaction((tx) => listAttachmentMoveTargets(tx, { userId: user.id, tripId }, captureId));
    return Response.json({ targets });
  } catch (error) { return apiError(error); }
}
