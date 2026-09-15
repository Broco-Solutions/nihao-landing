import { ProductCapture } from "@/components/app/ProductCapture";

export default async function NewSupplierPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <ProductCapture tripId={tripId} />;
}
