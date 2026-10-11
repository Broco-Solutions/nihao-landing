"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Building2, CalendarDays, LoaderCircle, Plus, Settings2, Star } from "lucide-react";
import type { TripInsights } from "@/lib/bot/trip-insights";
import { appApi } from "./api";
import { TripAdministration } from "./TripAdministration";
import { AgendaEditor } from "./AgendaEditor";
import { pendingCaptureHref } from "./trip-insights-links";
import { apiUrl } from "@/lib/api/origin";
import { AppSelect } from "./AppSelect";
import { TripReportOverview } from "./TripReportOverview";
import { SupplierReport } from "./SupplierReport";
import { ProductReport } from "./ProductReport";
import { useRouter } from "next/navigation";

export type TripInsightsTab = "resumen" | "viajeros" | "actividad" | "proveedores" | "productos" | "agenda" | "reportes" | "feedback" | "administracion";
function dateLabel(value: string | null) { return value ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "Fecha a definir"; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-line bg-paper-soft p-4"><p className="text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-ink-mute">{label}</p></div>; }

export function TripInsightsView({ tripId, routeKey = tripId, role, initialTab = "resumen" }: { tripId: string; routeKey?: string; role: "ADMIN" | "TRAVELER"; initialTab?: TripInsightsTab }) {
  const router = useRouter();
  const [data, setData] = useState<TripInsights | null>(null);
  const [tab, setTab] = useState<TripInsightsTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rating, setRating] = useState(10);
  const [comment, setComment] = useState("");
  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await appApi<{ insights: TripInsights }>(`/api/bot/trips/${encodeURIComponent(tripId)}/insights`);
      setData(result.insights);
      if (role === "TRAVELER" && result.insights.feedback.length) { setRating(result.insights.feedback[0].rating); setComment(result.insights.feedback[0].comment); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos cargar el resumen"); }
    finally { setLoading(false); }
  }, [tripId, role]);
  useEffect(() => {
    queueMicrotask(() => void load());
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("pageshow", refresh); window.removeEventListener("focus", refresh); };
  }, [load]);

  async function saveFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/feedback`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating, comment }) }); await load(); setMessage("Evaluación guardada."); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos guardar la evaluación"); }
    finally { setBusy(false); }
  }
  const exportUrl = (kind: string, format: string) => apiUrl(`/api/bot/trips/${encodeURIComponent(tripId)}/export?kind=${kind}&format=${format}`);
  const selectTab = (next: TripInsightsTab) => { setTab(next); setMessage(null); if (next !== "administracion") router.replace(`/app/viajes/${encodeURIComponent(routeKey)}${next === "resumen" ? "" : `?section=${next}`}`, { scroll: false }); };
  const tabs: Array<{ id: TripInsightsTab; label: string }> = role === "ADMIN"
    ? [{ id: "resumen", label: "Resumen" }, { id: "viajeros", label: "Viajeros" }, { id: "proveedores", label: "Proveedores" }, { id: "productos", label: "Productos" }, { id: "reportes", label: "Reportes" }, { id: "feedback", label: "Feedback" }]
    : [{ id: "resumen", label: "Resumen" }, { id: "actividad", label: "Actividad" }, { id: "proveedores", label: "Proveedores" }, { id: "productos", label: "Productos" }, { id: "agenda", label: "Agenda" }, { id: "reportes", label: "Reportes" }, { id: "feedback", label: "Evaluación" }];
  if (loading) return <main className="app-page" aria-busy="true"><LoaderCircle className="mx-auto mt-12 h-8 w-8 animate-spin text-nihao" /></main>;
  if (error || !data) return <main className="app-page"><p role="alert" className="rounded-xl bg-nihao-soft p-4 text-nihao">{error ?? "Viaje no disponible"}</p><button type="button" className="app-secondary-button mt-4" onClick={() => void load()}>Reintentar</button></main>;
  return <main className="app-page max-w-6xl pb-12">
    <Link href="/app" className="text-sm font-semibold text-ink-mute">← Mis viajes</Link>
    <header className="mt-4 rounded-2xl border border-line bg-paper p-5 shadow-soft sm:p-8">
      <p className="text-eyebrow-mark text-nihao">{role === "ADMIN" ? "Administración del viaje" : "Mi viaje"}</p>
      <h1 className="mt-3 text-3xl sm:text-4xl">{data.trip.name}</h1>
      <div className="mt-4 flex flex-wrap gap-2 text-sm text-ink-mute"><span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" />{dateLabel(data.trip.startDate)} – {dateLabel(data.trip.endDate)}</span><span className="inline-flex items-center gap-1"><Building2 className="h-4 w-4" />{data.companies.map((company) => company.name).join(", ") || "Sin empresas asignadas"}</span></div>
      {role === "TRAVELER" ? <Link href={`/app/viajes/${tripId}/proveedores/nuevo`} className="app-primary-button mt-5 w-full justify-center sm:w-auto"><Plus className="h-4 w-4" />Capturar proveedor</Link> : <button type="button" onClick={() => setTab("administracion")} className="app-primary-button mt-5 w-full justify-center sm:w-auto"><Settings2 className="h-4 w-4" />Gestionar viaje</button>}
      <div className={`mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 ${role === "ADMIN" ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        {role === "ADMIN" ? <Metric label="Viajeros" value={data.metrics.travelerCount} /> : null}
        <Metric label="Proveedores" value={data.metrics.supplierCount} /><Metric label="Productos" value={data.metrics.productCount} />
        <Metric label="Ciudades" value={data.metrics.cityCount} /><Metric label="Pendientes" value={data.metrics.pendingCount} />
        <Metric label={role === "ADMIN" ? "Satisfacción / 10" : "Empresas"} value={role === "ADMIN" ? (data.metrics.satisfaction ?? "—") : data.companies.length} />
      </div>
    </header>
    <nav aria-label="Secciones del viaje" className="mt-6 flex flex-wrap gap-2 pb-2">{tabs.map((item) => <button key={item.id} type="button" onClick={() => selectTab(item.id)} aria-current={tab === item.id ? "page" : undefined} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${tab === item.id ? "bg-nihao text-white" : item.id === "administracion" ? "border border-nihao/30 bg-nihao-soft text-nihao" : "border border-line bg-paper-soft text-ink-mute"}`}>{item.label}</button>)}</nav>
    {message ? <p role="status" className="mt-4 rounded-xl bg-nihao-soft p-3 text-sm text-nihao">{message}</p> : null}
    {tab === "resumen" ? <div className="mt-5 grid gap-5 lg:grid-cols-3">
      <section className="min-w-0 rounded-2xl border border-line bg-paper p-6 shadow-soft lg:col-span-2"><h2 className="text-xl">Resumen del viaje</h2><p className="mt-2 text-sm text-ink-mute">{data.metrics.supplierCount} proveedores registrados en {data.companies.length} empresas del viaje.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-paper-soft p-4"><h3 className="text-sm font-semibold">Categorías principales</h3><p className="mt-2 text-sm text-ink-mute">{data.categories.slice(0, 4).map((item) => `${item.name} (${item.count})`).join(" · ") || "Aún no hay categorías registradas."}</p></div><div className="rounded-xl bg-paper-soft p-4"><h3 className="text-sm font-semibold">Proveedores destacados</h3><p className="mt-2 text-sm text-ink-mute">{[...data.suppliers].sort((a, b) => (b.interestScore ?? 0) - (a.interestScore ?? 0)).slice(0, 3).map((item) => item.companyName).filter(Boolean).join(" · ") || "Aún no hay proveedores registrados."}</p></div></div></section>
      <div className="grid min-w-0 grid-cols-1 gap-5"><section className="min-w-0 rounded-2xl border border-line bg-paper p-6 shadow-soft"><h2 className="text-lg">Para seguir</h2><p className="mt-3 text-sm text-ink-mute">{data.metrics.pendingCount ? `${data.metrics.pendingCount} capturas pendientes de revisión.` : "No hay capturas pendientes."}</p>{role === "ADMIN" ? <button type="button" onClick={() => setTab("administracion")} className="mt-4 text-sm font-semibold text-nihao">Administrar viaje →</button> : <><Link href={`/app/viajes/${tripId}/proveedores/nuevo`} className="mt-4 inline-block text-sm font-semibold text-nihao">Capturar proveedor →</Link>{data.captures.filter((capture) => capture.pendingReview).length ? <ul className="mt-4 grid min-w-0 grid-cols-1 gap-2" aria-label="Proveedores pendientes">{data.captures.filter((capture) => capture.pendingReview).map((capture) => <li key={capture.id} className="min-w-0"><Link href={pendingCaptureHref(tripId, capture.id)} className="block min-w-0 rounded-xl bg-paper-soft p-3 hover:bg-nihao-soft"><span className="block truncate text-sm font-semibold">{capture.companyNameLatin ?? capture.companyName ?? "Proveedor pendiente"}</span><span className="mt-1 block wrap-anywhere text-xs text-ink-mute">{capture.company}{capture.needsReanalysis ? " · Nueva evidencia para analizar" : " · Continuar carga"}</span></Link></li>)}</ul> : null}</>}</section><section className="min-w-0 rounded-2xl bg-nihao-soft p-6"><h2 className="text-lg">Actividad reciente</h2><p className="mt-2 wrap-anywhere text-sm">{data.captures[0] ? `${data.captures[0].createdBy.name} · ${data.captures[0].companyName ?? "Proveedor pendiente"}` : "Todavía no hay actividad."}</p></section></div>
      {role === "ADMIN" ? <section className="rounded-2xl border border-line bg-paper p-6 shadow-soft lg:col-span-3"><h2 className="text-lg">Ciudades con más registros</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{data.cities.slice(0, 6).map((item) => <p key={item.name} className="flex justify-between rounded-lg bg-paper-soft p-3 text-sm"><span>{item.name}</span><strong>{item.count}</strong></p>)}{!data.cities.length ? <p className="text-sm text-ink-mute">Sin ciudades registradas.</p> : null}</div></section> : null}
    </div> : null}
    {tab === "viajeros" && role === "ADMIN" ? <section className="mt-5 grid gap-3 sm:grid-cols-2"><h2 className="sr-only">Viajeros del viaje</h2>{data.members.map((member) => <article key={member.id} className="rounded-2xl border border-line bg-paper p-5 shadow-soft"><h3 className="font-semibold">{member.name}</h3><p className="text-sm text-ink-mute">{member.email}</p><p className="mt-2 text-sm">{member.companies.join(", ") || "Sin empresa"}</p><p className="mt-2 text-xs text-ink-mute">{data.suppliers.filter((supplier) => supplier.createdBy.id === member.id).length} proveedores registrados</p><Link href={`/app/viajeros/${encodeURIComponent(member.id)}/viajes/${encodeURIComponent(tripId)}/agenda`} className="app-secondary-button mt-4 w-full justify-center">Administrar agenda</Link></article>)}{!data.members.length ? <p className="text-sm text-ink-mute">Todavía no hay viajeros inscritos.</p> : null}</section> : null}
    {tab === "actividad" ? <section className="mt-5 grid gap-3"><h2 className="text-xl">Actividad registrada</h2>{data.captures.map((capture) => <article key={capture.id} className="rounded-2xl border border-line bg-paper p-4 shadow-soft"><p className="font-semibold">{capture.companyNameLatin ?? capture.companyName ?? "Proveedor sin nombre"}</p><p className="mt-1 text-sm text-ink-mute">{capture.company} · {capture.sourceType} · {dateLabel(capture.updatedAt)}</p><p className="mt-1 text-xs">{capture.pendingReview ? "Pendiente" : "Guardado"}</p></article>)}{!data.captures.length ? <p className="text-sm text-ink-mute">Todavía no hay actividad registrada.</p> : null}</section> : null}
    {tab === "proveedores" ? <SupplierReport tripId={tripId} data={data} /> : null}
    {tab === "productos" ? <ProductReport tripId={tripId} data={data} /> : null}
    {tab === "agenda" && role === "TRAVELER" ? <AgendaEditor tripId={tripId} /> : null}
    {tab === "reportes" ? <TripReportOverview data={data} exportUrl={exportUrl} /> : null}
    {tab === "feedback" ? <section className="mt-5"><h2 className="text-xl">{role === "ADMIN" ? "Feedback del viaje" : "Evaluar este viaje"}</h2>{role === "TRAVELER" ? <form onSubmit={(event) => void saveFeedback(event)} className="mt-4 grid gap-3 rounded-2xl border border-line bg-paper p-5 shadow-soft"><AppSelect label="Puntuación (0 a 10)" value={String(rating)} onValueChange={(next) => setRating(Number(next))} options={Array.from({ length: 11 }, (_, value) => ({ value: String(value), label: `${value} / 10` }))} /><label className="text-sm">Comentario<textarea required maxLength={2000} className="app-input mt-1 min-h-24" value={comment} onChange={(event) => setComment(event.target.value)} /></label><button disabled={busy} type="submit" className="app-primary-button justify-center">Guardar evaluación</button></form> : <div className="mt-4 flex items-center gap-2 text-2xl font-semibold"><Star className="h-6 w-6 text-gold" />{data.metrics.satisfaction ?? "—"} / 10 <span className="text-sm font-normal text-ink-mute">({data.feedback.length} respuestas)</span></div>}<div className="mt-4 grid gap-3">{data.feedback.map((item) => <article key={item.id} className="rounded-2xl border border-line bg-paper p-5 shadow-soft"><p className="text-sm font-semibold">{item.name} · {item.rating}/10</p><p className="mt-2 text-sm">{item.comment}</p></article>)}</div></section> : null}
    {tab === "administracion" && role === "ADMIN" ? <div className="mt-5"><TripAdministration tripId={tripId} onViewSuppliers={() => setTab("proveedores")} /></div> : null}
  </main>;
}
