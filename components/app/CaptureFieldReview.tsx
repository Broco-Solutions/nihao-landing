"use client";

import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import type { SupplierCaptureRecord, Tier1Field } from "@/lib/bot/types";
import { groupCaptureFields } from "@/lib/bot/capture-presentation";
import { FIELD_LABELS, fieldValue } from "./tier1-display";

export function CaptureFieldReview({ capture, editing, onEdit, renderEditor }: { capture: SupplierCaptureRecord; editing: Tier1Field | null; onEdit: (field: Tier1Field) => void; renderEditor: (field: Tier1Field) => ReactNode }) {
  const { detected, review, missing } = groupCaptureFields(capture.reviewFields, capture.missingFields, capture.acknowledgedUnknownFields);
  return <div className="mt-7 space-y-6"><FieldGroup title="Detectamos" description="Podés tocar un dato si querés corregirlo." fields={detected} capture={capture} editing={editing} onEdit={onEdit} renderEditor={renderEditor} tone="detected" /><FieldGroup title="Necesitamos revisar" description="Estos datos pueden estar incompletos o ser ambiguos." fields={review} capture={capture} editing={editing} onEdit={onEdit} renderEditor={renderEditor} tone="review" /><FieldGroup title="Nos falta" description="Completá sólo lo que sepas. También podés marcar “No sé”." fields={missing} capture={capture} editing={editing} onEdit={onEdit} renderEditor={renderEditor} tone="missing" /></div>;
}

function FieldGroup({ title, description, fields, capture, editing, onEdit, renderEditor, tone }: { title: string; description: string; fields: Tier1Field[]; capture: SupplierCaptureRecord; editing: Tier1Field | null; onEdit: (field: Tier1Field) => void; renderEditor: (field: Tier1Field) => ReactNode; tone: "detected" | "review" | "missing" }) {
  if (!fields.length) return null;
  const color = tone === "detected" ? "bg-nihao-soft text-nihao" : tone === "review" ? "bg-gold-soft text-gold-deep" : "bg-paper-warm text-ink-mute";
  return <section aria-labelledby={`review-${tone}`}><h2 id={`review-${tone}`} className="text-xl">{title}</h2><p className="mt-1 text-sm text-ink-mute">{description}</p><div className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-soft">{fields.map((field) => <div key={field}><button type="button" onClick={() => onEdit(field)} aria-expanded={editing === field} className="flex min-h-16 w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-paper-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nihao"><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-ink">{FIELD_LABELS[field]}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>{tone === "review" ? "Revisar" : tone === "missing" ? "Completar" : "Detectado"}</span></span><span className="mt-1 block truncate text-sm text-ink-mute">{fieldValue(capture.fields, field)}</span></span><span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-nihao" aria-label={`Editar ${FIELD_LABELS[field]}`}><Pencil className="h-4 w-4" /></span></button>{editing === field ? <section className="border-t border-line bg-paper-soft p-4" aria-label={`Editar ${FIELD_LABELS[field]}`}>{renderEditor(field)}</section> : null}</div>)}</div></section>;
}
