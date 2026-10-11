"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, LoaderCircle, Trash2, Unlink, UserPlus } from "lucide-react";
import type { TripRecord } from "@/lib/bot/types";
import { appApi } from "./api";
import { NewTravelerInvitation } from "./NewTravelerInvitation";
import { AppSelect } from "./AppSelect";

type TripCompany = { id: string; name: string };
type TravelerTrip = { tripId: string; tripName: string; passportNumber: string | null; companies: TripCompany[] };
type Traveler = { id: string; name: string; email: string; whatsappPhone: string | null; trips: TravelerTrip[] };

export function TravelersClient() {
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [adminTrips, setAdminTrips] = useState<TripRecord[]>([]);
  const [companiesByTrip, setCompaniesByTrip] = useState<Record<string, TripCompany[]>>({});
  const [selectedCompany, setSelectedCompany] = useState<Record<string, string>>({});
  const [selectedTrip, setSelectedTrip] = useState<Record<string, string>>({});
  const [selectedNewCompany, setSelectedNewCompany] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
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
    try { const result = await appApi<{ travelers: Traveler[] }>("/api/bot/travelers"); setTravelers(result.travelers); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos cargar los viajeros"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); void appApi<{ trips: TripRecord[] }>("/api/bot/trips").then((result) => setAdminTrips(result.trips.filter((trip) => trip.role === "ADMIN"))).catch(() => setError("No pudimos cargar tus viajes administrados")); }, [load]);

  async function loadCompanies(tripId: string) {
    if (!tripId || companiesByTrip[tripId]) return;
    try { const result = await appApi<{ companies: TripCompany[] }>(`/api/bot/trips/${encodeURIComponent(tripId)}/companies`); setCompaniesByTrip((current) => ({ ...current, [tripId]: result.companies })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos cargar las empresas del viaje"); }
  }

  function startEdit(traveler: Traveler) { setEditing(traveler.id); setName(traveler.name); setPhone(traveler.whatsappPhone ?? ""); setError(null); setMessage(null); }

  async function saveProfile(event: FormEvent<HTMLFormElement>, travelerId: string) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try { await appApi(`/api/bot/travelers/${encodeURIComponent(travelerId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, whatsappPhone: phone }) }); await load(); setEditing(null); setMessage("Datos del viajero actualizados."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar los cambios"); }
    finally { setBusy(false); }
  }

  async function savePassport(event: FormEvent<HTMLFormElement>, travelerId: string, tripId: string) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try { await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/admin/travelers/${encodeURIComponent(travelerId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ passportNumber: passport }) }); await load(); setPassportKey(null); setMessage("Pasaporte actualizado."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos guardar el pasaporte"); }
    finally { setBusy(false); }
  }

  async function removeFromTrip(traveler: Traveler, trip: TravelerTrip) {
    if (!window.confirm(`¿Quitar a ${traveler.name} del viaje ${trip.tripName}? Perderá el acceso, pero se conservarán su cuenta y el historial.`)) return;
    setBusy(true); setError(null); setMessage(null);
    try { await appApi(`/api/bot/trips/${encodeURIComponent(trip.tripId)}/admin/travelers/${encodeURIComponent(traveler.id)}`, { method: "DELETE" }); await load(); setMessage(`${traveler.name} ya no pertenece a ${trip.tripName}.`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos quitar al viajero del viaje"); }
    finally { setBusy(false); }
  }

  async function assignCompany(traveler: Traveler, trip: TravelerTrip) {
    const companyId = selectedCompany[`${traveler.id}:${trip.tripId}`]; if (!companyId) return;
    setBusy(true); setError(null); setMessage(null);
    try { await appApi(`/api/bot/trips/${encodeURIComponent(trip.tripId)}/admin/travelers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: traveler.id, companyId }) }); setSelectedCompany((current) => ({ ...current, [`${traveler.id}:${trip.tripId}`]: "" })); await load(); setMessage("Empresa asignada al viajero."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos asignar la empresa"); }
    finally { setBusy(false); }
  }

  async function unassignCompany(traveler: Traveler, trip: TravelerTrip, company: TripCompany) {
    if (!window.confirm(`¿Quitar a ${traveler.name} de ${company.name}? Seguirá perteneciendo a ${trip.tripName} y se conservará el historial.`)) return;
    setBusy(true); setError(null); setMessage(null);
    try { await appApi(`/api/bot/trips/${encodeURIComponent(trip.tripId)}/companies/${encodeURIComponent(company.id)}/members/${encodeURIComponent(traveler.id)}`, { method: "DELETE" }); await load(); setMessage("Empresa desasignada. El viaje y el historial se conservaron."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos quitar la empresa"); }
    finally { setBusy(false); }
  }

  async function addToTrip(traveler: Traveler) {
    const tripId = selectedTrip[traveler.id]; const companyId = selectedNewCompany[traveler.id]; if (!tripId) return;
    setBusy(true); setError(null); setMessage(null);
    try { await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/admin/travelers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: traveler.id, ...(companyId ? { companyId } : {}) }) }); setSelectedTrip((current) => ({ ...current, [traveler.id]: "" })); setSelectedNewCompany((current) => ({ ...current, [traveler.id]: "" })); await load(); setMessage(companyId ? "Viajero agregado al viaje y a la empresa." : "Viajero agregado al viaje. Quedó visible como Sin empresa asignada."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos agregar al viajero"); }
    finally { setBusy(false); }
  }

  const normalized = search.trim().toLocaleLowerCase("es");
  const filtered = travelers.filter((traveler) => `${traveler.name} ${traveler.email} ${traveler.whatsappPhone ?? ""} ${traveler.trips.flatMap((trip) => [trip.tripName, ...trip.companies.map((company) => company.name)]).join(" ")}`.toLocaleLowerCase("es").includes(normalized));
  const displayedTravelers = normalized || showAll ? filtered : filtered.slice(0, 8);

  return <main className="app-page max-w-4xl">
    <Link href="/app" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Mis viajes</Link>
    <p className="mt-4 text-eyebrow-mark">Administración</p><h1 className="mt-2 text-3xl">Administrar viajeros</h1><p className="mt-2 text-sm text-ink-mute">Buscá una cuenta y gestioná desde su ficha los datos, viajes, empresas y agenda.</p>
    <label className="mt-6 block text-sm font-medium">Buscar viajeros<input className="app-input mt-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, email, WhatsApp, empresa o viaje" /></label>
    <NewTravelerInvitation />
    {error ? <p role="alert" className="mt-4 rounded-xl bg-nihao-soft p-3 text-sm text-nihao">{error}</p> : null}{message ? <p role="status" className="mt-4 rounded-xl bg-nihao-soft p-3 text-sm text-nihao">{message}</p> : null}
    {loading ? <LoaderCircle aria-label="Cargando viajeros" className="mx-auto mt-8 h-6 w-6 animate-spin text-nihao" /> : <><div className="mt-4 grid gap-3">{displayedTravelers.map((traveler) => <details key={traveler.id} className="group rounded-2xl border border-line bg-white p-4 shadow-soft">
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-semibold">{traveler.name}</h2><p className="break-all text-sm text-ink-mute">{traveler.email}</p><p className="text-sm text-ink-mute">WhatsApp: {traveler.whatsappPhone || "Sin registrar"}</p></div><div className="text-right"><span className="rounded-full bg-paper-soft px-2.5 py-1 text-xs font-semibold">{traveler.trips.length} viaje{traveler.trips.length === 1 ? "" : "s"}</span><span className="mt-2 block text-sm font-semibold text-nihao group-open:hidden">Administrar</span><span className="mt-2 hidden text-sm font-semibold text-nihao group-open:block">Cerrar</span></div></summary>
      <div className="mt-4 flex justify-end border-t border-line pt-4"><button type="button" disabled={busy} onClick={() => startEdit(traveler)} className="app-secondary-button text-xs">Editar viajero</button></div>
      {editing === traveler.id ? <form onSubmit={(event) => void saveProfile(event, traveler.id)} className="mt-4 grid gap-3 rounded-xl bg-paper-soft p-3 sm:grid-cols-2"><label className="text-sm font-medium">Nombre<input required maxLength={120} className="app-input mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="text-sm font-medium">WhatsApp<input type="tel" inputMode="tel" className="app-input mt-1" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Con código de país" /></label><div className="flex flex-wrap gap-2 sm:col-span-2"><button disabled={busy} type="submit" className="app-primary-button">{busy ? "Guardando…" : "Guardar"}</button><button disabled={busy} type="button" onClick={() => setEditing(null)} className="app-secondary-button">Cancelar</button></div></form> : null}
      <div className="mt-4 border-t border-line pt-3"><h3 className="text-sm font-semibold">Viajes y empresas</h3>{traveler.trips.length ? <div className="mt-2 grid gap-3">{traveler.trips.map((trip) => { const key = `${traveler.id}:${trip.tripId}`; const availableCompanies = (companiesByTrip[trip.tripId] ?? []).filter((company) => !trip.companies.some((assigned) => assigned.id === company.id)); return <section key={key} className="rounded-xl bg-paper-soft p-3" onFocus={() => void loadCompanies(trip.tripId)}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{trip.tripName}</p><p className="text-xs text-ink-mute">Pasaporte: {trip.passportNumber || "Sin cargar"}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => { setPassportKey(key); setPassport(trip.passportNumber ?? ""); }} className="app-secondary-button text-xs">Editar pasaporte</button><button type="button" disabled={busy} onClick={() => void removeFromTrip(traveler, trip)} className="min-h-11 rounded-xl px-3 text-xs font-semibold text-nihao hover:bg-nihao-soft"><Trash2 className="inline h-4 w-4" /> Quitar del viaje</button></div></div>
        <div className="mt-3 flex flex-wrap gap-2">{trip.companies.map((company) => <span key={company.id} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-white py-1 pl-3 pr-1 text-xs"><span>{company.name}</span><button type="button" disabled={busy} aria-label={`Quitar ${company.name}`} className="grid h-8 w-8 place-items-center rounded-full text-nihao hover:bg-nihao-soft" onClick={() => void unassignCompany(traveler, trip, company)}><Unlink className="h-3.5 w-3.5" /></button></span>)}{!trip.companies.length ? <span className="rounded-full bg-gold-soft px-3 py-2 text-xs font-semibold text-gold-deep">Sin empresa asignada</span> : null}</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><AppSelect label="Agregar otra empresa" value={selectedCompany[key] ?? ""} onValueChange={(value) => setSelectedCompany((current) => ({ ...current, [key]: value }))} searchable clearable placeholder="Buscar empresa" options={availableCompanies.map((company) => ({ value: company.id, label: company.name }))} /><button type="button" disabled={busy || !selectedCompany[key]} onClick={() => void assignCompany(traveler, trip)} className="app-secondary-button min-h-12">Asignar</button></div>
        <Link href={`/app/viajeros/${encodeURIComponent(traveler.id)}/viajes/${encodeURIComponent(trip.tripId)}/agenda`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-nihao">Administrar agenda →</Link>
        {passportKey === key ? <form onSubmit={(event) => void savePassport(event, traveler.id, trip.tripId)} className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm font-medium">Pasaporte<input className="app-input mt-1" value={passport} onChange={(event) => setPassport(event.target.value)} maxLength={64} /></label><button type="submit" disabled={busy} className="app-primary-button">{busy ? "Guardando…" : "Guardar"}</button><button type="button" disabled={busy} onClick={() => setPassportKey(null)} className="app-secondary-button">Cancelar</button></form> : null}
      </section>;})}</div> : <p className="mt-2 text-sm text-ink-mute">Sin viajes asignados.</p>}
        <div className="mt-4 border-t border-line pt-4"><p className="text-sm font-medium">Agregar a otro viaje</p><div className="mt-2 grid gap-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end"><AppSelect label="Viaje" value={selectedTrip[traveler.id] ?? ""} onValueChange={(value) => { setSelectedTrip((current) => ({ ...current, [traveler.id]: value })); setSelectedNewCompany((current) => ({ ...current, [traveler.id]: "" })); void loadCompanies(value); }} searchable clearable placeholder="Elegí un viaje" options={adminTrips.filter((trip) => !traveler.trips.some((membership) => membership.tripId === trip.id)).map((trip) => ({ value: trip.id, label: trip.name }))} /><AppSelect label="Empresa (opcional)" value={selectedNewCompany[traveler.id] ?? ""} onValueChange={(value) => setSelectedNewCompany((current) => ({ ...current, [traveler.id]: value }))} searchable clearable disabled={!selectedTrip[traveler.id]} placeholder="Sin empresa por ahora" options={(companiesByTrip[selectedTrip[traveler.id]] ?? []).map((company) => ({ value: company.id, label: company.name }))} /><button type="button" disabled={busy || !selectedTrip[traveler.id]} onClick={() => void addToTrip(traveler)} className="app-secondary-button min-h-12"><UserPlus className="h-4 w-4" />Agregar</button></div></div>
      </div>
    </details>)}{!filtered.length ? <p className="text-sm text-ink-mute">No encontramos viajeros con esa búsqueda.</p> : null}</div>{!normalized && filtered.length > 8 ? <button type="button" className="app-secondary-button mt-4" onClick={() => setShowAll((current) => !current)}>{showAll ? "Mostrar menos viajeros" : `Mostrar los ${filtered.length} viajeros`}</button> : null}</>}
  </main>;
}
