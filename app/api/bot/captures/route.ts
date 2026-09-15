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
    const suppliers = await new PrismaSupplierCaptureRepository(getPrisma()).listSuppliers({ userId: user.id, tripId: input.tripId });
    return Response.json({ suppliers });
  } catch (error) {
    return apiError(error);
  }
}
