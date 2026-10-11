"use client";

import { createPortal } from "react-dom";
import { Check, ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type AppSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type AppSelectProps = {
  value: string;
  options: AppSelectOption[];
  onValueChange(value: string): void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  error?: string | null;
  loading?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  searchable?: boolean;
  className?: string;
};

type Position = { left: number; top: number; width: number; maxHeight: number; above: boolean };

export function AppSelect({
  value,
  options,
  onValueChange,
  label,
  ariaLabel,
  placeholder = "Elegí una opción",
  searchPlaceholder = "Buscar…",
  emptyMessage = "No encontramos opciones.",
  loadingMessage = "Cargando…",
  error = null,
  loading = false,
  disabled = false,
  clearable = false,
  searchable = false,
  className = "",
}: AppSelectProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const selected = options.find((option) => option.value === value) ?? null;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return options.filter((option) => !normalized || `${option.label} ${option.description ?? ""}`.toLocaleLowerCase("es").includes(normalized));
  }, [options, query]);

  function enabledFrom(start: number, direction: 1 | -1): number {
    if (!filtered.length) return 0;
    for (let offset = 0; offset < filtered.length; offset += 1) {
      const index = (start + direction * offset + filtered.length) % filtered.length;
      if (!filtered[index]?.disabled) return index;
    }
    return 0;
  }

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    const availableBelow = window.innerHeight - rect.bottom - margin;
    const availableAbove = rect.top - margin;
    const above = availableBelow < 240 && availableAbove > availableBelow;
    const maxHeight = Math.max(160, Math.min(320, (above ? availableAbove : availableBelow) - gap));
    const width = Math.max(rect.width, Math.min(420, window.innerWidth - margin * 2));
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    setPosition({ left, width, maxHeight, above, top: above ? rect.top - gap : rect.bottom + gap });
  }

  function close() { setOpen(false); setQuery(""); setPosition(null); }
  function openPanel() {
    updatePosition();
    const selectedIndex = filtered.findIndex((option) => option.value === value && !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : enabledFrom(0, 1));
    setOpen(true);
  }
  function choose(option: AppSelectOption) {
    if (option.disabled) return;
    onValueChange(option.value);
    close();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }
  function move(direction: 1 | -1) {
    if (!open) { openPanel(); return; }
    setActiveIndex((current) => enabledFrom(current + direction, direction));
  }
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Home") { event.preventDefault(); setActiveIndex(enabledFrom(0, 1)); }
    else if (event.key === "End") { event.preventDefault(); setActiveIndex(enabledFrom(filtered.length - 1, -1)); }
    else if (event.key === "Enter" && open && filtered[activeIndex]) { event.preventDefault(); choose(filtered[activeIndex]); }
    else if (event.key === "Escape" && open) { event.preventDefault(); close(); triggerRef.current?.focus(); }
  }

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    if (searchable) window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, searchable]);

  const panel = open && position ? <div
    ref={panelRef}
    className="fixed z-[100] rounded-2xl border border-line bg-white p-2 shadow-elevated"
    style={{ left: position.left, top: position.above ? undefined : position.top, bottom: position.above ? window.innerHeight - position.top : undefined, width: position.width }}
  >
    {searchable ? <div className="relative mb-2"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" /><input ref={searchRef} className="app-input min-h-11 pl-10" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={onKeyDown} placeholder={searchPlaceholder} aria-label={searchPlaceholder} aria-controls={`${id}-listbox`} aria-activedescendant={filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined} /></div> : null}
    <div id={`${id}-listbox`} role="listbox" aria-label={ariaLabel ?? label} className="overflow-y-auto" style={{ maxHeight: position.maxHeight }} onKeyDown={onKeyDown}>
      {loading ? <p className="flex items-center gap-2 p-3 text-sm text-ink-mute"><LoaderCircle className="h-4 w-4 animate-spin" />{loadingMessage}</p> : null}
      {error ? <p role="alert" className="p-3 text-sm text-nihao">{error}</p> : null}
      {!loading && !error && !filtered.length ? <p className="p-3 text-sm text-ink-mute">{emptyMessage}</p> : null}
      {!loading && !error ? filtered.map((option, index) => <button
        key={option.value}
        id={`${id}-option-${index}`}
        type="button"
        role="option"
        aria-selected={option.value === value}
        disabled={option.disabled}
        className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${index === activeIndex ? "bg-nihao-soft" : "hover:bg-paper-soft"} disabled:cursor-not-allowed disabled:opacity-50`}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => choose(option)}
      ><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{option.label}</span>{option.description ? <span className="mt-0.5 block truncate text-xs text-ink-mute">{option.description}</span> : null}</span>{option.value === value ? <Check className="h-4 w-4 shrink-0 text-nihao" /> : null}</button>) : null}
    </div>
  </div> : null;

  return <div className={`min-w-0 ${className}`}>
    {label ? <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span> : null}
    <div className="relative">
      <button
        ref={triggerRef}
        id={`${id}-trigger`}
        type="button"
        role="combobox"
        aria-label={ariaLabel ?? label}
        aria-controls={`${id}-listbox`}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        className="app-input flex min-h-12 w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => open ? close() : openPanel()}
        onKeyDown={onKeyDown}
      ><span className={`min-w-0 flex-1 truncate ${selected ? "text-ink" : "text-ink-faint"}`}>{selected?.label ?? placeholder}</span><ChevronDown className={`h-4 w-4 shrink-0 text-ink-mute transition ${open ? "rotate-180" : ""}`} /></button>
      {clearable && value && !disabled ? <button type="button" aria-label={`Limpiar ${ariaLabel ?? label ?? "selección"}`} className="absolute right-9 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-paper-soft" onClick={(event) => { event.stopPropagation(); onValueChange(""); close(); }}><X className="h-4 w-4" /></button> : null}
    </div>
    {typeof document !== "undefined" ? createPortal(panel, document.body) : null}
  </div>;
}
