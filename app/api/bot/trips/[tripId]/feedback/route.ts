import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { requireTripTraveler } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { ValidationError } from "@/lib/bot/validation";

export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser(); const { tripId } = await params; const prisma = getPrisma();
    await requireTripTraveler(new PrismaTripAccessRepository(prisma), { userId: user.id, tripId });
    const body = await request.json();
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5 || !comment || comment.length > 2000) throw new ValidationError("Ingresá una puntuación de 1 a 5 y un comentario");
    const feedback = await prisma.tripFeedback.upsert({ where: { tripId_userId: { tripId, userId: user.id } }, create: { tripId, userId: user.id, rating: body.rating, comment }, update: { rating: body.rating, comment } });
    return Response.json({ feedback });
  } catch (error) { return apiError(error); }
}
