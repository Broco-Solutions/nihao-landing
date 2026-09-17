"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle, Trash2, UploadCloud } from "lucide-react";
import type { AttachmentType, SupplierAttachmentView } from "@/lib/bot/types";
import { apiUrl } from "@/lib/api/origin";
import { appApi } from "./api";

const LABELS: Record<"BUSINESS_CARD" | "PRODUCT_IMAGE", { title: string; help: string }> = {
  BUSINESS_CARD: { title: "Business card", help: "Fotografiá la tarjeta o elegí una imagen." },
  PRODUCT_IMAGE: { title: "Foto de producto", help: "Guardá una referencia visual del stand." },
};

export function AttachmentUploader({ tripId, captureId, type, compact = false, onBusyChange, onAttachmentsChange }: {
  tripId: string;
  captureId: string;
  type: Extract<AttachmentType, "BUSINESS_CARD" | "PRODUCT_IMAGE">;
  compact?: boolean;
  onBusyChange?: (type: Extract<AttachmentType, "BUSINESS_CARD" | "PRODUCT_IMAGE">, busy: boolean) => void;
  onAttachmentsChange?: (type: Extract<AttachmentType, "BUSINESS_CARD" | "PRODUCT_IMAGE">, attachments: SupplierAttachmentView[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<SupplierAttachmentView[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    appApi<{ attachments: SupplierAttachmentView[] }>(`/api/bot/captures/${captureId}/attachments?tripId=${encodeURIComponent(tripId)}`)
      .then((result) => { const next = result.attachments.filter((item) => item.type === type); if (active) { setAttachments(next); onAttachmentsChange?.(type, next); } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "No pudimos cargar los adjuntos"); });
    return () => { active = false; };
  }, [captureId, tripId, type, onAttachmentsChange]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function select(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(selected ? URL.createObjectURL(selected) : null);
    setError(null);
  }

  function upload() {
    if (!file) return;
    setBusy(true);
    onBusyChange?.(type, true);
    setProgress(0);
    setError(null);
    const body = new FormData();
    body.set("tripId", tripId);
    body.set("type", type);
    body.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(`/api/bot/captures/${captureId}/attachments`));
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100)); };
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText) as { attachment?: SupplierAttachmentView; error?: string };
        if (xhr.status < 200 || xhr.status >= 300 || !payload.attachment) throw new Error(payload.error ?? "No pudimos subir la imagen");
        setAttachments((current) => { const next = [payload.attachment!, ...current]; onAttachmentsChange?.(type, next); return next; });
        setFile(null);
        setPreview(null);
        if (input.current) input.current.value = "";
      } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos subir la imagen"); }
      finally { setBusy(false); onBusyChange?.(type, false); }
    };
    xhr.onerror = () => { setError("Se cortó la conexión. La imagen no se guardó; podés reintentar."); setBusy(false); onBusyChange?.(type, false); };
    xhr.send(body);
  }

  async function remove(attachment: SupplierAttachmentView) {
    setBusy(true);
    onBusyChange?.(type, true);
    setError(null);
    try {
      await appApi(`/api/bot/captures/${captureId}/attachments/${attachment.id}?tripId=${encodeURIComponent(tripId)}`, { method: "DELETE" });
      setAttachments((current) => { const next = current.filter((item) => item.id !== attachment.id); onAttachmentsChange?.(type, next); return next; });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos eliminar la imagen"); }
    finally { setBusy(false); onBusyChange?.(type, false); }
  }

  const labels = LABELS[type];
  return (
    <div className={compact ? "" : "rounded-2xl border border-line bg-white p-4 shadow-soft"}>
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-base">{labels.title}</h3><p className="mt-1 text-xs text-ink-mute">{labels.help} JPG, PNG o WebP · hasta 8 MB.</p></div>{type === "BUSINESS_CARD" ? <Camera className="h-5 w-5 shrink-0 text-nihao" /> : <ImagePlus className="h-5 w-5 shrink-0 text-nihao" />}</div>
      <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={select} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {attachments.map((attachment) => <div key={attachment.id} className="relative aspect-square rounded-xl bg-cover bg-center" role="img" aria-label={labels.title} style={{ backgroundImage: `url(${attachment.url})` }}><button disabled={busy} onClick={() => void remove(attachment)} type="button" aria-label="Eliminar imagen" className="absolute right-1.5 top-1.5 grid h-10 w-10 place-items-center rounded-xl bg-white/95 text-nihao shadow"><Trash2 className="h-4 w-4" /></button></div>)}
        {preview ? <div className="aspect-square rounded-xl bg-cover bg-center ring-2 ring-nihao" role="img" aria-label="Vista previa" style={{ backgroundImage: `url(${preview})` }} /> : null}
        <button disabled={busy} onClick={() => input.current?.click()} type="button" className="grid aspect-square min-h-24 place-items-center rounded-xl border border-dashed border-line-strong bg-paper-soft text-center text-xs font-semibold text-ink-mute"><span><Camera className="mx-auto mb-2 h-5 w-5 text-nihao" />{attachments.length ? "Otra foto" : "Elegir foto"}</span></button>
      </div>
      {file ? <button disabled={busy} onClick={upload} type="button" className="app-secondary-button mt-3 w-full">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}{busy ? `Subiendo ${progress}%` : "Guardar imagen"}</button> : null}
      {busy && file ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-warm"><div className="h-full bg-nihao transition-[width]" style={{ width: `${progress}%` }} /></div> : null}
      {error ? <p role="alert" className="mt-3 text-xs text-nihao">{error}</p> : null}
    </div>
  );
}
