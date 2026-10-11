import { TripInsightsView } from "@/components/app/TripInsightsView";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { resolveTripForUser } from "@/lib/bot/trip-route";
import { tripManagementPath } from "@/lib/app-routes";
import { notFound, redirect } from "next/navigation";

export default async function TripManagementPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId: routeKey } = await params;
  const user = await getAuthenticatedUser();
  const trip = await resolveTripForUser(getPrisma(), user.id, routeKey);
  if (!trip || trip.members[0]?.role !== "ADMIN") notFound();
  if (routeKey !== trip.publicSlug && trip.publicSlug) redirect(tripManagementPath(trip));
  return <TripInsightsView tripId={trip.id} routeKey={trip.publicSlug ?? trip.id} role="ADMIN" initialTab="administracion" />;
}
