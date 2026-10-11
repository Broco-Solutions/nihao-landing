import { TripInsightsView, type TripInsightsTab } from "@/components/app/TripInsightsView";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { resolveTripForUser } from "@/lib/bot/trip-route";
import { tripManagementPath, tripPath } from "@/lib/app-routes";

const SECTIONS = new Set<TripInsightsTab>(["resumen", "viajeros", "actividad", "evidencias", "proveedores", "productos", "agenda", "reportes", "feedback"]);

export default async function TripPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ section?: string }> }) {
  const { tripId: routeKey } = await params;
  const user = await getAuthenticatedUser();
  const trip = await resolveTripForUser(getPrisma(), user.id, routeKey);
  if (!trip) notFound();
  const requested = (await searchParams).section;
  const section: TripInsightsTab = requested && SECTIONS.has(requested as TripInsightsTab) ? requested as TripInsightsTab : "resumen";
  if (routeKey !== trip.publicSlug && trip.publicSlug) redirect(tripPath(trip, section === "resumen" ? undefined : section));
  if (trip.members[0]?.role === "ADMIN" && !requested) redirect(tripManagementPath(trip));
  const role = trip.members[0]?.role === "ADMIN" ? "ADMIN" : "TRAVELER";
  return <TripInsightsView tripId={trip.id} routeKey={trip.publicSlug ?? trip.id} role={role} initialTab={section} />;
}
