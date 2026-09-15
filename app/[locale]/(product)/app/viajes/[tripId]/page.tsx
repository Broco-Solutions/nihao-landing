import { TripDashboard } from "@/components/app/TripDashboard";

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <TripDashboard tripId={tripId} />;
}
