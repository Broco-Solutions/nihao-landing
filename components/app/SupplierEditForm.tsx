"use client";

import { useState } from "react";
import type { SupplierDetailRecord } from "@/lib/bot/types";
import { appApi } from "./api";

type Contact = { type: "EMAIL" | "PHONE" | "FAX" | "WECHAT" | null; rawText: string };

export function SupplierEditForm({ tripId, supplier, onSaved, onCancel }: { tripId: string; supplier: SupplierDetailRecord; onSaved: (supplier: SupplierDetailRecord) => void; onCancel: () => void }) {
  const [values, setValues] = useState({ companyName: supplier.companyName ?? "", notes: supplier.notes ?? "", companyNameLatin: supplier.companyNameLatin ?? "", city: supplier.city ?? "", province: supplier.province ?? "", category: supplier.category ?? "", supplierType: supplier.supplierType, website: supplier.website ?? "", interestScore: supplier.interestScore?.toString() ?? "" });
  const [contacts, setContacts] = useState<Contact[]>(supplier.contacts.map((contact) => ({ type: contact.type ?? null, rawText: contact.rawText })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try {
      const result = await appApi<{ supplier: SupplierDetailRecord }>(`/api/bot/suppliers/${supplier.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId, notes: values.notes, notesMode: "replace", companyName: values.companyName, companyNameLatin: values.companyNameLatin, city: values.city, province: values.province, category: values.category, supplierType: values.supplierType, website: values.website, interestScore: values.interestScore ? Number(values.interestScore) : null, contacts: contacts.filter((contact) => contact.rawText.trim()) }) });
      onSaved(result.supplier);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar el proveedor"); }
    finally { setBusy(false); }
  }
  const field = (label: string, key: "companyName" | "companyNameLatin" | "city" | "province" | "category" | "website") => <label className="block text-xs font-medium text-ink-mute">{label}<input className="app-input mt-1" value={values[key]} onChange={(event) => setValues((value) => ({ ...value, [key]: event.target.value }))} /></label>;
  return <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-soft"><h2 className="text-xl">Editar proveedor</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{field("Nombre original", "companyName")}{field("Nombre en letras latinas", "companyNameLatin")}{field("Categoría", "category")}{field("Ciudad", "city")}{field("Provincia", "province")}{field("Sitio web (https://…)", "website")}<label className="block text-xs font-medium text-ink-mute">Tipo<select className="app-input mt-1" value={values.supplierType} onChange={(event) => setValues((value) => ({ ...value, supplierType: event.target.value as typeof value.supplierType }))}><option value="UNKNOWN">Sin definir</option><option value="FACTORY">Fábrica</option><option value="TRADING">Trading</option></select></label><label className="block text-xs font-medium text-ink-mute">Interés (1 a 10)<select className="app-input mt-1" value={values.interestScore} onChange={(event) => setValues((value) => ({ ...value, interestScore: event.target.value }))}><option value="">Sin calificar</option>{Array.from({ length: 10 }, (_, index) => index + 1).map((score) => <option key={score} value={score}>{score}</option>)}</select></label></div>
    <label className="mt-4 block text-sm font-medium">Notas<textarea className="app-input mt-1 min-h-32" value={values.notes} onChange={(event) => setValues((value) => ({ ...value, notes: event.target.value }))} /></label>
    <h3 className="mt-5 font-semibold">Contactos</h3><div className="mt-2 space-y-2">{contacts.map((contact, index) => <div key={index} className="flex gap-2"><select className="app-input max-w-36" aria-label={`Tipo de contacto ${index + 1}`} value={contact.type ?? ""} onChange={(event) => setContacts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as Contact["type"] || null } : item))}><option value="">Sin clasificar</option><option value="EMAIL">Email</option><option value="PHONE">Teléfono</option><option value="FAX">Fax</option><option value="WECHAT">WeChat</option></select><input className="app-input" aria-label={`Contacto ${index + 1}`} value={contact.rawText} onChange={(event) => setContacts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, rawText: event.target.value } : item))} /><button type="button" className="px-2 text-nihao" aria-label={`Quitar contacto ${index + 1}`} onClick={() => setContacts((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Quitar</button></div>)}</div><button type="button" className="mt-3 text-sm font-semibold text-nihao" onClick={() => setContacts((items) => [...items, { type: "EMAIL", rawText: "" }])}>Agregar contacto</button>
    {error ? <p role="alert" className="mt-3 text-sm text-nihao">{error}</p> : null}<div className="mt-5 flex gap-2"><button type="button" className="app-primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar cambios"}</button><button type="button" className="app-secondary-button" onClick={onCancel}>Cancelar</button></div></section>;
}
