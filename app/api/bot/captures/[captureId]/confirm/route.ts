import { requireTripTraveler } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { apiError } from "@/lib/bot/http";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";
import { parseTripContext } from "@/lib/bot/validation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  try {
    const { captureId } = await params;
    const input = parseTripContext(await request.json());
    const user = await getAuthenticatedUser();
    await requireTripTraveler(new PrismaTripAccessRepository(getPrisma()), { userId: user.id, tripId: input.tripId });
    const result = await new PrismaSupplierCaptureRepository(getPrisma()).confirm({ userId: user.id, tripId: input.tripId }, captureId);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
