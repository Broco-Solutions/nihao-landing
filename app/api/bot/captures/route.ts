import { apiError } from "@/lib/bot/http";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";
import { parseTripContext } from "@/lib/bot/validation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = parseTripContext({ tripId: url.searchParams.get("tripId") });
    const user = await getAuthenticatedUser();
    const captures = await new PrismaSupplierCaptureRepository(getPrisma()).listCaptures({ userId: user.id, tripId: input.tripId });
    return Response.json({ captures });
  } catch (error) {
    return apiError(error);
  }
}
