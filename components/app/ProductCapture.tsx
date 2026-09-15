"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronRight, LoaderCircle, Pencil, Save, Sparkles } from "lucide-react";
import { calculateQuestionFields } from "@/lib/bot/tier1";
import type { SupplierCaptureRecord, SupplierRecord, Tier1Data, Tier1Field } from "@/lib/bot/types";
import { appApi } from "./api";
import { AttachmentUploader } from "./AttachmentUploader";
import { Tier1Editor } from "./Tier1Editor";
import { FIELD_LABELS, fieldValue } from "./tier1-display";

export function ProductCapture({ tripId }: { tripId: string }) {
  const autosaveKey = `nihao:app:capture:${tripId}`;
  const [rawText, setRawText] = useState("");
  const [capture, setCapture] = useState<SupplierCaptureRecord | null>(null);
  const [editing, setEditing] = useState<Tier1Field | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState<Record<"BUSINESS_CARD" | "PRODUCT_IMAGE", boolean>>({ BUSINESS_CARD: false, PRODUCT_IMAGE: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { queueMicrotask(() => setRawText(window.localStorage.getItem(autosaveKey) ?? "")); }, [autosaveKey]);

  async function extract() {
    setBusy(true); setError(null);
    window.localStorage.setItem(autosaveKey, rawText);
    try {
      const result = await appApi<{ capture: SupplierCaptureRecord }>("/api/bot/extractions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId, source: { type: "TEXT", text: rawText } }),
      });
      setCapture(result.capture);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar la captura"); }
    finally { setBusy(false); }
  }

  async function correct<Field extends Tier1Field>(field: Field, value: Tier1Data[Field], acknowledgedUnknown = false) {
    if (!capture) return;
    setBusy(true); setError(null);
    try {
      const result = await appApi<{ capture: SupplierCaptureRecord }>(`/api/bot/captures/${capture.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId, field, value, acknowledgedUnknown }),
      });
      setCapture(result.capture); setEditing(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar el campo"); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!capture) return;
    setBusy(true); setError(null);
    try {
      const result = await appApi<{ supplier: SupplierRecord }>(`/api/bot/captures/${capture.id}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId }),
      });
      window.localStorage.removeItem(autosaveKey);
      window.location.assign(`/app/viajes/${tripId}/proveedores/${result.supplier.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos confirmar el proveedor"); setBusy(false); }
  }

  if (!capture) return (
    <main className="app-page max-w-2xl">
      <Link href={`/app/viajes/${tripId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Volver al viaje</Link>
      <p className="mt-4 text-eyebrow-mark">Nuevo proveedor</p><h1 className="mt-3 text-3xl sm:text-4xl">Anotá lo esencial</h1><p className="mt-2 text-sm text-ink-mute">Escribí lo que escuchaste en el stand. Después podés completar cada dato y adjuntar fotos.</p>
      <div className="mt-6 rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-6">
        <label htmlFor="supplier-notes" className="text-sm font-semibold">Nota de feria</label>
        <textarea id="supplier-notes" autoFocus value={rawText} onChange={(event) => { setRawText(event.target.value); window.localStorage.setItem(autosaveKey, event.target.value); }} rows={8} className="mt-2 w-full resize-none rounded-xl border border-line bg-paper-soft p-4 text-base outline-none focus:border-nihao" placeholder="Ej. ABC Lighting, fábrica de lámparas. FOB USD 7/unidad, MOQ 300, entrega en 4 semanas..." />
        <p className="mt-3 flex gap-2 text-xs text-ink-mute"><Sparkles className="h-4 w-4 shrink-0 text-gold-deep" />Nihao ordena la nota con el motor Tier 1. Las imágenes se guardan, pero todavía no se analizan automáticamente.</p>
      </div>
      {error ? <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-nihao-soft p-4 text-sm text-nihao"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p> : null}
      <button disabled={busy || rawText.trim().length < 2} onClick={extract} className="app-primary-button mt-5 w-full" type="button">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}Organizar información<ChevronRight className="h-4 w-4" /></button>
    </main>
  );

  const unanswered = calculateQuestionFields(capture.fields, capture.acknowledgedUnknownFields);
  const canConfirm = Boolean(capture.fields.category) || capture.acknowledgedUnknownFields.includes("category");
  const uploading = attachmentBusy.BUSINESS_CARD || attachmentBusy.PRODUCT_IMAGE;
  const handleAttachmentBusy = (type: "BUSINESS_CARD" | "PRODUCT_IMAGE", value: boolean) => setAttachmentBusy((current) => ({ ...current, [type]: value }));
  return (
    <main className="app-page max-w-2xl pb-32">
      <button onClick={() => setCapture(null)} type="button" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Volver a la nota</button>
      <p className="mt-4 text-eyebrow-mark">Borrador guardado</p><h1 className="mt-3 text-3xl">Revisá el proveedor</h1><p className="mt-2 text-sm text-ink-mute">Corregí sólo lo necesario. Tu borrador y sus imágenes ya están guardados.</p>
      {unanswered.length ? <div className="mt-5 rounded-2xl border border-gold/40 bg-gold-soft p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Información pendiente</p><div className="mt-2 flex flex-wrap gap-2">{unanswered.map((field) => <button key={field} onClick={() => setEditing(field)} type="button" className="min-h-10 rounded-full bg-white px-3 text-xs font-semibold shadow-sm">{FIELD_LABELS[field]}</button>)}</div></div> : null}
      <section className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {(Object.keys(FIELD_LABELS) as Tier1Field[]).map((field) => {
          const missing = capture.missingFields.includes(field);
          const acknowledged = capture.acknowledgedUnknownFields.includes(field);
          const review = capture.reviewFields.includes(field);
          return <div key={field} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{FIELD_LABELS[field]}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${review ? "bg-gold-soft text-gold-deep" : missing ? "bg-paper-warm text-ink-mute" : "bg-nihao-soft text-nihao"}`}>{review ? "Revisar" : missing ? acknowledged ? "Pendiente" : "Falta" : "Completo"}</span></div><p className="mt-1 text-sm">{fieldValue(capture.fields, field)}</p></div><button onClick={() => setEditing(editing === field ? null : field)} className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-xs font-semibold text-nihao" type="button"><Pencil className="h-3.5 w-3.5" />Editar</button></div>{editing === field ? <Tier1Editor key={`${field}-${capture.updatedAt}`} capture={capture} field={field} busy={busy} onSave={correct} /> : null}</div>;
        })}
      </section>
      <section className="mt-7"><p className="text-eyebrow-mark">Adjuntos privados</p><h2 className="mt-3 text-2xl">Fotos del stand</h2><div className="mt-4 grid gap-4"><AttachmentUploader tripId={tripId} captureId={capture.id} type="BUSINESS_CARD" onBusyChange={handleAttachmentBusy} /><AttachmentUploader tripId={tripId} captureId={capture.id} type="PRODUCT_IMAGE" onBusyChange={handleAttachmentBusy} /></div></section>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-nihao-soft p-4 text-sm text-nihao">{error}</p> : null}
      {!canConfirm ? <p className="mt-5 text-xs font-medium text-nihao">Completá la categoría o marcala “No sé” antes de confirmar.</p> : null}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 p-4 backdrop-blur"><div className="mx-auto max-w-2xl"><button disabled={busy || uploading || !canConfirm} onClick={confirm} className="app-primary-button w-full" type="button">{busy || uploading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}{uploading ? "Esperando la imagen…" : "Confirmar proveedor"}</button></div></div>
    </main>
  );
}
