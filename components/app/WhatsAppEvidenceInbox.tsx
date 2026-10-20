"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppNotice } from "./AppNotice";
import { AppSelect } from "./AppSelect";
import { appApi } from "./api";
import { WhatsAppNegotiationCard, type NegotiationSaveResult } from "./WhatsAppNegotiationCard";
import type { TripInsights } from "@/lib/bot/trip-insights";
import type { CommercialFacts } from "@/lib/channels/whatsapp/commercial-review";
import { formatEvidenceTimeRange } from "@/lib/channels/whatsapp/evidence-time";
import { evidencePreview, negotiationPreview } from "@/lib/channels/whatsapp/evidence-preview";

type Decision = { id: string; action: string; companyId: string; captureId: string | null; supplierId: string | null; productId: string | null; createdAt: string };
type Message = { id: string; sentAt: string; type: string; text: string | null; transcript: string | null; ocr: string | null; visual: string | null; facts: CommercialFacts; commercial: boolean; resolution: "pending" | "resolved" | "discarded" | "history"; decisions: Decision[]; mediaAvailable: boolean; storagePending: boolean };
type Evidence = { id: string; ownerUserId: string; discardCompanyId: string | null; association: { companyId: string; supplierId: string | null } | null; messages: Message[] };
type Props = { tripId: string; role: "ADMIN" | "TRAVELER"; suppliers: TripInsights["suppliers"]; captures: TripInsights["captures"]; products: TripInsights["products"]; companies: TripInsights["companies"]; onChanged?: () => Promise<void> };
const when = (value: string) => formatEvidenceTimeRange([value]);
const source = (type: string) => ({ AUDIO: "Audio", IMAGE: "Imagen", DOCUMENT: "Documento", TEXT: "Mensaje", VIDEO: "Video" })[type.toUpperCase() as "AUDIO" | "IMAGE" | "DOCUMENT" | "TEXT" | "VIDEO"] ?? "Mensaje";
const numeric = (value: string) => value.trim() ? Number(value.replace(",", ".")) : null;
const hasProductFacts = (facts: CommercialFacts) => Boolean(facts.productName || facts.category || facts.fob || facts.quotedPrice || facts.moq || facts.leadTime);

function FactSummary({ facts }: { facts: CommercialFacts }) {
  const rows = [
    ["Proveedor", facts.companyName], ["Ciudad", facts.city], ["Producto sugerido", facts.productName], ["Categoría", facts.category],
    ["FOB", facts.fob ? `${facts.fob.currency ?? "Moneda pendiente"} ${facts.fob.amount ?? "Importe pendiente"}${facts.fob.unit ? ` / ${facts.fob.unit}` : " · unidad pendiente"}` : null],
    ["Precio cotizado", facts.quotedPrice ? `${facts.quotedPrice.currency ?? "Moneda pendiente"} ${facts.quotedPrice.amount ?? "Importe pendiente"}${facts.quotedPrice.unit ? ` / ${facts.quotedPrice.unit}` : " · unidad pendiente"}` : null],
    ["MOQ", facts.moq ? `${facts.moq.quantity ?? "Cantidad pendiente"} ${facts.moq.unit ?? "(unidad pendiente)"}${facts.moq.notes ? ` · ${facts.moq.notes}` : ""}` : null],
    ["Plazo de entrega", facts.leadTime ? facts.leadTime.days !== null ? `${facts.leadTime.days} días` : facts.leadTime.rawText ?? "Pendiente" : null],
    ["Contacto", facts.contact], ["Notas", facts.notes],
  ].filter((row): row is string[] => Boolean(row[1]));
  if (!rows.length) return <p className="mt-3 text-sm text-ink-mute">No se extrajeron datos confiables. Revisá el original y decidí cómo registrarlo.</p>;
  return <dl className="mt-4 grid gap-2 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-xl bg-paper-soft px-3 py-2"><dt className="text-xs font-medium text-ink-mute">{label}</dt><dd className="mt-1 wrap-anywhere text-sm font-semibold">{value}</dd></div>)}</dl>;
}

function DiscardedGroupCard({ tripId, item, messages, onSaved }: { tripId: string; item: Evidence; messages: Message[]; onSaved: () => Promise<void> }) {
  const preview = negotiationPreview(messages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const companyId = messages.map((message) => message.decisions.at(-1)?.companyId).find((value): value is string => Boolean(value));
  async function recover() {
    if (!companyId) { setError("No encontramos la empresa asociada al descarte."); return; }
    setBusy(true); setError(null); requestId.current ??= crypto.randomUUID();
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/negotiation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: requestId.current, mode: "RECOVER", burstId: item.id, messageIds: messages.map((message) => message.id), companyId, fields: {} }) });
      requestId.current = null;
      try { await onSaved(); }
      catch { setError("La negociación quedó recuperada, pero no pudimos actualizar la vista. Recargá la página."); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos recuperar la negociación."); }
    finally { setBusy(false); }
  }
  return <article className="min-w-0 rounded-2xl border border-line bg-paper p-4 shadow-soft sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-ink-mute">Negociación · {messages.length} mensajes · {preview.kinds}</p><p className="mt-1 text-xs text-ink-mute">{formatEvidenceTimeRange(messages.map((message) => message.sentAt))}</p><h3 className="mt-1 wrap-anywhere text-base font-semibold sm:text-lg">{preview.title}</h3></div><span className="rounded-full bg-paper-soft px-3 py-1 text-xs font-semibold text-ink-mute">Descartada</span></div><p className="mt-2 wrap-anywhere text-sm text-ink-mute">{preview.summary}</p><p className="mt-2 text-xs text-ink-mute">Los originales siguen conservados.</p><details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Revisar fuentes</summary><ul className="mt-2 space-y-2">{messages.map((message) => <li key={message.id} className="wrap-anywhere rounded-xl bg-paper-soft p-3"><span className="font-semibold">{source(message.type)}</span> · {evidencePreview(message).summary}</li>)}</ul></details>{error ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}<button className="app-secondary-button mt-4 min-h-11" type="button" disabled={busy} onClick={() => void recover()}>{busy ? "Recuperando…" : "Recuperar negociación"}</button></article>;
}

function EvidenceCard({ tripId, role, item, message, suppliers, captures, products, companies, onSaved }: Props & { item: Evidence; message: Message; onSaved: (action: string) => Promise<void> }) {
  const lastDecision = message.decisions.at(-1);
  const discardCompanyId = item.discardCompanyId ?? lastDecision?.companyId ?? null;
  const preview = evidencePreview(message);
  const [expanded, setExpanded] = useState(false);
  const [companyId, setCompanyId] = useState(lastDecision?.companyId ?? item.association?.companyId ?? item.discardCompanyId ?? "");
  const [captureId, setCaptureId] = useState("");
  const [productId, setProductId] = useState("");
  const [action, setAction] = useState(message.resolution === "discarded" ? "RECOVER" : hasProductFacts(message.facts) ? "APPLY_PRODUCT" : "LINK_SUPPLIER");
  const [name, setName] = useState(message.facts.productName ?? "");
  const [category, setCategory] = useState(message.facts.category ?? "");
  const [supplierName, setSupplierName] = useState(message.facts.companyName ?? "");
  const [city, setCity] = useState(message.facts.city ?? "");
  const [contact, setContact] = useState(message.facts.contact ?? "");
  const [fobAmount, setFobAmount] = useState(message.facts.fob?.amount?.toString() ?? "");
  const [fobCurrency, setFobCurrency] = useState(message.facts.fob?.currency ?? "");
  const [fobUnit, setFobUnit] = useState(message.facts.fob?.unit ?? "");
  const [quoteAmount, setQuoteAmount] = useState(message.facts.quotedPrice?.amount?.toString() ?? "");
  const [quoteCurrency, setQuoteCurrency] = useState(message.facts.quotedPrice?.currency ?? "");
  const [quoteUnit, setQuoteUnit] = useState(message.facts.quotedPrice?.unit ?? "");
  const [moqQuantity, setMoqQuantity] = useState(message.facts.moq?.quantity?.toString() ?? "");
  const [moqUnit, setMoqUnit] = useState(message.facts.moq?.unit ?? "");
  const [leadDays, setLeadDays] = useState(message.facts.leadTime?.days?.toString() ?? "");
  const [notes, setNotes] = useState(message.facts.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const change = <T,>(setter: (value: T) => void, value: T) => { requestId.current = null; setter(value); };
  const availableCaptures = captures.filter((capture) => capture.companyId === companyId);
  const selectedSupplier = suppliers.find((supplier) => supplier.captureId === captureId);
  const availableProducts = products.filter((product) => product.captureId === captureId);
  const selectedProduct = availableProducts.find((product) => product.id === productId);
  const recordHref = captureId ? `/app/viajes/${encodeURIComponent(tripId)}/${role === "ADMIN" ? `admin/capturas/${encodeURIComponent(captureId)}` : selectedSupplier ? `proveedores/${encodeURIComponent(selectedSupplier.id)}` : `proveedores/nuevo?captureId=${encodeURIComponent(captureId)}`}` : null;

  async function discard() {
    if (!discardCompanyId || busy || persisted) return;
    if (!window.confirm("¿Descartar esta evidencia? El original se conservará y podrás recuperarla.")) return;
    setBusy(true); setError(null); requestId.current ??= crypto.randomUUID();
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/${encodeURIComponent(message.id)}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: requestId.current, action: "DISCARD", companyId: discardCompanyId }) });
      requestId.current = null; setPersisted(true);
      try { await onSaved("DISCARD"); }
      catch { setError("La evidencia quedó descartada, pero no pudimos actualizar la vista. Recargá la página."); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos descartar la evidencia. Podés reintentar."); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!companyId) { setError("Elegí una empresa del viaje."); return; }
    if (!["CREATE_SUPPLIER", "DISCARD", "RECOVER"].includes(action) && !captureId) { setError("Elegí el proveedor de destino."); return; }
    if (["APPLY_PRODUCT", "LINK_PRODUCT"].includes(action) && !productId) { setError("Elegí el producto de destino."); return; }
    if (action === "CREATE_PRODUCT" && !name.trim()) { setError("Escribí el nombre del producto."); return; }
    if (action === "CREATE_SUPPLIER" && !supplierName.trim()) { setError("Escribí el nombre del proveedor."); return; }
    if (action === "DISCARD" && !window.confirm("¿Descartar esta evidencia? El original y la trazabilidad se conservarán.")) return;
    setBusy(true); setError(null);
    try {
      const fields: Record<string, unknown> = {};
      if (action === "CREATE_PRODUCT" || action === "APPLY_PRODUCT") {
        if (action === "APPLY_PRODUCT" && name.trim() && name.trim() !== selectedProduct?.name) fields.name = name.trim();
        if (message.facts.category || category.trim()) fields.category = category.trim() || null;
        if (notes.trim()) fields.notes = notes.trim();
        if (fobAmount.trim() || fobCurrency.trim() || fobUnit.trim()) fields.fob = { amount: numeric(fobAmount), currency: fobCurrency.trim() || null, unit: fobUnit.trim() || null, rawText: "" };
        if (quoteAmount.trim() || quoteCurrency.trim() || quoteUnit.trim()) fields.quotedPrice = { amount: numeric(quoteAmount), currency: quoteCurrency.trim() || null, unit: quoteUnit.trim() || null, rawText: "" };
        if (moqQuantity.trim() || moqUnit.trim()) fields.moq = { quantity: numeric(moqQuantity), unit: moqUnit.trim() || null, notes: null, rawText: "" };
        if (leadDays.trim()) fields.leadTime = { days: numeric(leadDays), rawText: `${leadDays.trim()} días` };
      }
      requestId.current ??= crypto.randomUUID();
      const body = { id: requestId.current, action, companyId, captureId: captureId || undefined, supplierId: selectedSupplier?.id, productId: productId || undefined, expectedVersion: selectedProduct?.updatedAt, name: action === "CREATE_SUPPLIER" ? supplierName : name, city, contact, fields };
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/${encodeURIComponent(message.id)}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      requestId.current = null;
      setPersisted(true);
      try { await onSaved(action); }
      catch { setError("La decisión quedó guardada, pero no pudimos actualizar la vista. Recargá la página para ver el estado actual."); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar la decisión. Podés reintentar."); }
    finally { setBusy(false); }
  }

  const field = (label: string, value: string, setter: (value: string) => void, inputMode?: "decimal") => <label className="text-xs font-medium">{label}<input className="app-input mt-1" value={value} inputMode={inputMode} onChange={(event) => change(setter, event.target.value)} placeholder="Sin dato" /></label>;
  return <article className="min-w-0 rounded-2xl border border-line bg-paper p-4 shadow-soft sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold text-ink-mute">{source(message.type)} · {when(message.sentAt)}</p><h3 className="mt-1 wrap-anywhere text-base font-semibold sm:text-lg">{preview.title}</h3></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${message.resolution === "resolved" ? "bg-emerald-50 text-emerald-800" : message.resolution === "discarded" || message.resolution === "history" ? "bg-paper-soft text-ink-mute" : "bg-gold-soft text-gold-deep"}`}>{message.resolution === "resolved" ? "Resuelta" : message.resolution === "discarded" ? "Descartada" : message.resolution === "history" ? "Historial" : "Por resolver"}</span></div>
    <p className="mt-2 wrap-anywhere text-sm text-ink-mute">{preview.summary}</p>
    <div className="mt-3 flex flex-wrap gap-2"><button className="app-secondary-button min-h-11" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Cerrar detalles" : message.resolution === "pending" ? "Revisar / Resolver" : "Revisar detalles"}</button>{message.resolution === "pending" && !message.decisions.some((decision) => !["DISCARD", "RECOVER"].includes(decision.action)) && discardCompanyId ? <button className="app-secondary-button min-h-11 text-danger" type="button" disabled={busy || persisted} onClick={() => void discard()}>{busy ? "Descartando…" : "Descartar"}</button> : null}</div>
    {message.resolution === "pending" && !discardCompanyId ? <p className="mt-2 text-xs text-ink-mute">No hay una empresa verificada para este descarte. Podés revisar el original; el descarte requiere un contexto autorizado.</p> : null}
    {error && !expanded ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}
    {expanded ? <div className="mt-4 border-t border-line pt-4">
    <FactSummary facts={message.facts} />
    {message.facts.category && !message.facts.productName ? <p className="mt-3 text-xs text-ink-mute">La categoría no identifica por sí sola un producto. Escribí su nombre sólo si lo conocés.</p> : null}
    {message.text ? <p className="mt-3 whitespace-pre-wrap wrap-anywhere text-sm">{message.text}</p> : null}
    {message.transcript ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Revisar transcripción</summary><p className="mt-2 whitespace-pre-wrap wrap-anywhere">{message.transcript}</p></details> : null}
    {message.ocr ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Texto de la imagen</summary><p className="mt-2 whitespace-pre-wrap wrap-anywhere">{message.ocr}</p></details> : null}
    {message.visual && !message.ocr ? <p className="mt-3 whitespace-pre-wrap wrap-anywhere text-sm">Descripción de la imagen: {message.visual}</p> : null}
    {message.mediaAvailable ? <a className="mt-3 inline-block text-sm font-semibold text-nihao underline" href={`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/${encodeURIComponent(message.id)}/media`} target="_blank" rel="noreferrer">Abrir original privado</a> : message.storagePending ? <p className="mt-3 text-xs text-gold-deep">El archivo original todavía se está guardando.</p> : null}
    {item.messages.some((other) => other.id !== message.id && other.text && !other.commercial) ? <details className="mt-3 text-sm"><summary className="cursor-pointer text-ink-mute">Mensajes cercanos de la conversación</summary><ul className="mt-2 list-inside list-disc text-ink-mute">{item.messages.filter((other) => other.id !== message.id && other.text && !other.commercial).map((other) => <li key={other.id}>{other.text}</li>)}</ul></details> : null}
    {message.decisions.length ? <div className="mt-4 rounded-xl bg-nihao-soft p-3 text-sm"><p className="font-semibold">Decisiones guardadas</p>{message.decisions.map((decision) => <p key={decision.id} className="mt-1">{decision.action === "DISCARD" ? "Descartada" : decision.action === "RECOVER" ? "Recuperada para revisión" : decision.action === "CREATE_SUPPLIER" ? "Proveedor creado como borrador" : decision.action === "CREATE_PRODUCT" ? "Producto creado como borrador" : decision.action === "APPLY_PRODUCT" ? "Datos aplicados al producto" : "Vinculada al registro"} · {when(decision.createdAt)}</p>)}</div> : null}
    {message.resolution === "discarded" ? <div className="mt-5 border-t border-line pt-4"><h4 className="font-semibold">Evidencia descartada</h4><p className="mt-1 text-sm text-ink-mute">El original sigue conservado. Recuperala para volver a enviarla a Por resolver.</p>{error ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}<button className="app-secondary-button mt-4" type="button" disabled={busy || persisted} onClick={() => void save()}>{busy ? "Recuperando…" : persisted ? "Evidencia recuperada" : "Recuperar evidencia"}</button></div> : null}
    {message.commercial && message.resolution !== "discarded" ? <div className="mt-5 border-t border-line pt-4"><h4 className="font-semibold">{message.resolution === "pending" ? "Resolver esta información" : "Agregar otra vinculación"}</h4><p className="mt-1 text-sm text-ink-mute">Elegí el destino, corregí los datos y guardá. La resolución aparece sólo después del guardado.</p><p className="mt-2 text-xs font-medium text-ink-mute"><span aria-hidden="true" className="text-danger">*</span> Obligatorio</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><AppSelect label="Empresa del viaje *" ariaLabel="Empresa de la evidencia, obligatoria" searchable value={companyId} onValueChange={(value) => { change(setCompanyId, value); setCaptureId(""); setProductId(""); }} placeholder="Elegí empresa" options={companies.map((company) => ({ value: company.id, label: company.name }))} /><AppSelect label="Acción *" ariaLabel="Acción comercial, obligatoria" value={action} onValueChange={(value) => change(setAction, value)} options={[{ value: "APPLY_PRODUCT", label: "Aplicar datos a producto" }, { value: "CREATE_PRODUCT", label: "Crear producto en borrador" }, { value: "LINK_PRODUCT", label: "Vincular producto sin aplicar datos" }, { value: "LINK_SUPPLIER", label: "Vincular proveedor" }, { value: "CREATE_SUPPLIER", label: "Crear proveedor en borrador" }]} />
      {!["CREATE_SUPPLIER", "DISCARD"].includes(action) ? <AppSelect ariaLabel="Proveedor o borrador de destino" searchable value={captureId} onValueChange={(value) => { change(setCaptureId, value); setProductId(""); }} placeholder="Elegí proveedor" options={availableCaptures.map((capture) => ({ value: capture.id, label: capture.companyNameLatin ?? capture.companyName ?? "Proveedor pendiente", description: capture.status === "DRAFT" ? "Borrador" : "Confirmado" }))} /> : null}
      {["APPLY_PRODUCT", "LINK_PRODUCT"].includes(action) ? <AppSelect ariaLabel="Producto de destino" searchable value={productId} onValueChange={(value) => change(setProductId, value)} placeholder="Elegí producto" options={availableProducts.map((product) => ({ value: product.id, label: product.name, description: product.status === "DRAFT" ? "Borrador" : "Confirmado" }))} /> : null}</div>
      {action === "CREATE_SUPPLIER" ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{field("Nombre del proveedor *", supplierName, setSupplierName)}{field("Ciudad · Opcional", city, setCity)}<div className="sm:col-span-2">{field("Contacto · Opcional", contact, setContact)}</div><p className="text-xs text-ink-mute sm:col-span-2">Se guarda como borrador. Para confirmarlo después necesitarás un contacto válido.</p></div> : null}
      {["APPLY_PRODUCT", "CREATE_PRODUCT"].includes(action) ? <div className="mt-3 grid gap-3 rounded-xl bg-paper-soft p-3 sm:grid-cols-3"><div className="sm:col-span-3">{field(action === "CREATE_PRODUCT" ? "Nombre del nuevo producto" : "Nombre (sólo si querés corregirlo)", name, setName)}</div><div className="sm:col-span-3">{field("Categoría (si corresponde)", category, setCategory)}</div>{field("Precio cotizado", quoteAmount, setQuoteAmount, "decimal")}{field("Moneda del precio", quoteCurrency, setQuoteCurrency)}{field("Unidad del precio", quoteUnit, setQuoteUnit)}{field("FOB explícito", fobAmount, setFobAmount, "decimal")}{field("Moneda FOB", fobCurrency, setFobCurrency)}{field("Unidad FOB", fobUnit, setFobUnit)}{field("MOQ", moqQuantity, setMoqQuantity, "decimal")}{field("Unidad MOQ", moqUnit, setMoqUnit)}{field("Plazo en días", leadDays, setLeadDays, "decimal")}<label className="text-xs font-medium sm:col-span-3">Notas y condiciones<textarea className="app-input mt-1 min-h-20" value={notes} onChange={(event) => change(setNotes, event.target.value)} /></label></div> : null}
      {(["LINK_SUPPLIER", "LINK_PRODUCT", "CREATE_SUPPLIER"].includes(action) && hasProductFacts(message.facts)) ? <p className="mt-3 text-xs text-gold-deep">La evidencia seguirá pendiente hasta que los datos del producto se apliquen o se descarten explícitamente.</p> : null}
      {error ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}
      {(!companyId || (!["CREATE_SUPPLIER", "DISCARD"].includes(action) && !captureId) || (["APPLY_PRODUCT", "LINK_PRODUCT"].includes(action) && !productId) || (action === "CREATE_PRODUCT" && !name.trim()) || (action === "CREATE_SUPPLIER" && !supplierName.trim())) ? <p className="mt-3 text-sm text-ink-mute">Para guardar, completá los campos marcados y elegí los destinos requeridos.</p> : null}
      <div className="mt-4 flex flex-wrap gap-2"><button className="app-primary-button" type="button" disabled={busy || persisted} onClick={() => void save()}>{busy ? "Guardando…" : persisted ? "Decisión guardada" : action === "DISCARD" ? "Confirmar descarte" : "Guardar decisión"}</button>{recordHref ? <Link href={recordHref} className="app-secondary-button">Abrir proveedor</Link> : null}</div>
    </div> : null}
    </div> : null}
  </article>;
}

export function WhatsAppEvidenceInbox(props: Props) {
  const { tripId } = props;
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "resolved" | "discarded" | "history">("pending");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [savedNegotiation, setSavedNegotiation] = useState<NegotiationSaveResult | null>(null);
  const [savedAction, setSavedAction] = useState<string | null>(null);
  const load = useCallback(async () => { try { setError(null); const result = await appApi<{ evidence: Evidence[] }>(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence`); setEvidence(result.evidence); } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos consultar las evidencias"); } finally { setLoading(false); } }, [tripId]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const items = evidence.flatMap((item) => item.messages.map((message) => ({ item, message })));
  const groupedBursts = new Set(evidence.filter((item) => item.messages.filter((message) => message.resolution === "pending").length > 1).map((item) => item.id));
  const groupedDiscardedBursts = new Set(evidence.filter((item) => {
    const discarded = item.messages.filter((message) => message.resolution === "discarded");
    return discarded.length > 1 && new Set(discarded.map((message) => message.decisions.at(-1)?.companyId)).size === 1;
  }).map((item) => item.id));
  const pending = items.filter(({ item, message }) => message.resolution === "pending" && !groupedBursts.has(item.id)).length + groupedBursts.size;
  const shown = items.filter(({ item, message }) => (tab === "history" || message.resolution === tab) && (!type || message.type.toUpperCase() === type) && (!search || [message.text, message.transcript, message.ocr, message.visual, message.facts.companyName, message.facts.productName, message.facts.category, props.companies.find((company) => company.id === item.association?.companyId)?.name, ...message.decisions.map((decision) => props.companies.find((company) => company.id === decision.companyId)?.name)].filter(Boolean).join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const groupedShown = tab === "pending" ? evidence.filter((item) => groupedBursts.has(item.id) && shown.some((entry) => entry.item.id === item.id)) : [];
  const groupedDiscardedShown = tab === "discarded" ? evidence.filter((item) => groupedDiscardedBursts.has(item.id) && shown.some((entry) => entry.item.id === item.id)) : [];
  const individualShown = shown.filter(({ item }) => tab === "pending" ? !groupedBursts.has(item.id) : tab === "discarded" ? !groupedDiscardedBursts.has(item.id) : true);
  const saved = async (action: string) => { setSavedAction(action); await Promise.all([load(), props.onChanged?.()]); };
  const negotiationSaved = async (result: NegotiationSaveResult) => {
    setSavedNegotiation(result);
    await Promise.all([load(), props.onChanged?.()]);
  };
  const savedSupplier = savedNegotiation ? props.suppliers.find((supplier) => supplier.captureId === savedNegotiation.captureId) : null;
  const savedHref = savedNegotiation?.captureId
    ? `/app/viajes/${encodeURIComponent(tripId)}/${props.role === "ADMIN" ? `admin/capturas/${encodeURIComponent(savedNegotiation.captureId)}` : savedSupplier ? `proveedores/${encodeURIComponent(savedSupplier.id)}` : `proveedores/nuevo?captureId=${encodeURIComponent(savedNegotiation.captureId)}${savedNegotiation.productId ? `&productId=${encodeURIComponent(savedNegotiation.productId)}` : ""}`}`
    : null;
  return <section className="mt-5" aria-labelledby="whatsapp-evidence-heading"><div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="whatsapp-evidence-heading" className="text-2xl">Evidencias de WhatsApp</h2><p className="mt-1 text-sm text-ink-mute">Revisá cada fuente y convertí sus datos en registros comerciales.</p></div><span className="rounded-full bg-gold-soft px-3 py-1 text-sm font-semibold text-gold-deep">{pending} por resolver</span></div>
    <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Estado de evidencias">{([["pending", `Por resolver (${pending})`], ["resolved", "Resueltas"], ["discarded", "Descartadas"], ["history", "Historial"]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${tab === value ? "bg-nihao text-white" : "border border-line bg-paper-soft text-ink"}`}>{label}</button>)}</div>
    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_12rem]"><label className="sr-only" htmlFor="evidence-search">Buscar evidencia</label><input id="evidence-search" className="app-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar empresa, proveedor o contenido" /><AppSelect ariaLabel="Filtrar tipo de evidencia" clearable value={type} onValueChange={setType} placeholder="Todos los tipos" options={[{ value: "AUDIO", label: "Audio" }, { value: "IMAGE", label: "Imagen" }, { value: "TEXT", label: "Texto" }, { value: "DOCUMENT", label: "Documento" }]} /></div>
    {savedNegotiation ? <AppNotice tone="success" className="mt-4">{savedNegotiation.mode === "DISCARD" ? "La selección quedó descartada y sus originales siguen en Historial." : <>Información guardada. {savedNegotiation.supplierCreated ? "Proveedor guardado como borrador." : "Proveedor vinculado."} {savedNegotiation.mode === "SUPPLIER" ? "No se creó ningún producto." : savedNegotiation.productCreated ? "Producto guardado como borrador." : "Datos aplicados al producto elegido."} {savedHref ? <Link href={savedHref} className="ml-1 font-semibold underline">Ver resultado</Link> : null}</>}</AppNotice> : null}
    {savedAction ? <AppNotice tone="success" className="mt-4">{savedAction === "DISCARD" ? "Evidencia descartada. El original se conserva y podés recuperarla en Descartadas." : savedAction === "RECOVER" ? "Evidencia recuperada para revisión." : "Decisión guardada y evidencia actualizada."}</AppNotice> : null}
    {error ? <div className="mt-4"><AppNotice tone="error">{error}</AppNotice><button type="button" onClick={() => void load()} className="app-secondary-button mt-3">Reintentar</button></div> : null}
    {loading ? <p className="mt-5 rounded-xl bg-paper-soft p-4 text-sm text-ink-mute">Cargando evidencias…</p> : null}
    {!loading && !error && !individualShown.length && !groupedShown.length && !groupedDiscardedShown.length ? <p className="mt-5 rounded-xl bg-paper-soft p-6 text-sm text-ink-mute">{tab === "pending" ? "No hay evidencias comerciales pendientes con estos filtros." : "No hay mensajes en esta vista con estos filtros."}</p> : null}
    <div className="mt-5 grid min-w-0 gap-4">{groupedShown.map((item) => <WhatsAppNegotiationCard key={`${item.id}:${item.messages.filter((message) => message.resolution === "pending").map((message) => message.id).join(",")}`} {...props} burstId={item.id} discardCompanyId={item.discardCompanyId} messages={item.messages.filter((message) => message.resolution === "pending")} onSaved={negotiationSaved} />)}{groupedDiscardedShown.map((item) => <DiscardedGroupCard key={`discarded:${item.id}`} tripId={tripId} item={item} messages={item.messages.filter((message) => message.resolution === "discarded")} onSaved={() => saved("RECOVER")} />)}{individualShown.map(({ item, message }) => <EvidenceCard key={message.id} {...props} item={item} message={message} onSaved={saved} />)}</div>
  </section>;
}
