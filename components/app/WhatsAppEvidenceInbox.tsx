"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppNotice } from "./AppNotice";
import { AppSelect } from "./AppSelect";
import { appApi } from "./api";
import type { TripInsights } from "@/lib/bot/trip-insights";

type Evidence = {
  id: string; createdAt: string; revision: number; attempts: number; unassigned: boolean; status: { code: string; label: string };
  failureCode: string | null; targets: Array<{ id: string; kind: string; name: string | null; supplierId: string | null }>;
  association: { companyId: string; supplierId: string | null } | null;
  messages: Array<{ id: string; sequence: number; sentAt: string; type: string; text: string | null; transcript: string | null; ocr: string | null; visual: string | null; extractedCommercial: { supplierNotes: unknown; products: unknown[]; pendingFacts: unknown; candidates: unknown[] }; status: string; mediaAvailable: boolean; storagePending: boolean }>;
};
const when = (value: string) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function WhatsAppEvidenceInbox({ tripId, role, suppliers, companies }: { tripId: string; role: "ADMIN" | "TRAVELER"; suppliers: TripInsights["suppliers"]; companies: TripInsights["companies"] }) {
  const [evidence, setEvidence] = useState<Evidence[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [selected, setSelected] = useState(""); const [companyId, setCompanyId] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setError(null); const result = await appApi<{ evidence: Evidence[] }>(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence`); setEvidence(result.evidence); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos consultar las evidencias"); }
    finally { setLoading(false); }
  }, [tripId]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selected);

  async function associate(item: Evidence, supplierId: string | null) {
    const targetCompanyId = supplierId ? suppliers.find((supplier) => supplier.id === supplierId)?.companyId : companyId || item.association?.companyId;
    if (!targetCompanyId) return;
    setBusy(item.id); setError(null);
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: targetCompanyId, supplierId }) });
      setSelected(""); setCompanyId(""); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar la asociación"); }
    finally { setBusy(null); }
  }

  return <section className="mt-5" aria-labelledby="whatsapp-evidence-heading">
    <div><h2 id="whatsapp-evidence-heading" className="text-2xl">Evidencias de WhatsApp</h2><p className="mt-1 text-sm text-ink-mute">Mensajes recibidos y originales guardados, incluso cuando su interpretación quedó pendiente o falló.</p></div>
    {error ? <div className="mt-4"><AppNotice tone="error">{error}</AppNotice><button type="button" onClick={() => void load()} className="app-secondary-button mt-3">Reintentar</button></div> : null}
    {loading ? <p className="mt-5 rounded-xl bg-paper-soft p-4 text-sm text-ink-mute">Cargando evidencias…</p> : null}
    {!loading && !error && !evidence.length ? <p className="mt-5 rounded-xl bg-paper-soft p-6 text-sm text-ink-mute">No hay evidencias de WhatsApp asociadas a este viaje.</p> : null}
    <div className="mt-5 grid gap-4">{evidence.map((item) => {
      const target = item.targets.find((entry) => entry.supplierId) ?? item.targets.find((entry) => entry.kind === "SUPPLIER");
      const supplierId = item.association?.supplierId ?? target?.supplierId ?? (target?.kind === "SUPPLIER" ? target.id : null);
      const supplier = suppliers.find((entry) => entry.id === supplierId);
      const href = supplier ? `/app/viajes/${encodeURIComponent(tripId)}/${role === "ADMIN" ? "admin/" : ""}proveedores/${encodeURIComponent(supplier.id)}` : selectedSupplier ? `/app/viajes/${encodeURIComponent(tripId)}/${role === "ADMIN" ? "admin/" : ""}proveedores/${encodeURIComponent(selectedSupplier.id)}` : `/app/viajes/${encodeURIComponent(tripId)}/proveedores/nuevo${item.association?.companyId ? `?companyId=${encodeURIComponent(item.association.companyId)}` : companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`;
      return <article key={item.id} className="rounded-2xl border border-line bg-paper p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Evidencia recibida · {when(item.createdAt)}</h3><p className="mt-1 text-xs text-ink-mute">{item.messages.length} mensajes · revisión {item.revision}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.status.code === "error" ? "bg-red-50 text-red-800" : item.status.code === "complete" ? "bg-emerald-50 text-emerald-800" : "bg-gold-soft text-gold-deep"}`}>{item.status.label}</span></div>
        {item.failureCode ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">La automatización tuvo un error ({item.failureCode}). El original sigue disponible para revisarlo.</p> : null}
        {item.unassigned ? <p className="mt-3 rounded-lg bg-gold-soft p-3 text-sm text-ink">Esta evidencia todavía no tiene viaje ni empresa asociados. Revisá el contenido y elegí el viaje y la empresa correctos para guardarla aquí.</p> : null}
        <div className="mt-4 grid gap-3">{item.messages.map((message) => <div key={message.id} className="min-w-0 rounded-xl bg-paper-soft p-4"><p className="text-xs font-semibold text-ink-mute">{message.type} · {when(message.sentAt)} · {message.status}</p>
          {message.text ? <p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm">{message.text}</p> : null}
          {message.transcript ? <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Transcripción</summary><p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm">{message.transcript}</p></details> : null}
          {message.ocr ? <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Texto detectado en la imagen</summary><p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm">{message.ocr}</p></details> : null}
          {message.visual ? <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Descripción disponible</summary><p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm">{message.visual}</p></details> : null}
          {message.extractedCommercial.products.length || message.extractedCommercial.pendingFacts || message.extractedCommercial.supplierNotes || message.extractedCommercial.candidates.length ? <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Datos comerciales extraídos</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap wrap-anywhere rounded-lg bg-white p-3 text-xs">{JSON.stringify(message.extractedCommercial, null, 2)}</pre></details> : null}
          {message.mediaAvailable ? <a className="mt-3 inline-block text-sm font-semibold text-nihao underline" href={`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/${encodeURIComponent(message.id)}/media`} target="_blank" rel="noreferrer">Abrir original privado</a> : message.storagePending ? <p className="mt-3 text-sm text-gold-deep">El original multimedia todavía está intentando guardarse.</p> : null}
        </div>)}</div>
        {supplier ? <p className="mt-4 text-sm text-ink-mute">Asociación confirmada: {supplier.companyNameLatin ?? supplier.companyName ?? "Proveedor"}.</p> : item.association ? <p className="mt-4 text-sm text-ink-mute">Asociada manualmente a {companies.find((entry) => entry.id === item.association?.companyId)?.name ?? "una empresa"}; todavía sin proveedor.</p> : null}
        <div className="mt-4 grid gap-3"><AppSelect ariaLabel="Elegir empresa para esta evidencia" searchable clearable value={selectedSupplier?.companyId ?? (companyId || item.association?.companyId || "")} onValueChange={setCompanyId} placeholder="Elegí empresa del viaje" options={companies.map((entry) => ({ value: entry.id, label: entry.name }))} />
          <AppSelect ariaLabel="Elegir proveedor existente" searchable clearable value={selected} onValueChange={setSelected} placeholder="Proveedor existente (opcional)" options={suppliers.filter((entry) => !companyId || entry.companyId === companyId).map((entry) => ({ value: entry.id, label: entry.companyNameLatin ?? entry.companyName ?? "Proveedor sin nombre", description: entry.company }))} />
          <div className="flex flex-wrap gap-2"><button type="button" disabled={busy === item.id || !(selectedSupplier?.companyId ?? companyId)} onClick={() => void associate(item, selectedSupplier?.id ?? null)} className="app-secondary-button">{busy === item.id ? "Guardando…" : selectedSupplier ? "Asociar y revisar proveedor" : "Asociar empresa sin crear proveedor"}</button>{(selectedSupplier || item.association?.companyId) ? <Link href={href} className="app-secondary-button">Revisar proveedor</Link> : <Link href={href} className="app-secondary-button">Crear proveedor manualmente</Link>}</div>
        </div>
      </article>;
    })}</div>
  </section>;
}
