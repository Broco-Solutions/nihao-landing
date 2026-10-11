"use client";

import { useState } from "react";
import type { SupplierDetailRecord } from "@/lib/bot/types";
import { appApi } from "./api";
import { AppSelect } from "./AppSelect";
import { AppNotice } from "./AppNotice";

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
  return <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-soft"><h2 className="text-xl">Editar proveedor</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{field("Nombre original", "companyName")}{field("Nombre en letras latinas", "companyNameLatin")}{field("Categoría", "category")}{field("Ciudad", "city")}{field("Provincia", "province")}{field("Sitio web (https://…)", "website")}<AppSelect label="Tipo" value={values.supplierType} onValueChange={(next) => setValues((value) => ({ ...value, supplierType: next as typeof value.supplierType }))} options={[{ value: "UNKNOWN", label: "Sin definir" }, { value: "FACTORY", label: "Fábrica" }, { value: "TRADING", label: "Trading" }]} /><AppSelect label="Interés (1 a 10)" value={values.interestScore} onValueChange={(next) => setValues((value) => ({ ...value, interestScore: next }))} clearable placeholder="Sin calificar" options={Array.from({ length: 10 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))} /></div>
    <label className="mt-4 block text-sm font-medium">Notas<textarea className="app-input mt-1 min-h-32" value={values.notes} onChange={(event) => setValues((value) => ({ ...value, notes: event.target.value }))} /></label>
    <h3 className="mt-5 font-semibold">Contactos</h3><div className="mt-2 space-y-2">{contacts.map((contact, index) => <div key={index} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]"><AppSelect ariaLabel={`Tipo de contacto ${index + 1}`} value={contact.type ?? ""} onValueChange={(next) => setContacts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, type: (next || null) as Contact["type"] } : item))} clearable placeholder="Sin clasificar" options={[{ value: "EMAIL", label: "Email" }, { value: "PHONE", label: "Teléfono" }, { value: "FAX", label: "Fax" }, { value: "WECHAT", label: "WeChat" }]} /><input className="app-input" aria-label={`Contacto ${index + 1}`} value={contact.rawText} onChange={(event) => setContacts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, rawText: event.target.value } : item))} /><button type="button" className="min-h-11 px-2 text-nihao" aria-label={`Quitar contacto ${index + 1}`} onClick={() => setContacts((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Quitar</button></div>)}</div><button type="button" className="mt-3 text-sm font-semibold text-nihao" onClick={() => setContacts((items) => [...items, { type: "EMAIL", rawText: "" }])}>Agregar contacto</button>
    {error ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}<div className="mt-5 flex gap-2"><button type="button" className="app-primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar cambios"}</button><button type="button" className="app-secondary-button" onClick={onCancel}>Cancelar</button></div></section>;
}
