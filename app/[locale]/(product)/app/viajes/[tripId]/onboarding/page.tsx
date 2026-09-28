import { TravelerOnboarding } from "@/components/app/TravelerOnboarding";

export default async function TravelerOnboardingPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <TravelerOnboarding tripId={tripId} />;
}
