import { TripDashboard } from "@/components/app/TripDashboard";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { redirect } from "next/navigation";

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await getAuthenticatedUser();
  const membership = await getPrisma().tripMember.findUnique({ where: { tripId_userId: { tripId, userId: user.id } }, select: { role: true } });
  if (membership?.role === "ADMIN") redirect(`/app/viajes/${tripId}/admin`);
  return <TripDashboard tripId={tripId} />;
}
