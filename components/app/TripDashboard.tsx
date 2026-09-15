"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, LoaderCircle, Plus, Search } from "lucide-react";
import type { SupplierCaptureRecord, SupplierRecord, TripRecord } from "@/lib/bot/types";
import { appApi } from "./api";
import { AttachmentThumbnail } from "./AttachmentThumbnail";
import { fieldValue, supplierTypeLabel } from "./tier1-display";

export function TripDashboard({ tripId }: { tripId: string }) {
  const [trip, setTrip] = useState<TripRecord | null>(null);
  const [captures, setCaptures] = useState<SupplierCaptureRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const [tripResult, supplierResult] = await Promise.all([
        appApi<{ trips: TripRecord[] }>("/api/bot/trips"),
        appApi<{ captures: SupplierCaptureRecord[]; suppliers: SupplierRecord[] }>(`/api/bot/captures?tripId=${encodeURIComponent(tripId)}`),
      ]);
      setTrip(tripResult.trips.find((item) => item.id === tripId) ?? null);
      setCaptures(supplierResult.captures);
      setSuppliers(supplierResult.suppliers);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos cargar el viaje");
    } finally { setLoading(false); }
  }, [tripId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const captureBySupplier = useMemo(() => new Map(captures.filter((capture) => capture.supplierId).map((capture) => [capture.supplierId, capture])), [captures]);
  const filtered = suppliers.filter((supplier) => `${supplier.companyName} ${supplier.category}`.toLowerCase().includes(query.toLowerCase()));

  if (loading) return <main className="app-page grid min-h-72 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-nihao" /></main>;
  if (error || !trip) return <main className="app-page"><Link href="/app" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" />Mis viajes</Link><p role="alert" className="mt-6 rounded-xl bg-nihao-soft p-4 text-sm text-nihao">{error ?? "Este viaje no está disponible."}</p></main>;

  return (
    <main className="app-page">
      <Link href="/app" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Mis viajes</Link>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div><p className="text-eyebrow-mark">Viaje activo</p><h1 className="mt-3 text-3xl sm:text-4xl">{trip.name}</h1><p className="mt-2 text-sm text-ink-mute">{suppliers.length} proveedor{suppliers.length === 1 ? "" : "es"} confirmado{suppliers.length === 1 ? "" : "s"}</p></div>
        <Link href={`/app/viajes/${tripId}/proveedores/nuevo`} className="app-primary-button shrink-0"><Plus className="h-5 w-5" /><span className="hidden sm:inline">Nuevo proveedor</span><span className="sm:hidden">Nuevo</span></Link>
      </div>
      <label className="relative mt-6 block"><span className="sr-only">Buscar proveedor</span><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><input className="app-input pl-11" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empresa o categoría" /></label>
      <div className="mt-5 grid gap-3">
        {filtered.map((supplier) => {
          const capture = captureBySupplier.get(supplier.id);
          return (
            <Link key={supplier.id} href={`/app/viajes/${tripId}/proveedores/${supplier.id}`} className="group flex gap-4 rounded-2xl border border-line bg-white p-4 shadow-soft transition hover:border-nihao/30">
              {capture ? <AttachmentThumbnail tripId={tripId} captureId={capture.id} /> : null}
              <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-lg">{supplier.companyName ?? "Empresa pendiente"}</h2><span className="shrink-0 rounded-full bg-nihao-soft px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-nihao">Confirmado</span></div><p className="truncate text-xs text-ink-mute">{supplier.category ?? "Categoría pendiente"} · {supplierTypeLabel(supplier.supplierType)}</p></div><ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-faint transition group-hover:translate-x-1" /></div><div className="mt-3 grid grid-cols-3 gap-2 text-[11px]"><span className="truncate"><strong className="block text-ink-faint">FOB</strong>{fieldValue(supplier, "fob")}</span><span className="truncate"><strong className="block text-ink-faint">MOQ</strong>{fieldValue(supplier, "moq")}</span><span className="truncate"><strong className="block text-ink-faint">Interés</strong>{fieldValue(supplier, "interestScore")}</span></div></div>
            </Link>
          );
        })}
        {!filtered.length ? <div className="rounded-2xl border border-dashed border-line-strong bg-white px-6 py-12 text-center"><p className="text-sm text-ink-mute">{query ? "No hay proveedores que coincidan." : "Todavía no confirmaste proveedores en este viaje."}</p>{!query ? <Link href={`/app/viajes/${tripId}/proveedores/nuevo`} className="app-primary-button mt-5"><Plus className="h-5 w-5" />Capturar el primero</Link> : null}</div> : null}
      </div>
    </main>
  );
}
