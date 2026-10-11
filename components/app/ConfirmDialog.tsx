"use client";

import { useEffect, useId, useRef } from "react";

export function ConfirmDialog({ open, title, description, confirmLabel, busy = false, onCancel, onConfirm }: { open: boolean; title: string; description: React.ReactNode; confirmLabel: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => { if (!open) return; const previous = document.activeElement as HTMLElement | null; cancelRef.current?.focus(); const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { onCancel(); return; } if (event.key !== "Tab") return; const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]; if (!controls.length) return; const first = controls[0]; const last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); previous?.focus(); }; }, [open, busy, onCancel]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-card"><h2 id={titleId} className="text-xl">{title}</h2><div id={descriptionId} className="mt-2 text-sm leading-6 text-ink-mute">{description}</div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="app-secondary-button justify-center">Cancelar</button><button type="button" disabled={busy} onClick={onConfirm} className="app-primary-button justify-center">{busy ? "Procesando…" : confirmLabel}</button></div></section></div>;
}
