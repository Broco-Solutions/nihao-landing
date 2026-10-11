import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaExistingTravelerAssignment } from "@/lib/bot/persistence/prisma-existing-traveler-assignment";
import { ValidationError } from "@/lib/bot/validation";
import { PrismaTravelerWelcomeService } from "@/lib/channels/whatsapp/traveler-welcome";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const admin = await getAuthenticatedUser();
    const { tripId } = await params;
    const travelers = await new PrismaExistingTravelerAssignment(getPrisma()).available(admin.id, tripId);
    return Response.json({ travelers });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const admin = await getAuthenticatedUser();
    const { tripId } = await params;
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Elegí un viajero");
    const { userId, companyId } = body as Record<string, unknown>;
    if (typeof userId !== "string" || !userId) throw new ValidationError("Elegí un viajero");
    const repository = new PrismaExistingTravelerAssignment(getPrisma());
    if (typeof companyId !== "string" || !companyId) {
      const result = await repository.addToTrip(admin.id, tripId, userId);
      await new PrismaTravelerWelcomeService(getPrisma()).reevaluate(userId, tripId).catch((error) => console.error("WhatsApp welcome reevaluation failed after trip assignment", { error: error instanceof Error ? error.name : "UnknownError" }));
      return Response.json({ assignment: result }, { status: result.createdTripMembership ? 201 : 200 });
    }
    const result = await repository.assign(admin.id, tripId, userId, companyId);
    await new PrismaTravelerWelcomeService(getPrisma()).reevaluate(userId, tripId).catch((error) => console.error("WhatsApp welcome reevaluation failed after company assignment", { error: error instanceof Error ? error.name : "UnknownError" }));
    return Response.json({ assignment: result }, { status: result.createdCompanyMembership ? 201 : 200 });
  } catch (error) { return apiError(error); }
}
