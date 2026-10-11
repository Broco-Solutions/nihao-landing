"use client";

import { useState } from "react";
import type { SupplierCaptureRecord } from "@/lib/bot/types";
import { appApi } from "./api";
import { AppSelect } from "./AppSelect";
import { AppNotice } from "./AppNotice";

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
  return <section className="mt-7 rounded-2xl border border-line bg-white p-5 shadow-soft"><h2 className="text-xl">Notas y contactos</h2><label className="mt-3 block text-sm font-medium">Notas<textarea className="app-input mt-1 min-h-32" value={notes} onChange={(event) => setNotes(event.target.value)} /></label><label className="mt-3 block text-xs font-medium text-ink-mute">Sitio web<input className="app-input mt-1" value={website} placeholder="https://ejemplo.com" onChange={(event) => setWebsite(event.target.value)} /></label>{methods.map((method, index) => <div key={index} className="mt-3 grid gap-2 sm:grid-cols-[9rem_1fr_auto]"><AppSelect ariaLabel={`Tipo de contacto ${index + 1}`} value={method.type ?? ""} placeholder="Tipo" clearable onValueChange={(next) => setMethods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, type: (next || null) as Method["type"] } : item))} options={[{ value: "EMAIL", label: "Email" }, { value: "PHONE", label: "Teléfono" }, { value: "FAX", label: "Fax" }, { value: "WECHAT", label: "WeChat" }]} /><input className="app-input" aria-label={`Contacto ${index + 1}`} value={method.rawText} onChange={(event) => setMethods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, rawText: event.target.value } : item))} /><button type="button" className="min-h-11 px-2 text-sm text-nihao" onClick={() => setMethods((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Quitar</button></div>)}<button type="button" className="mt-3 text-sm font-semibold text-nihao" onClick={() => setMethods((items) => [...items, { type: "EMAIL", rawText: "" }])}>Agregar contacto</button>{error ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}<button type="button" className="app-secondary-button mt-4 w-full" disabled={busy || offline} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar notas y contactos"}</button>{offline ? <p className="mt-2 text-xs text-ink-mute">Disponible al sincronizar la captura.</p> : null}</section>;
}
