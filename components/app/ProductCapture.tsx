"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, LoaderCircle, Plus, Save, Sparkles } from "lucide-react";
import { calculateQuestionFields } from "@/lib/bot/tier1";
import type { SupplierAttachmentView, SupplierCaptureRecord, SupplierRecord, Tier1Data, Tier1Field } from "@/lib/bot/types";
import { appApi } from "./api";
import { AttachmentUploader } from "./AttachmentUploader";
import { AudioUploader } from "./AudioUploader";
import { CaptureFieldReview } from "./CaptureFieldReview";
import { CaptureSourceSelector, type CaptureSource } from "./CaptureSourceSelector";
import { Tier1Editor } from "./Tier1Editor";

export function ProductCapture({ tripId }: { tripId: string }) {
  const router = useRouter();
  const autosaveKey = `nihao:app:capture:${tripId}`;
  const [source, setSource] = useState<CaptureSource | null>(null);
  const [rawText, setRawText] = useState("");
  const [capture, setCapture] = useState<SupplierCaptureRecord | null>(null);
  const [savedSupplier, setSavedSupplier] = useState<SupplierRecord | null>(null);
  const [editing, setEditing] = useState<Tier1Field | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState<Record<"BUSINESS_CARD" | "PRODUCT_IMAGE" | "AUDIO", boolean>>({ BUSINESS_CARD: false, PRODUCT_IMAGE: false, AUDIO: false });
  const [businessCards, setBusinessCards] = useState<SupplierAttachmentView[]>([]);
  const [audios, setAudios] = useState<SupplierAttachmentView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { queueMicrotask(() => setRawText(window.localStorage.getItem(autosaveKey) ?? "")); }, [autosaveKey]);
  const handleBusinessCards = useCallback((_: "BUSINESS_CARD" | "PRODUCT_IMAGE", attachments: SupplierAttachmentView[]) => setBusinessCards(attachments), []);

  async function createDraft(nextSource: CaptureSource) {
    setBusy(true); setError(null); setSource(nextSource);
    try {
      const result = await appApi<{ capture: SupplierCaptureRecord }>("/api/bot/captures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId }) });
      setCapture(result.capture);
    } catch (caught) { setSource(null); setError(caught instanceof Error ? caught.message : "No pudimos preparar la captura"); }
    finally { setBusy(false); }
  }

  async function chooseSource(nextSource: CaptureSource) {
    if (nextSource === "TEXT") { setSource(nextSource); setError(null); return; }
    await createDraft(nextSource);
  }

  async function analyzeText() {
    if (rawText.trim().length < 2) return;
    setBusy(true); setError(null); window.localStorage.setItem(autosaveKey, rawText);
    try {
      const result = await appApi<{ capture: SupplierCaptureRecord }>("/api/bot/extractions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, text: rawText, businessCardAttachmentIds: [] }) });
      setCapture(result.capture);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos analizar la nota. La conservamos para que reintentes."); }
    finally { setBusy(false); }
  }

  async function analyzeEvidence() {
    if (!capture || (!businessCards.length && !audios.length && rawText.trim().length < 2)) return;
    setBusy(true); setError(null);
    try {
      const result = await appApi<{ capture: SupplierCaptureRecord }>("/api/bot/extractions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, captureId: capture.id, text: rawText.trim() || undefined, businessCardAttachmentIds: businessCards.map((card) => card.id), audioAttachmentIds: audios.slice(0, 1).map((audio) => audio.id) }) });
      setCapture(result.capture);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos analizarlo. Tu evidencia sigue guardada y podés reintentar."); }
    finally { setBusy(false); }
  }

  async function correct<Field extends Tier1Field>(field: Field, value: Tier1Data[Field], acknowledgedUnknown = false) {
    if (!capture) return;
    setBusy(true); setError(null);
    try {
      const result = await appApi<{ capture: SupplierCaptureRecord }>(`/api/bot/captures/${capture.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, field, value, acknowledgedUnknown }) });
      setCapture(result.capture); setEditing(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar este cambio"); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!capture) return;
    setBusy(true); setError(null);
    try {
      const result = await appApi<{ supplier: SupplierRecord }>(`/api/bot/captures/${capture.id}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId }) });
      window.localStorage.removeItem(autosaveKey); setSavedSupplier(result.supplier);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar el proveedor"); }
    finally { setBusy(false); }
  }

  function startAnother() { setCapture(null); setSource(null); setSavedSupplier(null); setEditing(null); setRawText(""); setBusinessCards([]); setAudios([]); setError(null); }

  if (savedSupplier) return <main className="app-page flex min-h-[70dvh] items-center"><section className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-white p-7 text-center shadow-card"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-nihao-soft text-nihao"><CheckCircle2 className="h-8 w-8" /></span><p className="mt-5 text-eyebrow-mark">Todo listo</p><h1 className="mt-3 text-3xl">Proveedor guardado</h1><p className="mt-2 text-sm text-ink-mute">Podés seguir capturando mientras la información está fresca.</p><button type="button" onClick={startAnother} className="app-primary-button mt-7 w-full justify-center"><Plus className="h-5 w-5" />Capturar otro proveedor</button><button type="button" onClick={() => router.push(`/app/viajes/${tripId}/proveedores/${savedSupplier.id}`)} className="app-secondary-button mt-3 w-full justify-center">Ver proveedor</button></section></main>;

  if (!capture) return <main className="app-page max-w-xl"><Link href={`/app/viajes/${tripId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Volver al viaje</Link><p className="mt-5 text-eyebrow-mark">Nuevo proveedor</p>{source === "TEXT" ? <TextStart rawText={rawText} busy={busy} error={error} onChange={(value) => { setRawText(value); window.localStorage.setItem(autosaveKey, value); }} onAnalyze={() => void analyzeText()} onBack={() => setSource(null)} /> : <><CaptureSourceSelector busy={busy} onSelect={(next) => void chooseSource(next)} />{busy ? <p aria-live="polite" className="mt-4 flex items-center gap-2 text-sm text-ink-mute"><LoaderCircle className="h-4 w-4 animate-spin text-nihao" />Preparando tu captura…</p> : null}{error ? <ErrorNotice error={error} /> : null}</>}</main>;

  const unanswered = calculateQuestionFields(capture.fields, capture.acknowledgedUnknownFields);
  const canConfirm = Boolean(capture.fields.category) || capture.acknowledgedUnknownFields.includes("category");
  const uploading = attachmentBusy.BUSINESS_CARD || attachmentBusy.PRODUCT_IMAGE || attachmentBusy.AUDIO;
  const hasEvidence = businessCards.length > 0 || audios.length > 0 || rawText.trim().length >= 2;
  const handleAttachmentBusy = (type: "BUSINESS_CARD" | "PRODUCT_IMAGE", value: boolean) => setAttachmentBusy((current) => ({ ...current, [type]: value }));
  return <main className="app-page max-w-xl pb-10"><button onClick={() => setCapture(null)} type="button" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Volver a empezar</button><p className="mt-5 text-eyebrow-mark">Proveedor nuevo</p><h1 className="mt-3 text-3xl">Capturá y revisá</h1><p className="mt-2 text-sm leading-6 text-ink-mute">Agregá una evidencia, analizala y corregí sólo lo necesario antes de guardar.</p>
    <section className="mt-7" aria-labelledby="evidence-heading"><h2 id="evidence-heading" className="text-xl">Evidencia</h2><div className="mt-3 grid gap-4"><AttachmentUploader tripId={tripId} captureId={capture.id} type="BUSINESS_CARD" onBusyChange={handleAttachmentBusy} onAttachmentsChange={handleBusinessCards} /><AudioUploader tripId={tripId} captureId={capture.id} onBusyChange={(value) => setAttachmentBusy((current) => ({ ...current, AUDIO: value }))} onAttachmentsChange={setAudios} /><details className="rounded-2xl border border-line bg-white p-4 shadow-soft"><summary className="cursor-pointer font-semibold text-ink">Agregar una nota escrita</summary><textarea value={rawText} onChange={(event) => { setRawText(event.target.value); window.localStorage.setItem(autosaveKey, event.target.value); }} rows={5} className="app-input mt-4 min-h-32 resize-none" placeholder="Ej. Fabrican iluminación. FOB USD 7. MOQ 300 unidades. Entrega en 28 días." /></details><details className="rounded-2xl border border-line bg-white p-4 shadow-soft"><summary className="cursor-pointer font-semibold text-ink">Agregar foto del producto</summary><div className="mt-4"><AttachmentUploader tripId={tripId} captureId={capture.id} type="PRODUCT_IMAGE" onBusyChange={handleAttachmentBusy} /></div></details></div>{hasEvidence ? <button disabled={busy || uploading} onClick={() => void analyzeEvidence()} className="app-primary-button mt-4 w-full justify-center" type="button">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{busy ? "Analizando…" : "Analizar información"}</button> : <p className="mt-3 text-sm text-ink-mute">Elegí una forma de captura para continuar.</p>}</section>
    {error ? <ErrorNotice error={error} /> : null}
    <CaptureFieldReview capture={capture} onEdit={setEditing} />
    {editing ? <section className="mt-4" aria-label={`Editar ${editing}`}><Tier1Editor key={`${editing}-${capture.updatedAt}`} capture={capture} field={editing} busy={busy} onSave={correct} /></section> : null}
    {unanswered.length ? <p className="mt-6 rounded-2xl bg-gold-soft p-4 text-sm text-ink-soft">Antes de guardar, revisá la categoría o marcala como “No sé”.</p> : null}
    <section className="mt-7 rounded-2xl border border-line bg-white p-5 shadow-soft"><h2 className="text-xl">Guardar proveedor</h2><p className="mt-2 text-sm leading-6 text-ink-mute">Nada se confirma automáticamente: vos decidís cuándo está listo.</p><button disabled={busy || uploading || !canConfirm} onClick={() => void confirm()} className="app-primary-button mt-4 w-full justify-center" type="button">{busy || uploading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}{uploading ? "Esperando la evidencia…" : busy ? "Guardando…" : "Guardar proveedor"}</button></section>
  </main>;
}

function TextStart({ rawText, busy, error, onChange, onAnalyze, onBack }: { rawText: string; busy: boolean; error: string | null; onChange: (value: string) => void; onAnalyze: () => void; onBack: () => void }) { return <section className="mt-7"><button type="button" onClick={onBack} className="min-h-11 text-sm font-semibold text-nihao">Elegir otra forma</button><h1 className="mt-3 text-3xl">Contame sobre este proveedor</h1><p className="mt-2 text-sm text-ink-mute">Anotá lo que escuchaste. No hace falta ordenar los datos.</p><textarea autoFocus value={rawText} onChange={(event) => onChange(event.target.value)} rows={8} className="app-input mt-5 min-h-52 resize-none" placeholder="Fabrican iluminación. FOB USD 7. MOQ 300 unidades. Entrega en 28 días." /><button disabled={busy || rawText.trim().length < 2} onClick={onAnalyze} className="app-primary-button mt-4 w-full justify-center" type="button">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{busy ? "Analizando…" : "Analizar información"}</button>{error ? <ErrorNotice error={error} /> : null}</section>; }
function ErrorNotice({ error }: { error: string }) { return <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-nihao-soft p-4 text-sm text-nihao"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>; }
