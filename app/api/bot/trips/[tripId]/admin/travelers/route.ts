import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaExistingTravelerAssignment } from "@/lib/bot/persistence/prisma-existing-traveler-assignment";
import { ValidationError } from "@/lib/bot/validation";

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
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Elegí un viajero y una empresa");
    const { userId, companyId } = body as Record<string, unknown>;
    if (typeof userId !== "string" || !userId || typeof companyId !== "string" || !companyId) throw new ValidationError("Elegí un viajero y una empresa");
    const result = await new PrismaExistingTravelerAssignment(getPrisma()).assign(admin.id, tripId, userId, companyId);
    return Response.json({ assignment: result }, { status: 201 });
  } catch (error) { return apiError(error); }
}
