"use client";

import { useMemo, useRef, useState } from "react";
import type { CommercialFacts } from "@/lib/channels/whatsapp/commercial-review";
import { formatEvidenceTimeRange } from "@/lib/channels/whatsapp/evidence-time";
import { evidencePreview, negotiationPreview } from "@/lib/channels/whatsapp/evidence-preview";
import type { TripInsights } from "@/lib/bot/trip-insights";
import { AppNotice } from "./AppNotice";
import { AppSelect } from "./AppSelect";
import { appApi } from "./api";

type Message = { id: string; sentAt: string; type: string; text: string | null; transcript: string | null; ocr: string | null; visual: string | null; facts: CommercialFacts; resolution: string; mediaAvailable: boolean; decisions: Array<{ action: string }> };
type SaveMode = "SUPPLIER" | "PRODUCT" | "DISCARD";
export type NegotiationSaveResult = { mode: SaveMode; captureId: string | null; productId: string | null; supplierCreated: boolean; productCreated: boolean };
type Props = { tripId: string; role: "ADMIN" | "TRAVELER"; burstId: string; discardCompanyId: string | null; messages: Message[]; suppliers: TripInsights["suppliers"]; captures: TripInsights["captures"]; products: TripInsights["products"]; companies: TripInsights["companies"]; onSaved: (result: NegotiationSaveResult) => Promise<void> };
const decimal = (value: string) => value.trim() ? Number(value.replace(",", ".")) : null;
const sharedField = (messages: Message[], get: (facts: CommercialFacts) => string | number | null | undefined) => {
  const values = [...new Set(messages.map((message) => get(message.facts)).filter((value): value is string | number => value !== null && value !== undefined && value !== "").map(String))];
  return values.length === 1 ? values[0] : "";
};

export function WhatsAppNegotiationCard({ tripId, burstId, discardCompanyId, messages, captures, products, companies, onSaved }: Props) {
  const preview = negotiationPreview(messages);
  const singleEvidence = messages.length === 1;
  const singlePreview = singleEvidence ? evidencePreview(messages[0]) : null;
  const subject = singleEvidence ? "evidencia" : "negociación";
  const initialNames = useMemo(() => [...new Set(messages.map((message) => message.facts.companyName).filter((name): name is string => Boolean(name)))], [messages]);
  const hasProducts = messages.some((message) => Boolean(message.facts.productName || message.facts.category || message.facts.fob || message.facts.quotedPrice || message.facts.moq || message.facts.leadTime));
  const ambiguous = preview.ambiguous;
  const matched = initialNames.length === 1 ? captures.filter((capture) => (capture.companyNameLatin ?? capture.companyName ?? "").toLocaleLowerCase() === initialNames[0].toLocaleLowerCase()) : [];
  const initialCapture = matched.length === 1 ? matched[0] : null;
  const initialSources = ambiguous ? [] : messages;
  const [selected, setSelected] = useState<string[]>(ambiguous ? [] : messages.map((message) => message.id));
  const discardableIds = messages.filter((message) => !message.decisions.some((decision) => !["DISCARD", "RECOVER"].includes(decision.action))).map((message) => message.id);
  const [saveMode, setSaveMode] = useState<"SUPPLIER" | "PRODUCT">(hasProducts ? "PRODUCT" : "SUPPLIER");
  const [supplierMode, setSupplierMode] = useState<"EXISTING" | "NEW">(initialCapture ? "EXISTING" : "NEW");
  const [productMode, setProductMode] = useState<"EXISTING" | "NEW">("NEW");
  const [companyId, setCompanyId] = useState(initialCapture?.companyId ?? discardCompanyId ?? "");
  const [captureId, setCaptureId] = useState(initialCapture?.id ?? "");
  const [supplierName, setSupplierName] = useState(sharedField(initialSources, (facts) => facts.companyName));
  const [city, setCity] = useState(sharedField(initialSources, (facts) => facts.city));
  const [contact, setContact] = useState(sharedField(initialSources, (facts) => facts.contact));
  const [productId, setProductId] = useState("");
  const [name, setName] = useState(sharedField(initialSources, (facts) => facts.productName));
  const [category, setCategory] = useState(sharedField(initialSources, (facts) => facts.category));
  const [quoteAmount, setQuoteAmount] = useState(sharedField(initialSources, (facts) => facts.quotedPrice?.amount));
  const [quoteCurrency, setQuoteCurrency] = useState(sharedField(initialSources, (facts) => facts.quotedPrice?.currency));
  const [quoteUnit, setQuoteUnit] = useState(sharedField(initialSources, (facts) => facts.quotedPrice?.unit));
  const [moqQuantity, setMoqQuantity] = useState(sharedField(initialSources, (facts) => facts.moq?.quantity));
  const [moqUnit, setMoqUnit] = useState(sharedField(initialSources, (facts) => facts.moq?.unit));
  const [fobAmount, setFobAmount] = useState(sharedField(initialSources, (facts) => facts.fob?.amount));
  const [fobCurrency, setFobCurrency] = useState(sharedField(initialSources, (facts) => facts.fob?.currency));
  const [fobUnit, setFobUnit] = useState(sharedField(initialSources, (facts) => facts.fob?.unit));
  const [leadDays, setLeadDays] = useState(sharedField(initialSources, (facts) => facts.leadTime?.days));
  const [notes, setNotes] = useState(sharedField(initialSources, (facts) => facts.notes));
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const requestId = useRef<string | null>(null);
  const supplierNameRef = useRef<HTMLInputElement>(null);
  const productNameRef = useRef<HTMLInputElement>(null);
  const changed = () => { requestId.current = null; setSaved(false); setError(null); };
  const selectSources = (ids: string[]) => {
    changed(); setSelected(ids);
    const sources = messages.filter((message) => ids.includes(message.id));
    setSupplierName(sharedField(sources, (facts) => facts.companyName)); setCity(sharedField(sources, (facts) => facts.city)); setContact(sharedField(sources, (facts) => facts.contact));
    setName(sharedField(sources, (facts) => facts.productName)); setCategory(sharedField(sources, (facts) => facts.category));
    setQuoteAmount(sharedField(sources, (facts) => facts.quotedPrice?.amount)); setQuoteCurrency(sharedField(sources, (facts) => facts.quotedPrice?.currency)); setQuoteUnit(sharedField(sources, (facts) => facts.quotedPrice?.unit));
    setMoqQuantity(sharedField(sources, (facts) => facts.moq?.quantity)); setMoqUnit(sharedField(sources, (facts) => facts.moq?.unit));
    setFobAmount(sharedField(sources, (facts) => facts.fob?.amount)); setFobCurrency(sharedField(sources, (facts) => facts.fob?.currency)); setFobUnit(sharedField(sources, (facts) => facts.fob?.unit));
    setLeadDays(sharedField(sources, (facts) => facts.leadTime?.days)); setNotes(sharedField(sources, (facts) => facts.notes));
    setCaptureId(""); setProductId(""); setSupplierMode("NEW"); setProductMode("NEW");
  };
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
    if (!selected.length || !(mode === "DISCARD" ? discardCompanyId : companyId)) { setError(!selected.length ? "Elegí al menos una fuente." : mode === "DISCARD" ? "No hay una empresa verificada para descartar esta negociación." : "Elegí la empresa del viaje."); return; }
    if (mode === "DISCARD" && !window.confirm(`¿Descartar ${singleEvidence ? "esta evidencia" : "toda la negociación seleccionada"}? ${singleEvidence ? "El original" : "Los originales"} y la trazabilidad se conservarán.`)) return;
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
      const result = await appApi<{ mode: SaveMode; captureId: string | null; productId: string | null }>(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/negotiation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: requestId.current, mode, burstId, messageIds: selected, companyId: mode === "DISCARD" ? discardCompanyId : companyId, ...(mode !== "DISCARD" && (supplierMode === "EXISTING" ? { captureId } : { newSupplier: { name: supplierName.trim(), city: city.trim(), contact: contact.trim() } })), ...(mode === "PRODUCT" && (productMode === "EXISTING" ? { productId, expectedProductVersion: existingProduct?.updatedAt } : { createProduct: true })), fields }) });
      setSaved(true); requestId.current = null;
      try { await onSaved({ ...result, supplierCreated: mode !== "DISCARD" && supplierMode === "NEW", productCreated: mode === "PRODUCT" && productMode === "NEW" }); }
      catch { setError("La decisión quedó guardada, pero no pudimos actualizar la vista. Recargá la página para ver el estado actual."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar la decisión. Podés reintentar."); }
    finally { setBusy(false); }
  }

  const choices: Array<["EXISTING" | "NEW", string, string]> = [["EXISTING", "Elegir proveedor existente", "Buscar entre borradores y confirmados"], ["NEW", "Crear proveedor nuevo", "Guardar un borrador en esta ficha"]];
  return <article className="min-w-0 rounded-2xl border border-line bg-paper p-4 shadow-soft sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-ink-mute">{singleEvidence ? "Evidencia · 1 mensaje" : `Negociación · ${messages.length} mensajes`} · {preview.kinds}</p><p className="mt-1 text-xs text-ink-mute">{formatEvidenceTimeRange(messages.map((message) => message.sentAt))}</p><h3 className="mt-1 wrap-anywhere text-base font-semibold sm:text-lg">{singlePreview?.title ?? preview.title}</h3></div><span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold-deep">Por resolver</span></div>
    <p className="mt-2 wrap-anywhere text-sm text-ink-mute">{singlePreview?.summary ?? preview.summary}</p>
    <div className="mt-3 flex flex-wrap gap-2"><button className="app-secondary-button min-h-11" type="button" aria-expanded={expanded} onClick={() => { setExpanded((value) => !value); setSelectOpen(false); }}>{expanded ? "Cerrar detalles" : "Revisar / Resolver"}</button>{discardCompanyId && discardableIds.length ? <button className="app-secondary-button min-h-11 text-danger" type="button" aria-expanded={selectOpen} onClick={() => { if (!selectOpen) selectSources(ambiguous ? [] : discardableIds); setSelectOpen((value) => !value); setExpanded(false); }}>{selectOpen ? "Cerrar selección" : "Descartar"}</button> : null}</div>
    {!discardCompanyId ? <p className="mt-2 text-xs text-ink-mute">No hay una única empresa verificada para este descarte. Podés revisar {singleEvidence ? "el original" : "los originales"}; el descarte requiere un contexto autorizado.</p> : null}
    {selectOpen || expanded ? <div className="mt-4 border-t border-line pt-4">
    {ambiguous ? <AppNotice tone="warning" className="mt-3">Hay nombres o categorías diferentes. Seleccioná únicamente las fuentes que correspondan entre sí.</AppNotice> : null}
    <div className="mt-3 space-y-2">{messages.map((message) => <div key={message.id} className="min-w-0 rounded-xl bg-paper-soft p-3 text-sm"><label className="flex min-h-11 min-w-0 items-start gap-3"><input className="mt-1" type="checkbox" checked={selected.includes(message.id)} disabled={selectOpen && !discardableIds.includes(message.id)} onChange={(event) => selectSources(event.target.checked ? [...selected, message.id] : selected.filter((id) => id !== message.id))} /><span className="min-w-0 wrap-anywhere"><span className="font-semibold">{evidencePreview(message).kind}</span> · {evidencePreview(message).summary}</span></label>{message.text || message.transcript || message.ocr || message.visual ? <details className="mt-1 ml-6"><summary className="cursor-pointer font-semibold text-nihao">Leer fuente</summary><p className="mt-2 whitespace-pre-wrap wrap-anywhere">{message.text ?? message.transcript ?? message.ocr ?? message.visual}</p></details> : null}{message.mediaAvailable ? <a className="ml-6 inline-block font-semibold text-nihao underline" href={`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/${encodeURIComponent(message.id)}/media`} target="_blank" rel="noreferrer">Abrir original privado</a> : null}</div>)}</div>
    {selectOpen ? <div className="mt-4">{error ? <AppNotice tone="error" className="mb-3">{error}</AppNotice> : null}<button className="app-secondary-button min-h-11 text-danger" type="button" disabled={busy || saved || !selected.length} onClick={() => void submit("DISCARD")}>{busy ? "Descartando…" : `Confirmar descarte (${selected.length})`}</button></div> : null}
    </div> : null}
    {expanded ? <div className="mt-4 border-t border-line pt-4">
    <p className="mt-4 text-xs font-medium text-ink-mute"><span aria-hidden="true" className="text-danger">*</span> Obligatorio</p>
    <div className="mt-2"><AppSelect label="Empresa del viaje *" ariaLabel="Empresa del viaje, obligatoria" searchable value={companyId} onValueChange={(value) => { changed(); setCompanyId(value); setCaptureId(""); setProductId(""); }} placeholder="Elegí empresa" options={companies.map((company) => ({ value: company.id, label: company.name }))} /></div>
    <fieldset className="mt-4"><legend className="text-sm font-semibold">Destino del proveedor *</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{choices.map(([value, title, description]) => <label key={value} className={`min-h-14 rounded-xl border p-3 ${supplierMode === value ? "border-nihao bg-nihao-soft" : "border-line bg-paper"}`}><input className="mr-2" type="radio" name={`supplier-${burstId}`} checked={supplierMode === value} onChange={() => { changed(); setSupplierMode(value); setCaptureId(""); if (value === "NEW") { setProductMode("NEW"); setProductId(""); } }} /><span className="text-sm font-semibold">{title}</span><span className="ml-6 block text-xs text-ink-mute">{description}</span></label>)}</div></fieldset>
    {supplierMode === "EXISTING" ? <div className="mt-3"><AppSelect label="Proveedor existente *" ariaLabel="Proveedor existente, obligatorio" searchable value={captureId} onValueChange={(value) => { changed(); setCaptureId(value); setProductId(""); }} placeholder="Buscar proveedor" searchPlaceholder="Buscar por nombre o estado" options={availableCaptures.map((capture) => ({ value: capture.id, label: capture.companyNameLatin ?? capture.companyName ?? "Proveedor pendiente", description: capture.status === "DRAFT" ? "Borrador" : "Confirmado" }))} /></div> : <div className="mt-3 grid gap-3 rounded-xl bg-paper-soft p-3 sm:grid-cols-3">{input("Nombre del proveedor", supplierName, setSupplierName, { required: true, inputRef: supplierNameRef })}{input("Ciudad", city, setCity)}{input("Contacto", contact, setContact)}<p className="text-xs text-ink-mute sm:col-span-3">Se guardará como borrador. Para confirmarlo después necesitarás un contacto válido.</p></div>}
    <fieldset className="mt-4"><legend className="text-sm font-semibold">Qué querés guardar *</legend><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className={`rounded-xl border p-3 ${saveMode === "SUPPLIER" ? "border-nihao bg-nihao-soft" : "border-line"}`}><input className="mr-2" type="radio" name={`save-${burstId}`} checked={saveMode === "SUPPLIER"} onChange={() => { changed(); setSaveMode("SUPPLIER"); }} /><span className="text-sm font-semibold">Sólo proveedor</span><span className="ml-6 block text-xs text-ink-mute">Para una tarjeta sin producto.</span></label><label className={`rounded-xl border p-3 ${saveMode === "PRODUCT" ? "border-nihao bg-nihao-soft" : "border-line"}`}><input className="mr-2" type="radio" name={`save-${burstId}`} checked={saveMode === "PRODUCT"} onChange={() => { changed(); setSaveMode("PRODUCT"); }} /><span className="text-sm font-semibold">Proveedor y producto</span><span className="ml-6 block text-xs text-ink-mute">Aplica las condiciones revisadas.</span></label></div></fieldset>
    {saveMode === "PRODUCT" ? <><fieldset className="mt-4"><legend className="text-sm font-semibold">Destino del producto *</legend><div className="mt-2 flex flex-wrap gap-4 text-sm"><label className={supplierMode === "NEW" ? "text-ink-mute" : undefined}><input className="mr-2" type="radio" name={`product-${burstId}`} checked={productMode === "EXISTING"} disabled={supplierMode === "NEW"} onChange={() => { changed(); setProductMode("EXISTING"); }} />Elegir existente</label><label><input className="mr-2" type="radio" name={`product-${burstId}`} checked={productMode === "NEW"} onChange={() => { changed(); setProductMode("NEW"); }} />Crear producto nuevo</label></div>{supplierMode === "NEW" ? <p className="mt-2 text-xs text-ink-mute">Un producto existente ya pertenece a otro proveedor. Para el proveedor nuevo, creá un producto nuevo.</p> : null}</fieldset>
      {productMode === "EXISTING" ? <div className="mt-3"><AppSelect label="Producto existente *" ariaLabel="Producto existente, obligatorio" searchable value={productId} onValueChange={(value) => { changed(); setProductId(value); const product = availableProducts.find((item) => item.id === value); if (product) setName(product.name); }} placeholder={captureId ? "Buscar producto" : "Primero elegí el proveedor"} disabled={!captureId} options={availableProducts.map((product) => ({ value: product.id, label: product.name, description: product.status === "DRAFT" ? "Borrador" : "Confirmado" }))} /></div> : null}
      <div className="mt-4 grid gap-3 rounded-xl bg-paper-soft p-3 sm:grid-cols-3"><div className="sm:col-span-2">{input("Nombre del producto", name, setName, { required: productMode === "NEW", inputRef: productNameRef })}</div>{input("Categoría", category, setCategory)}{input("Precio cotizado", quoteAmount, setQuoteAmount, { decimal: true })}{input("Moneda del precio", quoteCurrency, setQuoteCurrency)}{input("Unidad del precio", quoteUnit, setQuoteUnit)}{input("MOQ", moqQuantity, setMoqQuantity, { decimal: true })}{input("Unidad MOQ", moqUnit, setMoqUnit)}{input("Plazo en días", leadDays, setLeadDays, { decimal: true })}{input("FOB explícito", fobAmount, setFobAmount, { decimal: true })}{input("Moneda FOB", fobCurrency, setFobCurrency)}{input("Unidad FOB", fobUnit, setFobUnit)}<label className="text-xs font-medium sm:col-span-3">Notas <span className="font-normal text-ink-mute">· Opcional</span><textarea className="app-input mt-1 min-h-20" value={notes} onChange={(event) => { changed(); setNotes(event.target.value); }} /></label></div>
      <p className="mt-2 text-xs text-ink-mute">FOB sólo se guarda cuando la fuente lo indica explícitamente. El precio cotizado y FOB permanecen separados.</p></> : <AppNotice tone="info" className="mt-4">La evidencia quedará resuelta con el proveedor elegido o el borrador nuevo. No se creará un producto.</AppNotice>}
    {requirement && !error ? <p className="mt-3 text-sm text-ink-mute" aria-live="polite">Para guardar: {requirement.charAt(0).toLocaleLowerCase() + requirement.slice(1)}</p> : null}
    {error ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}
    <div className="mt-4 flex flex-wrap gap-2"><button className="app-primary-button" type="button" disabled={busy || saved} onClick={() => void submit(saveMode)}>{busy ? "Guardando…" : saved ? "Decisión guardada" : saveMode === "SUPPLIER" ? "Guardar proveedor y resolver" : `Guardar ${subject} y resolver`}</button></div>
    </div> : null}
  </article>;
}
