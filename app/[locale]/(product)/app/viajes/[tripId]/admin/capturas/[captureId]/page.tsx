import Link from "next/link";
import { notFound } from "next/navigation";
import { SupplierProducts } from "@/components/app/SupplierProducts";
import { AttachmentUploader } from "@/components/app/AttachmentUploader";
import { FIELD_LABELS, fieldValue } from "@/components/app/tier1-display";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { requireTripAdmin } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";
import type { Tier1Field } from "@/lib/bot/types";

export default async function AdminCapturePage({ params }: { params: Promise<{ tripId: string; captureId: string }> }) {
  const { tripId, captureId } = await params;
  const user = await getAuthenticatedUser();
  const prisma = getPrisma();
  await requireTripAdmin(new PrismaTripAccessRepository(prisma), { userId: user.id, tripId });
  const capture = await new PrismaSupplierCaptureRepository(prisma).getCapture({ userId: user.id, tripId }, captureId);
  const active = await prisma.supplierCapture.findFirst({ where: { id: captureId, tripId, deletedAt: null }, select: { id: true } });
  if (!capture || !active) notFound();
  return <main className="app-page max-w-3xl pb-10">
    <Link href={`/app/viajes/${tripId}/admin`} className="text-sm font-semibold text-ink-mute">← Volver al viaje</Link>
    <h1 className="mt-5 text-3xl">{capture.fields.companyName ?? "Proveedor pendiente"}</h1>
    <p className="mt-2 text-sm text-ink-mute">Captura pendiente de revisión · Solo consulta</p>
    {capture.needsReanalysis ? <p className="mt-4 rounded-xl bg-gold-soft p-4 text-sm">Nueva evidencia para analizar.</p> : null}
    <dl className="mt-5 grid gap-3 sm:grid-cols-2">{(Object.keys(FIELD_LABELS) as Tier1Field[]).filter((field) => !["fob", "moq", "leadTime"].includes(field)).map((field) => <div key={field} className="rounded-xl border border-line bg-white p-4"><dt className="text-xs text-ink-mute">{FIELD_LABELS[field]}{capture.reviewFields.includes(field) ? " · Revisar" : ""}</dt><dd className="mt-1 text-sm">{fieldValue(capture.fields, field)}</dd></div>)}</dl>
    {capture.source.text ? <details className="mt-5"><summary>Información original</summary><p className="mt-2 whitespace-pre-wrap text-sm">{capture.source.text}</p></details> : null}
    <SupplierProducts tripId={tripId} captureId={captureId} readOnly needsReanalysis={capture.needsReanalysis} supplierConfirmed={Boolean(capture.supplierId)} />
    <div className="mt-5"><AttachmentUploader tripId={tripId} captureId={captureId} type="BUSINESS_CARD" readOnly /></div>
  </main>;
}
