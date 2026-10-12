"use client";

import { useMemo, useRef, useState } from "react";
import type { CommercialFacts } from "@/lib/channels/whatsapp/commercial-review";
import type { TripInsights } from "@/lib/bot/trip-insights";
import { AppNotice } from "./AppNotice";
import { AppSelect } from "./AppSelect";
import { appApi } from "./api";

type Message = { id: string; sentAt: string; type: string; text: string | null; facts: CommercialFacts; resolution: string; mediaAvailable: boolean };
type SaveMode = "SUPPLIER" | "PRODUCT" | "DISCARD";
export type NegotiationSaveResult = { mode: SaveMode; captureId: string | null; productId: string | null; supplierCreated: boolean; productCreated: boolean };
type Props = { tripId: string; role: "ADMIN" | "TRAVELER"; burstId: string; messages: Message[]; suppliers: TripInsights["suppliers"]; captures: TripInsights["captures"]; products: TripInsights["products"]; companies: TripInsights["companies"]; onSaved: (result: NegotiationSaveResult) => Promise<void> };
const decimal = (value: string) => value.trim() ? Number(value.replace(",", ".")) : null;

export function WhatsAppNegotiationCard({ tripId, burstId, messages, captures, products, companies, onSaved }: Props) {
  const initialNames = useMemo(() => [...new Set(messages.map((message) => message.facts.companyName).filter((name): name is string => Boolean(name)))], [messages]);
  const initialCategories = useMemo(() => [...new Set(messages.map((message) => message.facts.category).filter((name): name is string => Boolean(name)))], [messages]);
  const hasProducts = messages.some((message) => Boolean(message.facts.productName || message.facts.category || message.facts.fob || message.facts.quotedPrice || message.facts.moq || message.facts.leadTime));
  const ambiguous = initialNames.length > 1 || initialCategories.length > 1;
  const matched = initialNames.length === 1 ? captures.filter((capture) => (capture.companyNameLatin ?? capture.companyName ?? "").toLocaleLowerCase() === initialNames[0].toLocaleLowerCase()) : [];
  const initialCapture = matched.length === 1 ? matched[0] : null;
  const [selected, setSelected] = useState<string[]>(ambiguous ? [] : messages.map((message) => message.id));
  const [saveMode, setSaveMode] = useState<"SUPPLIER" | "PRODUCT">(hasProducts ? "PRODUCT" : "SUPPLIER");
  const [supplierMode, setSupplierMode] = useState<"EXISTING" | "NEW">(initialCapture ? "EXISTING" : "NEW");
  const [productMode, setProductMode] = useState<"EXISTING" | "NEW">("NEW");
  const [companyId, setCompanyId] = useState(initialCapture?.companyId ?? (companies.length === 1 ? companies[0].id : ""));
  const [captureId, setCaptureId] = useState(initialCapture?.id ?? "");
  const [supplierName, setSupplierName] = useState(initialNames.length === 1 ? initialNames[0] : "");
  const [city, setCity] = useState(messages.find((message) => message.facts.city)?.facts.city ?? "");
  const [contact, setContact] = useState(messages.find((message) => message.facts.contact)?.facts.contact ?? "");
  const [productId, setProductId] = useState("");
  const [name, setName] = useState(messages.find((message) => message.facts.productName)?.facts.productName ?? (initialCategories.length === 1 ? `${initialCategories[0][0].toUpperCase()}${initialCategories[0].slice(1)}` : ""));
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
  const [saved, setSaved] = useState(false);
  const requestId = useRef<string | null>(null);
  const supplierNameRef = useRef<HTMLInputElement>(null);
  const productNameRef = useRef<HTMLInputElement>(null);
  const changed = () => { requestId.current = null; setSaved(false); setError(null); };
  const availableCaptures = captures.filter((capture) => capture.companyId === companyId);
  const availableProducts = products.filter((product) => product.captureId === captureId);
  const existingProduct = availableProducts.find((product) => product.id === productId);
  const requirement = !selected.length ? "Elegí al menos una fuente." : !companyId ? "Elegí la empresa del viaje." : supplierMode === "EXISTING" && !captureId ? "Elegí un proveedor existente." : supplierMode === "NEW" && !supplierName.trim() ? "Escribí el nombre del proveedor nuevo." : saveMode === "PRODUCT" && productMode === "EXISTING" && !productId ? "Elegí el producto existente." : saveMode === "PRODUCT" && productMode === "NEW" && !name.trim() ? "Escribí el nombre del producto nuevo." : null;
  const input = (label: string, value: string, set: (value: string) => void, options?: { decimal?: boolean; required?: boolean; inputRef?: React.Ref<HTMLInputElement> }) => <label className="text-xs font-medium">{label}{options?.required ? <span aria-hidden="true" className="text-danger"> *</span> : <span className="font-normal text-ink-mute"> · Opcional</span>}<input ref={options?.inputRef} className="app-input mt-1" value={value} inputMode={options?.decimal ? "decimal" : undefined} required={options?.required} aria-required={options?.required} onChange={(event) => { changed(); set(event.target.value); }} placeholder={options?.required ? "Obligatorio" : "Sin dato"} /></label>;

  async function submit(mode: SaveMode) {
    if (mode !== "DISCARD" && requirement) {
      setError(requirement);
      if (supplierMode === "NEW" && !supplierName.trim()) supplierNameRef.current?.focus();
      else if (saveMode === "PRODUCT" && productMode === "NEW" && !name.trim()) productNameRef.current?.focus();
      return;
    }
    if (!selected.length || !companyId) { setError(!selected.length ? "Elegí al menos una fuente." : "Elegí la empresa del viaje."); return; }
    if (mode === "DISCARD" && !window.confirm("¿Descartar toda la negociación seleccionada? Los originales y la trazabilidad se conservarán.")) return;
    setBusy(true); setError(null);
    try {
      const fields: Record<string, unknown> = {};
      if (mode === "PRODUCT") {
        if (productMode === "NEW" || name.trim() && name.trim() !== existingProduct?.name) fields.name = name.trim();
        if (category.trim()) fields.category = category.trim();
        if (quoteAmount.trim()) fields.quotedPrice = { amount: decimal(quoteAmount), currency: quoteCurrency.trim() || null, unit: quoteUnit.trim() || null, rawText: "" };
        if (moqQuantity.trim()) fields.moq = { quantity: decimal(moqQuantity), unit: moqUnit.trim() || null, notes: null, rawText: "" };
        if (fobAmount.trim()) fields.fob = { amount: decimal(fobAmount), currency: fobCurrency.trim() || null, unit: fobUnit.trim() || null, rawText: "" };
        if (leadDays.trim()) fields.leadTime = { days: decimal(leadDays), rawText: `${leadDays.trim()} días` };
        if (notes.trim()) fields.notes = notes.trim();
      }
      requestId.current ??= crypto.randomUUID();
      const result = await appApi<{ mode: SaveMode; captureId: string | null; productId: string | null }>(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/negotiation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: requestId.current, mode, burstId, messageIds: selected, companyId, ...(mode !== "DISCARD" && (supplierMode === "EXISTING" ? { captureId } : { newSupplier: { name: supplierName.trim(), city: city.trim(), contact: contact.trim() } })), ...(mode === "PRODUCT" && (productMode === "EXISTING" ? { productId, expectedProductVersion: existingProduct?.updatedAt } : { createProduct: true })), fields }) });
      setSaved(true); requestId.current = null;
      await onSaved({ ...result, supplierCreated: mode !== "DISCARD" && supplierMode === "NEW", productCreated: mode === "PRODUCT" && productMode === "NEW" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar la decisión. Podés reintentar."); }
    finally { setBusy(false); }
  }

  const choices: Array<["EXISTING" | "NEW", string, string]> = [["EXISTING", "Elegir proveedor existente", "Buscar entre borradores y confirmados"], ["NEW", "Crear proveedor nuevo", "Guardar un borrador en esta ficha"]];
  return <article className="rounded-2xl border border-line bg-paper p-4 shadow-soft sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-ink-mute">Conversación comercial · {messages.length} fuentes</p><h3 className="mt-1 text-lg font-semibold">{initialNames.length === 1 ? initialNames[0] : "Revisar negociación"}</h3></div><span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold-deep">Por resolver</span></div>
    <p className="mt-2 text-sm text-ink-mute">Elegí las fuentes de la misma tarea. Podés guardar sólo el proveedor, completar la negociación o descartar lo irrelevante.</p>
    {ambiguous ? <AppNotice tone="warning" className="mt-3">Hay nombres o categorías diferentes. Seleccioná únicamente las fuentes que correspondan entre sí.</AppNotice> : null}
    <div className="mt-4 space-y-2">{messages.map((message) => <label key={message.id} className="flex min-h-12 gap-3 rounded-xl bg-paper-soft p-3 text-sm"><input type="checkbox" checked={selected.includes(message.id)} onChange={(event) => { changed(); setSelected((current) => event.target.checked ? [...current, message.id] : current.filter((id) => id !== message.id)); }} /><span><span className="font-semibold">{message.type === "IMAGE" ? "Fotografía" : message.type === "AUDIO" ? "Audio" : "Mensaje"}</span> · {message.text ?? (message.type === "IMAGE" ? "Original privado" : "Transcripción disponible en Historial")}{message.mediaAvailable ? <a className="ml-2 font-semibold text-nihao underline" href={`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/${encodeURIComponent(message.id)}/media`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Abrir original</a> : null}</span></label>)}</div>
    <p className="mt-4 text-xs font-medium text-ink-mute"><span aria-hidden="true" className="text-danger">*</span> Obligatorio</p>
    <div className="mt-2"><AppSelect label="Empresa del viaje *" ariaLabel="Empresa del viaje, obligatoria" searchable value={companyId} onValueChange={(value) => { changed(); setCompanyId(value); setCaptureId(""); setProductId(""); }} placeholder="Elegí empresa" options={companies.map((company) => ({ value: company.id, label: company.name }))} /></div>
    <fieldset className="mt-4"><legend className="text-sm font-semibold">Destino del proveedor *</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{choices.map(([value, title, description]) => <label key={value} className={`min-h-14 rounded-xl border p-3 ${supplierMode === value ? "border-nihao bg-nihao-soft" : "border-line bg-paper"}`}><input className="mr-2" type="radio" name={`supplier-${burstId}`} checked={supplierMode === value} onChange={() => { changed(); setSupplierMode(value); setCaptureId(""); }} /><span className="text-sm font-semibold">{title}</span><span className="ml-6 block text-xs text-ink-mute">{description}</span></label>)}</div></fieldset>
    {supplierMode === "EXISTING" ? <div className="mt-3"><AppSelect label="Proveedor existente *" ariaLabel="Proveedor existente, obligatorio" searchable value={captureId} onValueChange={(value) => { changed(); setCaptureId(value); setProductId(""); }} placeholder="Buscar proveedor" searchPlaceholder="Buscar por nombre o estado" options={availableCaptures.map((capture) => ({ value: capture.id, label: capture.companyNameLatin ?? capture.companyName ?? "Proveedor pendiente", description: capture.status === "DRAFT" ? "Borrador" : "Confirmado" }))} /></div> : <div className="mt-3 grid gap-3 rounded-xl bg-paper-soft p-3 sm:grid-cols-3">{input("Nombre del proveedor", supplierName, setSupplierName, { required: true, inputRef: supplierNameRef })}{input("Ciudad", city, setCity)}{input("Contacto", contact, setContact)}<p className="text-xs text-ink-mute sm:col-span-3">Se guardará como borrador. Para confirmarlo después necesitarás un contacto válido.</p></div>}
    <fieldset className="mt-4"><legend className="text-sm font-semibold">Qué querés guardar *</legend><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className={`rounded-xl border p-3 ${saveMode === "SUPPLIER" ? "border-nihao bg-nihao-soft" : "border-line"}`}><input className="mr-2" type="radio" name={`save-${burstId}`} checked={saveMode === "SUPPLIER"} onChange={() => { changed(); setSaveMode("SUPPLIER"); }} /><span className="text-sm font-semibold">Sólo proveedor</span><span className="ml-6 block text-xs text-ink-mute">Para una tarjeta sin producto.</span></label><label className={`rounded-xl border p-3 ${saveMode === "PRODUCT" ? "border-nihao bg-nihao-soft" : "border-line"}`}><input className="mr-2" type="radio" name={`save-${burstId}`} checked={saveMode === "PRODUCT"} onChange={() => { changed(); setSaveMode("PRODUCT"); }} /><span className="text-sm font-semibold">Proveedor y producto</span><span className="ml-6 block text-xs text-ink-mute">Aplica las condiciones revisadas.</span></label></div></fieldset>
    {saveMode === "PRODUCT" ? <><fieldset className="mt-4"><legend className="text-sm font-semibold">Destino del producto *</legend><div className="mt-2 flex flex-wrap gap-4 text-sm"><label><input className="mr-2" type="radio" name={`product-${burstId}`} checked={productMode === "EXISTING"} onChange={() => { changed(); setProductMode("EXISTING"); }} />Elegir existente</label><label><input className="mr-2" type="radio" name={`product-${burstId}`} checked={productMode === "NEW"} onChange={() => { changed(); setProductMode("NEW"); }} />Crear producto nuevo</label></div></fieldset>
      {productMode === "EXISTING" ? <div className="mt-3"><AppSelect label="Producto existente *" ariaLabel="Producto existente, obligatorio" searchable value={productId} onValueChange={(value) => { changed(); setProductId(value); const product = availableProducts.find((item) => item.id === value); if (product) setName(product.name); }} placeholder={captureId ? "Buscar producto" : "Primero elegí el proveedor"} disabled={!captureId} options={availableProducts.map((product) => ({ value: product.id, label: product.name, description: product.status === "DRAFT" ? "Borrador" : "Confirmado" }))} /></div> : null}
      <div className="mt-4 grid gap-3 rounded-xl bg-paper-soft p-3 sm:grid-cols-3"><div className="sm:col-span-2">{input("Nombre del producto", name, setName, { required: productMode === "NEW", inputRef: productNameRef })}</div>{input("Categoría", category, setCategory)}{input("Precio cotizado", quoteAmount, setQuoteAmount, { decimal: true })}{input("Moneda del precio", quoteCurrency, setQuoteCurrency)}{input("Unidad del precio", quoteUnit, setQuoteUnit)}{input("MOQ", moqQuantity, setMoqQuantity, { decimal: true })}{input("Unidad MOQ", moqUnit, setMoqUnit)}{input("Plazo en días", leadDays, setLeadDays, { decimal: true })}{input("FOB explícito", fobAmount, setFobAmount, { decimal: true })}{input("Moneda FOB", fobCurrency, setFobCurrency)}{input("Unidad FOB", fobUnit, setFobUnit)}<label className="text-xs font-medium sm:col-span-3">Notas <span className="font-normal text-ink-mute">· Opcional</span><textarea className="app-input mt-1 min-h-20" value={notes} onChange={(event) => { changed(); setNotes(event.target.value); }} /></label></div>
      <p className="mt-2 text-xs text-ink-mute">FOB sólo se guarda cuando la fuente lo indica explícitamente. El precio cotizado y FOB permanecen separados.</p></> : <AppNotice tone="info" className="mt-4">La evidencia quedará resuelta con el proveedor elegido o el borrador nuevo. No se creará un producto.</AppNotice>}
    {requirement && !error ? <p className="mt-3 text-sm text-ink-mute" aria-live="polite">Para guardar: {requirement.charAt(0).toLocaleLowerCase() + requirement.slice(1)}</p> : null}
    {error ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}
    <div className="mt-4 flex flex-wrap gap-2"><button className="app-primary-button" type="button" disabled={busy || saved} onClick={() => void submit(saveMode)}>{busy ? "Guardando…" : saved ? "Decisión guardada" : saveMode === "SUPPLIER" ? "Guardar proveedor y resolver" : "Guardar negociación y resolver"}</button><button className="app-secondary-button text-danger" type="button" disabled={busy || saved || !selected.length || !companyId} onClick={() => void submit("DISCARD")}>Descartar selección</button></div>
  </article>;
}
