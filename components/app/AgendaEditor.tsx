"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, MapPin, X } from "lucide-react";
import { appApi } from "./api";

type Entry = { id: string; date: string; time: string; place: string; address: string; instructions: string | null };
type Traveler = { id: string; name: string; email: string; trips: Array<{ tripId: string; tripName: string }> };
const emptyForm = { date: "", time: "", place: "", address: "", instructions: "" };
function dayLabel(date: string) { return new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`)); }

export function AgendaEditor({ tripId, userId }: { tripId: string; userId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const base = `/api/bot/trips/${encodeURIComponent(tripId)}/agenda`;
  const load = useCallback(async () => {
    try {
      const result = await appApi<{ entries: Entry[] }>(`${base}${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`);
      setEntries(result.entries);
      setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos cargar la agenda"); }
    finally { setLoading(false); }
  }, [base, userId]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => {
    if (!userId) return;
    queueMicrotask(() => void appApi<{ travelers: Traveler[] }>("/api/bot/travelers").then((result) => setTravelers(result.travelers)).catch((caught) => setError(caught instanceof Error ? caught.message : "No pudimos cargar los viajeros")));
  }, [userId]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (formOpen && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>("input")?.focus();
    }
    return () => { if (dialog.open) dialog.close(); };
  }, [formOpen]);

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      await appApi(`${base}${editingId ? `/${encodeURIComponent(editingId)}` : ""}`, { method: editingId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, ...(userId ? { userId } : {}) }) });
      closeForm(); await load(); setMessage("Actividad guardada.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar la actividad"); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("¿Eliminar esta actividad de la agenda?")) return;
    setBusy(true); setError(null); setMessage(null);
    try { await appApi(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" }); setSelectedEntries((items) => items.filter((item) => item !== id)); await load(); setMessage("Actividad eliminada."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos eliminar la actividad"); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!userId || !selectedEntries.length || !selectedTargets.length) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const targets = selectedTargets.map((key) => { const [targetTripId, targetUserId] = key.split(":"); return { tripId: targetTripId, userId: targetUserId }; });
      const result = await appApi<{ copied: number }>(`${base}/copy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, entryIds: selectedEntries, targets }) });
      setSelectedEntries([]); setSelectedTargets([]); setMessage(`${result.copied} actividades copiadas. Cada viajero puede modificarlas por separado.`);
      if (targets.some((target) => target.tripId === tripId && target.userId === userId)) await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos copiar las actividades"); }
    finally { setBusy(false); }
  }
  const days = [...new Set(entries.map((entry) => entry.date))];
  const owner = travelers.find((traveler) => traveler.id === userId);
  const targets = travelers.flatMap((traveler) => traveler.trips.map((trip) => ({ key: `${trip.tripId}:${traveler.id}`, name: traveler.name, tripName: trip.tripName })));
  return <section className="mt-5" aria-busy={loading || busy}>
    <h2 className="text-xl">Agenda{owner ? ` de ${owner.name}` : ""}</h2>
    <p className="mt-1 text-sm text-ink-mute">Organizá días, horarios, lugares, direcciones e instrucciones del viaje.</p>
    {error && !formOpen ? <p role="alert" className="mt-3 rounded-xl bg-nihao-soft p-3 text-sm text-nihao">{error}</p> : null}
    {message ? <p role="status" className="mt-3 rounded-xl bg-nihao-soft p-3 text-sm text-nihao">{message}</p> : null}
    <button ref={addButtonRef} type="button" disabled={busy} onClick={() => { setEditingId(null); setForm(emptyForm); setError(null); setFormOpen(true); }} className="app-primary-button mt-4">Agregar actividad</button>
    <dialog ref={dialogRef} aria-labelledby="agenda-form-title" onClose={() => setFormOpen(false)} className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-line bg-paper p-5 text-ink shadow-2xl backdrop:bg-black/50 sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-eyebrow-mark text-nihao">Agenda</p><h3 id="agenda-form-title" className="mt-2 text-xl font-semibold">{editingId ? "Editar actividad" : "Agregar actividad"}</h3></div><button type="button" aria-label="Cerrar formulario" onClick={closeForm} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-mute hover:bg-paper-soft"><X aria-hidden="true" className="h-5 w-5" /></button></div>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-nihao-soft p-3 text-sm text-nihao">{error}</p> : null}
      <form onSubmit={(event) => void save(event)} className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Día<input required type="date" className="app-input mt-1" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        <label className="text-sm font-medium">Hora<input required type="time" className="app-input mt-1" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
        <label className="text-sm font-medium">Lugar a visitar<input required maxLength={160} className="app-input mt-1" value={form.place} onChange={(event) => setForm({ ...form, place: event.target.value })} /></label>
        <label className="text-sm font-medium">Dirección<input required maxLength={300} className="app-input mt-1" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
        <label className="text-sm font-medium sm:col-span-2">Instrucciones (opcional)<textarea maxLength={2000} className="app-input mt-1 min-h-20" value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button disabled={busy} className="app-primary-button" type="submit">{busy ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar actividad"}</button><button disabled={busy} type="button" className="app-secondary-button" onClick={closeForm}>Cancelar</button></div>
      </form>
    </dialog>
    {loading ? <LoaderCircle aria-label="Cargando agenda" className="mx-auto mt-6 h-6 w-6 animate-spin text-nihao" /> : <div className="mt-5 grid gap-5">{days.map((day) => <section key={day} aria-label={dayLabel(day)}><h3 className="mb-3 text-lg font-semibold capitalize">{dayLabel(day)}</h3><div className="grid gap-3">{entries.filter((entry) => entry.date === day).map((entry) => <article key={entry.id} className="rounded-2xl border border-line bg-paper p-4 shadow-soft"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><strong className="text-nihao">{entry.time}</strong><h4 className="font-semibold">{entry.place}</h4></div><p className="mt-2 flex items-start gap-1 text-sm text-ink-mute"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{entry.address}</p>{entry.instructions ? <p className="mt-2 whitespace-pre-wrap text-sm">{entry.instructions}</p> : null}</div><div className="flex gap-3"><button type="button" disabled={busy} className="text-sm font-semibold text-nihao" onClick={() => { setEditingId(entry.id); setForm({ date: entry.date, time: entry.time, place: entry.place, address: entry.address, instructions: entry.instructions ?? "" }); setError(null); setFormOpen(true); }}>Editar</button><button type="button" disabled={busy} className="text-sm font-semibold text-nihao" onClick={() => void remove(entry.id)}>Eliminar</button></div></div>{userId ? <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedEntries.includes(entry.id)} onChange={(event) => setSelectedEntries(event.target.checked ? [...selectedEntries, entry.id] : selectedEntries.filter((id) => id !== entry.id))} />Seleccionar para copiar</label> : null}</article>)}</div></section>)}{!days.length ? <p className="rounded-xl bg-paper-soft p-4 text-sm text-ink-mute">Todavía no hay actividades en la agenda.</p> : null}</div>}
    {userId && entries.length ? <section className="mt-6 rounded-2xl border border-line bg-paper p-5 shadow-soft"><h3 className="font-semibold">Copiar actividades a otros viajeros</h3><p className="mt-1 text-sm text-ink-mute">Seleccioná las actividades arriba y los viajes de destino. Las copias se agregan a sus agendas y se editan por separado.</p><div className="mt-4 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">{targets.filter((target) => target.key !== `${tripId}:${userId}`).map((target) => <label key={target.key} className="flex items-center gap-2 rounded-xl bg-paper-soft p-3 text-sm"><input type="checkbox" checked={selectedTargets.includes(target.key)} onChange={(event) => setSelectedTargets(event.target.checked ? [...selectedTargets, target.key] : selectedTargets.filter((key) => key !== target.key))} /><span>{target.name} · {target.tripName}</span></label>)}</div><button type="button" disabled={busy || !selectedEntries.length || !selectedTargets.length} className="app-primary-button mt-4" onClick={() => void copy()}>Copiar actividades</button></section> : null}
  </section>;
}
