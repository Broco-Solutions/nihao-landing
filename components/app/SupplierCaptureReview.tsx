"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SupplierCaptureRecord, Tier1Data, Tier1Field } from "@/lib/bot/types";
import { canConfirmCapture } from "@/lib/bot/tier1";
import { AppNotice } from "./AppNotice";
import { AttachmentUploader } from "./AttachmentUploader";
import { CaptureDetails } from "./CaptureDetails";
import { CaptureFieldReview } from "./CaptureFieldReview";
import { LinkedWhatsAppEvidence } from "./LinkedWhatsAppEvidence";
import { SupplierProducts } from "./SupplierProducts";
import { Tier1Editor } from "./Tier1Editor";
import { appApi } from "./api";

export function SupplierCaptureReview({ tripId, initialCapture, role }: { tripId: string; initialCapture: SupplierCaptureRecord; role: "ADMIN" | "TRAVELER" }) {
  const router = useRouter();
  const [capture, setCapture] = useState(initialCapture);
  const [editing, setEditing] = useState<Tier1Field | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const refresh = async () => { const result = await appApi<{ capture: SupplierCaptureRecord }>(`/api/bot/captures/${capture.id}?tripId=${encodeURIComponent(tripId)}`); setCapture(result.capture); };
  async function correct<Field extends Tier1Field>(field: Field, value: Tier1Data[Field], unknown = false) {
    setBusy(true); setError(null); setSuccess(null);
    try { const result = await appApi<{ capture: SupplierCaptureRecord }>(`/api/bot/captures/${capture.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, field, value, acknowledgedUnknown: unknown }) }); setCapture(result.capture); setEditing(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar el dato"); }
    finally { setBusy(false); }
  }
  async function act(action: "review" | "confirm" | "archive") {
    if (action === "archive" && !window.confirm("¿Archivar este borrador? El historial y las evidencias originales se conservarán.")) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      await appApi(`/api/bot/captures/${capture.id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, expectedVersion: capture.updatedAt }) });
      if (action === "archive") { router.replace(`/app/viajes/${encodeURIComponent(tripId)}/${role === "ADMIN" ? "admin" : ""}?section=proveedores`); router.refresh(); return; }
      await refresh(); setSuccess(action === "review" ? "Borrador revisado. Podés gestionar sus productos; todavía falta contacto válido para confirmar el proveedor." : "Proveedor confirmado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar la revisión"); }
    finally { setBusy(false); }
  }
  const confirmationMissing = [!capture.fields.companyName?.trim() ? "nombre" : null, !canConfirmCapture(capture) ? "contacto válido" : null].filter(Boolean);
  return <main className="app-page max-w-3xl pb-10"><Link href={`/app/viajes/${encodeURIComponent(tripId)}/${role === "ADMIN" ? "admin" : ""}`} className="text-sm font-semibold text-ink-mute">← Volver al viaje</Link>
    <h1 className="mt-5 text-3xl">{capture.fields.companyName ?? "Proveedor pendiente"}</h1><p className="mt-2 text-sm text-ink-mute">{capture.status === "CONFIRMED" ? "Proveedor confirmado" : capture.reviewedAt ? "Borrador revisado · Sin confirmar" : "Borrador pendiente de revisión"}</p>
    {capture.status === "DRAFT" ? <div className="mt-4 rounded-xl bg-gold-soft p-4 text-sm"><p>Para confirmar: {confirmationMissing.length ? `completá ${confirmationMissing.join(" y ")}.` : "los datos mínimos están completos."}</p><p className="mt-1">Podés guardar avances y gestionar productos sin confirmar el proveedor.</p></div> : null}
    {capture.needsReanalysis ? <AppNotice tone="warning" className="mt-3">Nueva evidencia requiere análisis antes de confirmar.</AppNotice> : null}
    {error ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}{success ? <AppNotice tone="success" className="mt-3">{success}</AppNotice> : null}
    <CaptureFieldReview capture={capture} editing={editing} onEdit={setEditing} renderEditor={(field) => <Tier1Editor key={`${field}-${capture.updatedAt}`} capture={capture} field={field} busy={busy} onSave={correct} onCancel={() => setEditing(null)} />} />
    <div className="mt-5 flex flex-wrap gap-2">{capture.status === "DRAFT" ? <><button type="button" className="app-secondary-button" disabled={busy} onClick={() => void act("review")}>{capture.reviewedAt ? "Volver a marcar revisado" : "Marcar borrador revisado"}</button><button type="button" className="app-primary-button" disabled={busy || !canConfirmCapture(capture) || capture.needsReanalysis} onClick={() => void act("confirm")}>Confirmar proveedor</button><button type="button" className="app-secondary-button" disabled={busy} onClick={() => void act("archive")}>Archivar borrador</button></> : capture.supplierId ? <Link className="app-secondary-button" href={`/app/viajes/${encodeURIComponent(tripId)}/${role === "ADMIN" ? "admin/" : ""}proveedores/${encodeURIComponent(capture.supplierId)}`}>Abrir proveedor</Link> : null}</div>
    <CaptureDetails key={`${capture.id}-${capture.updatedAt}`} tripId={tripId} capture={capture} offline={false} onSaved={setCapture} />
    <SupplierProducts tripId={tripId} captureId={capture.id} refreshKey={capture.updatedAt} needsReanalysis={capture.needsReanalysis} />
    <LinkedWhatsAppEvidence tripId={tripId} captureId={capture.id} />
    <section className="mt-5"><h2 className="text-lg">Archivos privados</h2><AttachmentUploader tripId={tripId} captureId={capture.id} type="BUSINESS_CARD" /></section>
  </main>;
}
