"use client";

import { useState } from "react";
import { MapPin, Calendar, Building2, FileText, Users, Package, Phone, Download, Share2, MessageSquare, Mic, ImageIcon, CreditCard, StickyNote, Copy, CheckCircle2, ChevronRight } from "lucide-react";
import { DemoTabs } from "@/components/demo/DemoTabs";
import { MetricCard } from "@/components/demo/MetricCard";
import { StatusBadge } from "@/components/demo/StatusBadge";
import { DetailDrawer } from "@/components/demo/DetailDrawer";
import { Toast } from "@/components/demo/Toast";
import { useToast } from "@/components/demo/useToast";
import {
  demoTraveler,
  suppliers,
  products,
  contacts,
  timelineEvents,
  travelerMetrics,
  type Supplier,
  type Product,
  type Contact,
  type TimelineEvent,
} from "@/components/demo/demo-data";

const tabs = [
  { id: "resumen", label: "Resumen" },
  { id: "timeline", label: "Timeline" },
  { id: "proveedores", label: "Proveedores" },
  { id: "productos", label: "Productos" },
  { id: "contactos", label: "Contactos" },
  { id: "recorrido", label: "Recorrido" },
  { id: "exportaciones", label: "Exportaciones" },
];

const typeIcons: Record<TimelineEvent["type"], typeof MessageSquare> = {
  text: MessageSquare,
  audio: Mic,
  photo: ImageIcon,
  card: CreditCard,
  product: Package,
  note: StickyNote,
};

export default function ViajeroPage() {
  const [activeTab, setActiveTab] = useState("resumen");
  const [drawer, setDrawer] = useState<{ open: boolean; title: string; subtitle?: string; content: React.ReactNode }>({
    open: false,
    title: "",
    content: null,
  });
  const { toasts, addToast, removeToast } = useToast();

  const openSupplier = (s: Supplier) => {
    setDrawer({
      open: true,
      title: s.name,
      subtitle: `${s.city} · ${s.category}`,
      content: (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">Contacto</p>
              <p className="mt-1 font-medium text-ink">{s.contactName}</p>
              <p className="text-[13px] text-ink-mute">{s.contactRole}</p>
            </div>
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">Interés</p>
              <div className="mt-1">
                <StatusBadge type="interest" value={s.interest}>{s.interest}</StatusBadge>
              </div>
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">Notas</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{s.notes}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">Productos asociados</p>
            <ul className="mt-2 space-y-2">
              {products
                .filter((p) => p.supplierId === s.id)
                .map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-lg border border-line bg-paper p-3">
                    <span className="text-[13px] font-medium text-ink">{p.name}</span>
                    <ChevronRight className="h-4 w-4 text-ink-faint" strokeWidth={2} />
                  </li>
                ))}
              {products.filter((p) => p.supplierId === s.id).length === 0 && (
                <li className="text-[13px] text-ink-faint">Sin productos registrados aún.</li>
              )}
            </ul>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => addToast("Proveedor marcado para seguimiento", "success")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-nihao px-5 text-[13px] font-medium text-white transition-colors hover:bg-nihao-deep"
            >
              Marcar para seguimiento
            </button>
            <button
              onClick={() => addToast("Ficha exportada correctamente", "success")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line bg-paper px-5 text-[13px] font-medium text-ink transition-colors hover:bg-paper-warm"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              Exportar ficha
            </button>
          </div>
        </div>
      ),
    });
  };

  const openProduct = (p: Product) => {
    setDrawer({
      open: true,
      title: p.name,
      subtitle: `${p.category} · ${p.city}`,
      content: (
        <div className="space-y-6">
          <div className="aspect-video w-full rounded-xl border border-line bg-paper-warm flex items-center justify-center">
            <Package className="h-12 w-12 text-ink-faint" strokeWidth={1.5} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">Proveedor</p>
              <p className="mt-1 font-medium text-ink">{p.supplierName}</p>
            </div>
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">Interés</p>
              <div className="mt-1">
                <StatusBadge type="interest" value={p.interest}>{p.interest}</StatusBadge>
              </div>
            </div>
            {p.price && (
              <div className="rounded-xl border border-line bg-paper-soft p-4">
                <p className="text-[11px] uppercase tracking-wider text-ink-faint">Precio</p>
                <p className="mt-1 font-medium text-ink">{p.price}</p>
              </div>
            )}
            {p.moq && (
              <div className="rounded-xl border border-line bg-paper-soft p-4">
                <p className="text-[11px] uppercase tracking-wider text-ink-faint">MOQ</p>
                <p className="mt-1 font-medium text-ink">{p.moq}</p>
              </div>
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">Notas</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{p.notes}</p>
          </div>
        </div>
      ),
    });
  };

  const openContact = (c: Contact) => {
    setDrawer({
      open: true,
      title: c.name,
      subtitle: `${c.role} · ${c.supplierName}`,
      content: (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">Empresa</p>
              <p className="mt-1 font-medium text-ink">{c.supplierName}</p>
            </div>
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">Canal</p>
              <p className="mt-1 font-medium text-ink">{c.channel}</p>
            </div>
            <div className="rounded-xl border border-line bg-paper-soft p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">Ciudad</p>
              <p className="mt-1 font-medium text-ink">{c.city}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">Notas</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{c.notes}</p>
          </div>
          <button
            onClick={() => addToast("Contacto copiado al portapapeles", "success")}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-nihao px-5 text-[13px] font-medium text-white transition-colors hover:bg-nihao-deep"
          >
            <Copy className="h-4 w-4" strokeWidth={2} />
            Copiar contacto
          </button>
        </div>
      ),
    });
  };

  const openTimelineEvent = (e: TimelineEvent) => {
    setDrawer({
      open: true,
      title: e.title,
      subtitle: `${e.date} · ${e.city}`,
      content: (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nihao/10 text-nihao">
              {(() => {
                const Icon = typeIcons[e.type];
                return <Icon className="h-5 w-5" strokeWidth={1.75} />;
              })()}
            </div>
            <div>
              <p className="text-[13px] font-medium text-ink">Tipo: {e.type}</p>
              <p className="text-[12px] text-ink-mute">Día {e.day} · {e.city}</p>
            </div>
          </div>
          <p className="text-[14px] leading-relaxed text-ink-soft">{e.description}</p>
          <div className="aspect-video w-full rounded-xl border border-line bg-paper-warm flex items-center justify-center">
            {(() => {
              const Icon = typeIcons[e.type];
              return <Icon className="h-12 w-12 text-ink-faint" strokeWidth={1.5} />;
            })()}
          </div>
        </div>
      ),
    });
  };

  const exportItem = (label: string) => {
    addToast(`${label} generada correctamente`, "success");
  };

  return (
    <div className="container-page py-6 md:py-8">
      {/* Header */}
      <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <span className="text-eyebrow-mark text-nihao">Informe de viaje</span>
            <h1 className="mt-4 font-display text-2xl font-medium tracking-tight text-ink md:text-4xl">
              {demoTraveler.trip}
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-mute md:text-[15px]">
              Toda la información que Martín fue enviando por WhatsApp, organizada automáticamente por el Asistente Nihao.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-[13px] text-ink-soft">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-soft px-3 py-1.5">
                <Building2 className="h-3.5 w-3.5 text-nihao" strokeWidth={2} />
                {demoTraveler.company}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-soft px-3 py-1.5">
                <Calendar className="h-3.5 w-3.5 text-nihao" strokeWidth={2} />
                {demoTraveler.dates}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-soft px-3 py-1.5">
                <MapPin className="h-3.5 w-3.5 text-nihao" strokeWidth={2} />
                {demoTraveler.cities.join(" · ")}
              </span>
            </div>
          </div>
          <div className="shrink-0 rounded-full border border-line bg-paper-soft px-4 py-2 text-[12px] font-medium text-ink-mute">
            {demoTraveler.mode}
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Proveedores" value={travelerMetrics.suppliers} />
          <MetricCard label="Productos" value={travelerMetrics.products} />
          <MetricCard label="Contactos" value={travelerMetrics.contacts} />
          <MetricCard label="Ciudades" value={travelerMetrics.cities} />
          <MetricCard label="Pendientes" value={travelerMetrics.pending} />
          <MetricCard label="Informes listos" value={travelerMetrics.reports} />
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 overflow-x-auto pb-2 md:mt-8">
        <DemoTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Content */}
      <div className="mt-6 min-h-[320px] md:mt-8">
        {activeTab === "resumen" && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft lg:col-span-2">
              <h3 className="font-display text-lg font-medium text-ink">Resumen ejecutivo</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
                Martín completó 4 días de recorrido entre Guangzhou, Shenzhen y Foshan. El Asistente Nihao
                registró automáticamente proveedores clave en iluminación, hogar inteligente, productos de bambú
                y muebles. Los contactos principales ya están organizados con notas y próximas acciones.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-paper-soft p-4">
                  <p className="text-[11px] uppercase tracking-wider text-ink-faint">Categorías más exploradas</p>
                  <p className="mt-1 text-[13px] font-medium text-ink">Hogar, Iluminación, Muebles</p>
                </div>
                <div className="rounded-xl bg-paper-soft p-4">
                  <p className="text-[11px] uppercase tracking-wider text-ink-faint">Proveedores de mayor interés</p>
                  <p className="mt-1 text-[13px] font-medium text-ink">Canton LED Works, Guangzhou Bamboo Living</p>
                </div>
              </div>
            </div>
            <div className="space-y-5">
              <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft">
                <h3 className="font-display text-lg font-medium text-ink">Pendientes importantes</h3>
                <ul className="mt-4 space-y-3">
                  <li className="flex items-start gap-2 text-[13px] text-ink-soft">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-nihao" strokeWidth={2} />
                    Confirmar certificaciones LED
                  </li>
                  <li className="flex items-start gap-2 text-[13px] text-ink-soft">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-nihao" strokeWidth={2} />
                    Solicitar muestras de packaging
                  </li>
                  <li className="flex items-start gap-2 text-[13px] text-ink-soft">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-nihao" strokeWidth={2} />
                    Revisar tiempos de producción Foshan
                  </li>
                </ul>
              </div>
              <div className="rounded-2xl border border-line bg-nihao-soft p-6">
                <h3 className="font-display text-lg font-medium text-nihao-ink">Recomendaciones</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-nihao-ink/80">
                  Priorizar Canton LED Works y Guangzhou Bamboo Living para seguimiento inmediato. Ambos tienen
                  interés alto y productos alineados con el rubro del viajero.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="relative space-y-4 before:absolute before:left-4 before:top-0 before:h-full before:w-px before:bg-line md:before:left-6">
            {timelineEvents.map((e) => {
              const Icon = typeIcons[e.type];
              return (
                <button
                  key={e.id}
                  onClick={() => openTimelineEvent(e)}
                  className="group relative flex w-full gap-4 rounded-2xl border border-line bg-paper p-4 text-left shadow-soft transition-all hover:shadow-card md:gap-6 md:p-6"
                >
                  <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper-soft ring-1 ring-line group-hover:bg-nihao-soft group-hover:text-nihao md:h-12 md:w-12">
                    <Icon className="h-4 w-4 text-ink-mute group-hover:text-nihao md:h-5 md:w-5" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-nihao">
                        Día {e.day} · {e.date}
                      </span>
                      <span className="text-[11px] text-ink-faint">· {e.city}</span>
                    </div>
                    <h4 className="mt-1 font-display text-[16px] font-medium text-ink md:text-[18px]">{e.title}</h4>
                    <p className="mt-1 text-[13px] text-ink-mute">{e.description}</p>
                  </div>
                  <ChevronRight className="hidden h-5 w-5 shrink-0 text-ink-faint group-hover:text-nihao md:block" strokeWidth={2} />
                </button>
              );
            })}
          </div>
        )}

        {activeTab === "proveedores" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((s) => (
              <button
                key={s.id}
                onClick={() => openSupplier(s)}
                className="rounded-2xl border border-line bg-paper p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-display text-[16px] font-medium text-ink">{s.name}</h4>
                    <p className="mt-1 text-[13px] text-ink-mute">{s.city} · {s.category}</p>
                  </div>
                  <StatusBadge type="interest" value={s.interest}>{s.interest}</StatusBadge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
                  <div className="rounded-lg bg-paper-soft p-2.5">
                    <p className="text-ink-faint">Contacto</p>
                    <p className="font-medium text-ink">{s.contactName}</p>
                  </div>
                  <div className="rounded-lg bg-paper-soft p-2.5">
                    <p className="text-ink-faint">Productos</p>
                    <p className="font-medium text-ink">{s.productCount}</p>
                  </div>
                </div>
                <p className="mt-3 text-[12px] text-ink-faint">{s.lastInteraction}</p>
              </button>
            ))}
          </div>
        )}

        {activeTab === "productos" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => openProduct(p)}
                className="overflow-hidden rounded-2xl border border-line bg-paper text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="aspect-[4/3] w-full bg-paper-warm flex items-center justify-center">
                  <Package className="h-12 w-12 text-ink-faint" strokeWidth={1.5} />
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-display text-[16px] font-medium text-ink">{p.name}</h4>
                    <StatusBadge type="interest" value={p.interest}>{p.interest}</StatusBadge>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-mute">{p.supplierName}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
                    <span className="rounded-full bg-paper-soft px-2.5 py-1 text-ink-soft">{p.category}</span>
                    <span className="rounded-full bg-paper-soft px-2.5 py-1 text-ink-soft">{p.city}</span>
                    {p.price && <span className="rounded-full bg-paper-soft px-2.5 py-1 text-ink-soft">{p.price}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === "contactos" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {contacts.map((c) => (
              <button
                key={c.id}
                onClick={() => openContact(c)}
                className="flex items-center gap-4 rounded-2xl border border-line bg-paper p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-nihao/10 text-nihao">
                  <Phone className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-display text-[16px] font-medium text-ink">{c.name}</h4>
                  <p className="truncate text-[13px] text-ink-mute">{c.role}</p>
                  <p className="mt-1 truncate text-[12px] text-ink-faint">{c.supplierName}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === "recorrido" && (
          <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft md:p-8">
            <h3 className="font-display text-xl font-medium text-ink">Recorrido del viaje</h3>
            <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center">
              {demoTraveler.cities.map((city, i) => (
                <div key={city} className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-nihao/10 text-nihao ring-1 ring-nihao/20">
                    <MapPin className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="font-display text-lg font-medium text-ink">{city}</p>
                    <p className="text-[12px] text-ink-mute">
                      {suppliers.filter((s) => s.city === city).length} proveedores · {" "}
                      {Array.from(new Set(suppliers.filter((s) => s.city === city).map((s) => s.category))).join(", ") || "—"}
                    </p>
                  </div>
                  {i < demoTraveler.cities.length - 1 && (
                    <ChevronRight className="hidden h-5 w-5 text-ink-faint md:block" strokeWidth={2} />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {demoTraveler.cities.map((city) => (
                <div key={city} className="rounded-xl border border-line bg-paper-soft p-4">
                  <p className="text-[11px] uppercase tracking-wider text-ink-faint">Eventos en {city}</p>
                  <p className="mt-1 text-[13px] font-medium text-ink">
                    {timelineEvents.filter((e) => e.city === city).length} registros
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "exportaciones" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Exportar informe PDF", icon: FileText },
              { label: "Exportar Excel de proveedores", icon: Users },
              { label: "Exportar Excel de productos", icon: Package },
              { label: "Exportar resumen del viaje", icon: FileText },
              { label: "Compartir link privado", icon: Share2 },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => exportItem(item.label)}
                className="flex items-center gap-4 rounded-2xl border border-line bg-paper p-6 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-nihao/10 text-nihao">
                  <item.icon className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <div>
                  <h4 className="font-display text-[16px] font-medium text-ink">{item.label}</h4>
                  <p className="mt-1 text-[12px] text-ink-mute">Descarga/demo disponible</p>
                </div>
              </button>
            ))}
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
