"use client";

import Image from "next/image";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupplierAttachmentView, SupplierProductRecord } from "@/lib/bot/types";
import { appApi } from "./api";
import { isProductConfirmable } from "@/lib/bot/record-completeness";
import { ImageViewer } from "./ImageViewer";
import { AttachmentUploader } from "./AttachmentUploader";

type Form = { name: string; notes: string; fobAmount: string; fobCurrency: string; fobUnit: string; moqQuantity: string; moqUnit: string; leadTime: string };
const blank: Form = { name: "", notes: "", fobAmount: "", fobCurrency: "USD", fobUnit: "unidad", moqQuantity: "", moqUnit: "unidades", leadTime: "" };

export function SupplierProducts({ tripId, captureId, refreshKey, reviewProductId, needsReanalysis = false, readOnly = false, offline = false, onBusyChange, externalImages, onImageAssigned }: { tripId: string; captureId: string; refreshKey?: string; reviewProductId?: string; needsReanalysis?: boolean; supplierConfirmed?: boolean; readOnly?: boolean; offline?: boolean; onBusyChange?: (busy: boolean) => void; externalImages?: SupplierAttachmentView[]; onImageAssigned?: (imageId: string, productId: string | null) => void }) {
  const [products, setProducts] = useState<SupplierProductRecord[]>([]);
  const [storedImages, setStoredImages] = useState<SupplierAttachmentView[]>([]);
  const images = (externalImages ?? storedImages).filter((a) => a.type === "PRODUCT_IMAGE");
  const focusedProduct = useRef<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setWorking = (value: boolean) => { setBusy(value); onBusyChange?.(value); };
  const onImagesChange = useCallback((_: "BUSINESS_CARD" | "PRODUCT_IMAGE", attachments: SupplierAttachmentView[]) => setStoredImages((current) => [...current.filter((a) => a.type !== "PRODUCT_IMAGE"), ...attachments]), []);
  const reload = useCallback(async () => {
    const [productResult, imageResult] = await Promise.allSettled([
      appApi<{ products: SupplierProductRecord[] }>(`/api/bot/captures/${captureId}/products?tripId=${encodeURIComponent(tripId)}`),
      appApi<{ attachments: SupplierAttachmentView[] }>(`/api/bot/captures/${captureId}/attachments?tripId=${encodeURIComponent(tripId)}`),
    ]);
    if (productResult.status === "rejected") throw productResult.reason;
    setProducts(productResult.value.products);
    setStoredImages(imageResult.status === "fulfilled" ? imageResult.value.attachments : []);
    setError(imageResult.status === "rejected" ? "No pudimos cargar las imágenes de los productos." : null);
  }, [captureId, tripId]);
  useEffect(() => { if (!offline) queueMicrotask(() => { void reload().catch((cause) => setError(cause instanceof Error ? cause.message : "No pudimos cargar productos")); }); }, [offline, reload, refreshKey]);

  useEffect(() => {
    if (!reviewProductId || focusedProduct.current === reviewProductId || !products.some((product) => product.id === reviewProductId)) return;
    const element = document.getElementById(`product-${reviewProductId}`);
    if (element) { focusedProduct.current = reviewProductId; element.scrollIntoView({ block: "center" }); element.focus({ preventScroll: true }); }
  }, [products, reviewProductId]);

  function edit(product?: SupplierProductRecord) {
    setEditing(product?.id ?? "new");
    setForm(product ? { name: product.name, notes: product.notes ?? "", fobAmount: product.fob?.amount?.toString() ?? "", fobCurrency: product.fob?.currency ?? "USD", fobUnit: product.fob?.unit ?? "unidad", moqQuantity: product.moq?.quantity?.toString() ?? "", moqUnit: product.moq?.unit ?? "unidades", leadTime: product.leadTime?.rawText ?? "" } : blank);
    setError(null);
  }
  async function save() {
    setWorking(true); setError(null);
    try {
      const body = { tripId, name: form.name.trim(), notes: form.notes, ...(editing !== "new" ? { notesMode: "replace" } : {}), fob: form.fobAmount ? { amount: Number(form.fobAmount.replace(",", ".")), currency: form.fobCurrency, unit: form.fobUnit, rawText: "" } : null, moq: form.moqQuantity ? { quantity: Number(form.moqQuantity), unit: form.moqUnit, notes: null, rawText: "" } : null, leadTime: form.leadTime.trim() ? { rawText: form.leadTime.trim(), days: null } : null };
      await appApi(`/api/bot/captures/${captureId}/products${editing === "new" ? "" : `/${editing}`}`, { method: editing === "new" ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      setEditing(null); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar el producto"); }
    finally { setWorking(false); }
  }
  async function confirmProduct(id: string) {
    setWorking(true); setError(null);
    try {
      await appApi(`/api/bot/captures/${captureId}/products/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, confirm: true }) });
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos confirmar el producto"); }
    finally { setWorking(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("¿Eliminar este producto?")) return;
    setWorking(true); setError(null);
    try { await appApi(`/api/bot/captures/${captureId}/products/${id}?tripId=${encodeURIComponent(tripId)}`, { method: "DELETE" }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos eliminar el producto"); }
    finally { setWorking(false); }
  }
  async function assign(imageId: string, productId: string | null) {
    setWorking(true); setError(null);
    try {
      await appApi(`/api/bot/captures/${captureId}/attachments/${imageId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, productId }) });
      onImageAssigned?.(imageId, productId);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos asignar la imagen"); }
    finally { setWorking(false); }
  }
  const field = (label: string, key: keyof Form, inputMode?: "decimal" | "numeric") => <label className="block text-xs font-medium text-ink-mute">{label}<input className="app-input mt-1" value={form[key]} inputMode={inputMode} onChange={(event) => setForm((value) => ({ ...value, [key]: event.target.value }))} /></label>;
  return <section className="mt-7 rounded-2xl border border-line bg-white p-5 shadow-soft"><div className="flex items-center justify-between gap-3"><h2 className="text-xl">Productos</h2>{!readOnly && !offline ? <button type="button" className="app-secondary-button" onClick={() => edit()}>Agregar producto</button> : null}</div>
    {offline ? <p className="mt-3 text-sm text-ink-mute">Podés agregar productos cuando se sincronice la captura.</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-nihao">{error}</p> : null}
    {editing ? <div className="mt-4 space-y-3 rounded-xl bg-paper-soft p-4">{field("Nombre del producto", "name")}<label className="block text-sm font-medium">Notas<textarea className="app-input mt-1 min-h-32" value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} /></label><div className="grid gap-3 sm:grid-cols-3">{field("FOB", "fobAmount", "decimal")}{field("Moneda", "fobCurrency")}{field("Unidad FOB", "fobUnit")}{field("MOQ", "moqQuantity", "numeric")}{field("Unidad MOQ", "moqUnit")}{field("Lead time", "leadTime")}</div><div className="flex gap-2"><button type="button" className="app-primary-button" disabled={busy || !form.name.trim()} onClick={() => void save()}>Guardar</button><button type="button" className="app-secondary-button" onClick={() => setEditing(null)}>Cancelar</button></div></div> : null}
    <div className="mt-4 space-y-3">{products.map((product) => <article key={product.id} id={`product-${product.id}`} tabIndex={-1} className={`scroll-mt-6 rounded-xl border border-line p-4 ${product.id === reviewProductId ? "ring-2 ring-nihao" : ""}`}><div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">{product.name}</h3>{(product.status === "DRAFT" || product.reviewFields?.length || needsReanalysis) ? <p className="mt-1 text-xs font-medium text-nihao">Pendiente de revisión</p> : null}</div>{!readOnly ? <div className="flex gap-3 text-sm"><button type="button" className="text-nihao" onClick={() => edit(product)}>Editar</button><button type="button" className="text-nihao" disabled={busy} onClick={() => void remove(product.id)}>Eliminar</button></div> : null}</div>{(product.status === "DRAFT" || product.reviewFields?.length || needsReanalysis) ? <div className="mt-3 rounded-xl bg-paper-soft p-3 text-sm"><p>{needsReanalysis ? "Analizá la nueva evidencia antes de confirmar. " : ""}El producto queda guardado como borrador para que puedas revisar la información, completar los datos y confirmarlo en la web.</p>{product.reviewFields?.length ? <p className="mt-1 text-nihao">Datos con dudas o conflictos: {product.reviewFields.map((field) => field === "fob" ? "FOB" : field === "moq" ? "MOQ" : field === "leadTime" ? "plazo de entrega" : field).join(", ")}.</p> : null}{product.sourceText ? <details className="mt-2"><summary className="cursor-pointer">Ver información original</summary><p className="mt-2 whitespace-pre-wrap">{product.sourceText}</p></details> : null}{storedImages.filter((a) => a.type === "AUDIO" && a.productId === product.id).map((a) => <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="mt-2 block text-nihao underline">Escuchar audio original</a>)}{!readOnly ? <button type="button" disabled={busy || needsReanalysis || !isProductConfirmable(product)} onClick={() => void confirmProduct(product.id)} className="app-secondary-button mt-3">{product.status === "CONFIRMED" ? "Reconfirmar producto" : "Confirmar producto"}</button> : null}</div> : null}<p className="mt-2 text-sm text-ink-mute">FOB: {product.fob?.amount ?? "—"} {product.fob?.currency ?? ""} {product.fob?.unit ?? ""} · MOQ: {product.moq?.quantity ?? "—"} {product.moq?.unit ?? ""} · Lead time: {product.leadTime?.rawText || "—"}</p><div className="mt-3"><h4 className="text-sm font-semibold">Notas</h4><p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm text-ink-mute">{product.notes || "Sin notas."}</p></div><div className="mt-3 flex flex-wrap gap-2">{images.filter((image) => image.productId === product.id).map((image) => <ImageViewer key={image.id} src={image.url} alt={`Imagen de ${product.name}`} className="h-24 w-24"><Image unoptimized width={96} height={96} src={image.url} alt={product.name} className="h-full w-full rounded-xl object-cover" /></ImageViewer>)}</div></article>)}{!products.length ? <p className="text-sm text-ink-mute">Todavía no hay productos.</p> : null}</div>
    {!offline ? <div className="mt-5"><h3 className="text-sm font-semibold">Imágenes de productos</h3>{!externalImages ? <AttachmentUploader compact readOnly={readOnly} tripId={tripId} captureId={captureId} type="PRODUCT_IMAGE" onAttachmentsChange={onImagesChange} /> : null}{images.map((image) => <label key={image.id} className="mt-2 flex items-center gap-3 text-sm"><ImageViewer src={image.url} alt="Imagen del producto" className="text-nihao underline" /><select className="app-input max-w-64" aria-label="Asignar imagen a producto" value={image.productId ?? ""} disabled={readOnly || busy} onChange={(event) => void assign(image.id, event.target.value || null)}><option value="">Sin asignar</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>)}</div> : null}
  </section>;
}
