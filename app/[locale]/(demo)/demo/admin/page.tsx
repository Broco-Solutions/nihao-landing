"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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

export default function AdminPage() {
  const t = useTranslations("auto");
  const tDemo = useTranslations();

  const tabs = [
    { id: "overview", label: t("app_demo_demo_admin_page_280") },
    { id: "viajeros", label: t("app_demo_demo_admin_page_281") },
    { id: "recorridos", label: t("app_demo_demo_admin_page_282") },
    { id: "proveedores", label: t("app_demo_demo_viajero_page_235") },
    { id: "reportes", label: t("app_demo_demo_admin_page_283") },
    { id: "feedback", label: t("app_demo_demo_admin_page_284") },
  ];

  const [activeTab, setActiveTab] = useState("overview");
  const [drawer, setDrawer] = useState<{ open: boolean; title: string; subtitle?: string; content: React.ReactNode }>({
    open: false,
    title: "",
    content: null,
  });
  const { toasts, addToast, removeToast } = useToast();

  const openTraveler = (tr: AdminTraveler) => {
    setDrawer({
      open: true,
      title: tr.name,
      subtitle: `${tr.company} · ${tr.trip}`,
      content: (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t("app_demo_demo_admin_page_285")}</p>
              <p className="mt-1 font-medium text-ink">{tr.company}</p>
            </div>
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t("app_demo_demo_admin_page_286")}</p>
              <p className="mt-1 text-[13px] font-medium text-ink">{tr.status}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t("app_demo_demo_admin_page_287")}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
              {t("app_demo_demo_admin_page_445")}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t("app_demo_demo_admin_page_288")}</p>
            <ul className="mt-2 space-y-2">
              <li className="flex items-start gap-2 text-[13px] text-ink-soft">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-nihao" strokeWidth={2} />
                {t("app_demo_demo_admin_page_289")}
              </li>
              <li className="flex items-start gap-2 text-[13px] text-ink-soft">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-nihao" strokeWidth={2} />
                {t("app_demo_demo_admin_page_290")}
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => addToast(t("app_demo_demo_admin_page_291"), "info")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-nihao px-5 text-[13px] font-medium text-white transition-colors hover:bg-nihao-deep"
            >
              <Eye className="h-4 w-4" strokeWidth={2} />
              {t("app_demo_demo_admin_page_292")}
            </button>
            <button
              onClick={() => addToast(t("app_demo_demo_admin_page_293"), "success")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line bg-paper px-5 text-[13px] font-medium text-ink transition-colors hover:bg-paper-warm"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              {t("app_demo_demo_admin_page_294")}
            </button>
          </div>
        </div>
      ),
    });
  };

  const openRoute = (r: AdminRoute) => {
    setDrawer({
      open: true,
      title: t("app_demo_demo_viajero_page_238"),
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
            {t("app_demo_demo_admin_page_295")}
          </p>
          <button
            onClick={() => addToast(t("app_demo_demo_admin_page_296"), "success")}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-nihao px-5 text-[13px] font-medium text-white transition-colors hover:bg-nihao-deep"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            {t("app_demo_demo_admin_page_297")}
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
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t("app_demo_demo_admin_page_298")}</p>
              <p className="mt-1 font-medium text-ink">{s.travelers.join(", ")}</p>
            </div>
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t("app_demo_demo_admin_page_299")}</p>
              <div className="mt-1">
                <StatusBadge type="interest" value={s.interest}>{s.interest}</StatusBadge>
              </div>
            </div>
          </div>
          <p className="text-[14px] leading-relaxed text-ink-soft">
            {t("app_demo_demo_admin_page_300")}
          </p>
        </div>
      ),
    });
  };

  const handleReportAction = (action: string, title: string, toastType: "info" | "success" = "success") => {
    addToast(`${action}: ${title}`, toastType);
  };

  return (
    <div className="container-page py-6 md:py-8">
      {/* Header */}
      <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft md:p-8">
        <span className="text-eyebrow-mark text-nihao">{t("app_demo_demo_admin_page_301")}</span>
        <h1 className="mt-4 font-display text-2xl font-medium tracking-tight text-ink md:text-4xl">
          {t("app_demo_demo_admin_page_302")}
        </h1>
        <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-mute md:text-[15px]">
          {t("app_demo_demo_admin_page_303")}
        </p>

        {/* KPIs */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard label={t("app_demo_demo_admin_page_304")} value={adminMetrics.activeTravelers} icon={<Users className="h-5 w-5" strokeWidth={1.75} />} />
          <MetricCard label={t("app_demo_demo_viajero_page_235")} value={adminMetrics.registeredSuppliers} icon={<Building2 className="h-5 w-5" strokeWidth={1.75} />} />
          <MetricCard label={t("app_demo_demo_viajero_page_236")} value={adminMetrics.reviewedProducts} icon={<Package className="h-5 w-5" strokeWidth={1.75} />} />
          <MetricCard label={t("app_demo_demo_admin_page_305")} value={adminMetrics.generatedReports} icon={<FileText className="h-5 w-5" strokeWidth={1.75} />} />
          <MetricCard label={t("app_demo_demo_admin_page_306")} value={adminMetrics.visitedCities} icon={<MapPin className="h-5 w-5" strokeWidth={1.75} />} />
          <MetricCard label={t("app_demo_demo_admin_page_307")} value={`${adminMetrics.satisfaction}/5`} icon={<Star className="h-5 w-5" strokeWidth={1.75} />} />
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
              <h3 className="font-display text-lg font-medium text-ink">{t("app_demo_demo_admin_page_288")}</h3>
              <div className="mt-4 space-y-3">
                {recentActivity.map((activity, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl border border-line bg-paper-soft p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nihao/10 text-nihao">
                      <TrendingUp className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <p className="text-[14px] text-ink-soft">{activity.tKey ? tDemo(activity.tKey) : activity.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-5">
              <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft">
                <h3 className="font-display text-lg font-medium text-ink">{t("app_demo_demo_admin_page_308")}</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    "app_demo_demo_admin_page_447",
                    "app_demo_demo_admin_page_448",
                    "app_demo_demo_admin_page_449",
                    "Valores_reutilizados_219",
                    "app_demo_demo_admin_page_450",
                  ].map((key) => (
                    <span key={key} className="rounded-full bg-paper-soft px-3 py-1.5 text-[13px] text-ink-soft">
                      {t(key)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft">
                <h3 className="font-display text-lg font-medium text-ink">{t("app_demo_demo_admin_page_309")}</h3>
                <div className="mt-4 space-y-2">
                {[
                  { city: "Guangzhou", count: 58 },
                  { city: "Shenzhen", count: 42 },
                  { city: "Foshan", count: 31 },
                  { city: "Shanghai", count: 27 },
                ].map(({ city, count }) => (
                  <div key={city} className="flex items-center justify-between text-[13px]">
                    <span className="text-ink-soft">{city}</span>
                    <span className="font-medium text-ink">{count} {t("app_demo_demo_admin_page_451")}</span>
                  </div>
                ))}
              </div>
              </div>
              <div className="rounded-2xl border border-nihao/15 bg-nihao-soft p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-nihao" strokeWidth={2} />
                  <div>
                    <h4 className="font-display text-[15px] font-medium text-nihao-ink">{t("app_demo_demo_admin_page_310")}</h4>
                    <p className="mt-1 text-[13px] leading-relaxed text-nihao-ink/80">
                      {t("app_demo_demo_admin_page_311")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "viajeros" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminTravelers.map((tr) => (
              <button
                key={tr.id}
                onClick={() => openTraveler(tr)}
                className="rounded-2xl border border-line bg-paper p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-display text-[16px] font-medium text-ink">{tr.name}</h4>
                    <p className="mt-1 text-[13px] text-ink-mute">{tr.company}</p>
                  </div>
                  <span className="rounded-full bg-paper-soft px-2.5 py-1 text-[11px] font-medium text-ink-soft">
                    {tr.statusKey ? tDemo(tr.statusKey) : tr.status}
                  </span>
                </div>
                <p className="mt-4 text-[13px] text-ink-faint">{tr.tripKey ? tDemo(tr.tripKey) : tr.trip}</p>
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
                    <p className="mt-1 text-[13px] text-ink-mute">{s.city} · {s.categoryKey ? t(s.categoryKey) : s.category}</p>
                  </div>
                  <StatusBadge type="interest" value={s.interest}>{s.interest}</StatusBadge>
                </div>
                <div className="mt-4 rounded-lg bg-paper-soft p-3">
                  <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t("app_demo_demo_admin_page_312")}</p>
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
                    {r.status === "completado" ? t("app_demo_demo_admin_page_315") : t("app_demo_demo_admin_page_316")}
                  </StatusBadge>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleReportAction(t("app_demo_demo_admin_page_313"), r.title, "info")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-nihao px-4 text-[12px] font-medium text-white transition-colors hover:bg-nihao-deep"
                  >
                    <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                    {t("app_demo_demo_admin_page_314")}
                  </button>
                  <button
                    onClick={() => handleReportAction(t("app_demo_demo_admin_page_294"), r.title)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-paper px-4 text-[12px] font-medium text-ink transition-colors hover:bg-paper-warm"
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={2} />
                    PDF
                  </button>
                  <button
                    onClick={() => handleReportAction(t("actions.exportExcel"), r.title)}
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
              <h3 className="font-display text-lg font-medium text-ink">{t("app_demo_demo_admin_page_317")}</h3>
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
                {t("app_demo_demo_admin_page_318")}
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
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{f.quoteKey ? tDemo(f.quoteKey) : f.quote}</p>
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
