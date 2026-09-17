import { TripAdministration } from "@/components/app/TripAdministration";

export default async function TripAdministrationPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <TripAdministration tripId={tripId} />;
}
