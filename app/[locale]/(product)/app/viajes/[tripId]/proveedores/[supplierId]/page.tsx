import { SupplierDetail } from "@/components/app/SupplierDetail";

export default async function SupplierPage({ params }: { params: Promise<{ tripId: string; supplierId: string }> }) {
  const { tripId, supplierId } = await params;
  return <SupplierDetail tripId={tripId} supplierId={supplierId} />;
}
