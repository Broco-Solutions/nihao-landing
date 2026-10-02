import { TripInsightsView } from "@/components/app/TripInsightsView";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { redirect } from "next/navigation";

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await getAuthenticatedUser();
  const membership = await getPrisma().tripMember.findUnique({ where: { tripId_userId: { tripId, userId: user.id } }, select: { role: true } });
  if (membership?.role === "ADMIN") redirect(`/app/viajes/${tripId}/admin`);
  return <TripInsightsView tripId={tripId} role="TRAVELER" />;
}
