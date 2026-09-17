"use client";

import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { SupplierCaptureRecord, Tier1Data, Tier1Field } from "@/lib/bot/types";
import { FIELD_LABELS } from "./tier1-display";

const STRING_FIELDS = ["companyName", "city", "province", "contact", "category"] as const;
type StringField = (typeof STRING_FIELDS)[number];

function TextInput({ label, value, onChange, inputMode = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; inputMode?: "text" | "decimal" | "numeric"; placeholder?: string }) {
  return <label className="block text-xs font-semibold text-ink-mute">{label}<input className="app-input mt-1.5" value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} placeholder={placeholder} /></label>;
}

function Choice({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`min-h-12 rounded-xl border px-2 text-xs font-semibold ${active ? "border-nihao bg-nihao text-white" : "border-line bg-white"}`}>{children}</button>;
}

export function Tier1Editor({ capture, field, busy, onSave }: {
  capture: SupplierCaptureRecord;
  field: Tier1Field;
  busy: boolean;
  onSave: <Field extends Tier1Field>(field: Field, value: Tier1Data[Field], unknown?: boolean) => Promise<void>;
}) {
  const [fields, setFields] = useState<Tier1Data>(() => structuredClone(capture.fields));
  const isString = STRING_FIELDS.includes(field as StringField);
  let control: React.ReactNode;
  if (isString) {
    const stringField = field as StringField;
    control = <TextInput label={FIELD_LABELS[field]} value={fields[stringField] ?? ""} onChange={(value) => setFields((current) => ({ ...current, [stringField]: value || null }))} />;
  } else if (field === "supplierType") {
    control = <div className="grid grid-cols-3 gap-2"><Choice active={fields.supplierType === "FACTORY"} onClick={() => setFields((value) => ({ ...value, supplierType: "FACTORY" }))}>Fábrica</Choice><Choice active={fields.supplierType === "TRADING"} onClick={() => setFields((value) => ({ ...value, supplierType: "TRADING" }))}>Trading</Choice><Choice active={fields.supplierType === "UNKNOWN"} onClick={() => setFields((value) => ({ ...value, supplierType: "UNKNOWN" }))}>No sé</Choice></div>;
  } else if (field === "fob") {
    const fob = fields.fob ?? { amount: null, currency: "USD", unit: "unidad", rawText: "" };
    control = <div className="grid grid-cols-2 gap-2"><TextInput label="Monto" inputMode="decimal" value={fob.amount?.toString() ?? ""} onChange={(value) => setFields((current) => ({ ...current, fob: { ...fob, amount: value ? Number(value.replace(",", ".")) : null } }))} /><TextInput label="Moneda" value={fob.currency ?? ""} onChange={(value) => setFields((current) => ({ ...current, fob: { ...fob, currency: value.toUpperCase() || null } }))} /><span className="col-span-2"><TextInput label="Unidad" value={fob.unit ?? ""} onChange={(value) => setFields((current) => ({ ...current, fob: { ...fob, unit: value || null } }))} /></span></div>;
  } else if (field === "moq") {
    const moq = fields.moq ?? { quantity: null, unit: "unidades", notes: null, rawText: "" };
    control = <div className="space-y-2"><div className="grid grid-cols-2 gap-2"><TextInput label="Cantidad" inputMode="numeric" value={moq.quantity?.toString() ?? ""} onChange={(value) => setFields((current) => ({ ...current, moq: { ...moq, quantity: value ? Number(value) : null } }))} /><TextInput label="Unidad" value={moq.unit ?? ""} onChange={(value) => setFields((current) => ({ ...current, moq: { ...moq, unit: value || null } }))} /></div><TextInput label="Aclaraciones" value={moq.notes ?? ""} onChange={(value) => setFields((current) => ({ ...current, moq: { ...moq, notes: value || null } }))} /></div>;
  } else if (field === "leadTime") {
    control = <TextInput label="Tiempo informado" value={fields.leadTime?.rawText ?? ""} onChange={(value) => setFields((current) => ({ ...current, leadTime: { rawText: value, days: null } }))} placeholder="Ej. 4 semanas" />;
  } else {
    control = <div className="grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((score) => <Choice key={score} active={fields.interestScore === score} onClick={() => setFields((value) => ({ ...value, interestScore: score }))}>{score}</Choice>)}</div>;
  }

  const unknownValue = field === "supplierType" ? "UNKNOWN" : null;
  return <div className="mt-3 rounded-xl bg-paper-soft p-3">{control}<div className="mt-3 flex items-center justify-between gap-3"><button disabled={busy} onClick={() => onSave(field, unknownValue as never, true)} type="button" className="min-h-11 text-left text-xs font-semibold text-ink-mute">No sé · dejar pendiente</button><button disabled={busy} onClick={() => onSave(field, fields[field] as never)} type="button" className="app-secondary-button">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Guardar</button></div></div>;
}
