"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, LoaderCircle, Plus, Save, Sparkles } from "lucide-react";
import { calculateQuestionFields } from "@/lib/bot/tier1";
import type { SupplierAttachmentView, SupplierCaptureRecord, SupplierRecord, Tier1Data, Tier1Field } from "@/lib/bot/types";
import { appApi } from "./api";
import { AttachmentUploader } from "./AttachmentUploader";
import { AudioUploader } from "./AudioUploader";
import { CaptureFieldReview } from "./CaptureFieldReview";
import { CaptureSourceSelector, type CaptureSource } from "./CaptureSourceSelector";
import { Tier1Editor } from "./Tier1Editor";
import { authClient } from "@/lib/auth/client";
import { createOfflineCapture, indexedDbCaptureStore, type LocalEvidenceType } from "@/lib/offline/capture-store";
import { syncPendingCaptures } from "@/lib/offline/sync";
import { EMPTY_TIER_1_DATA } from "@/lib/bot/types";

export function ProductCapture({ tripId, resumeCaptureId }: { tripId: string; resumeCaptureId?: string }) {
  const session = authClient.useSession();
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
  const [productImages, setProductImages] = useState<SupplierAttachmentView[]>([]);
  const [selectedBusinessCardIds, setSelectedBusinessCardIds] = useState<string[]>([]);
  const [selectedAudioIds, setSelectedAudioIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(Boolean(resumeCaptureId));
  const [offlineMode, setOfflineMode] = useState(false);
  const [localCaptureId, setLocalCaptureId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);
  const captureRef = useRef<SupplierCaptureRecord | null>(null);
  const localObjectUrls = useRef<string[]>([]);
  useEffect(() => { captureRef.current = capture; }, [capture]);
  useEffect(() => () => { for (const url of localObjectUrls.current) URL.revokeObjectURL(url); }, []);

  const localUrl = useCallback((blob: Blob) => { const url = URL.createObjectURL(blob); localObjectUrls.current.push(url); return url; }, []);

  const localCapture = useCallback((localId: string, text = ""): SupplierCaptureRecord => {
    const now = new Date().toISOString();
    return { id: localId, userId: session.data?.user.id ?? "local", tripId, supplierId: null, status: "DRAFT", source: { type: "TEXT", text }, fields: { ...EMPTY_TIER_1_DATA }, missingFields: ["category"], reviewFields: [], acknowledgedUnknownFields: [], evidence: [], humanCorrectedFields: [], analyzedAttachmentIds: [], needsReanalysis: false, createdAt: now, updatedAt: now, confirmedAt: null };
  }, [session.data?.user.id, tripId]);

  const persistCapture = useCallback(async (text = "") => {
    const userId = session.data?.user.id;
    if (!userId) throw new Error("Necesitás iniciar sesión para guardar en este dispositivo");
    const localId = localCaptureId ?? crypto.randomUUID();
    const existing = await indexedDbCaptureStore.get(localId);
    const next = existing ?? createOfflineCapture(userId, tripId, localId);
    await indexedDbCaptureStore.put({ ...next, text, textSynced: false, updatedAt: new Date().toISOString() });
    setLocalCaptureId(localId);
    return localId;
  }, [localCaptureId, session.data?.user.id, tripId]);

  const persistEvidence = useCallback(async ({ type, file }: { type: LocalEvidenceType; file: File }) => {
    const localId = await persistCapture(rawText);
    const capture = await indexedDbCaptureStore.get(localId);
    if (!capture) throw new Error("No pudimos guardar la captura en este dispositivo");
    const evidenceId = crypto.randomUUID();
    const view: SupplierAttachmentView = { id: evidenceId, userId: capture.userId, tripId, captureId: capture.remoteCaptureId ?? localId, type, storageKey: "local", mimeType: file.type, size: file.size, createdAt: new Date().toISOString(), url: localUrl(file) };
    await indexedDbCaptureStore.put({ ...capture, textSynced: false, evidences: [...capture.evidences, { localId: evidenceId, type, blob: file, mimeType: file.type, size: file.size, createdAt: view.createdAt, status: "LOCAL" }], updatedAt: new Date().toISOString() });
    return { localId: evidenceId, view };
  }, [localUrl, persistCapture, rawText, tripId]);

  const markEvidenceSynced = useCallback(async (localId: string, remoteId: string) => {
    const capture = localCaptureId ? await indexedDbCaptureStore.get(localCaptureId) : null;
    if (!capture) return;
    await indexedDbCaptureStore.put({ ...capture, evidences: capture.evidences.map((evidence) => evidence.localId === localId ? { ...evidence, remoteAttachmentId: remoteId, status: "SYNCED" as const } : evidence), updatedAt: new Date().toISOString() });
  }, [localCaptureId]);

  const removeLocalEvidence = useCallback(async (evidenceId: string) => {
    if (!localCaptureId) return;
    const capture = await indexedDbCaptureStore.get(localCaptureId); if (!capture) return;
    await indexedDbCaptureStore.put({ ...capture, evidences: capture.evidences.filter((evidence) => evidence.localId !== evidenceId), updatedAt: new Date().toISOString() });
  }, [localCaptureId]);

  useEffect(() => {
    if (!resumeCaptureId) return;
    let active = true;
    appApi<{ capture: SupplierCaptureRecord }>(`/api/bot/captures/${encodeURIComponent(resumeCaptureId)}?tripId=${encodeURIComponent(tripId)}`)
      .then(({ capture: next }) => { if (active) { setCapture(next); setSource(next.source.type === "TEXT" ? "TEXT" : "CARD"); setRawText(next.source.text ?? ""); } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "No pudimos recuperar esta captura"); })
      .finally(() => { if (active) setResuming(false); });
    return () => { active = false; };
  }, [resumeCaptureId, tripId]);

  useEffect(() => { queueMicrotask(() => setRawText(window.localStorage.getItem(autosaveKey) ?? "")); }, [autosaveKey]);
  useEffect(() => {
    const userId = session.data?.user.id; if (!userId) return;
    let active = true;
    void indexedDbCaptureStore.list(userId, tripId).then((pending) => {
      if (!active) return;
      setPendingCount(pending.length);
      const first = pending[0];
      if (first && !captureRef.current) {
        const hydrated = localCapture(first.localId, first.text); captureRef.current = hydrated;
        setLocalCaptureId(first.localId); setCapture(hydrated); setRawText(first.text); setOfflineMode(!first.remoteCaptureId); setSource(first.text ? "TEXT" : "CARD");
        for (const evidence of first.evidences) {
          const view: SupplierAttachmentView = { id: evidence.localId, userId: first.userId, tripId, captureId: first.remoteCaptureId ?? first.localId, type: evidence.type, storageKey: "local", mimeType: evidence.mimeType, size: evidence.size, createdAt: evidence.createdAt, url: localUrl(evidence.blob) };
          if (evidence.type === "BUSINESS_CARD") setBusinessCards((current) => [...current, view]); else if (evidence.type === "AUDIO") setAudios((current) => [...current, view]); else setProductImages((current) => [...current, view]);
        }
      }
    }).catch(() => undefined);
    const sync = async (force = false) => {
      if (!navigator.onLine || syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      try {
        const results = await syncPendingCaptures(indexedDbCaptureStore, userId, tripId, force);
        if (active) setPendingCount((await indexedDbCaptureStore.list(userId, tripId)).length);
        if (active && results.some((result) => result.status === "auth")) setError("Necesitás iniciar sesión nuevamente para sincronizar esta captura.");
        const synced = results.find((result) => result.status === "synced" && result.capture?.localId === localCaptureId);
        if (active && synced?.capture?.remoteCaptureId) {
          const result = await appApi<{ capture: SupplierCaptureRecord }>(`/api/bot/captures/${encodeURIComponent(synced.capture.remoteCaptureId)}?tripId=${encodeURIComponent(tripId)}`);
          setCapture(result.capture); setOfflineMode(false); setError(null);
        }
      } finally { syncingRef.current = false; if (active) setSyncing(false); }
    };
    const online = () => void sync(); const manual = () => void sync(true); void sync(); window.addEventListener("online", online); window.addEventListener("nihao:sync-now", manual); document.addEventListener("visibilitychange", online);
    return () => { active = false; window.removeEventListener("online", online); window.removeEventListener("nihao:sync-now", manual); document.removeEventListener("visibilitychange", online); };
  }, [localCapture, localCaptureId, localUrl, session.data?.user.id, tripId]);
  const handleAttachments = useCallback((type: "BUSINESS_CARD" | "PRODUCT_IMAGE", attachments: SupplierAttachmentView[]) => {
    if (type === "PRODUCT_IMAGE") return setProductImages(attachments);
    setBusinessCards(attachments);
    setSelectedBusinessCardIds((current) => {
      const available = new Set(attachments.map((attachment) => attachment.id));
      return [...current.filter((id) => available.has(id)), ...attachments.map((attachment) => attachment.id).filter((id) => !current.includes(id))].slice(0, 3);
    });
  }, []);
  const handleAudios = useCallback((attachments: SupplierAttachmentView[]) => {
    setAudios(attachments);
    setSelectedAudioIds((current) => {
      const available = new Set(attachments.map((attachment) => attachment.id));
      return [...current.filter((id) => available.has(id)), ...attachments.map((attachment) => attachment.id).filter((id) => !current.includes(id))].slice(0, 3);
    });
  }, []);

  async function createDraft(nextSource: CaptureSource, initialText = ""): Promise<boolean> {
    setBusy(true); setError(null); setSource(nextSource);
    try {
      const localId = await persistCapture(initialText);
      const result = await appApi<{ capture: SupplierCaptureRecord }>("/api/bot/captures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, clientCaptureId: localId }) });
      setCapture(result.capture); setOfflineMode(false);
      const stored = await indexedDbCaptureStore.get(localId); if (stored) await indexedDbCaptureStore.put({ ...stored, remoteCaptureId: result.capture.id, updatedAt: new Date().toISOString() });
      return true;
    } catch (caught) {
      if (caught instanceof Error && caught.message.includes("iniciar sesión")) throw caught;
      const status = caught instanceof Error && "status" in caught ? Number((caught as Error & { status?: number }).status) : 0;
      if (status >= 400 && status < 500) { setError(caught instanceof Error ? caught.message : "No pudimos crear la captura."); return false; }
      const localId = localCaptureId ?? crypto.randomUUID(); setOfflineMode(true); setCapture(localCapture(localId, initialText)); setLocalCaptureId(localId); setError("Sin conexión. La captura queda guardada en este dispositivo y se sincronizará al volver Internet."); return false;
    }
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
      if (!capture) { const createdOnline = await createDraft("TEXT", rawText); if (!createdOnline) return; }
      if (offlineMode) { await persistCapture(rawText); setError("Guardado en este dispositivo. Se analizará cuando vuelva Internet."); return; }
      const result = await appApi<{ capture: SupplierCaptureRecord }>("/api/bot/extractions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, text: rawText, businessCardAttachmentIds: [] }) });
      setCapture(result.capture);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos analizar la nota. La conservamos para que reintentes."); }
    finally { setBusy(false); }
  }

  async function analyzeEvidence() {
    if (!capture || (!selectedBusinessCardIds.length && !selectedAudioIds.length && rawText.trim().length < 2)) return;
    setBusy(true); setError(null);
    try {
      if (offlineMode) { await persistCapture(rawText); setError("Guardado en este dispositivo. Se analizará cuando vuelva Internet."); return; }
      const result = await appApi<{ capture: SupplierCaptureRecord }>("/api/bot/extractions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, captureId: capture.id, text: rawText.trim() || undefined, businessCardAttachmentIds: selectedBusinessCardIds, audioAttachmentIds: selectedAudioIds }) });
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

  function startAnother() { setCapture(null); setSource(null); setSavedSupplier(null); setEditing(null); setRawText(""); setBusinessCards([]); setAudios([]); setProductImages([]); setSelectedBusinessCardIds([]); setSelectedAudioIds([]); setError(null); }

  if (savedSupplier) return <main className="app-page flex min-h-[70dvh] items-center"><section className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-white p-7 text-center shadow-card"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-nihao-soft text-nihao"><CheckCircle2 className="h-8 w-8" /></span><p className="mt-5 text-eyebrow-mark">Todo listo</p><h1 className="mt-3 text-3xl">Proveedor guardado</h1><p className="mt-2 text-sm text-ink-mute">Podés seguir capturando mientras la información está fresca.</p><button type="button" onClick={startAnother} className="app-primary-button mt-7 w-full justify-center"><Plus className="h-5 w-5" />Capturar otro proveedor</button><button type="button" onClick={() => router.push(`/app/viajes/${tripId}/proveedores/${savedSupplier.id}`)} className="app-secondary-button mt-3 w-full justify-center">Ver proveedor</button></section></main>;

  if (resuming) return <main className="app-page grid min-h-72 place-items-center" aria-busy="true"><LoaderCircle className="h-7 w-7 animate-spin text-nihao" /></main>;

  if (!capture) return <main className="app-page max-w-xl"><Link href={`/app/viajes/${tripId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Volver al viaje</Link><p className="mt-5 text-eyebrow-mark">Nuevo proveedor</p>{source === "TEXT" ? <TextStart rawText={rawText} busy={busy} error={error} onChange={(value) => { setRawText(value); window.localStorage.setItem(autosaveKey, value); }} onAnalyze={() => void analyzeText()} onBack={() => setSource(null)} /> : <><CaptureSourceSelector busy={busy} onSelect={(next) => void chooseSource(next)} />{busy ? <p aria-live="polite" className="mt-4 flex items-center gap-2 text-sm text-ink-mute"><LoaderCircle className="h-4 w-4 animate-spin text-nihao" />Preparando tu captura…</p> : null}{error ? <ErrorNotice error={error} /> : null}</>}</main>;

  const unanswered = calculateQuestionFields(capture.fields, capture.acknowledgedUnknownFields);
  const canConfirm = (Boolean(capture.fields.category) || capture.acknowledgedUnknownFields.includes("category")) && !capture.needsReanalysis && !offlineMode;
  const uploading = attachmentBusy.BUSINESS_CARD || attachmentBusy.PRODUCT_IMAGE || attachmentBusy.AUDIO;
  const hasEvidence = businessCards.length > 0 || audios.length > 0 || rawText.trim().length >= 2;
  const handleAttachmentBusy = (type: "BUSINESS_CARD" | "PRODUCT_IMAGE", value: boolean) => setAttachmentBusy((current) => ({ ...current, [type]: value }));
  return <main className="app-page max-w-xl pb-10"><button onClick={() => setCapture(null)} type="button" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Volver a empezar</button><p className="mt-5 text-eyebrow-mark">Proveedor nuevo</p><h1 className="mt-3 text-3xl">Capturá y revisá</h1><p className="mt-2 text-sm leading-6 text-ink-mute">Agregá una evidencia, analizala y corregí sólo lo necesario antes de guardar.</p>{pendingCount ? <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-gold-soft p-4 text-sm text-ink-soft"><span>{pendingCount} captura{pendingCount === 1 ? "" : "s"} pendiente{pendingCount === 1 ? "" : "s"} de sincronizar</span><button type="button" className="font-semibold text-nihao" disabled={syncing} onClick={() => window.dispatchEvent(new Event("nihao:sync-now"))}>{syncing ? "Sincronizando…" : "Sincronizar ahora"}</button></div> : null}{offlineMode ? <p role="status" className="mt-3 rounded-2xl bg-gold-soft p-4 text-sm text-ink-soft">Sin conexión. La captura queda guardada en este dispositivo y se sincronizará al volver Internet.</p> : syncing ? <p role="status" className="mt-4 text-sm text-ink-mute">Sincronizando evidencias…</p> : null}
    <section className="mt-7" aria-labelledby="evidence-heading"><h2 id="evidence-heading" className="text-xl">Evidencias</h2><p className="mt-1 text-sm text-ink-mute">Podés sumar tarjetas, fotos, notas de voz y una nota escrita antes de guardar.</p><div className="mt-3 grid gap-4"><AttachmentUploader tripId={tripId} captureId={capture.id} type="BUSINESS_CARD" offline={offlineMode} persistEvidence={persistEvidence} markEvidenceSynced={markEvidenceSynced} removeLocalEvidence={removeLocalEvidence} onBusyChange={handleAttachmentBusy} onAttachmentsChange={handleAttachments} selectedAttachmentIds={selectedBusinessCardIds} onSelectedAttachmentIdsChange={setSelectedBusinessCardIds} selectionLimit={3} analyzedAttachmentIds={capture.analyzedAttachmentIds} needsReanalysis={capture.needsReanalysis} /><AudioUploader tripId={tripId} captureId={capture.id} offline={offlineMode} persistEvidence={persistEvidence} markEvidenceSynced={markEvidenceSynced} removeLocalEvidence={removeLocalEvidence} onBusyChange={(value) => setAttachmentBusy((current) => ({ ...current, AUDIO: value }))} onAttachmentsChange={handleAudios} selectedAttachmentIds={selectedAudioIds} onSelectedAttachmentIdsChange={setSelectedAudioIds} analyzedAttachmentIds={capture.analyzedAttachmentIds} needsReanalysis={capture.needsReanalysis} /><details className="rounded-2xl border border-line bg-white p-4 shadow-soft"><summary className="cursor-pointer font-semibold text-ink">Agregar una nota escrita</summary><textarea value={rawText} onChange={(event) => { setRawText(event.target.value); window.localStorage.setItem(autosaveKey, event.target.value); void persistCapture(event.target.value); }} rows={5} className="app-input mt-4 min-h-32 resize-none" placeholder="Ej. Fabrican iluminación. FOB USD 7. MOQ 300 unidades. Entrega en 28 días." /></details><details className="rounded-2xl border border-line bg-white p-4 shadow-soft"><summary className="cursor-pointer font-semibold text-ink">Agregar fotos del producto {productImages.length ? `(${productImages.length})` : ""}</summary><div className="mt-4"><AttachmentUploader tripId={tripId} captureId={capture.id} type="PRODUCT_IMAGE" offline={offlineMode} persistEvidence={persistEvidence} markEvidenceSynced={markEvidenceSynced} removeLocalEvidence={removeLocalEvidence} onBusyChange={handleAttachmentBusy} onAttachmentsChange={handleAttachments} /></div></details></div>{hasEvidence ? <button disabled={busy || uploading} onClick={() => void analyzeEvidence()} className="app-primary-button mt-4 w-full justify-center" type="button">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{busy ? "Analizando…" : "Analizar información"}</button> : <p className="mt-3 text-sm text-ink-mute">Elegí una forma de captura para continuar.</p>}{capture.needsReanalysis ? <p role="status" className="mt-3 rounded-2xl bg-gold-soft p-4 text-sm text-ink-soft">La evidencia analizada cambió. Volvé a analizar antes de guardar para revisar la información actualizada.</p> : null}</section>
    {error ? <ErrorNotice error={error} /> : null}
    <CaptureFieldReview capture={capture} onEdit={setEditing} />
    {editing ? <section className="mt-4" aria-label={`Editar ${editing}`}><Tier1Editor key={`${editing}-${capture.updatedAt}`} capture={capture} field={editing} busy={busy} onSave={correct} /></section> : null}
    {unanswered.length ? <p className="mt-6 rounded-2xl bg-gold-soft p-4 text-sm text-ink-soft">Antes de guardar, revisá la categoría o marcala como “No sé”.</p> : null}
    <section className="mt-7 rounded-2xl border border-line bg-white p-5 shadow-soft"><h2 className="text-xl">Guardar proveedor</h2><p className="mt-2 text-sm leading-6 text-ink-mute">Nada se confirma automáticamente: vos decidís cuándo está listo.</p>{offlineMode ? <p className="mt-3 text-sm text-ink-soft">Necesitás conexión para analizar y guardar el proveedor. La captura local no se pierde.</p> : null}<button disabled={busy || uploading || !canConfirm} onClick={() => void confirm()} className="app-primary-button mt-4 w-full justify-center" type="button">{busy || uploading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}{uploading ? "Esperando la evidencia…" : busy ? "Guardando…" : "Guardar proveedor"}</button></section>
  </main>;
}

function TextStart({ rawText, busy, error, onChange, onAnalyze, onBack }: { rawText: string; busy: boolean; error: string | null; onChange: (value: string) => void; onAnalyze: () => void; onBack: () => void }) { return <section className="mt-7"><button type="button" onClick={onBack} className="min-h-11 text-sm font-semibold text-nihao">Elegir otra forma</button><h1 className="mt-3 text-3xl">Contame sobre este proveedor</h1><p className="mt-2 text-sm text-ink-mute">Anotá lo que escuchaste. No hace falta ordenar los datos.</p><textarea autoFocus value={rawText} onChange={(event) => onChange(event.target.value)} rows={8} className="app-input mt-5 min-h-52 resize-none" placeholder="Fabrican iluminación. FOB USD 7. MOQ 300 unidades. Entrega en 28 días." /><button disabled={busy || rawText.trim().length < 2} onClick={onAnalyze} className="app-primary-button mt-4 w-full justify-center" type="button">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{busy ? "Analizando…" : "Analizar información"}</button>{error ? <ErrorNotice error={error} /> : null}</section>; }
function ErrorNotice({ error }: { error: string }) { return <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-nihao-soft p-4 text-sm text-nihao"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>; }
