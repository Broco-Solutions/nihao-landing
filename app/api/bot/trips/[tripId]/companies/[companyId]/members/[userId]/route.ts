import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { PrismaExistingTravelerAssignment } from "@/lib/bot/persistence/prisma-existing-traveler-assignment";
import { PrismaTravelerWelcomeService } from "@/lib/channels/whatsapp/traveler-welcome";

export async function DELETE(_request: Request, { params }: { params: Promise<{ tripId: string; companyId: string; userId: string }> }) {
  try {
    const admin = await getAuthenticatedUser();
    const { tripId, companyId, userId } = await params;
    const prisma = getPrisma();
    const result = await new PrismaExistingTravelerAssignment(prisma).unassign(admin.id, tripId, userId, companyId);
    await new PrismaTravelerWelcomeService(prisma).reevaluate(userId, tripId).catch((error) => console.error("WhatsApp welcome reevaluation failed after company removal", { error: error instanceof Error ? error.name : "UnknownError" }));
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
