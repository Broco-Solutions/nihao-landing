import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { resolveTripForUser } from "@/lib/bot/trip-route";
import { tripManagementPath } from "@/lib/app-routes";
import { notFound, redirect } from "next/navigation";

export default async function TripAdministrationPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await getAuthenticatedUser();
  const trip = await resolveTripForUser(getPrisma(), user.id, tripId);
  if (!trip || trip.members[0]?.role !== "ADMIN") notFound();
  redirect(tripManagementPath(trip));
}
