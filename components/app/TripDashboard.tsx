"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, ChevronRight, ClipboardCheck, Phone, Plus, RefreshCw, Users } from "lucide-react";
import type { TravelerDashboardPendingRecord, TravelerDashboardRecord, TripRecord } from "@/lib/bot/types";
import { appApi } from "./api";

function tripDateLabel(trip: TripRecord) {
  if (!trip.startDate) return trip.status === "ACTIVE" ? "Viaje activo" : null;
  const formatter = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });
  const start = formatter.format(new Date(trip.startDate));
  const end = trip.endDate ? formatter.format(new Date(trip.endDate)) : null;
  return end ? `${start} – ${end}` : start;
}

export function pendingSummary(item: TravelerDashboardPendingRecord) {
  if (item.needsReanalysis) return "Nueva evidencia para analizar";
  if (item.reviewCount) return `Revisar ${item.reviewCount} ${item.reviewCount === 1 ? "dato" : "datos"}`;
  if (item.missingCount) return `Completar ${item.missingCount} ${item.missingCount === 1 ? "dato" : "datos"}`;
  return "Terminá de guardar este proveedor";
}

function DashboardLoading() {
  return <main className="app-page max-w-xl" aria-busy="true"><div className="h-5 w-24 animate-pulse rounded bg-paper-warm" /><div className="mt-5 h-10 w-3/4 animate-pulse rounded bg-paper-warm" /><div className="mt-6 h-14 animate-pulse rounded-2xl bg-nihao-soft" /><div className="mt-6 grid grid-cols-3 gap-3">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-paper-warm" />)}</div></main>;
}

export function TripDashboard({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<TravelerDashboardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappSaved, setWhatsappSaved] = useState(false);
  const captureHref = `/app/viajes/${tripId}/proveedores/nuevo`;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const access = await appApi<{ onboardingRequired: boolean }>(`/api/bot/trips/${encodeURIComponent(tripId)}/onboarding`);
      if (access.onboardingRequired) return router.replace(`/app/viajes/${tripId}/onboarding`);
      const [result, whatsapp] = await Promise.all([appApi<{ dashboard: TravelerDashboardRecord }>(`/api/bot/trips/${encodeURIComponent(tripId)}/dashboard`), appApi<{ whatsappPhone: string | null }>(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp`)]);
      setDashboard(result.dashboard);
      setWhatsappPhone(whatsapp.whatsappPhone ?? "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos actualizar tu resumen"); }
    finally { setLoading(false); }
  }, [router, tripId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  if (loading) return <DashboardLoading />;
  if (error || !dashboard) return <main className="app-page max-w-xl"><Link href="/app" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Mis viajes</Link><section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-soft"><p role="alert" className="text-sm text-nihao">{error ?? "Este viaje no está disponible."}</p><Link href={captureHref} className="app-primary-button mt-5 w-full justify-center"><Plus className="h-5 w-5" />Capturar proveedor</Link>{error ? <button type="button" onClick={() => void load()} className="app-secondary-button mt-3 w-full justify-center"><RefreshCw className="h-4 w-4" />Reintentar resumen</button> : null}</section></main>;

  const { trip, metrics, pending, recent } = dashboard;
  const empty = metrics.confirmedCount === 0 && metrics.pendingCount === 0;
  return <main className="app-page max-w-xl pb-10"><Link href="/app" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Mis viajes</Link>
    <header className="mt-4"><div className="flex items-start justify-between gap-3"><div><p className="text-eyebrow-mark">Mi viaje</p><h1 className="mt-2 text-3xl sm:text-4xl">{trip.name}</h1>{tripDateLabel(trip) ? <p className="mt-2 text-sm text-ink-mute">{tripDateLabel(trip)}</p> : null}</div>{trip.role === "ADMIN" ? <Link href={`/app/viajes/${tripId}/admin`} className="app-secondary-button shrink-0 px-3 text-xs"><Users className="h-4 w-4" />Administrar</Link> : null}</div><Link href={captureHref} className="app-primary-button mt-6 min-h-14 w-full justify-center text-base"><Plus className="h-5 w-5" />Capturar proveedor</Link></header>
    <WhatsAppCard phone={whatsappPhone} saved={whatsappSaved} onChange={setWhatsappPhone} onSave={async () => { setWhatsappSaved(false); await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ whatsappPhone: whatsappPhone || null }) }); setWhatsappSaved(true); }} />
    {empty ? <section className="mt-6 rounded-3xl border border-line bg-white p-6 text-center shadow-soft"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-nihao-soft text-nihao"><CheckCircle2 className="h-6 w-6" /></span><h2 className="mt-4 text-xl">Tu viaje ya está listo</h2><p className="mt-2 text-sm leading-6 text-ink-mute">Guardá tu primer proveedor en pocos segundos con una tarjeta, una foto, audio o texto.</p><Link href={captureHref} className="app-primary-button mt-5 w-full justify-center"><Plus className="h-5 w-5" />Capturar proveedor</Link></section> : <>
      <section className="mt-6 grid grid-cols-3 gap-3" aria-label="Resumen personal"><Metric value={metrics.confirmedCount} label="guardados" /><Metric value={metrics.pendingCount} label="pendientes" emphasis={metrics.pendingCount > 0} /><Metric value={metrics.todayCount} label="hoy" helper="UTC" /></section>
      <section className="mt-8" aria-labelledby="pending-heading"><div className="flex items-center justify-between gap-3"><div><p className="text-eyebrow-mark">Para seguir</p><h2 id="pending-heading" className="mt-2 text-xl">Pendientes</h2></div><ClipboardCheck className="h-5 w-5 text-nihao" /></div>{pending.length ? <div className="mt-3 grid gap-3">{pending.map((item) => <Link key={item.id} href={`${captureHref}?captureId=${encodeURIComponent(item.id)}`} className="group flex min-h-20 items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft transition hover:border-nihao/30"><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{item.companyName ?? "Proveedor pendiente"}</h3><p className="mt-1 truncate text-sm text-ink-mute">{pendingSummary(item)}</p></div><ChevronRight className="h-5 w-5 shrink-0 text-ink-faint transition group-hover:translate-x-1" /></Link>)}</div> : <p className="mt-3 rounded-2xl bg-nihao-soft p-4 text-sm text-ink-soft">Todo al día. Podés seguir capturando cuando encuentres otro proveedor.</p>}</section>
      <section className="mt-8" aria-labelledby="recent-heading"><div className="flex items-end justify-between gap-3"><div><p className="text-eyebrow-mark">Mi actividad</p><h2 id="recent-heading" className="mt-2 text-xl">Últimos proveedores</h2></div>{recent.length ? <span className="text-xs text-ink-mute">Tus últimos {recent.length}</span> : null}</div>{recent.length ? <div className="mt-3 grid gap-3">{recent.map((supplier) => <Link key={supplier.id} href={`/app/viajes/${tripId}/proveedores/${supplier.id}`} className="group flex min-h-18 items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft transition hover:border-nihao/30"><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{supplier.companyName ?? "Empresa sin nombre"}</h3><p className="mt-1 truncate text-sm text-ink-mute">{supplier.city ?? supplier.category ?? "Proveedor guardado"}</p></div><span className="rounded-full bg-nihao-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-nihao">Guardado</span><ChevronRight className="h-5 w-5 shrink-0 text-ink-faint transition group-hover:translate-x-1" /></Link>)}</div> : <p className="mt-3 text-sm text-ink-mute">Tus proveedores guardados aparecerán acá.</p>}<Link href={captureHref} className="app-secondary-button mt-4 w-full justify-center">Capturar otro proveedor <ArrowUpRight className="h-4 w-4" /></Link></section>
    </>}</main>;
}

function WhatsAppCard({ phone, saved, onChange, onSave }: { phone: string; saved: boolean; onChange: (value: string) => void; onSave: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  return <section className="mt-6 rounded-2xl border border-line bg-white p-4 shadow-soft"><div className="flex gap-3"><Phone className="mt-0.5 h-5 w-5 text-nihao" /><div><h2 className="font-semibold">WhatsApp</h2><p className="mt-1 text-sm text-ink-mute">Vinculalo para enviar capturas por texto. Incluí el código de país.</p></div></div><div className="mt-3 flex gap-2"><input value={phone} onChange={(event) => onChange(event.target.value)} inputMode="tel" placeholder="5493412345678" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line px-3 text-sm" /><button type="button" disabled={busy} onClick={() => { setBusy(true); setError(null); void onSave().catch((caught) => setError(caught instanceof Error ? caught.message : "No pudimos guardar el número")).finally(() => setBusy(false)); }} className="app-secondary-button px-3 text-sm">Guardar</button></div>{error ? <p role="alert" className="mt-2 text-xs text-nihao">{error}</p> : saved ? <p className="mt-2 text-xs text-ink-mute">WhatsApp vinculado.</p> : null}</section>;
}

function Metric({ value, label, helper, emphasis = false }: { value: number; label: string; helper?: string; emphasis?: boolean }) {
  return <div className={`rounded-2xl border p-3 ${emphasis ? "border-gold-soft bg-gold-soft" : "border-line bg-white"}`}><p className="text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-ink-mute">{label}{helper ? <span className="block text-[10px] text-ink-faint">{helper}</span> : null}</p></div>;
}
