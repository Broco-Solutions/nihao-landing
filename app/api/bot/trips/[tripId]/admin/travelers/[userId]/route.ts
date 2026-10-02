import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaTripAdministrationRepository } from "@/lib/bot/persistence/prisma-trip-administration-repository";
import { parsePassportNumber, ValidationError } from "@/lib/bot/validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tripId: string; userId: string }> },
) {
  try {
    const admin = await getAuthenticatedUser();
    const { tripId, userId } = await params;
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body) || !("passportNumber" in body)) throw new ValidationError("Pasaporte no es válido");
    const passportNumber = parsePassportNumber((body as { passportNumber: unknown }).passportNumber);
    const updated = await new PrismaTripAdministrationRepository(getPrisma()).updateTravelerPassport(admin.id, tripId, userId, passportNumber);
    if (!updated) return Response.json({ error: "Viajero no encontrado en este viaje" }, { status: 404 });
    return Response.json({ passportNumber });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tripId: string; userId: string }> },
) {
  try {
    const admin = await getAuthenticatedUser();
    const { tripId, userId } = await params;
    const removed = await new PrismaTripAdministrationRepository(getPrisma()).removeTraveler(admin.id, tripId, userId);
    if (!removed) return Response.json({ error: "Viajero no encontrado en este viaje" }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
