"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Pencil, Plus, Save, Trash2 } from "lucide-react";
import {
  CAPTURE_STORAGE_KEY,
  EMPTY_CAPTURE,
  prepareCapture,
  type StoredSupplierCapture,
  type SupplierCaptureDraft,
  type SupplierType,
} from "@/lib/capture";

type Screen = "capture" | "review" | "report";
type EditableField =
  | "companyName"
  | "location"
  | "contact"
  | "category"
  | "supplierType"
  | "fob"
  | "moq"
  | "leadTime"
  | "interestScore";

const FIELD_LABELS: Record<EditableField, string> = {
  companyName: "Empresa",
  location: "Ciudad / provincia",
  contact: "Contacto",
  category: "Categoría",
  supplierType: "Tipo de proveedor",
  fob: "Precio FOB",
  moq: "MOQ",
  leadTime: "Lead time",
  interestScore: "Interés",
};

function cloneEmptyCapture(): SupplierCaptureDraft {
  return {
    ...EMPTY_CAPTURE,
    fob: { ...EMPTY_CAPTURE.fob },
    moq: { ...EMPTY_CAPTURE.moq },
    leadTime: { ...EMPTY_CAPTURE.leadTime },
    pendingFields: [],
  };
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "text" | "decimal" | "numeric";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-ink-mute">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="h-12 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink shadow-sm outline-none transition focus:border-nihao"
      />
    </label>
  );
}

function ChoiceButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-xl border px-4 text-[14px] font-semibold transition ${
        active ? "border-nihao bg-nihao text-white" : "border-line bg-white text-ink hover:border-nihao/40"
      }`}
    >
      {children}
    </button>
  );
}

function valueFor(capture: SupplierCaptureDraft, field: EditableField): string {
  switch (field) {
    case "companyName": return capture.companyName || "Pendiente";
    case "location": return [capture.city, capture.province].filter(Boolean).join(", ") || "Pendiente";
    case "contact": return capture.contact || "Pendiente";
    case "category": return capture.category || "No sé todavía · pendiente";
    case "supplierType": return capture.supplierType === "FACTORY" ? "Fábrica" : capture.supplierType === "TRADING" ? "Trading" : "No seguro · pendiente";
    case "fob": return capture.fob.amount === null ? "Pendiente" : `${capture.fob.currency} ${capture.fob.amount} / ${capture.fob.unit}`;
    case "moq": return capture.moq.quantity === null ? "Pendiente" : `${capture.moq.quantity} ${capture.moq.unit}${capture.moq.notes ? ` · ${capture.moq.notes}` : ""}`;
    case "leadTime": return capture.leadTime.days === null ? capture.leadTime.rawText || "Pendiente" : `${capture.leadTime.rawText} · ${capture.leadTime.days} días`;
    case "interestScore": return capture.interestScore === null ? "Pendiente" : `${capture.interestScore} / 5`;
  }
}

export function SupplierCapture() {
  const [screen, setScreen] = useState<Screen>("capture");
  const [draft, setDraft] = useState<SupplierCaptureDraft>(cloneEmptyCapture);
  const [saved, setSaved] = useState<StoredSupplierCapture[]>([]);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [sort, setSort] = useState<"interest" | "company">("interest");
  const [categoryUnknown, setCategoryUnknown] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      const raw = window.localStorage.getItem(CAPTURE_STORAGE_KEY);
      if (raw) {
        const restored = JSON.parse(raw) as StoredSupplierCapture[];
        queueMicrotask(() => {
          if (active) setSaved(restored);
        });
      }
    } catch {
      // A cache corrupto no debe impedir una captura nueva.
    }
    return () => {
      active = false;
    };
  }, []);

  const normalized = useMemo(() => prepareCapture(draft), [draft]);
  const categoryAnswered = Boolean(draft.category.trim()) || categoryUnknown;

  const update = <K extends keyof SupplierCaptureDraft>(key: K, value: SupplierCaptureDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const persist = () => {
    const now = new Date().toISOString();
    const capture: StoredSupplierCapture = {
      ...normalized,
      id: globalThis.crypto.randomUUID(),
      status: "CONFIRMED",
      createdAt: now,
      updatedAt: now,
    };
    const next = [capture, ...saved];
    window.localStorage.setItem(CAPTURE_STORAGE_KEY, JSON.stringify(next));
    setSaved(next);
    setDraft(cloneEmptyCapture());
    setCategoryUnknown(false);
    setEditingField(null);
    setScreen("report");
  };

  const remove = (id: string) => {
    const next = saved.filter((capture) => capture.id !== id);
    window.localStorage.setItem(CAPTURE_STORAGE_KEY, JSON.stringify(next));
    setSaved(next);
  };

  const sorted = [...saved].sort((a, b) => {
    if (sort === "company") return (a.companyName || "ZZZ").localeCompare(b.companyName || "ZZZ");
    return (b.interestScore ?? 0) - (a.interestScore ?? 0);
  });

  if (screen === "report") {
    return (
      <section className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-eyebrow-mark">Comparación básica</p>
            <h2 className="mt-3 text-2xl text-ink">Proveedores confirmados</h2>
          </div>
          <div className="flex gap-2">
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-11 rounded-xl border border-line bg-white px-3 text-[13px]">
              <option value="interest">Mayor interés</option>
              <option value="company">Empresa A–Z</option>
            </select>
            <button type="button" onClick={() => setScreen("capture")} className="inline-flex h-11 items-center gap-2 rounded-xl bg-nihao px-4 text-[13px] font-semibold text-white">
              <Plus className="h-4 w-4" /> Nuevo
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {sorted.map((capture) => (
            <article key={capture.id} className="rounded-2xl border border-line bg-white p-4 shadow-soft md:grid md:grid-cols-[1.4fr_1fr_1fr_1fr_auto] md:items-center md:gap-4">
              <div><p className="font-semibold text-ink">{capture.companyName || "Empresa pendiente"}</p><p className="text-[12px] text-ink-mute">{capture.category || "Categoría pendiente"}</p></div>
              <p className="mt-2 text-[13px] md:mt-0">FOB: {valueFor(capture, "fob")}</p>
              <p className="text-[13px]">MOQ: {valueFor(capture, "moq")}</p>
              <p className="text-[13px]">Interés: {valueFor(capture, "interestScore")}</p>
              <button type="button" onClick={() => remove(capture.id)} aria-label="Eliminar registro local" className="mt-3 rounded-lg p-2 text-ink-faint hover:bg-nihao-soft hover:text-nihao md:mt-0"><Trash2 className="h-4 w-4" /></button>
            </article>
          ))}
          {sorted.length === 0 && <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-mute">Todavía no hay proveedores confirmados.</p>}
        </div>
      </section>
    );
  }

  if (screen === "review") {
    const fields = Object.keys(FIELD_LABELS) as EditableField[];
    return (
      <section className="mx-auto max-w-2xl">
        <button type="button" onClick={() => setScreen("capture")} className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" /> Volver</button>
        <p className="mt-6 text-eyebrow-mark">Confirmación</p>
        <h2 className="mt-3 text-2xl text-ink">Revisá antes de guardar</h2>
        <p className="mt-2 text-sm text-ink-mute">Si algo cambió, corregí solamente ese campo.</p>

        <div className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
          {fields.map((field) => (
            <div key={field} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{FIELD_LABELS[field]}</p><p className="mt-1 text-[14px] text-ink">{valueFor(normalized, field)}</p></div>
                <button type="button" onClick={() => setEditingField(editingField === field ? null : field)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-nihao hover:bg-nihao-soft"><Pencil className="h-3.5 w-3.5" /> Corregir</button>
              </div>
              {editingField === field && <div className="mt-4 rounded-xl bg-paper-soft p-3"><FieldEditor field={field} draft={draft} update={update} categoryUnknown={categoryUnknown} setCategoryUnknown={setCategoryUnknown} /></div>}
            </div>
          ))}
        </div>

        {normalized.pendingFields.length > 0 && <p className="mt-4 rounded-xl bg-gold-soft px-4 py-3 text-[13px] text-ink-soft">Quedarán {normalized.pendingFields.length} campos pendientes. Podés completarlos más adelante.</p>}
        <button type="button" onClick={persist} className="mt-5 inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-nihao px-5 text-[15px] font-semibold text-white hover:bg-nihao-deep"><Save className="h-4 w-4" /> Confirmar y guardar</button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-eyebrow-mark">Captura Tier 1</p><h1 className="mt-3 text-3xl text-ink">Nuevo proveedor</h1><p className="mt-2 text-sm text-ink-mute">Registrá lo esencial mientras caminás la feria. Lo que no sepas queda pendiente.</p></div>
        {saved.length > 0 && <button type="button" onClick={() => setScreen("report")} className="shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-[12px] font-semibold text-ink">Ver {saved.length}</button>}
      </div>

      <div className="mt-6 space-y-4 rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-6">
        <TextInput label="Empresa" value={draft.companyName} onChange={(value) => update("companyName", value)} placeholder="Ej. ABC Lighting" />
        <div className="grid gap-4 sm:grid-cols-2"><TextInput label="Ciudad" value={draft.city} onChange={(value) => update("city", value)} placeholder="Guangzhou" /><TextInput label="Provincia" value={draft.province} onChange={(value) => update("province", value)} placeholder="Guangdong" /></div>
        <TextInput label="Contacto" value={draft.contact} onChange={(value) => update("contact", value)} placeholder="Nombre, email o teléfono" />
        <div><TextInput label="Categoría *" value={draft.category} onChange={(value) => { update("category", value); setCategoryUnknown(false); }} placeholder="Ej. Iluminación" /><button type="button" onClick={() => { update("category", ""); setCategoryUnknown(true); }} className={`mt-2 text-[12px] font-semibold ${categoryUnknown ? "text-nihao" : "text-ink-mute"}`}>{categoryUnknown ? "✓ Marcado como pendiente" : "No sé todavía"}</button></div>
        <FieldEditor field="supplierType" draft={draft} update={update} categoryUnknown={categoryUnknown} setCategoryUnknown={setCategoryUnknown} />
        <FieldEditor field="fob" draft={draft} update={update} categoryUnknown={categoryUnknown} setCategoryUnknown={setCategoryUnknown} />
        <FieldEditor field="moq" draft={draft} update={update} categoryUnknown={categoryUnknown} setCategoryUnknown={setCategoryUnknown} />
        <FieldEditor field="leadTime" draft={draft} update={update} categoryUnknown={categoryUnknown} setCategoryUnknown={setCategoryUnknown} />
        <FieldEditor field="interestScore" draft={draft} update={update} categoryUnknown={categoryUnknown} setCategoryUnknown={setCategoryUnknown} />
      </div>

      {!categoryAnswered && <p className="mt-3 text-[12px] text-nihao">Indicá una categoría o elegí “No sé todavía” para continuar.</p>}
      <button type="button" disabled={!categoryAnswered} onClick={() => setScreen("review")} className="mt-5 inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-nihao px-5 text-[15px] font-semibold text-white transition hover:bg-nihao-deep disabled:cursor-not-allowed disabled:opacity-40">Revisar registro <ChevronRight className="h-4 w-4" /></button>
    </section>
  );
}

function FieldEditor({ field, draft, update, categoryUnknown, setCategoryUnknown }: {
  field: EditableField;
  draft: SupplierCaptureDraft;
  update: <K extends keyof SupplierCaptureDraft>(key: K, value: SupplierCaptureDraft[K]) => void;
  categoryUnknown: boolean;
  setCategoryUnknown: (value: boolean) => void;
}) {
  if (field === "companyName") return <TextInput label="Empresa" value={draft.companyName} onChange={(value) => update("companyName", value)} />;
  if (field === "location") return <div className="grid gap-3 sm:grid-cols-2"><TextInput label="Ciudad" value={draft.city} onChange={(value) => update("city", value)} /><TextInput label="Provincia" value={draft.province} onChange={(value) => update("province", value)} /></div>;
  if (field === "contact") return <TextInput label="Contacto" value={draft.contact} onChange={(value) => update("contact", value)} />;
  if (field === "category") return <div><TextInput label="Categoría" value={draft.category} onChange={(value) => { update("category", value); setCategoryUnknown(false); }} /><button type="button" onClick={() => { update("category", ""); setCategoryUnknown(true); }} className={`mt-2 text-[12px] font-semibold ${categoryUnknown ? "text-nihao" : "text-ink-mute"}`}>No sé todavía</button></div>;
  if (field === "supplierType") return <div><p className="mb-2 text-[12px] font-semibold text-ink-mute">Tipo de proveedor</p><div className="grid grid-cols-3 gap-2">{(["FACTORY", "TRADING", "UNKNOWN"] as SupplierType[]).map((type) => <ChoiceButton key={type} active={draft.supplierType === type} onClick={() => update("supplierType", type)}>{type === "FACTORY" ? "Fábrica" : type === "TRADING" ? "Trading" : "No seguro"}</ChoiceButton>)}</div></div>;
  if (field === "fob") return <div><p className="mb-2 text-[12px] font-semibold text-ink-mute">Precio FOB</p><div className="grid grid-cols-[1fr_88px] gap-2 sm:grid-cols-[1fr_100px_1fr]"><TextInput label="Monto" inputMode="decimal" value={draft.fob.amount?.toString() ?? ""} onChange={(value) => update("fob", { ...draft.fob, amount: value ? Number(value.replace(",", ".")) : null })} /><TextInput label="Moneda" value={draft.fob.currency} onChange={(value) => update("fob", { ...draft.fob, currency: value.toUpperCase() })} /><TextInput label="Unidad" value={draft.fob.unit} onChange={(value) => update("fob", { ...draft.fob, unit: value })} /></div></div>;
  if (field === "moq") return <div><p className="mb-2 text-[12px] font-semibold text-ink-mute">MOQ</p><div className="grid grid-cols-2 gap-2"><TextInput label="Cantidad" inputMode="numeric" value={draft.moq.quantity?.toString() ?? ""} onChange={(value) => update("moq", { ...draft.moq, quantity: value ? Number(value) : null })} /><TextInput label="Unidad" value={draft.moq.unit} onChange={(value) => update("moq", { ...draft.moq, unit: value })} /></div><div className="mt-2"><TextInput label="Aclaraciones" value={draft.moq.notes} onChange={(value) => update("moq", { ...draft.moq, notes: value })} placeholder="Ej. 100 negras + 100 rojas" /></div></div>;
  if (field === "leadTime") return <div><TextInput label="Lead time de producción" value={draft.leadTime.rawText} onChange={(value) => update("leadTime", { rawText: value, days: null })} placeholder="Ej. 4 semanas" />{draft.leadTime.rawText && <p className="mt-2 text-[12px] text-ink-mute">Se normalizará a días en el resumen.</p>}</div>;
  return <div><p className="mb-2 text-[12px] font-semibold text-ink-mute">Interés</p><div className="grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((score) => <ChoiceButton key={score} active={draft.interestScore === score} onClick={() => update("interestScore", score)}>{score}</ChoiceButton>)}</div>{draft.interestScore !== null && <p className="mt-2 flex items-center gap-1 text-[12px] text-nihao"><Check className="h-3.5 w-3.5" /> Interés registrado</p>}</div>;
}
