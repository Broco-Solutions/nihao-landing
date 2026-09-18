import { ProductCapture } from "@/components/app/ProductCapture";

export default async function NewSupplierPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ captureId?: string }> }) {
  const { tripId } = await params;
  const { captureId } = await searchParams;
  return <ProductCapture tripId={tripId} resumeCaptureId={captureId} />;
}
