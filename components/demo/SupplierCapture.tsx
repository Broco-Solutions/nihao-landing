"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Check, ChevronRight, LoaderCircle, Pencil, Plus, Save, Sparkles } from "lucide-react";
import type { SupplierCaptureRecord, SupplierRecord, Tier1Data, Tier1Field } from "@/lib/bot/types";
import { calculateQuestionFields } from "@/lib/bot/tier1";

const DEMO_CONTEXT = { userId: "demo-user", tripId: "canton-fair-2026", tripName: "Feria de Cantón 2026" };
const AUTOSAVE_KEY = "nihao:supplier-capture-autosave:v2";

const FIELD_LABELS: Record<Tier1Field, string> = {
  companyName: "Empresa", city: "Ciudad", province: "Provincia", contact: "Contacto", category: "Categoría",
  supplierType: "Tipo de proveedor", fob: "Precio FOB", moq: "MOQ", leadTime: "Lead time", interestScore: "Interés",
};
const STRING_FIELDS = ["companyName", "city", "province", "contact", "category"] as const;

type StringTier1Field = (typeof STRING_FIELDS)[number];

type Screen = "input" | "review" | "report";

function TextInput({ label, value, onChange, placeholder, inputMode = "text" }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; inputMode?: "text" | "decimal" | "numeric";
}) {
  return <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-ink-mute">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} className="h-12 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink shadow-sm outline-none transition focus:border-nihao" /></label>;
}

function ChoiceButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`min-h-11 rounded-xl border px-3 text-[13px] font-semibold transition ${active ? "border-nihao bg-nihao text-white" : "border-line bg-white text-ink hover:border-nihao/40"}`}>{children}</button>;
}

function fieldValue(fields: Tier1Data, field: Tier1Field): string {
  switch (field) {
    case "supplierType": return fields.supplierType === "UNKNOWN" ? "Pendiente" : fields.supplierType === "FACTORY" ? "Fábrica" : "Trading";
    case "fob": return fields.fob ? `${fields.fob.currency ?? "Moneda pendiente"} ${fields.fob.amount ?? "—"} / ${fields.fob.unit ?? "unidad"}` : "Pendiente";
    case "moq": return fields.moq ? `${fields.moq.quantity ?? "—"} ${fields.moq.unit ?? "unidades"}${fields.moq.notes ? ` · ${fields.moq.notes}` : ""}` : "Pendiente";
    case "leadTime": return fields.leadTime ? fields.leadTime.days === null ? fields.leadTime.rawText : `${fields.leadTime.rawText} · ${fields.leadTime.days} días` : "Pendiente";
    case "interestScore": return fields.interestScore === null ? "Pendiente" : `${fields.interestScore} / 5`;
    default: return fields[field] || "Pendiente";
  }
}

function isStringTier1Field(field: Tier1Field): field is StringTier1Field {
  return STRING_FIELDS.some((candidate) => candidate === field);
}

function CorrectionEditor({ capture, field, busy, onSave }: {
  capture: SupplierCaptureRecord; field: Tier1Field; busy: boolean;
  onSave: <Field extends Tier1Field>(field: Field, value: Tier1Data[Field], acknowledgedUnknown?: boolean) => Promise<void>;
}) {
  const [fields, setFields] = useState<Tier1Data>(() => structuredClone(capture.fields));
  const save = () => onSave(field, fields[field]);
  const markUnknown = () => field === "supplierType"
    ? onSave(field, "UNKNOWN", true)
    : onSave(field, null, true);
  let editor: React.ReactNode;

  if (isStringTier1Field(field)) {
    editor = <TextInput label={FIELD_LABELS[field]} value={fields[field] ?? ""} onChange={(value) => setFields((current) => ({ ...current, [field]: value || null }))} />;
  } else if (field === "supplierType") {
    editor = <div className="grid grid-cols-3 gap-2"><ChoiceButton active={fields.supplierType === "FACTORY"} onClick={() => setFields((current) => ({ ...current, supplierType: "FACTORY" }))}>Fábrica</ChoiceButton><ChoiceButton active={fields.supplierType === "TRADING"} onClick={() => setFields((current) => ({ ...current, supplierType: "TRADING" }))}>Trading</ChoiceButton><ChoiceButton active={fields.supplierType === "UNKNOWN"} onClick={() => setFields((current) => ({ ...current, supplierType: "UNKNOWN" }))}>No seguro</ChoiceButton></div>;
  } else if (field === "fob") {
    const fob = fields.fob ?? { amount: null, currency: "USD", unit: "unidad", rawText: "" };
    editor = <div className="grid grid-cols-[1fr_88px] gap-2 sm:grid-cols-[1fr_100px_1fr]"><TextInput label="Monto" inputMode="decimal" value={fob.amount?.toString() ?? ""} onChange={(value) => setFields((current) => ({ ...current, fob: { ...fob, amount: value ? Number(value.replace(",", ".")) : null } }))} /><TextInput label="Moneda" value={fob.currency ?? ""} onChange={(value) => setFields((current) => ({ ...current, fob: { ...fob, currency: value.toUpperCase() || null } }))} /><TextInput label="Unidad" value={fob.unit ?? ""} onChange={(value) => setFields((current) => ({ ...current, fob: { ...fob, unit: value || null } }))} /></div>;
  } else if (field === "moq") {
    const moq = fields.moq ?? { quantity: null, unit: "unidades", notes: null, rawText: "" };
    editor = <div className="space-y-2"><div className="grid grid-cols-2 gap-2"><TextInput label="Cantidad" inputMode="numeric" value={moq.quantity?.toString() ?? ""} onChange={(value) => setFields((current) => ({ ...current, moq: { ...moq, quantity: value ? Number(value) : null } }))} /><TextInput label="Unidad" value={moq.unit ?? ""} onChange={(value) => setFields((current) => ({ ...current, moq: { ...moq, unit: value || null } }))} /></div><TextInput label="Aclaraciones" value={moq.notes ?? ""} onChange={(value) => setFields((current) => ({ ...current, moq: { ...moq, notes: value || null } }))} placeholder="Ej. 100 negras + 100 rojas" /></div>;
  } else if (field === "leadTime") {
    editor = <TextInput label="Tiempo informado" value={fields.leadTime?.rawText ?? ""} onChange={(value) => setFields((current) => ({ ...current, leadTime: { rawText: value, days: null } }))} placeholder="Ej. 4 semanas" />;
  } else {
    editor = <div className="grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((score) => <ChoiceButton key={score} active={fields.interestScore === score} onClick={() => setFields((current) => ({ ...current, interestScore: score }))}>{score}</ChoiceButton>)}</div>;
  }

  return <div className="mt-4 rounded-xl bg-paper-soft p-3">{editor}<div className="mt-3 flex flex-wrap items-center justify-between gap-2"><button type="button" disabled={busy} onClick={markUnknown} className="text-[12px] font-semibold text-ink-mute hover:text-nihao">No sé · dejar pendiente</button><button type="button" disabled={busy} onClick={save} className="inline-flex h-10 items-center gap-2 rounded-lg bg-nihao px-4 text-[12px] font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar campo</button></div></div>;
}

export function SupplierCapture() {
  const [screen, setScreen] = useState<Screen>("input");
  const [rawText, setRawText] = useState("");
  const [capture, setCapture] = useState<SupplierCaptureRecord | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [editingField, setEditingField] = useState<Tier1Field | null>(null);
  const [sort, setSort] = useState<"interest" | "company">("interest");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const restored = window.localStorage.getItem(AUTOSAVE_KEY) ?? "";
    queueMicrotask(() => { if (active) setRawText(restored); });
    return () => { active = false; };
  }, []);

  const unanswered = capture ? calculateQuestionFields(capture.fields, capture.acknowledgedUnknownFields) : [];
  const categoryAnswered = capture ? Boolean(capture.fields.category) || capture.acknowledgedUnknownFields.includes("category") : false;
  const sortedSuppliers = useMemo(() => [...suppliers].sort((left, right) => sort === "company" ? (left.companyName ?? "ZZZ").localeCompare(right.companyName ?? "ZZZ") : (right.interestScore ?? 0) - (left.interestScore ?? 0)), [sort, suppliers]);

  const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, init);
    const payload = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "No se pudo completar la operación");
    return payload;
  };

  const extract = async () => {
    setBusy(true); setError(null); window.localStorage.setItem(AUTOSAVE_KEY, rawText);
    try {
      const result = await api<{ capture: SupplierCaptureRecord }>("/api/bot/extractions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...DEMO_CONTEXT, source: { type: "TEXT", text: rawText } }) });
      setCapture(result.capture); setScreen("review");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo analizar el texto"); }
    finally { setBusy(false); }
  };

  const correct = async <Field extends Tier1Field>(field: Field, value: Tier1Data[Field], acknowledgedUnknown = false) => {
    if (!capture) return;
    setBusy(true); setError(null);
    try {
      const result = await api<{ capture: SupplierCaptureRecord }>(`/api/bot/captures/${capture.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...DEMO_CONTEXT, field, value, acknowledgedUnknown }) });
      setCapture(result.capture); setEditingField(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar el campo"); }
    finally { setBusy(false); }
  };

  const loadReport = async () => {
    setBusy(true); setError(null);
    try {
      const query = new URLSearchParams({ userId: DEMO_CONTEXT.userId, tripId: DEMO_CONTEXT.tripId });
      const result = await api<{ suppliers: SupplierRecord[] }>(`/api/bot/captures?${query}`);
      setSuppliers(result.suppliers); setScreen("report");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar el reporte"); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!capture) return;
    setBusy(true); setError(null);
    try {
      await api(`/api/bot/captures/${capture.id}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(DEMO_CONTEXT) });
      window.localStorage.removeItem(AUTOSAVE_KEY); setRawText(""); setCapture(null); await loadReport();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo confirmar el proveedor"); setBusy(false); }
  };

  if (screen === "report") {
    return <section className="mx-auto max-w-5xl"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-eyebrow-mark">Persistencia servidor</p><h2 className="mt-3 text-2xl text-ink">Proveedores del viaje</h2><p className="mt-2 text-sm text-ink-mute">{DEMO_CONTEXT.tripName}</p></div><div className="flex gap-2"><label className="sr-only" htmlFor="supplier-sort">Ordenar proveedores</label><select id="supplier-sort" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-11 rounded-xl border border-line bg-white px-3 text-[13px]"><option value="interest">Mayor interés</option><option value="company">Empresa A–Z</option></select><button type="button" onClick={() => setScreen("input")} className="inline-flex h-11 items-center gap-2 rounded-xl bg-nihao px-4 text-[13px] font-semibold text-white"><Plus className="h-4 w-4" /> Nuevo</button></div></div><div className="mt-6 grid gap-3">{sortedSuppliers.map((supplier) => <article key={supplier.id} className="rounded-2xl border border-line bg-white p-4 shadow-soft md:grid md:grid-cols-[1.4fr_1fr_1fr_1fr] md:items-center md:gap-4"><div><p className="font-semibold text-ink">{supplier.companyName ?? "Empresa pendiente"}</p><p className="text-[12px] text-ink-mute">{supplier.category ?? "Categoría pendiente"}</p></div><p className="mt-2 text-[13px] md:mt-0">FOB: {fieldValue(supplier, "fob")}</p><p className="text-[13px]">MOQ: {fieldValue(supplier, "moq")}</p><p className="text-[13px]">Interés: {fieldValue(supplier, "interestScore")}</p></article>)}{sortedSuppliers.length === 0 ? <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-mute">Todavía no hay proveedores confirmados en este viaje.</p> : null}</div></section>;
  }

  if (screen === "review" && capture) {
    return <section className="mx-auto max-w-2xl"><button type="button" onClick={() => setScreen("input")} className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" /> Volver al texto</button><p className="mt-6 text-eyebrow-mark">Extracción estructurada</p><h1 className="mt-3 text-3xl text-ink">Revisá lo detectado</h1><p className="mt-2 text-sm text-ink-mute">Completá sólo lo que falta. Podés corregir un campo sin reiniciar el registro.</p>
      {unanswered.length > 0 ? <div className="mt-5 rounded-2xl border border-gold/40 bg-gold-soft p-4"><p className="text-[12px] font-semibold uppercase tracking-wide text-ink-soft">Falta preguntar</p><div className="mt-2 flex flex-wrap gap-2">{unanswered.map((field) => <button key={field} type="button" onClick={() => setEditingField(field)} className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-ink shadow-sm">{FIELD_LABELS[field]}</button>)}</div></div> : <p className="mt-5 rounded-xl bg-nihao-soft px-4 py-3 text-[13px] text-nihao">No quedan preguntas sin responder.</p>}
      <div className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-soft">{(Object.keys(FIELD_LABELS) as Tier1Field[]).map((field) => { const missing = capture.missingFields.includes(field); const acknowledged = capture.acknowledgedUnknownFields.includes(field); const review = capture.reviewFields.includes(field); return <div key={field} className="p-4"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{FIELD_LABELS[field]}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${review ? "bg-gold-soft text-gold-deep" : missing ? "bg-paper-warm text-ink-mute" : "bg-nihao-soft text-nihao"}`}>{review ? "Revisar" : missing ? acknowledged ? "Pendiente" : "Falta" : "Detectado"}</span></div><p className="mt-1 text-[14px] text-ink">{fieldValue(capture.fields, field)}</p></div><button type="button" onClick={() => setEditingField(editingField === field ? null : field)} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-nihao hover:bg-nihao-soft"><Pencil className="h-3.5 w-3.5" /> {missing ? "Completar" : "Corregir"}</button></div>{editingField === field ? <CorrectionEditor key={field} capture={capture} field={field} busy={busy} onSave={correct} /> : null}</div>; })}</div>
      {error ? <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-nihao-soft px-4 py-3 text-[13px] text-nihao"><AlertCircle className="h-4 w-4" /> {error}</p> : null}{!categoryAnswered ? <p className="mt-4 text-[12px] text-nihao">La categoría es el único campo bloqueante: completala o marcala como pendiente.</p> : null}<button type="button" disabled={busy || !categoryAnswered} onClick={confirm} className="mt-5 inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-nihao px-5 text-[15px] font-semibold text-white hover:bg-nihao-deep disabled:cursor-not-allowed disabled:opacity-40">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Confirmar y guardar</button></section>;
  }

  return <section className="mx-auto max-w-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-eyebrow-mark">Captura Tier 1</p><h1 className="mt-3 text-3xl text-ink">Contame sobre el proveedor</h1><p className="mt-2 text-sm text-ink-mute">Pegá o escribí tus notas. Primero extraemos lo que ya está; después preguntamos solamente lo que falta.</p></div><button type="button" disabled={busy} onClick={loadReport} className="shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-[12px] font-semibold text-ink">Ver reporte</button></div><div className="mt-6 rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-6"><label htmlFor="supplier-source" className="text-[12px] font-semibold text-ink-mute">Texto o nota de feria</label><textarea id="supplier-source" value={rawText} onChange={(event) => { setRawText(event.target.value); window.localStorage.setItem(AUTOSAVE_KEY, event.target.value); }} rows={7} placeholder="Ej. Esta fábrica se llama ABC Lighting, FOB 7 dólares por unidad, mínimo 300 y tarda cuatro semanas." className="mt-2 w-full resize-none rounded-xl border border-line bg-paper-soft p-3.5 text-[15px] leading-relaxed text-ink outline-none transition focus:border-nihao" /><div className="mt-3 flex items-start gap-2 rounded-xl bg-paper-warm px-3 py-2.5 text-[12px] text-ink-mute"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" /><p>La extracción actual es un adaptador de desarrollo determinista. El contrato ya permite reemplazarlo por IA/OCR sin acoplar la interfaz.</p></div></div>{error ? <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-nihao-soft px-4 py-3 text-[13px] text-nihao"><AlertCircle className="h-4 w-4" /> {error}</p> : null}<button type="button" disabled={busy || rawText.trim().length < 2} onClick={extract} className="mt-5 inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-nihao px-5 text-[15px] font-semibold text-white hover:bg-nihao-deep disabled:cursor-not-allowed disabled:opacity-40">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Extraer información <ChevronRight className="h-4 w-4" /></button></section>;
}
