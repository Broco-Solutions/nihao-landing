"use client";

import { Camera, Keyboard, Mic } from "lucide-react";

export type CaptureSource = "CARD" | "AUDIO" | "TEXT";

const OPTIONS: Array<{ source: CaptureSource; icon: typeof Camera; title: string; description: string }> = [
  { source: "CARD", icon: Camera, title: "Tarjeta o foto", description: "Sacá una foto de la tarjeta o información del proveedor." },
  { source: "AUDIO", icon: Mic, title: "Contarme", description: "Grabá una nota de voz mientras seguís recorriendo." },
  { source: "TEXT", icon: Keyboard, title: "Escribir", description: "Anotá sólo lo importante y nosotros lo ordenamos." },
];

export function CaptureSourceSelector({ busy, onSelect }: { busy: boolean; onSelect: (source: CaptureSource) => void }) {
  return <section aria-labelledby="capture-source-heading" className="mt-7"><h1 id="capture-source-heading" className="text-3xl leading-tight sm:text-4xl">¿Cómo querés empezar?</h1><div className="mt-5 grid gap-3">{OPTIONS.map(({ source, icon: Icon, title, description }) => <button key={source} disabled={busy} type="button" onClick={() => onSelect(source)} className="flex min-h-24 items-center gap-4 rounded-2xl border border-line bg-white p-4 text-left shadow-soft transition hover:border-nihao/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nihao disabled:opacity-60"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-nihao-soft text-nihao"><Icon className="h-6 w-6" /></span><span><strong className="block text-lg text-ink">{title}</strong><span className="mt-1 block text-sm leading-5 text-ink-mute">{description}</span></span></button>)}</div></section>;
}
