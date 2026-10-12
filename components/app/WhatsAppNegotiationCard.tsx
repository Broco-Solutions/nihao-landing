"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { CommercialFacts } from "@/lib/channels/whatsapp/commercial-review";
import type { TripInsights } from "@/lib/bot/trip-insights";
import { AppNotice } from "./AppNotice";
import { AppSelect } from "./AppSelect";
import { appApi } from "./api";

type Message = { id: string; sentAt: string; type: string; text: string | null; facts: CommercialFacts; resolution: string; mediaAvailable: boolean };
export type NegotiationSaveResult = { captureId: string; productId: string; supplierCreated: boolean; productCreated: boolean };
type Props = { tripId: string; role: "ADMIN" | "TRAVELER"; burstId: string; messages: Message[]; suppliers: TripInsights["suppliers"]; captures: TripInsights["captures"]; products: TripInsights["products"]; companies: TripInsights["companies"]; onSaved: (result: NegotiationSaveResult) => Promise<void> };
const decimal = (value: string) => value.trim() ? Number(value.replace(",", ".")) : null;

export function WhatsAppNegotiationCard({ tripId, role, burstId, messages, captures, products, companies, onSaved }: Props) {
  const initialNames = [...new Set(messages.map((message) => message.facts.companyName).filter((name): name is string => Boolean(name)))];
  const initialCategories = [...new Set(messages.map((message) => message.facts.category).filter((name): name is string => Boolean(name)))];
  const ambiguous = initialNames.length > 1 || initialCategories.length > 1;
  const matched = initialNames.length === 1 ? captures.filter((capture) => (capture.companyNameLatin ?? capture.companyName ?? "").toLocaleLowerCase() === initialNames[0].toLocaleLowerCase()) : [];
  const initialCapture = matched.length === 1 ? matched[0] : null;
  const [selected, setSelected] = useState<string[]>(ambiguous ? [] : messages.map((message) => message.id));
  const [companyId, setCompanyId] = useState(initialCapture?.companyId ?? (companies.length === 1 ? companies[0].id : ""));
  const [captureId, setCaptureId] = useState(initialCapture?.id ?? "");
  const [supplierName, setSupplierName] = useState(initialNames.length === 1 ? initialNames[0] : "");
  const [city, setCity] = useState(messages.find((message) => message.facts.city)?.facts.city ?? "");
  const [contact, setContact] = useState(messages.find((message) => message.facts.contact)?.facts.contact ?? "");
  const [productId, setProductId] = useState("");
  const [name, setName] = useState(messages.find((message) => message.facts.productName)?.facts.productName ?? (initialCategories.length === 1 ? initialCategories[0][0].toUpperCase() + initialCategories[0].slice(1) : ""));
  const [category, setCategory] = useState(initialCategories.length === 1 ? initialCategories[0] : "");
  const [quoteAmount, setQuoteAmount] = useState(messages.find((message) => message.facts.quotedPrice)?.facts.quotedPrice?.amount?.toString() ?? "");
  const [quoteCurrency, setQuoteCurrency] = useState(messages.find((message) => message.facts.quotedPrice)?.facts.quotedPrice?.currency ?? "");
  const [quoteUnit, setQuoteUnit] = useState(messages.find((message) => message.facts.quotedPrice)?.facts.quotedPrice?.unit ?? "");
  const [moqQuantity, setMoqQuantity] = useState(messages.find((message) => message.facts.moq)?.facts.moq?.quantity?.toString() ?? "");
  const [moqUnit, setMoqUnit] = useState(messages.find((message) => message.facts.moq)?.facts.moq?.unit ?? "");
  const [fobAmount, setFobAmount] = useState(messages.find((message) => message.facts.fob)?.facts.fob?.amount?.toString() ?? "");
  const [fobCurrency, setFobCurrency] = useState(messages.find((message) => message.facts.fob)?.facts.fob?.currency ?? "");
  const [fobUnit, setFobUnit] = useState(messages.find((message) => message.facts.fob)?.facts.fob?.unit ?? "");
  const [leadDays, setLeadDays] = useState(messages.find((message) => message.facts.leadTime)?.facts.leadTime?.days?.toString() ?? "");
  const [notes, setNotes] = useState(messages.find((message) => message.facts.notes)?.facts.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ captureId: string; productId: string } | null>(null);
  const requestId = useRef<string | null>(null);
  const changed = () => { requestId.current = null; setSaved(null); };
  const availableCaptures = captures.filter((capture) => capture.companyId === companyId);
  const availableProducts = products.filter((product) => product.captureId === captureId);
  const existingProduct = availableProducts.find((product) => product.id === productId);
  const input = (label: string, value: string, set: (value: string) => void, mode?: "decimal") => <label className="text-xs font-medium">{label}<input className="app-input mt-1" value={value} inputMode={mode} onChange={(event) => { changed(); set(event.target.value); }} placeholder="Sin dato" /></label>;

  async function save() {
    if (!selected.length || !companyId || !name.trim() || !captureId && !supplierName.trim()) { setError("Elegí los mensajes, la empresa, el proveedor y el producto."); return; }
    setBusy(true); setError(null);
    try {
      const fields: Record<string, unknown> = { name: name.trim() };
      if (category.trim()) fields.category = category.trim();
      if (quoteAmount.trim()) fields.quotedPrice = { amount: decimal(quoteAmount), currency: quoteCurrency.trim() || null, unit: quoteUnit.trim() || null, rawText: "" };
      if (moqQuantity.trim()) fields.moq = { quantity: decimal(moqQuantity), unit: moqUnit.trim() || null, notes: null, rawText: "" };
      if (fobAmount.trim()) fields.fob = { amount: decimal(fobAmount), currency: fobCurrency.trim() || null, unit: fobUnit.trim() || null, rawText: "" };
      if (leadDays.trim()) fields.leadTime = { days: decimal(leadDays), rawText: `${leadDays.trim()} días` };
      if (notes.trim()) fields.notes = notes.trim();
      requestId.current ??= crypto.randomUUID();
      const result = await appApi<{ captureId: string; productId: string }>(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/negotiation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: requestId.current, burstId, messageIds: selected, companyId, ...(captureId ? { captureId } : { newSupplier: { name: supplierName.trim(), city: city.trim(), contact: contact.trim() } }), ...(productId ? { productId, expectedProductVersion: existingProduct?.updatedAt } : { createProduct: true }), fields }) });
      setSaved(result); requestId.current = null;
      try { await onSaved({ ...result, supplierCreated: !captureId, productCreated: !productId }); } catch { setError("La negociación se guardó. Recargá la página para ver el estado actualizado."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar la negociación. Podés reintentar."); }
    finally { setBusy(false); }
  }
  const recordHref = saved ? `/app/viajes/${encodeURIComponent(tripId)}/${role === "ADMIN" ? `admin/capturas/${encodeURIComponent(saved.captureId)}` : `proveedores/nuevo?captureId=${encodeURIComponent(saved.captureId)}&productId=${encodeURIComponent(saved.productId)}`}` : null;
  return <article className="rounded-2xl border border-line bg-paper p-4 shadow-soft sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-ink-mute">Conversación comercial · {messages.length} fuentes</p><h3 className="mt-1 text-lg font-semibold">{initialNames.length === 1 ? initialNames[0] : "Revisar negociación"}</h3></div><span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold-deep">Por resolver</span></div>
    <p className="mt-2 text-sm text-ink-mute">Revisá qué mensajes corresponden a este proveedor y producto. Guardás todo junto y cada dato conserva su fuente.</p>
    {ambiguous ? <AppNotice tone="warning" className="mt-3">Hay nombres o categorías diferentes en el mismo lote. Elegí sólo los mensajes de esta negociación.</AppNotice> : null}
    <div className="mt-4 space-y-2">{messages.map((message) => <label key={message.id} className="flex gap-3 rounded-xl bg-paper-soft p-3 text-sm"><input type="checkbox" checked={selected.includes(message.id)} onChange={(event) => { changed(); setSelected((current) => event.target.checked ? [...current, message.id] : current.filter((id) => id !== message.id)); }} /><span><span className="font-semibold">{message.type === "IMAGE" ? "Fotografía" : message.type === "AUDIO" ? "Audio" : "Mensaje"}</span> · {message.text ?? (message.type === "IMAGE" ? "Original privado" : "Transcripción disponible en Historial")}{message.mediaAvailable ? <a className="ml-2 font-semibold text-nihao underline" href={`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/${encodeURIComponent(message.id)}/media`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Abrir original</a> : null}</span></label>)}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><AppSelect ariaLabel="Empresa de la negociación" searchable value={companyId} onValueChange={(value) => { changed(); setCompanyId(value); setCaptureId(""); setProductId(""); }} placeholder="Elegí empresa" options={companies.map((company) => ({ value: company.id, label: company.name }))} /><AppSelect ariaLabel="Proveedor existente o borrador" searchable clearable value={captureId} onValueChange={(value) => { changed(); setCaptureId(value); setProductId(""); }} placeholder="Crear proveedor nuevo" options={availableCaptures.map((capture) => ({ value: capture.id, label: capture.companyNameLatin ?? capture.companyName ?? "Proveedor pendiente", description: capture.status === "DRAFT" ? "Borrador" : "Confirmado" }))} /></div>
    {!captureId ? <div className="mt-3 grid gap-3 sm:grid-cols-3">{input("Proveedor", supplierName, setSupplierName)}{input("Ciudad", city, setCity)}{input("Contacto, si se conoce", contact, setContact)}</div> : null}
    {captureId ? <div className="mt-3"><AppSelect ariaLabel="Producto existente" searchable clearable value={productId} onValueChange={(value) => { changed(); setProductId(value); }} placeholder="Crear producto genérico" options={availableProducts.map((product) => ({ value: product.id, label: product.name, description: product.status === "DRAFT" ? "Borrador" : "Confirmado" }))} /></div> : null}
    <div className="mt-4 grid gap-3 rounded-xl bg-paper-soft p-3 sm:grid-cols-3"><div className="sm:col-span-2">{input("Producto o categoría genérica", name, setName)}</div>{input("Categoría", category, setCategory)}{input("Precio cotizado", quoteAmount, setQuoteAmount, "decimal")}{input("Moneda del precio", quoteCurrency, setQuoteCurrency)}{input("Unidad del precio", quoteUnit, setQuoteUnit)}{input("MOQ", moqQuantity, setMoqQuantity, "decimal")}{input("Unidad MOQ (si fue indicada)", moqUnit, setMoqUnit)}{input("Plazo en días", leadDays, setLeadDays, "decimal")}{input("FOB explícito", fobAmount, setFobAmount, "decimal")}{input("Moneda FOB", fobCurrency, setFobCurrency)}{input("Unidad FOB", fobUnit, setFobUnit)}<label className="text-xs font-medium sm:col-span-3">Notas<textarea className="app-input mt-1 min-h-20" value={notes} onChange={(event) => { changed(); setNotes(event.target.value); }} /></label></div>
    <p className="mt-2 text-xs text-ink-mute">Completá FOB sólo si la fuente lo indica explícitamente. El precio cotizado queda separado; la unidad MOQ queda pendiente si no fue expresada.</p>
    {error ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}
    <div className="mt-4 flex flex-wrap gap-2"><button className="app-primary-button" type="button" disabled={busy || Boolean(saved) || !selected.length || !companyId || !name.trim()} onClick={() => void save()}>{busy ? "Guardando…" : saved ? "Negociación guardada" : "Guardar negociación"}</button>{recordHref ? <Link href={recordHref} className="app-secondary-button">Ver proveedor y producto</Link> : null}</div>
  </article>;
}
