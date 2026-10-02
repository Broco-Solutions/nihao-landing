import { TripInsightsView } from "@/components/app/TripInsightsView";

export default async function TripAdministrationPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <TripInsightsView tripId={tripId} role="ADMIN" />;
}
