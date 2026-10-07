"use client";

import Image from "next/image";

import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export function ImageViewer({ src, alt, className, children }: { src: string; alt: string; className?: string; children?: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  return <>
    <button type="button" aria-label={`Ampliar ${alt}`} className={className} onClick={() => { setFailed(false); dialog.current?.showModal(); }}>{children ?? "Ver imagen"}</button>
    <dialog ref={dialog} aria-label={alt} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="fixed inset-0 m-auto max-h-[95dvh] w-[calc(100%-1rem)] max-w-5xl overflow-auto rounded-2xl border-0 bg-night p-3 text-white shadow-2xl backdrop:bg-black/80">
      <div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm">{alt}</p><button type="button" aria-label="Cerrar imagen" onClick={() => dialog.current?.close()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10"><X className="h-5 w-5" /></button></div>
      {failed ? <p role="alert" className="p-6">No pudimos abrir la imagen. Cerrá el visor e intentá nuevamente.</p> : <Image unoptimized width={1920} height={1080} src={src} alt={alt} onError={() => setFailed(true)} className="mx-auto h-auto w-auto max-h-[80dvh] max-w-full object-contain" />}
    </dialog>
  </>;
}
