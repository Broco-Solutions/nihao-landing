"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, LoaderCircle, MapPin, UserRound } from "lucide-react";
import type { SupplierCaptureRecord, SupplierDetailRecord, Tier1Field } from "@/lib/bot/types";
import { appApi } from "./api";
import { AttachmentUploader } from "./AttachmentUploader";
import { FIELD_LABELS, fieldValue, supplierTypeLabel } from "./tier1-display";

export function SupplierDetail({ tripId, supplierId }: { tripId: string; supplierId: string }) {
  const [supplier, setSupplier] = useState<SupplierDetailRecord | null>(null);
  const [capture, setCapture] = useState<SupplierCaptureRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const supplierResult = await appApi<{ supplier: SupplierDetailRecord }>(`/api/bot/suppliers/${supplierId}?tripId=${encodeURIComponent(tripId)}`);
      const captureResult = await appApi<{ capture: SupplierCaptureRecord }>(`/api/bot/captures/${supplierResult.supplier.captureId}?tripId=${encodeURIComponent(tripId)}`);
      setSupplier(supplierResult.supplier); setCapture(captureResult.capture);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos abrir el proveedor"); }
    finally { setLoading(false); }
  }, [supplierId, tripId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  if (loading) return <main className="app-page grid min-h-72 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-nihao" /></main>;
  if (error || !supplier || !capture) return <main className="app-page"><Link href={`/app/viajes/${tripId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" />Proveedores</Link><p role="alert" className="mt-5 rounded-xl bg-nihao-soft p-4 text-sm text-nihao">{error ?? "Proveedor no encontrado"}</p></main>;

  return (
    <main className="app-page max-w-3xl">
      <Link href={`/app/viajes/${tripId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Proveedores del viaje</Link>
      <div className="mt-3 rounded-3xl bg-night p-5 text-white shadow-card sm:p-7"><div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs"><CheckCircle2 className="h-4 w-4 text-gold" />Proveedor confirmado</span><span className="text-xs text-white/55">Tier 1</span></div><h1 className="mt-6 text-3xl text-white sm:text-4xl">{supplier.companyName ?? "Empresa pendiente"}</h1><p className="mt-2 flex items-center gap-2 text-sm text-white/65"><MapPin className="h-4 w-4" />{[supplier.city, supplier.province].filter(Boolean).join(", ") || "Ubicación pendiente"}</p><div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-3 py-1 text-xs">{supplier.category ?? "Categoría pendiente"}</span><span className="rounded-full bg-white/10 px-3 py-1 text-xs">{supplierTypeLabel(supplier.supplierType)}</span><span className="rounded-full bg-gold/20 px-3 py-1 text-xs text-gold">Interés {supplier.interestScore ?? "—"}/5</span></div></div>

      <section className="mt-6"><p className="text-eyebrow-mark">Información comercial</p><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">{(["fob", "moq", "leadTime"] as Tier1Field[]).map((field) => <div key={field} className="rounded-2xl border border-line bg-white p-4 shadow-soft"><p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{FIELD_LABELS[field]}</p><p className="mt-2 text-sm font-medium">{fieldValue(supplier, field)}</p></div>)}</div></section>
      <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-soft"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-nihao-soft text-nihao"><UserRound className="h-5 w-5" /></span><div><h2 className="text-lg">Contacto</h2>{supplier.contacts.length ? supplier.contacts.map((contact) => <p key={contact.id} className="mt-1 text-sm text-ink-mute">{contact.rawText}</p>) : <p className="mt-1 text-sm text-ink-mute">Información pendiente.</p>}</div></div></section>

      <section className="mt-7"><p className="text-eyebrow-mark">Archivos privados</p><h2 className="mt-3 text-2xl">Tarjeta y productos</h2><div className="mt-4 grid gap-6 sm:grid-cols-2"><AttachmentUploader compact tripId={tripId} captureId={capture.id} type="BUSINESS_CARD" /><AttachmentUploader compact tripId={tripId} captureId={capture.id} type="PRODUCT_IMAGE" /></div></section>

      <section className="mt-7 rounded-2xl border border-line bg-white p-5"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-nihao" /><h2 className="text-lg">Información pendiente</h2></div>{supplier.pendingFields.length ? <div className="mt-3 flex flex-wrap gap-2">{supplier.pendingFields.map((field) => <span key={field} className="rounded-full bg-paper-warm px-3 py-1 text-xs text-ink-mute">{FIELD_LABELS[field]}</span>)}</div> : <p className="mt-2 text-sm text-ink-mute">El registro Tier 1 está completo.</p>}<p className="mt-4 border-t border-line pt-4 text-xs text-ink-faint">Los datos confirmados quedan protegidos contra cambios accidentales. Las correcciones se realizan durante la revisión previa a confirmar.</p></section>
    </main>
  );
}
