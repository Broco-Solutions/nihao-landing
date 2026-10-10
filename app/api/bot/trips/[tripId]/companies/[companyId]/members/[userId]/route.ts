import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { PrismaExistingTravelerAssignment } from "@/lib/bot/persistence/prisma-existing-traveler-assignment";

export async function DELETE(_request: Request, { params }: { params: Promise<{ tripId: string; companyId: string; userId: string }> }) {
  try {
    const admin = await getAuthenticatedUser();
    const { tripId, companyId, userId } = await params;
    const result = await new PrismaExistingTravelerAssignment(getPrisma()).unassign(admin.id, tripId, userId, companyId);
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
