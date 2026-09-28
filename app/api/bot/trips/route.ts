import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaTripRepository } from "@/lib/bot/persistence/prisma-trip-repository";
import { parseCreateTripRequest } from "@/lib/bot/validation";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const repository = new PrismaTripRepository(getPrisma());
    const [trips, canCreateTrip] = await Promise.all([repository.listForUser(user.id), repository.canCreateTrip(user.id)]);
    return Response.json({ trips, canCreateTrip });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const input = parseCreateTripRequest(await request.json());
    const trip = await new PrismaTripRepository(getPrisma()).createForUser(user.id, input);
    return Response.json({ trip }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
