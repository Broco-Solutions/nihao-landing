import { ProductCapture } from "@/components/app/ProductCapture";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { requireTripTraveler } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { redirect } from "next/navigation";

export default async function NewSupplierPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ captureId?: string; productId?: string }> }) {
  const { tripId } = await params;
  const user = await getAuthenticatedUser();
  const membership = await new PrismaTripAccessRepository(getPrisma()).getTripMembership({ userId: user.id, tripId });
  if (membership?.role === "ADMIN") redirect(`/app/viajes/${tripId}/admin`);
  await requireTripTraveler(new PrismaTripAccessRepository(getPrisma()), { userId: user.id, tripId });
  const { captureId, productId } = await searchParams;
  return <ProductCapture tripId={tripId} resumeCaptureId={captureId} reviewProductId={productId} />;
}
