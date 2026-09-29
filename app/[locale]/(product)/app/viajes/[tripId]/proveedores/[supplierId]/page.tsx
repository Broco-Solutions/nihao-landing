import { SupplierDetail } from "@/components/app/SupplierDetail";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { redirect } from "next/navigation";

export default async function SupplierPage({ params }: { params: Promise<{ tripId: string; supplierId: string }> }) {
  const { tripId, supplierId } = await params;
  const user = await getAuthenticatedUser();
  const membership = await getPrisma().tripMember.findUnique({ where: { tripId_userId: { tripId, userId: user.id } }, select: { role: true } });
  if (membership?.role === "ADMIN") redirect(`/app/viajes/${tripId}/admin/proveedores/${supplierId}`);
  return <SupplierDetail tripId={tripId} supplierId={supplierId} />;
}
