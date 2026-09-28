import { SupplierReport } from "@/components/app/SupplierReport";
export default async function Page({ params }: { params: Promise<{ tripId: string }> }) { const { tripId } = await params; return <SupplierReport tripId={tripId} />; }
