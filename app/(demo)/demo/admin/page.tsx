"use client";

import { useState } from "react";
import {
  Users,
  Building2,
  Package,
  FileText,
  MapPin,
  Star,
  ChevronRight,
  Download,
  Eye,
  Route,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoTabs } from "@/components/demo/DemoTabs";
import { MetricCard } from "@/components/demo/MetricCard";
import { StatusBadge } from "@/components/demo/StatusBadge";
import { DetailDrawer } from "@/components/demo/DetailDrawer";
import { Toast } from "@/components/demo/Toast";
import { useToast } from "@/components/demo/useToast";
import {
  adminMetrics,
  adminTravelers,
  adminRoutes,
  adminReports,
  adminSuppliers,
  feedback,
  recentActivity,
  type AdminTraveler,
  type AdminRoute,
  type AdminSupplier,
} from "@/components/demo/demo-data";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "viajeros", label: "Viajeros" },
  { id: "recorridos", label: "Recorridos" },
  { id: "proveedores", label: "Proveedores" },
  { id: "reportes", label: "Reportes" },
  { id: "feedback", label: "Feedback" },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [drawer, setDrawer] = useState<{ open: boolean; title: string; subtitle?: string; content: React.ReactNode }>({
    open: false,
    title: "",
    content: null,
  });
  const { toasts, addToast, removeToast } = useToast();

  const openTraveler = (t: AdminTraveler) => {
    setDrawer({
      open: true,
      title: t.name,
      subtitle: `${t.company} · ${t.trip}`,
      content: (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">Empresa</p>
              <p className="mt-1 font-medium text-ink">{t.company}</p>
            </div>
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">Estado</p>
              <p className="mt-1 text-[13px] font-medium text-ink">{t.status}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">Resumen</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
              Viajero activo con proveedores registrados en múltiples ciudades. El informe está en progreso
              con alta actividad reciente.
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">Actividad reciente</p>
            <ul className="mt-2 space-y-2">
              <li className="flex items-start gap-2 text-[13px] text-ink-soft">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-nihao" strokeWidth={2} />
                Guardó 3 proveedores nuevos.
              </li>
              <li className="flex items-start gap-2 text-[13px] text-ink-soft">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-nihao" strokeWidth={2} />
                Generó un resumen diario.
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => addToast("Informe del viajero abierto", "info")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-nihao px-5 text-[13px] font-medium text-white transition-colors hover:bg-nihao-deep"
            >
              <Eye className="h-4 w-4" strokeWidth={2} />
              Ver informe del viajero
            </button>
            <button
              onClick={() => addToast("Exportación demo generada", "success")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line bg-paper px-5 text-[13px] font-medium text-ink transition-colors hover:bg-paper-warm"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              Exportar PDF
            </button>
          </div>
        </div>
      ),
    });
  };

  const openRoute = (r: AdminRoute) => {
    setDrawer({
      open: true,
      title: "Recorrido",
      subtitle: `${r.travelerName} · ${r.travelerCompany}`,
      content: (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            {r.cities.map((city, i) => (
              <div key={city} className="flex items-center gap-3">
                <span className="rounded-full bg-nihao/10 px-3 py-1.5 text-[13px] font-medium text-nihao">{city}</span>
                {i < r.cities.length - 1 && <ChevronRight className="h-4 w-4 text-ink-faint" strokeWidth={2} />}
              </div>
            ))}
          </div>
          <p className="text-[14px] leading-relaxed text-ink-soft">
            Recorrido planificado para la inmersión comercial. Las ciudades fueron seleccionadas según el
            rubro del viajero y la disponibilidad de proveedores.
          </p>
          <button
            onClick={() => addToast("Detalle del recorrido exportado", "success")}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-nihao px-5 text-[13px] font-medium text-white transition-colors hover:bg-nihao-deep"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            Exportar recorrido
          </button>
        </div>
      ),
    });
  };

  const openAdminSupplier = (s: AdminSupplier) => {
    setDrawer({
      open: true,
      title: s.name,
      subtitle: `${s.city} · ${s.category}`,
      content: (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">Viajeros que lo registraron</p>
              <p className="mt-1 font-medium text-ink">{s.travelers.join(", ")}</p>
            </div>
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">Interés promedio</p>
              <div className="mt-1">
                <StatusBadge type="interest" value={s.interest}>{s.interest}</StatusBadge>
              </div>
            </div>
          </div>
          <p className="text-[14px] leading-relaxed text-ink-soft">
            Proveedor capturado por el Asistente Nihao a través de mensajes, fotos o tarjetas durante el viaje.
          </p>
        </div>
      ),
    });
  };

  const handleReportAction = (action: string, title: string) => {
    addToast(`${action}: ${title}`, action === "Ver" ? "info" : "success");
  };

  return (
    <div className="container-page py-6 md:py-8">
      {/* Header */}
      <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft md:p-8">
        <span className="text-eyebrow-mark text-nihao">Panel interno</span>
        <h1 className="mt-4 font-display text-2xl font-medium tracking-tight text-ink md:text-4xl">
          Panel Nihao — Viajeros y reportes
        </h1>
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-mute md:text-[15px]">
          Vista interna para seguir la actividad de los viajeros y el valor generado por el Asistente Nihao.
        </p>

        {/* KPIs */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Viajeros activos" value={adminMetrics.activeTravelers} icon={<Users className="h-5 w-5" strokeWidth={1.75} />} />
          <MetricCard label="Proveedores" value={adminMetrics.registeredSuppliers} icon={<Building2 className="h-5 w-5" strokeWidth={1.75} />} />
          <MetricCard label="Productos" value={adminMetrics.reviewedProducts} icon={<Package className="h-5 w-5" strokeWidth={1.75} />} />
          <MetricCard label="Informes" value={adminMetrics.generatedReports} icon={<FileText className="h-5 w-5" strokeWidth={1.75} />} />
          <MetricCard label="Ciudades" value={adminMetrics.visitedCities} icon={<MapPin className="h-5 w-5" strokeWidth={1.75} />} />
          <MetricCard label="Satisfacción" value={`${adminMetrics.satisfaction}/5`} icon={<Star className="h-5 w-5" strokeWidth={1.75} />} />
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 overflow-x-auto pb-2 md:mt-8">
        <DemoTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Content */}
      <div className="mt-6 min-h-[320px] md:mt-8">
        {activeTab === "overview" && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft lg:col-span-2">
              <h3 className="font-display text-lg font-medium text-ink">Actividad reciente</h3>
              <div className="mt-4 space-y-3">
                {recentActivity.map((activity, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl border border-line bg-paper-soft p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nihao/10 text-nihao">
                      <TrendingUp className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <p className="text-[14px] text-ink-soft">{activity}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-5">
              <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft">
                <h3 className="font-display text-lg font-medium text-ink">Categorías más buscadas</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["Hogar", "Iluminación", "Muebles", "Packaging", "Electrónica"].map((cat) => (
                    <span key={cat} className="rounded-full bg-paper-soft px-3 py-1.5 text-[13px] text-ink-soft">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft">
                <h3 className="font-display text-lg font-medium text-ink">Ciudades con más registros</h3>
                <div className="mt-4 space-y-2">
                {[
                  { city: "Guangzhou", count: 58 },
                  { city: "Shenzhen", count: 42 },
                  { city: "Foshan", count: 31 },
                  { city: "Shanghai", count: 27 },
                ].map(({ city, count }) => (
                  <div key={city} className="flex items-center justify-between text-[13px]">
                    <span className="text-ink-soft">{city}</span>
                    <span className="font-medium text-ink">{count} registros</span>
                  </div>
                ))}
              </div>
              </div>
              <div className="rounded-2xl border border-nihao/15 bg-nihao-soft p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-nihao" strokeWidth={2} />
                  <div>
                    <h4 className="font-display text-[15px] font-medium text-nihao-ink">Recomendación</h4>
                    <p className="mt-1 text-[13px] leading-relaxed text-nihao-ink/80">
                      Hay 3 viajeros con informes próximos a vencer. Revisar antes del fin de semana.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "viajeros" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminTravelers.map((t) => (
              <button
                key={t.id}
                onClick={() => openTraveler(t)}
                className="rounded-2xl border border-line bg-paper p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-display text-[16px] font-medium text-ink">{t.name}</h4>
                    <p className="mt-1 text-[13px] text-ink-mute">{t.company}</p>
                  </div>
                  <span className="rounded-full bg-paper-soft px-2.5 py-1 text-[11px] font-medium text-ink-soft">
                    {t.status}
                  </span>
                </div>
                <p className="mt-4 text-[13px] text-ink-faint">{t.trip}</p>
              </button>
            ))}
          </div>
        )}

        {activeTab === "recorridos" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminRoutes.map((r) => (
              <button
                key={r.id}
                onClick={() => openRoute(r)}
                className="rounded-2xl border border-line bg-paper p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-nihao/10 text-nihao">
                    <Route className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h4 className="font-display text-[16px] font-medium text-ink">{r.travelerName}</h4>
                    <p className="text-[12px] text-ink-mute">{r.travelerCompany}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {r.cities.map((city, i) => (
                    <span key={city} className="inline-flex items-center gap-2 text-[13px] text-ink-soft">
                      {city}
                      {i < r.cities.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-ink-faint" strokeWidth={2} />}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === "proveedores" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminSuppliers.map((s) => (
              <button
                key={s.id}
                onClick={() => openAdminSupplier(s)}
                className="rounded-2xl border border-line bg-paper p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-display text-[16px] font-medium text-ink">{s.name}</h4>
                    <p className="mt-1 text-[13px] text-ink-mute">{s.city} · {s.category}</p>
                  </div>
                  <StatusBadge type="interest" value={s.interest}>{s.interest}</StatusBadge>
                </div>
                <div className="mt-4 rounded-lg bg-paper-soft p-3">
                  <p className="text-[11px] uppercase tracking-wider text-ink-faint">Registrado por</p>
                  <p className="mt-1 text-[13px] font-medium text-ink">{s.travelers.join(", ")}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === "reportes" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminReports.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-line bg-paper p-5 shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-display text-[16px] font-medium text-ink">{r.title}</h4>
                    <p className="mt-1 text-[13px] text-ink-mute">{r.traveler}</p>
                  </div>
                  <StatusBadge type="status" value={r.status}>
                    {r.status === "completado" ? "Listo" : "En progreso"}
                  </StatusBadge>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleReportAction("Ver", r.title)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-nihao px-4 text-[12px] font-medium text-white transition-colors hover:bg-nihao-deep"
                  >
                    <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                    Ver informe
                  </button>
                  <button
                    onClick={() => handleReportAction("Exportar PDF", r.title)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-paper px-4 text-[12px] font-medium text-ink transition-colors hover:bg-paper-warm"
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={2} />
                    PDF
                  </button>
                  <button
                    onClick={() => handleReportAction("Exportar Excel", r.title)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-paper px-4 text-[12px] font-medium text-ink transition-colors hover:bg-paper-warm"
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={2} />
                    Excel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "feedback" && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft lg:col-span-1">
              <h3 className="font-display text-lg font-medium text-ink">Satisfacción promedio</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-5xl font-medium text-ink">{adminMetrics.satisfaction}</span>
                <span className="text-[14px] text-ink-mute">/ 5</span>
              </div>
              <div className="mt-3 flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-5 w-5",
                      i < Math.round(adminMetrics.satisfaction) ? "fill-gold text-gold" : "text-line-strong",
                    )}
                    strokeWidth={1.5}
                  />
                ))}
              </div>
              <p className="mt-4 text-[13px] text-ink-mute">
                Basado en feedback reciente de viajeros activos.
              </p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              {feedback.map((f) => (
                <div key={f.id} className="rounded-2xl border border-line bg-paper p-6 shadow-soft">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: f.rating }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-gold text-gold" strokeWidth={1.5} />
                    ))}
                  </div>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">“{f.quote}”</p>
                  <p className="mt-3 text-[13px] font-medium text-ink">
                    {f.name} · <span className="text-ink-mute">{f.company}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DetailDrawer
        open={drawer.open}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        title={drawer.title}
        subtitle={drawer.subtitle}
      >
        {drawer.content}
      </DetailDrawer>

      <Toast toasts={toasts} onClose={removeToast} />
    </div>
  );
}
