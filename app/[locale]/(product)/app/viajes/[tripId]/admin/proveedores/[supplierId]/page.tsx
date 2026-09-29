import { SupplierDetail } from "@/components/app/SupplierDetail";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { requireTripAdmin } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";

export default async function AdminSupplierPage({ params }: { params: Promise<{ tripId: string; supplierId: string }> }) {
  const { tripId, supplierId } = await params;
  const user = await getAuthenticatedUser();
  await requireTripAdmin(new PrismaTripAccessRepository(getPrisma()), { userId: user.id, tripId });
  return <SupplierDetail tripId={tripId} supplierId={supplierId} readOnly />;
}
