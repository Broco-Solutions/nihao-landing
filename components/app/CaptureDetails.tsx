"use client";

import { useState } from "react";
import type { SupplierCaptureRecord } from "@/lib/bot/types";
import { appApi } from "./api";

type Method = NonNullable<SupplierCaptureRecord["contactMethods"]>[number];

export function CaptureDetails({ tripId, capture, onSaved, offline, onBusyChange }: { tripId: string; capture: SupplierCaptureRecord; onSaved: (capture: SupplierCaptureRecord) => void; offline: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [notes, setNotes] = useState(capture.notes ?? "");
  const [website, setWebsite] = useState(capture.website ?? "");
  const [methods, setMethods] = useState<Method[]>(capture.contactMethods ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); onBusyChange?.(true); setError(null);
    try {
      const result = await appApi<{ capture: SupplierCaptureRecord; website: string | null; contactMethods: Method[] }>(`/api/bot/captures/${capture.id}/details`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, notes, website, contacts: methods.filter((method) => method.rawText.trim()) }) });
      onSaved(result.capture);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar estos datos"); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  return <section className="mt-7 rounded-2xl border border-line bg-white p-5 shadow-soft"><h2 className="text-xl">Notas y contactos</h2><label className="mt-3 block text-sm font-medium">Notas<textarea className="app-input mt-1 min-h-32" value={notes} onChange={(event) => setNotes(event.target.value)} /></label><label className="mt-3 block text-xs font-medium text-ink-mute">Sitio web<input className="app-input mt-1" value={website} placeholder="https://ejemplo.com" onChange={(event) => setWebsite(event.target.value)} /></label>{methods.map((method, index) => <div key={index} className="mt-3 flex gap-2"><select className="app-input max-w-32" aria-label={`Tipo de contacto ${index + 1}`} value={method.type ?? ""} onChange={(event) => setMethods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as Method["type"] } : item))}><option value="">Tipo</option><option value="EMAIL">Email</option><option value="PHONE">Teléfono</option><option value="FAX">Fax</option><option value="WECHAT">WeChat</option></select><input className="app-input" aria-label={`Contacto ${index + 1}`} value={method.rawText} onChange={(event) => setMethods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, rawText: event.target.value } : item))} /><button type="button" className="text-sm text-nihao" onClick={() => setMethods((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Quitar</button></div>)}<button type="button" className="mt-3 text-sm font-semibold text-nihao" onClick={() => setMethods((items) => [...items, { type: "EMAIL", rawText: "" }])}>Agregar contacto</button>{error ? <p role="alert" className="mt-3 text-sm text-nihao">{error}</p> : null}<button type="button" className="app-secondary-button mt-4 w-full" disabled={busy || offline} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar notas y contactos"}</button>{offline ? <p className="mt-2 text-xs text-ink-mute">Disponible al sincronizar la captura.</p> : null}</section>;
}
