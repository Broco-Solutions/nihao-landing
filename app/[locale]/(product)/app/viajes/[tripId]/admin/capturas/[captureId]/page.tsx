import { notFound } from "next/navigation";
import { SupplierCaptureReview } from "@/components/app/SupplierCaptureReview";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { requireTripAdmin } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";

export default async function AdminCapturePage({ params }: { params: Promise<{ tripId: string; captureId: string }> }) {
  const { tripId, captureId } = await params;
  const user = await getAuthenticatedUser();
  const prisma = getPrisma();
  await requireTripAdmin(new PrismaTripAccessRepository(prisma), { userId: user.id, tripId });
  const capture = await new PrismaSupplierCaptureRepository(prisma).getCapture({ userId: user.id, tripId }, captureId);
  const active = await prisma.supplierCapture.findFirst({ where: { id: captureId, tripId, deletedAt: null }, select: { id: true } });
  if (!capture || !active) notFound();
  return <SupplierCaptureReview tripId={tripId} initialCapture={capture} role="ADMIN" />;
}
