import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireUserAdmin } from "@/lib/bot/authorization";
import { apiError } from "@/lib/bot/http";

export async function GET() {
  try {
    const admin = await getAuthenticatedUser();
    const prisma = getPrisma();
    await requireUserAdmin(prisma, admin.id);
    const users = await prisma.user.findMany({
      where: { OR: [{ role: "TRAVELER" }, { tripMemberships: { some: { role: "TRAVELER" } } }] },
      select: {
        id: true, name: true, email: true, whatsappPhone: true,
        tripMemberships: { where: { role: "TRAVELER" }, select: { tripId: true, passportNumber: true, trip: { select: { name: true } } } },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    return Response.json({ travelers: users.map((user) => ({
      id: user.id, name: user.name, email: user.email, whatsappPhone: user.whatsappPhone,
      trips: user.tripMemberships.map((member) => ({ tripId: member.tripId, tripName: member.trip.name, passportNumber: member.passportNumber })),
    })) });
  } catch (error) { return apiError(error); }
}
