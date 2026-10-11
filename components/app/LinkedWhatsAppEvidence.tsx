"use client";

import { useEffect, useState } from "react";
import { appApi } from "./api";

type Row = { id: string; type: string; sentAt: string; text: string | null; transcript: string | null; mediaAvailable: boolean; decisions: Array<{ captureId: string | null; productId: string | null; action: string; appliedFields: string[] }> };

export function LinkedWhatsAppEvidence({ tripId, captureId, productId }: { tripId: string; captureId: string; productId?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let active = true;
    void appApi<{ evidence: Array<{ messages: Row[] }> }>(`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence`).then(({ evidence }) => {
      if (active) setRows(evidence.flatMap((burst) => burst.messages).filter((message) => message.decisions.some((decision) => decision.captureId === captureId && (!productId || decision.productId === productId))));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [tripId, captureId, productId]);
  if (!rows.length) return null;
  return <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-soft"><h2 className="text-xl">Evidencias de WhatsApp vinculadas</h2><p className="mt-1 text-sm text-ink-mute">Fuentes originales que respaldan este registro.</p><div className="mt-4 grid gap-3">{rows.map((message) => <article key={message.id} className="rounded-xl bg-paper-soft p-3"><p className="text-xs font-semibold text-ink-mute">{message.type === "AUDIO" ? "Audio" : message.type === "IMAGE" ? "Imagen" : message.type === "TEXT" ? "Mensaje" : "Documento"} · {new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(message.sentAt))}</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap wrap-anywhere text-sm">{message.text ?? message.transcript ?? "Original privado conservado"}</p>{message.mediaAvailable ? <a className="mt-2 inline-block text-sm font-semibold text-nihao underline" href={`/api/bot/trips/${encodeURIComponent(tripId)}/whatsapp-evidence/${encodeURIComponent(message.id)}/media`} target="_blank" rel="noreferrer">Abrir original privado</a> : null}</article>)}</div></section>;
}
