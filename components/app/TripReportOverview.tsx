"use client";

import { Download } from "lucide-react";
import type { TripInsights } from "@/lib/bot/trip-insights";

type Props = {
  data: TripInsights;
  exportUrl(kind: string, format: string): string;
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-paper-soft p-4"><p className="text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-ink-mute">{label}</p></div>;
}

function Section({ title, count, children, open = false }: { title: string; count: number; children: React.ReactNode; open?: boolean }) {
  return <details open={open} className="group rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3"><span className="font-semibold">{title}</span><span className="rounded-full bg-paper-soft px-2.5 py-1 text-xs text-ink-mute">{count}</span></summary><div className="mt-4 border-t border-line pt-4">{children}</div></details>;
}

export function TripReportOverview({ data, exportUrl }: Props) {
  const confirmedProducts = data.products.filter((product) => product.status === "CONFIRMED" && !product.pendingReview);
  return <section className="mt-5" aria-labelledby="report-heading">
    <div className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-eyebrow-mark">Informe actual</p><h2 id="report-heading" className="mt-2 text-2xl">{data.trip.name}</h2><p className="mt-2 text-sm text-ink-mute">Consultá el informe dentro del viaje y descargá la versión completa cuando la necesites.</p></div><div className="flex flex-wrap gap-2"><a className="app-primary-button" href={exportUrl("report", "pdf")}><Download className="h-4 w-4" />Descargar PDF</a><a className="app-secondary-button" href={exportUrl("report", "xlsx")}><Download className="h-4 w-4" />Descargar Excel</a></div></div>
      <div className={`mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 ${data.role === "ADMIN" ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}><Metric label="Empresas" value={data.companies.length} />{data.role === "ADMIN" ? <Metric label="Viajeros" value={data.metrics.travelerCount} /> : null}<Metric label="Proveedores" value={data.metrics.supplierCount} /><Metric label="Productos" value={data.metrics.productCount} /><Metric label="Contactos" value={data.metrics.contactCount} /><Metric label="Ciudades" value={data.metrics.cityCount} /><Metric label="Pendientes" value={data.metrics.pendingCount} /></div>
    </div>
    <div className="mt-5 grid gap-3">
      {data.role === "ADMIN" ? <Section title="Empresas y viajeros" count={data.members.length} open={data.members.length <= 8}><div className="grid gap-2 sm:grid-cols-2">{data.members.map((member) => <article key={member.id} className="rounded-xl bg-paper-soft p-3"><p className="font-medium">{member.name}</p><p className="break-all text-xs text-ink-mute">{member.email}</p><p className="mt-1 text-sm">{member.companies.join(", ") || "Sin empresa asignada"}</p></article>)}{!data.members.length ? <p className="text-sm text-ink-mute">Todavía no hay viajeros asignados.</p> : null}</div></Section> : null}
      <Section title="Proveedores confirmados" count={data.suppliers.length}><div className="grid gap-2 sm:grid-cols-2">{data.suppliers.map((supplier) => <article key={supplier.id} className="rounded-xl bg-paper-soft p-3"><p className="font-medium">{supplier.companyNameLatin ?? supplier.companyName ?? "Proveedor sin nombre"}</p><p className="text-xs text-ink-mute">{supplier.company} · {supplier.city ?? "Sin ubicación"}</p></article>)}{!data.suppliers.length ? <p className="text-sm text-ink-mute">Todavía no hay proveedores confirmados.</p> : null}</div></Section>
      <Section title="Productos confirmados" count={confirmedProducts.length}><div className="grid gap-2 sm:grid-cols-2">{confirmedProducts.map((product) => <article key={product.id} className="rounded-xl bg-paper-soft p-3"><p className="font-medium">{product.name}</p><p className="text-xs text-ink-mute">{product.supplierName} · {product.company}</p><p className="mt-1 text-sm">FOB {product.fobAmount ?? "—"} {product.fobCurrency ?? ""} · MOQ {product.moqQuantity ?? "—"}</p></article>)}{!confirmedProducts.length ? <p className="text-sm text-ink-mute">Todavía no hay productos confirmados.</p> : null}</div></Section>
      <Section title="Información pendiente de revisión" count={data.pendingProducts.length + data.captures.filter((capture) => capture.pendingReview).length}><div className="grid gap-2 sm:grid-cols-2">{data.captures.filter((capture) => capture.pendingReview).map((capture) => <article key={capture.id} className="rounded-xl bg-gold-soft p-3"><p className="font-medium">{capture.companyNameLatin ?? capture.companyName ?? "Proveedor pendiente"}</p><p className="text-xs text-ink-mute">{capture.company} · Captura pendiente</p></article>)}{data.pendingProducts.map((product) => <article key={product.id} className="rounded-xl bg-gold-soft p-3"><p className="font-medium">{product.name}</p><p className="text-xs text-ink-mute">{product.supplierName} · Producto pendiente</p></article>)}</div></Section>
      <Section title="Agenda" count={data.agenda.length}><div className="grid gap-2">{data.agenda.map((entry) => <article key={entry.id} className="grid gap-1 rounded-xl bg-paper-soft p-3 sm:grid-cols-[10rem_1fr]"><p className="text-sm font-medium">{entry.date} · {entry.time}</p><div><p className="font-medium">{entry.place}</p><p className="text-xs text-ink-mute">{entry.traveler}{entry.address ? ` · ${entry.address}` : ""}</p></div></article>)}{!data.agenda.length ? <p className="text-sm text-ink-mute">No hay actividades en la agenda.</p> : null}</div></Section>
    </div>
  </section>;
}
