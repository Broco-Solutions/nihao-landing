"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, LoaderCircle, Trash2 } from "lucide-react";
import { appApi } from "./api";
import { NewTravelerInvitation } from "./NewTravelerInvitation";

type Traveler = { id: string; name: string; email: string; whatsappPhone: string | null; trips: Array<{ tripId: string; tripName: string; passportNumber: string | null }> };

export function TravelersClient() {
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [passportKey, setPassportKey] = useState<string | null>(null);
  const [passport, setPassport] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await appApi<{ travelers: Traveler[] }>("/api/bot/travelers");
      setTravelers(result.travelers); setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos cargar los viajeros"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  function startEdit(traveler: Traveler) { setEditing(traveler.id); setName(traveler.name); setPhone(traveler.whatsappPhone ?? ""); setError(null); setMessage(null); }

  async function saveProfile(event: FormEvent<HTMLFormElement>, travelerId: string) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      await appApi(`/api/bot/travelers/${encodeURIComponent(travelerId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, whatsappPhone: phone }) });
      await load(); setEditing(null); setMessage("Datos del viajero actualizados.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar los cambios"); }
    finally { setBusy(false); }
  }

  async function savePassport(event: FormEvent<HTMLFormElement>, travelerId: string, tripId: string) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/admin/travelers/${encodeURIComponent(travelerId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ passportNumber: passport }) });
      await load(); setPassportKey(null); setMessage("Pasaporte actualizado.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar el pasaporte"); }
    finally { setBusy(false); }
  }

  async function removeFromTrip(traveler: Traveler, trip: Traveler["trips"][number]) {
    if (!window.confirm(`¿Quitar a ${traveler.name} del viaje ${trip.tripName}? Perderá el acceso a ese viaje, pero se conservará su cuenta y el historial.`)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(trip.tripId)}/admin/travelers/${encodeURIComponent(traveler.id)}`, { method: "DELETE" });
      await load(); setMessage(`${traveler.name} ya no pertenece a ${trip.tripName}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos quitar al viajero del viaje"); }
    finally { setBusy(false); }
  }

  const filtered = travelers.filter((traveler) => `${traveler.name} ${traveler.email} ${traveler.whatsappPhone ?? ""} ${traveler.trips.map((trip) => trip.tripName).join(" ")}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));

  return <main className="app-page max-w-3xl">
    <Link href="/app" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Mis viajes</Link>
    <p className="mt-4 text-eyebrow-mark">Administración</p><h1 className="mt-2 text-3xl">Administrar viajeros</h1>
    <p className="mt-2 text-sm text-ink-mute">Editá sus datos y pasaportes, o quitá el acceso a un viaje sin borrar la cuenta.</p>
    <NewTravelerInvitation />
    <label className="mt-6 block text-sm font-medium">Buscar viajeros<input className="app-input mt-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, email, WhatsApp o viaje" /></label>
    {error ? <p role="alert" className="mt-4 rounded-xl bg-nihao-soft p-3 text-sm text-nihao">{error}</p> : null}
    {message ? <p role="status" className="mt-4 rounded-xl bg-nihao-soft p-3 text-sm text-nihao">{message}</p> : null}
    {loading ? <LoaderCircle aria-label="Cargando viajeros" className="mx-auto mt-8 h-6 w-6 animate-spin text-nihao" /> : <div className="mt-4 grid gap-3">
      {filtered.map((traveler) => <article key={traveler.id} className="rounded-2xl border border-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h2 className="font-semibold">{traveler.name}</h2><p className="break-all text-sm text-ink-mute">{traveler.email}</p>{traveler.whatsappPhone ? <p className="text-sm text-ink-mute">WhatsApp: {traveler.whatsappPhone}</p> : null}</div><button type="button" disabled={busy} onClick={() => startEdit(traveler)} className="app-secondary-button text-xs">Editar viajero</button></div>
        {editing === traveler.id ? <form onSubmit={(event) => void saveProfile(event, traveler.id)} className="mt-4 grid gap-3 rounded-xl bg-paper-soft p-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Nombre<input required maxLength={120} className="app-input mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="text-sm font-medium">WhatsApp<input type="tel" inputMode="tel" className="app-input mt-1" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Con código de país" /></label>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><button disabled={busy} type="submit" className="app-primary-button">{busy ? "Guardando…" : "Guardar"}</button><button disabled={busy} type="button" onClick={() => setEditing(null)} className="app-secondary-button">Cancelar</button></div>
        </form> : null}
        <div className="mt-4 border-t border-line pt-3"><h3 className="text-sm font-semibold">Viajes</h3>{traveler.trips.length ? <div className="mt-2 grid gap-3">{traveler.trips.map((trip) => {
          const key = `${traveler.id}:${trip.tripId}`;
          return <div key={key} className="rounded-xl bg-paper-soft p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{trip.tripName}</p><p className="text-xs text-ink-mute">Pasaporte: {trip.passportNumber || "Sin cargar"}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => { setPassportKey(key); setPassport(trip.passportNumber ?? ""); }} className="app-secondary-button text-xs">Editar pasaporte</button><button type="button" disabled={busy} onClick={() => void removeFromTrip(traveler, trip)} className="app-secondary-button text-xs"><Trash2 className="h-4 w-4" />Quitar del viaje</button></div></div>
            <Link href={`/app/viajeros/${encodeURIComponent(traveler.id)}/viajes/${encodeURIComponent(trip.tripId)}/agenda`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-nihao">Administrar agenda →</Link>
            {passportKey === key ? <form onSubmit={(event) => void savePassport(event, traveler.id, trip.tripId)} className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm font-medium">Pasaporte<input className="app-input mt-1" value={passport} onChange={(event) => setPassport(event.target.value)} maxLength={64} /></label><button type="submit" disabled={busy} className="app-primary-button">{busy ? "Guardando…" : "Guardar"}</button><button type="button" disabled={busy} onClick={() => setPassportKey(null)} className="app-secondary-button">Cancelar</button></form> : null}
          </div>;
        })}</div> : <p className="mt-2 text-sm text-ink-mute">Sin viajes asignados.</p>}</div>
      </article>)}
      {!filtered.length ? <p className="text-sm text-ink-mute">No encontramos viajeros con esa búsqueda.</p> : null}
    </div>}
  </main>;
}
