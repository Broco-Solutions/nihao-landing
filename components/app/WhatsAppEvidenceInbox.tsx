"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppNotice } from "./AppNotice";
import { AppSelect } from "./AppSelect";
import { appApi } from "./api";
import type { TripInsights } from "@/lib/bot/trip-insights";
import type { CommercialFacts } from "@/lib/channels/whatsapp/commercial-review";

type Decision = { id: string; action: string; companyId: string; captureId: string | null; supplierId: string | null; productId: string | null; createdAt: string };
type Message = { id: string; sentAt: string; type: string; text: string | null; transcript: string | null; ocr: string | null; facts: CommercialFacts; commercial: boolean; resolution: "pending" | "resolved" | "history"; decisions: Decision[]; mediaAvailable: boolean; storagePending: boolean };
type Evidence = { id: string; association: { companyId: string; supplierId: string | null } | null; messages: Message[] };
type Props = { tripId: string; role: "ADMIN" | "TRAVELER"; suppliers: TripInsights["suppliers"]; captures: TripInsights["captures"]; products: TripInsights["products"]; companies: TripInsights["companies"]; onChanged?: () => Promise<void> };
const when = (value: string) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const source = (type: string) => ({ AUDIO: "Audio", IMAGE: "Imagen", DOCUMENT: "Documento", TEXT: "Mensaje", VIDEO: "Video" })[type.toUpperCase() as "AUDIO" | "IMAGE" | "DOCUMENT" | "TEXT" | "VIDEO"] ?? "Mensaje";
const numeric = (value: string) => value.trim() ? Number(value.replace(",", ".")) : null;
const hasProductFacts = (facts: CommercialFacts) => Boolean(facts.productName || facts.category || facts.fob || facts.moq || facts.leadTime);

function FactSummary({ facts }: { facts: CommercialFacts }) {
  const rows = [
    ["Proveedor", facts.companyName], ["Ciudad", facts.city], ["Producto sugerido", facts.productName], ["Categoría", facts.category],
    ["FOB", facts.fob ? `${facts.fob.currency ?? "Moneda pendiente"} ${facts.fob.amount ?? "Importe pendiente"}${facts.fob.unit ? ` / ${facts.fob.unit}` : " · unidad pendiente"}` : null],
    ["MOQ", facts.moq ? `${facts.moq.quantity ?? "Cantidad pendiente"} ${facts.moq.unit ?? "(unidad pendiente)"}${facts.moq.notes ? ` · ${facts.moq.notes}` : ""}` : null],
    ["Plazo de entrega", facts.leadTime ? facts.leadTime.days !== null ? `${facts.leadTime.days} días` : facts.leadTime.rawText ?? "Pendiente" : null],
    ["Contacto", facts.contact], ["Notas", facts.notes],
  ].filter((row): row is string[] => Boolean(row[1]));
  if (!rows.length) return <p className="mt-3 text-sm text-ink-mute">No se extrajeron datos confiables. Revisá el original y decidí cómo registrarlo.</p>;
  return <dl className="mt-4 grid gap-2 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-xl bg-paper-soft px-3 py-2"><dt className="text-xs font-medium text-ink-mute">{label}</dt><dd className="mt-1 wrap-anywhere text-sm font-semibold">{value}</dd></div>)}</dl>;
}

function EvidenceCard({ tripId, role, item, message, suppliers, captures, products, companies, onSaved }: Props & { item: Evidence; message: Message; onSaved: () => Promise<void> }) {
  const [companyId, setCompanyId] = useState(item.association?.companyId ?? (companies.length === 1 ? companies[0].id : ""));
  const [captureId, setCaptureId] = useState("");
  const [productId, setProductId] = useState("");
  const [action, setAction] = useState(hasProductFacts(message.facts) ? "APPLY_PRODUCT" : "LINK_SUPPLIER");
  const [name, setName] = useState(message.facts.productName ?? "");
  const [supplierName, setSupplierName] = useState(message.facts.companyName ?? "");
  const [city, setCity] = useState(message.facts.city ?? "");
  const [contact, setContact] = useState(message.facts.contact ?? "");
  const [fobAmount, setFobAmount] = useState(message.facts.fob?.amount?.toString() ?? "");
  const [fobCurrency, setFobCurrency] = useState(message.facts.fob?.currency ?? "");
  const [fobUnit, setFobUnit] = useState(message.facts.fob?.unit ?? "");
  const [moqQuantity, setMoqQuantity] = useState(message.facts.moq?.quantity?.toString() ?? "");
  const [moqUnit, setMoqUnit] = useState(message.facts.moq?.unit ?? "");
  const [leadDays, setLeadDays] = useState(message.facts.leadTime?.days?.toString() ?? "");
  const [notes, setNotes] = useState(message.facts.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const change = <T,>(setter: (value: T) => void, value: T) => { requestId.current = null; setter(value); };
  const availableCaptures = captures.filter((capture) => capture.companyId === companyId);
  const selectedSupplier = suppliers.find((supplier) => supplier.captureId === captureId);
  const availableProducts = products.filter((product) => product.captureId === captureId);
  const selectedProduct = availableProducts.find((product) => product.id === productId);
  const recordHref = captureId ? `/app/viajes/${encodeURIComponent(tripId)}/${selectedSupplier ? `proveedores/${encodeURIComponent(selectedSupplier.id)}` : `proveedores/nuevo?captureId=${encodeURIComponent(captureId)}`}` : null;

  async function save() {
    if (!companyId) { setError("Elegí una empresa del viaje."); return; }
    if (action === "DISCARD" && !window.confirm("¿Descartar esta evidencia como no comercial? El mensaje original seguirá en Historial.")) return;
    setBusy(true); setError(null);
    try {
      const fields: Record<string, unknown> = {};
      if (action === "CREATE_PRODUCT" || action === "APPLY_PRODUCT") {
        if (action === "APPLY_PRODUCT" && name.trim() && name.trim() !== selectedProduct?.name) fields.name = name.trim();
        if (notes.trim()) fields.notes = notes.trim();
        if (fobAmount.trim() || fobCurrency.trim() || fobUnit.trim()) fields.fob = { amount: numeric(fobAmount), currency: fobCurrency.trim() || null, unit: fobUnit.trim() || null, rawText: "" };
        if (moqQuantity.trim() || moqUnit.trim()) fields.moq = { quantity: numeric(moqQuantity), unit: moqUnit.trim() || null, notes: null, rawText: "" };
        if (leadDays.trim()) fields.leadTime = { days: numeric(leadDays), rawText: `${leadDays.trim()} días` };
      }
      requestId.current ??= crypto.randomUUID();
      const body = { id: requestId.current, action, companyId, captureId: captureId || undefined, supplierId: selectedSupplier?.id, productId: productId || undefined, expectedVersion: selectedProduct?.updatedAt, name: action === "CREATE_SUPPLIER" ? supplierName : name, city, contact, fields };
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/${encodeURIComponent(message.id)}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      requestId.current = null;
      await onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar la decisión. Podés reintentar."); }
    finally { setBusy(false); }
  }

  const field = (label: string, value: string, setter: (value: string) => void, inputMode?: "decimal") => <label className="text-xs font-medium">{label}<input className="app-input mt-1" value={value} inputMode={inputMode} onChange={(event) => change(setter, event.target.value)} placeholder="Sin dato" /></label>;
  return <article className="rounded-2xl border border-line bg-paper p-4 shadow-soft sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-ink-mute">{source(message.type)} · {when(message.sentAt)}</p><h3 className="mt-1 text-lg font-semibold">{message.facts.productName ?? message.facts.companyName ?? message.facts.category ?? "Información recibida"}</h3></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${message.resolution === "resolved" ? "bg-emerald-50 text-emerald-800" : message.resolution === "history" ? "bg-paper-soft text-ink-mute" : "bg-gold-soft text-gold-deep"}`}>{message.resolution === "resolved" ? "Resuelta" : message.resolution === "history" ? "Historial" : "Por resolver"}</span></div>
    <FactSummary facts={message.facts} />
    {message.facts.category && !message.facts.productName ? <p className="mt-3 text-xs text-ink-mute">La categoría no identifica por sí sola un producto. Escribí su nombre sólo si lo conocés.</p> : null}
    {message.text ? <p className="mt-3 whitespace-pre-wrap wrap-anywhere text-sm">{message.text}</p> : null}
    {message.transcript ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Revisar transcripción</summary><p className="mt-2 whitespace-pre-wrap wrap-anywhere">{message.transcript}</p></details> : null}
    {message.ocr ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Texto de la imagen</summary><p className="mt-2 whitespace-pre-wrap wrap-anywhere">{message.ocr}</p></details> : null}
    {message.mediaAvailable ? <a className="mt-3 inline-block text-sm font-semibold text-nihao underline" href={`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/${encodeURIComponent(message.id)}/media`} target="_blank" rel="noreferrer">Abrir original privado</a> : message.storagePending ? <p className="mt-3 text-xs text-gold-deep">El archivo original todavía se está guardando.</p> : null}
    {item.messages.some((other) => other.id !== message.id && other.text && !other.commercial) ? <details className="mt-3 text-sm"><summary className="cursor-pointer text-ink-mute">Mensajes cercanos de la conversación</summary><ul className="mt-2 list-inside list-disc text-ink-mute">{item.messages.filter((other) => other.id !== message.id && other.text && !other.commercial).map((other) => <li key={other.id}>{other.text}</li>)}</ul></details> : null}
    {message.decisions.length ? <div className="mt-4 rounded-xl bg-nihao-soft p-3 text-sm"><p className="font-semibold">Decisiones guardadas</p>{message.decisions.map((decision) => <p key={decision.id} className="mt-1">{decision.action === "DISCARD" ? "Descartada como no comercial" : decision.action === "CREATE_SUPPLIER" ? "Proveedor creado" : decision.action === "CREATE_PRODUCT" ? "Producto creado como borrador" : decision.action === "APPLY_PRODUCT" ? "Datos aplicados al producto" : "Vinculada al registro"} · {when(decision.createdAt)}</p>)}</div> : null}
    {role === "TRAVELER" && message.commercial ? <div className="mt-5 border-t border-line pt-4"><h4 className="font-semibold">{message.resolution === "pending" ? "Resolver esta información" : "Agregar otra vinculación"}</h4><p className="mt-1 text-sm text-ink-mute">Elegí el destino, corregí los datos y guardá. La resolución aparece sólo después del guardado.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><AppSelect ariaLabel="Empresa de la evidencia" searchable value={companyId} onValueChange={(value) => { change(setCompanyId, value); setCaptureId(""); setProductId(""); }} placeholder="Elegí empresa" options={companies.map((company) => ({ value: company.id, label: company.name }))} /><AppSelect ariaLabel="Acción comercial" value={action} onValueChange={(value) => change(setAction, value)} options={[{ value: "APPLY_PRODUCT", label: "Aplicar datos a producto" }, { value: "CREATE_PRODUCT", label: "Crear producto en borrador" }, { value: "LINK_PRODUCT", label: "Vincular producto sin aplicar datos" }, { value: "LINK_SUPPLIER", label: "Vincular proveedor" }, { value: "CREATE_SUPPLIER", label: "Crear proveedor" }, { value: "DISCARD", label: "Descartar como no comercial" }]} />
      {!["CREATE_SUPPLIER", "DISCARD"].includes(action) ? <AppSelect ariaLabel="Proveedor o borrador de destino" searchable value={captureId} onValueChange={(value) => { change(setCaptureId, value); setProductId(""); }} placeholder="Elegí proveedor" options={availableCaptures.map((capture) => ({ value: capture.id, label: capture.companyNameLatin ?? capture.companyName ?? "Proveedor pendiente", description: capture.status === "DRAFT" ? "Borrador" : "Confirmado" }))} /> : null}
      {["APPLY_PRODUCT", "LINK_PRODUCT"].includes(action) ? <AppSelect ariaLabel="Producto de destino" searchable value={productId} onValueChange={(value) => change(setProductId, value)} placeholder="Elegí producto" options={availableProducts.map((product) => ({ value: product.id, label: product.name, description: product.status === "DRAFT" ? "Borrador" : "Confirmado" }))} /> : null}</div>
      {action === "CREATE_SUPPLIER" ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{field("Nombre del proveedor", supplierName, setSupplierName)}{field("Ciudad", city, setCity)}<div className="sm:col-span-2">{field("Contacto para confirmar (opcional)", contact, setContact)}</div><p className="text-xs text-ink-mute sm:col-span-2">Sin un contacto válido se guarda como borrador. Podés completarlo en Proveedores.</p></div> : null}
      {["APPLY_PRODUCT", "CREATE_PRODUCT"].includes(action) ? <div className="mt-3 grid gap-3 rounded-xl bg-paper-soft p-3 sm:grid-cols-3"><div className="sm:col-span-3">{field(action === "CREATE_PRODUCT" ? "Nombre del nuevo producto" : "Nombre (sólo si querés corregirlo)", name, setName)}</div>{field("FOB", fobAmount, setFobAmount, "decimal")}{field("Moneda", fobCurrency, setFobCurrency)}{field("Unidad FOB", fobUnit, setFobUnit)}{field("MOQ", moqQuantity, setMoqQuantity, "decimal")}{field("Unidad MOQ", moqUnit, setMoqUnit)}{field("Plazo en días", leadDays, setLeadDays, "decimal")}<label className="text-xs font-medium sm:col-span-3">Notas y condiciones<textarea className="app-input mt-1 min-h-20" value={notes} onChange={(event) => change(setNotes, event.target.value)} /></label></div> : null}
      {(["LINK_SUPPLIER", "LINK_PRODUCT", "CREATE_SUPPLIER"].includes(action) && hasProductFacts(message.facts)) ? <p className="mt-3 text-xs text-gold-deep">La evidencia seguirá pendiente hasta que los datos del producto se apliquen o se descarten explícitamente.</p> : null}
      {error ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}
      <div className="mt-4 flex flex-wrap gap-2"><button className="app-primary-button" type="button" disabled={busy || !companyId || (!["CREATE_SUPPLIER", "DISCARD"].includes(action) && !captureId) || (["APPLY_PRODUCT", "LINK_PRODUCT"].includes(action) && !productId) || (action === "CREATE_PRODUCT" && !name.trim()) || (action === "CREATE_SUPPLIER" && !supplierName.trim())} onClick={() => void save()}>{busy ? "Guardando…" : action === "DISCARD" ? "Confirmar descarte" : "Guardar decisión"}</button>{recordHref ? <Link href={recordHref} className="app-secondary-button">Abrir proveedor</Link> : null}</div>
    </div> : null}
  </article>;
}

export function WhatsAppEvidenceInbox(props: Props) {
  const { tripId } = props;
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "resolved" | "history">("pending");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const load = useCallback(async () => { try { setError(null); const result = await appApi<{ evidence: Evidence[] }>(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence`); setEvidence(result.evidence); } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos consultar las evidencias"); } finally { setLoading(false); } }, [tripId]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const items = evidence.flatMap((item) => item.messages.map((message) => ({ item, message })));
  const pending = items.filter(({ message }) => message.resolution === "pending").length;
  const shown = items.filter(({ item, message }) => (tab === "history" || message.resolution === tab) && (!type || message.type.toUpperCase() === type) && (!search || [message.text, message.transcript, message.ocr, message.facts.companyName, message.facts.productName, message.facts.category, props.companies.find((company) => company.id === item.association?.companyId)?.name, ...message.decisions.map((decision) => props.companies.find((company) => company.id === decision.companyId)?.name)].filter(Boolean).join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const saved = async () => { await Promise.all([load(), props.onChanged?.()]); };
  return <section className="mt-5" aria-labelledby="whatsapp-evidence-heading"><div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="whatsapp-evidence-heading" className="text-2xl">Evidencias de WhatsApp</h2><p className="mt-1 text-sm text-ink-mute">Revisá cada fuente y convertí sus datos en registros comerciales.</p></div><span className="rounded-full bg-gold-soft px-3 py-1 text-sm font-semibold text-gold-deep">{pending} por resolver</span></div>
    <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Estado de evidencias">{([["pending", `Por resolver (${pending})`], ["resolved", "Resueltas"], ["history", "Historial"]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${tab === value ? "bg-nihao text-white" : "border border-line bg-paper-soft text-ink"}`}>{label}</button>)}</div>
    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_12rem]"><label className="sr-only" htmlFor="evidence-search">Buscar evidencia</label><input id="evidence-search" className="app-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar empresa, proveedor o contenido" /><AppSelect ariaLabel="Filtrar tipo de evidencia" clearable value={type} onValueChange={setType} placeholder="Todos los tipos" options={[{ value: "AUDIO", label: "Audio" }, { value: "IMAGE", label: "Imagen" }, { value: "TEXT", label: "Texto" }, { value: "DOCUMENT", label: "Documento" }]} /></div>
    {error ? <div className="mt-4"><AppNotice tone="error">{error}</AppNotice><button type="button" onClick={() => void load()} className="app-secondary-button mt-3">Reintentar</button></div> : null}
    {loading ? <p className="mt-5 rounded-xl bg-paper-soft p-4 text-sm text-ink-mute">Cargando evidencias…</p> : null}
    {!loading && !error && !shown.length ? <p className="mt-5 rounded-xl bg-paper-soft p-6 text-sm text-ink-mute">{tab === "pending" ? "No hay evidencias comerciales pendientes con estos filtros." : "No hay mensajes en esta vista con estos filtros."}</p> : null}
    <div className="mt-5 grid gap-4">{shown.map(({ item, message }) => <EvidenceCard key={message.id} {...props} item={item} message={message} onSaved={saved} />)}</div>
  </section>;
}
