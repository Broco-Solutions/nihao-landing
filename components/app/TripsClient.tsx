"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronRight, LoaderCircle, MapPinned, Plus, X } from "lucide-react";
import type { TripRecord } from "@/lib/bot/types";
import { appApi } from "./api";

function dateLabel(value: string | null) {
  if (!value) return "Fecha a definir";
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export function TripsClient() {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await appApi<{ trips: TripRecord[] }>("/api/bot/trips");
      setTrips(result.trips);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos cargar tus viajes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function createTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const result = await appApi<{ trip: TripRecord }>("/api/bot/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), startDate: form.get("startDate"), endDate: form.get("endDate") }),
      });
      window.location.assign(`/app/viajes/${result.trip.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos crear el viaje");
      setCreating(false);
    }
  }

  return (
    <main className="app-page">
      <div className="flex items-end justify-between gap-4">
        <div><p className="text-eyebrow-mark">Espacio de trabajo</p><h1 className="mt-3 text-3xl sm:text-4xl">Mis viajes</h1><p className="mt-2 text-sm text-ink-mute">Entrá a un viaje para registrar y comparar proveedores.</p></div>
        <button onClick={() => setShowForm(true)} className="app-primary-button shrink-0" type="button"><Plus className="h-5 w-5" /><span className="hidden sm:inline">Nuevo viaje</span><span className="sm:hidden">Nuevo</span></button>
      </div>

      {showForm ? (
        <form onSubmit={createTrip} className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between"><h2 className="text-xl">Crear viaje</h2><button type="button" onClick={() => setShowForm(false)} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-xl text-ink-mute"><X className="h-5 w-5" /></button></div>
          <label className="mt-4 block text-sm font-medium">Nombre<input required maxLength={120} name="name" className="app-input mt-1.5" placeholder="Ej. Feria de Cantón 2027" /></label>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Inicio<input required type="date" name="startDate" className="app-input mt-1.5" /></label>
            <label className="block text-sm font-medium">Fin<input required type="date" name="endDate" className="app-input mt-1.5" /></label>
          </div>
          <button disabled={creating} className="app-primary-button mt-5 w-full" type="submit">{creating ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}Crear y entrar</button>
        </form>
      ) : null}

      {error ? <p role="alert" className="mt-5 rounded-xl bg-nihao-soft px-4 py-3 text-sm text-nihao">{error}</p> : null}
      {loading ? <div className="mt-10 flex justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-nihao" /></div> : (
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {trips.map((trip) => (
            <Link key={trip.id} href={`/app/viajes/${trip.id}`} className="group rounded-2xl border border-line bg-white p-5 shadow-soft transition hover:border-nihao/30">
              <div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-nihao-soft text-nihao"><MapPinned className="h-5 w-5" /></span><ChevronRight className="mt-2 h-5 w-5 text-ink-faint transition group-hover:translate-x-1" /></div>
              <h2 className="mt-5 text-xl">{trip.name}</h2>
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-mute"><CalendarDays className="h-4 w-4" />{dateLabel(trip.startDate)} — {dateLabel(trip.endDate)}</p>
            </Link>
          ))}
          {!trips.length ? <button type="button" onClick={() => setShowForm(true)} className="min-h-48 rounded-2xl border border-dashed border-line-strong bg-white p-6 text-center text-sm text-ink-mute"><Plus className="mx-auto mb-3 h-7 w-7 text-nihao" />Creá tu primer viaje para empezar a capturar proveedores.</button> : null}
        </div>
      )}
    </main>
  );
}
