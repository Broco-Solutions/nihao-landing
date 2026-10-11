"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarDays, LoaderCircle, Pencil, Plus, Trash2, Unlink, UserPlus, X } from "lucide-react";
import type { TripRecord } from "@/lib/bot/types";
import { appApi } from "./api";
import { NewTravelerInvitation } from "./NewTravelerInvitation";
import { AppSelect } from "./AppSelect";
import { AppNotice } from "./AppNotice";
import { InternationalPhoneInput } from "./InternationalPhoneInput";
import { formatWhatsAppPhone } from "@/lib/bot/whatsapp-phone";

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
  const [expandedTravelers, setExpandedTravelers] = useState<Set<string>>(new Set());
  const [companyFormKey, setCompanyFormKey] = useState<string | null>(null);
  const [tripFormTravelerId, setTripFormTravelerId] = useState<string | null>(null);
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
    try {
      const result = await appApi<{ travelers: Traveler[] }>("/api/bot/travelers");
      setTravelers(result.travelers);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos cargar los viajeros");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
    void appApi<{ trips: TripRecord[] }>("/api/bot/trips")
      .then((result) => setAdminTrips(result.trips.filter((trip) => trip.role === "ADMIN")))
      .catch(() => setError("No pudimos cargar tus viajes administrados"));
  }, [load]);

  async function loadCompanies(tripId: string) {
    if (!tripId || companiesByTrip[tripId]) return;
    try {
      const result = await appApi<{ companies: TripCompany[] }>(`/api/bot/trips/${encodeURIComponent(tripId)}/companies`);
      setCompaniesByTrip((current) => ({ ...current, [tripId]: result.companies }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos cargar las empresas del viaje");
    }
  }

  function openTraveler(travelerId: string) {
    setExpandedTravelers((current) => new Set(current).add(travelerId));
  }

  function closeTraveler(travelerId: string) {
    setExpandedTravelers((current) => {
      const next = new Set(current);
      next.delete(travelerId);
      return next;
    });
    if (editing === travelerId) setEditing(null);
    if (tripFormTravelerId === travelerId) setTripFormTravelerId(null);
    if (companyFormKey?.startsWith(`${travelerId}:`)) setCompanyFormKey(null);
  }

  function startEdit(traveler: Traveler) {
    openTraveler(traveler.id);
    setEditing(traveler.id);
    setName(traveler.name);
    setPhone(traveler.whatsappPhone ?? "");
    setError(null);
    setMessage(null);
  }

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

  async function removeFromTrip(traveler: Traveler, trip: TravelerTrip) {
    if (!window.confirm(`¿Quitar a ${traveler.name} del viaje ${trip.tripName}? Perderá el acceso, pero se conservarán su cuenta y el historial.`)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(trip.tripId)}/admin/travelers/${encodeURIComponent(traveler.id)}`, { method: "DELETE" });
      await load(); setMessage(`${traveler.name} ya no pertenece a ${trip.tripName}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos quitar al viajero del viaje"); }
    finally { setBusy(false); }
  }

  async function assignCompany(traveler: Traveler, trip: TravelerTrip) {
    const key = `${traveler.id}:${trip.tripId}`;
    const companyId = selectedCompany[key];
    if (!companyId) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(trip.tripId)}/admin/travelers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: traveler.id, companyId }) });
      setSelectedCompany((current) => ({ ...current, [key]: "" }));
      await load(); setCompanyFormKey(null); setMessage("Empresa asignada al viajero.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos asignar la empresa"); }
    finally { setBusy(false); }
  }

  async function unassignCompany(traveler: Traveler, trip: TravelerTrip, company: TripCompany) {
    if (!window.confirm(`¿Quitar a ${traveler.name} de ${company.name}? Seguirá perteneciendo a ${trip.tripName} y se conservará el historial.`)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(trip.tripId)}/companies/${encodeURIComponent(company.id)}/members/${encodeURIComponent(traveler.id)}`, { method: "DELETE" });
      await load(); setMessage("Empresa desasignada. El viaje y el historial se conservaron.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos quitar la empresa"); }
    finally { setBusy(false); }
  }

  async function addToTrip(traveler: Traveler) {
    const tripId = selectedTrip[traveler.id];
    const companyId = selectedNewCompany[traveler.id];
    if (!tripId) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/admin/travelers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: traveler.id, ...(companyId ? { companyId } : {}) }) });
      setSelectedTrip((current) => ({ ...current, [traveler.id]: "" }));
      setSelectedNewCompany((current) => ({ ...current, [traveler.id]: "" }));
      await load(); setTripFormTravelerId(null);
      setMessage(companyId ? "Viajero agregado al viaje y a la empresa." : "Viajero agregado al viaje. Quedó visible como Sin empresa asignada.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos agregar al viajero"); }
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
    {error ? <AppNotice tone="error" className="mt-4">{error}</AppNotice> : null}{message ? <AppNotice tone="success" className="mt-4">{message}</AppNotice> : null}
    {loading ? <LoaderCircle aria-label="Cargando viajeros" className="mx-auto mt-8 h-6 w-6 animate-spin text-nihao" /> : <><div className="mt-4 grid gap-3">
      {displayedTravelers.map((traveler) => {
        const expanded = expandedTravelers.has(traveler.id);
        const panelId = `traveler-panel-${traveler.id}`;
        return <article key={traveler.id} className="rounded-2xl border border-line bg-white p-4 shadow-soft">
          <header className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0"><h2 className="break-words text-base font-semibold text-ink">{traveler.name}</h2><p className="break-all text-sm text-ink-mute">{traveler.email}</p><p className="break-words text-sm text-ink-mute">WhatsApp: {traveler.whatsappPhone ? formatWhatsAppPhone(traveler.whatsappPhone) : "Sin registrar"}</p></div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className="whitespace-nowrap rounded-full bg-paper-soft px-2.5 py-1 text-xs font-semibold">{traveler.trips.length} viaje{traveler.trips.length === 1 ? "" : "s"}</span>
              <button type="button" disabled={busy} onClick={() => startEdit(traveler)} className="app-secondary-button min-h-10 px-3 text-xs"><Pencil className="h-3.5 w-3.5" />Editar viajero</button>
              <button type="button" disabled={busy} aria-expanded={expanded} aria-controls={panelId} onClick={() => expanded ? closeTraveler(traveler.id) : openTraveler(traveler.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-nihao hover:bg-nihao-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nihao">{expanded ? <><X className="h-3.5 w-3.5" />Cerrar</> : "Administrar"}</button>
            </div>
          </header>
          {expanded ? <div id={panelId} className="mt-4 border-t border-line pt-4">
            {editing === traveler.id ? <form onSubmit={(event) => void saveProfile(event, traveler.id)} className="grid gap-3 rounded-xl bg-paper-soft p-3 sm:grid-cols-2"><label className="text-sm font-medium">Nombre<input required maxLength={120} className="app-input mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label><InternationalPhoneInput className="sm:col-span-2" value={phone} onValueChange={setPhone} helperText="Dejalo vacío para mantener al viajero sin WhatsApp vinculado." /><div className="flex flex-wrap gap-2 sm:col-span-2"><button disabled={busy} type="submit" className="app-primary-button">{busy ? "Guardando…" : "Guardar"}</button><button disabled={busy} type="button" onClick={() => setEditing(null)} className="app-secondary-button">Cancelar</button></div></form> : null}
            <div className={editing === traveler.id ? "mt-4" : ""}><h3 className="text-sm font-semibold">Viajes y empresas</h3>
              {traveler.trips.length ? <div className="mt-2 grid gap-3">{traveler.trips.map((trip) => {
                const key = `${traveler.id}:${trip.tripId}`;
                const availableCompanies = (companiesByTrip[trip.tripId] ?? []).filter((company) => !trip.companies.some((assigned) => assigned.id === company.id));
                const companyFormOpen = companyFormKey === key;
                return <section key={key} className="rounded-xl border border-line/70 bg-paper-soft p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><p className="break-words text-sm font-semibold">{trip.tripName}</p><p className="mt-0.5 text-xs text-ink-mute">Pasaporte: {trip.passportNumber || "Sin cargar"}</p></div><div className="flex flex-wrap gap-1.5"><button type="button" disabled={busy} onClick={() => { setPassportKey(key); setPassport(trip.passportNumber ?? ""); }} className="app-secondary-button min-h-10 px-3 text-xs"><Pencil className="h-3.5 w-3.5" />Editar pasaporte</button><button type="button" disabled={busy} onClick={() => void removeFromTrip(traveler, trip)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-nihao hover:bg-nihao-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nihao"><Trash2 className="h-3.5 w-3.5" />Quitar del viaje</button></div></div>
                  {passportKey === key ? <form onSubmit={(event) => void savePassport(event, traveler.id, trip.tripId)} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-sm font-medium">Pasaporte<input className="app-input mt-1" value={passport} onChange={(event) => setPassport(event.target.value)} maxLength={64} /></label><div className="flex gap-2"><button type="submit" disabled={busy} className="app-primary-button">{busy ? "Guardando…" : "Guardar"}</button><button type="button" disabled={busy} onClick={() => setPassportKey(null)} className="app-secondary-button">Cancelar</button></div></form> : null}
                  <div className="mt-3 flex flex-wrap gap-2">{trip.companies.map((company) => <span key={company.id} className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-line bg-white py-1 pl-3 pr-1 text-xs"><span className="min-w-0 break-words">{company.name}</span><button type="button" disabled={busy} aria-label={`Quitar ${company.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-nihao hover:bg-nihao-soft" onClick={() => void unassignCompany(traveler, trip, company)}><Unlink className="h-3.5 w-3.5" /></button></span>)}{!trip.companies.length ? <span className="rounded-full bg-gold-soft px-3 py-2 text-xs font-semibold text-gold-deep">Sin empresa asignada</span> : null}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/70 pt-2"><button type="button" disabled={busy} aria-expanded={companyFormOpen} onClick={() => { if (companyFormOpen) setCompanyFormKey(null); else { setCompanyFormKey(key); void loadCompanies(trip.tripId); } }} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-nihao hover:bg-white"><Plus className="h-3.5 w-3.5" />Agregar otra empresa</button><Link href={`/app/viajeros/${encodeURIComponent(traveler.id)}/viajes/${encodeURIComponent(trip.tripId)}/agenda`} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-nihao hover:bg-white"><CalendarDays className="h-3.5 w-3.5" />Administrar agenda</Link></div>
                  {companyFormOpen ? <div className="mt-2 grid gap-2 rounded-xl bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><AppSelect label="Empresa" value={selectedCompany[key] ?? ""} onValueChange={(value) => setSelectedCompany((current) => ({ ...current, [key]: value }))} searchable clearable placeholder="Buscar empresa" emptyMessage="No hay otras empresas disponibles en este viaje." options={availableCompanies.map((company) => ({ value: company.id, label: company.name }))} /><div className="flex gap-2"><button type="button" disabled={busy || !selectedCompany[key]} onClick={() => void assignCompany(traveler, trip)} className="app-secondary-button min-h-12">Asignar</button><button type="button" disabled={busy} onClick={() => setCompanyFormKey(null)} className="min-h-12 rounded-xl px-3 text-sm font-semibold text-ink-mute hover:bg-paper-soft">Cancelar</button></div></div> : null}
                </section>;
              })}</div> : <p className="mt-2 text-sm text-ink-mute">Sin viajes asignados.</p>}
              <div className="mt-3 border-t border-line pt-3"><button type="button" disabled={busy} aria-expanded={tripFormTravelerId === traveler.id} onClick={() => setTripFormTravelerId((current) => current === traveler.id ? null : traveler.id)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-nihao hover:bg-nihao-soft"><UserPlus className="h-4 w-4" />Agregar a otro viaje</button>
                {tripFormTravelerId === traveler.id ? <div className="mt-2 grid gap-2 rounded-xl bg-paper-soft p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"><AppSelect label="Viaje" value={selectedTrip[traveler.id] ?? ""} onValueChange={(value) => { setSelectedTrip((current) => ({ ...current, [traveler.id]: value })); setSelectedNewCompany((current) => ({ ...current, [traveler.id]: "" })); void loadCompanies(value); }} searchable clearable placeholder="Elegí un viaje" options={adminTrips.filter((trip) => !traveler.trips.some((membership) => membership.tripId === trip.id)).map((trip) => ({ value: trip.id, label: trip.name }))} /><AppSelect label="Empresa (opcional)" value={selectedNewCompany[traveler.id] ?? ""} onValueChange={(value) => setSelectedNewCompany((current) => ({ ...current, [traveler.id]: value }))} searchable clearable disabled={!selectedTrip[traveler.id]} placeholder="Sin empresa por ahora" options={(companiesByTrip[selectedTrip[traveler.id]] ?? []).map((company) => ({ value: company.id, label: company.name }))} /><div className="flex gap-2"><button type="button" disabled={busy || !selectedTrip[traveler.id]} onClick={() => void addToTrip(traveler)} className="app-secondary-button min-h-12"><UserPlus className="h-4 w-4" />Agregar</button><button type="button" disabled={busy} onClick={() => setTripFormTravelerId(null)} className="min-h-12 rounded-xl px-3 text-sm font-semibold text-ink-mute hover:bg-white">Cancelar</button></div></div> : null}
              </div>
            </div>
          </div> : null}
        </article>;
      })}
      {!filtered.length ? <p className="text-sm text-ink-mute">No encontramos viajeros con esa búsqueda.</p> : null}
    </div>{!normalized && filtered.length > 8 ? <button type="button" className="app-secondary-button mt-4" onClick={() => setShowAll((current) => !current)}>{showAll ? "Mostrar menos viajeros" : `Mostrar los ${filtered.length} viajeros`}</button> : null}</>}
  </main>;
}
