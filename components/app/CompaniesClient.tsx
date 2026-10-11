"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, LoaderCircle, Plus, Unlink, UserPlus } from "lucide-react";
import type { TripRecord } from "@/lib/bot/types";
import { appApi } from "./api";
import { AppSelect } from "./AppSelect";
import { AppNotice } from "./AppNotice";

type Company = { id: string; name: string; tripCount: number; tripNames: string[] };
type Traveler = { id: string; name: string; email: string };
type CompanyTrip = { id: string; companyId: string; name: string; travelers: Traveler[] };
type CompanyDetails = { id: string; name: string; trips: CompanyTrip[] };

export function CompaniesClient() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [adminTrips, setAdminTrips] = useState<TripRecord[]>([]);
  const [tripTravelers, setTripTravelers] = useState<Record<string, Traveler[]>>({});
  const [selectedTravelerByTrip, setSelectedTravelerByTrip] = useState<Record<string, string>>({});
  const [selectedTripId, setSelectedTripId] = useState("");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef(0);
  const detailRequestId = useRef(0);
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [details, setDetails] = useState<CompanyDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    const currentRequest = ++requestId.current;
    try {
      const result = await appApi<{ companies: Company[] }>(`/api/bot/companies?search=${encodeURIComponent(query)}`);
      if (currentRequest === requestId.current) { setCompanies(result.companies); setError(null); }
    } catch (caught) { if (currentRequest === requestId.current) setError(caught instanceof Error ? caught.message : "No pudimos cargar las empresas"); }
    finally { if (currentRequest === requestId.current) setLoading(false); }
  }, []);

  const loadDetails = useCallback(async (companyId: string) => {
    const currentRequest = ++detailRequestId.current;
    setDetailError(null); setDetailLoading(true);
    try {
      const result = await appApi<{ company: CompanyDetails }>(`/api/bot/companies/${encodeURIComponent(companyId)}`);
      if (currentRequest === detailRequestId.current) setDetails(result.company);
    } catch (caught) { if (currentRequest === detailRequestId.current) setDetailError(caught instanceof Error ? caught.message : "No pudimos cargar las asociaciones de la empresa"); }
    finally { if (currentRequest === detailRequestId.current) setDetailLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(search); }, 200);
    return () => window.clearTimeout(timer);
  }, [search, load]);
  useEffect(() => { void appApi<{ trips: TripRecord[] }>("/api/bot/trips").then((result) => setAdminTrips(result.trips.filter((trip) => trip.role === "ADMIN"))).catch(() => setError("No pudimos cargar tus viajes administrados")); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try { await appApi("/api/bot/companies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }); setName(""); setSearch(""); await load(""); setMessage("Empresa creada en el catálogo."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos crear la empresa"); }
    finally { setBusy(false); }
  }

  async function rename(company: Company) {
    const next = window.prompt("Nombre de la empresa en todos los viajes", company.name)?.trim();
    if (!next || next === company.name) return;
    setBusy(true); setError(null); setMessage(null);
    try { await appApi(`/api/bot/companies/${company.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: next }) }); await load(search); if (expandedCompanyId === company.id) await loadDetails(company.id); setMessage("Nombre actualizado."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos renombrar la empresa"); }
    finally { setBusy(false); }
  }

  async function toggleDetails(companyId: string) {
    if (expandedCompanyId === companyId) { setExpandedCompanyId(null); return; }
    setExpandedCompanyId(companyId); setDetails(null); setSelectedTripId("");
    await loadDetails(companyId);
  }

  async function ensureTravelers(tripId: string) {
    if (tripTravelers[tripId]) return;
    try {
      const result = await appApi<{ travelers: Traveler[] }>(`/api/bot/trips/${encodeURIComponent(tripId)}/admin/travelers`);
      setTripTravelers((current) => ({ ...current, [tripId]: result.travelers }));
    } catch (caught) { setDetailError(caught instanceof Error ? caught.message : "No pudimos cargar los viajeros"); }
  }

  async function assignTraveler(trip: CompanyTrip) {
    const userId = selectedTravelerByTrip[trip.id]; if (!userId) return;
    setBusy(true); setDetailError(null); setMessage(null);
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(trip.id)}/admin/travelers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, companyId: trip.companyId }) });
      setSelectedTravelerByTrip((current) => ({ ...current, [trip.id]: "" })); await loadDetails(details!.id); setMessage("Viajero asignado a la empresa en este viaje.");
    } catch (caught) { setDetailError(caught instanceof Error ? caught.message : "No pudimos asignar al viajero"); }
    finally { setBusy(false); }
  }

  async function unassignTraveler(trip: CompanyTrip, traveler: Traveler) {
    if (!window.confirm(`¿Quitar a ${traveler.name} de ${details?.name} en ${trip.name}? Seguirá perteneciendo al viaje y se conservará su historial.`)) return;
    setBusy(true); setDetailError(null); setMessage(null);
    try { await appApi(`/api/bot/trips/${encodeURIComponent(trip.id)}/companies/${encodeURIComponent(trip.companyId)}/members/${encodeURIComponent(traveler.id)}`, { method: "DELETE" }); await loadDetails(details!.id); setMessage("Asociación quitada. La membresía del viaje y el historial se conservaron."); }
    catch (caught) { setDetailError(caught instanceof Error ? caught.message : "No pudimos quitar la asociación"); }
    finally { setBusy(false); }
  }

  async function addToTrip() {
    if (!details || !selectedTripId) return;
    setBusy(true); setDetailError(null); setMessage(null);
    try { await appApi(`/api/bot/trips/${encodeURIComponent(selectedTripId)}/companies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalogCompanyId: details.id }) }); setSelectedTripId(""); await Promise.all([loadDetails(details.id), load(search)]); setMessage("Empresa incorporada al viaje. Ahora podés asignarle viajeros."); }
    catch (caught) { setDetailError(caught instanceof Error ? caught.message : "No pudimos incorporar la empresa al viaje"); }
    finally { setBusy(false); }
  }

  async function removeFromTrip(trip: CompanyTrip) {
    if (!details || !window.confirm(`¿Quitar ${details.name} de ${trip.name}? Se revocarán sus invitaciones pendientes y se conservará toda la información histórica.`)) return;
    setBusy(true); setDetailError(null); setMessage(null);
    try { await appApi(`/api/bot/trips/${encodeURIComponent(trip.id)}/companies/${encodeURIComponent(trip.companyId)}?revokePending=1`, { method: "DELETE" }); await Promise.all([loadDetails(details.id), load(search)]); setMessage("Empresa quitada del viaje. El catálogo y el historial se conservaron."); }
    catch (caught) { setDetailError(caught instanceof Error ? caught.message : "No pudimos quitar la empresa del viaje"); }
    finally { setBusy(false); }
  }

  const displayedCompanies = search.trim() || showAll ? companies : companies.slice(0, 8);
  return <main className="app-page max-w-4xl">
    <Link href="/app" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Mis viajes</Link>
    <p className="mt-4 text-eyebrow-mark">Administración</p><h1 className="mt-2 text-3xl">Administrar empresas</h1>
    <p className="mt-2 text-sm text-ink-mute">Creá, buscá y gestioná sus viajes y viajeros sin salir del catálogo.</p>
    <form onSubmit={create} className="mt-6 flex flex-col gap-2 rounded-2xl border border-line bg-white p-4 shadow-soft sm:flex-row"><input className="app-input min-w-0 flex-1" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Nombre de la empresa" aria-label="Nueva empresa" /><button disabled={busy} className="app-primary-button justify-center" type="submit"><Plus className="h-4 w-4" />Crear</button></form>
    <label className="mt-7 block text-sm font-medium">Buscar en el catálogo<input className="app-input mt-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre de empresa" /></label>
    {error ? <AppNotice tone="error" className="mt-3">{error}</AppNotice> : null}
    {message ? <AppNotice tone="success" className="mt-3">{message}</AppNotice> : null}
    {loading ? <LoaderCircle className="mx-auto mt-8 h-6 w-6 animate-spin text-nihao" /> : <><div className="mt-4 grid gap-3">{displayedCompanies.map((company) => {
      const expanded = expandedCompanyId === company.id;
      return <article key={company.id} className="rounded-2xl border border-line bg-white p-4 shadow-soft">
        <div className="flex items-center gap-2"><button type="button" disabled={busy} aria-expanded={expanded} aria-controls={`company-travelers-${company.id}`} aria-label={`${expanded ? "Ocultar" : "Administrar"} ${company.name}`} onClick={() => void toggleDetails(company.id)} className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 text-left"><span className="min-w-0"><span className="block font-semibold">{company.name}</span><span className="mt-1 block truncate text-xs text-ink-mute">{company.tripCount ? `${company.tripCount} viaje${company.tripCount === 1 ? "" : "s"} · ${company.tripNames.join(", ")}` : "Sin viajes asignados"}</span></span><ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 text-ink-mute transition ${expanded ? "rotate-180" : ""}`} /></button><button type="button" disabled={busy} onClick={() => void rename(company)} className="app-secondary-button shrink-0 text-xs">Renombrar</button></div>
        {expanded ? <div id={`company-travelers-${company.id}`} className="mt-4 border-t border-line pt-4">{detailLoading ? <p role="status" className="flex items-center gap-2 text-sm text-ink-mute"><LoaderCircle className="h-4 w-4 animate-spin" />Cargando asociaciones…</p> : null}{detailError ? <AppNotice tone="error" className="mt-3">{detailError}</AppNotice> : null}{details && details.id === company.id ? <>
          <div className="grid gap-3">{details.trips.map((trip) => <section key={trip.id} className="rounded-xl bg-paper-soft p-3" onFocus={() => void ensureTravelers(trip.id)}><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">{trip.name}</h2><p className="text-xs text-ink-mute">{trip.travelers.length} viajero{trip.travelers.length === 1 ? "" : "s"} asignado{trip.travelers.length === 1 ? "" : "s"}</p></div><button type="button" disabled={busy} onClick={() => void removeFromTrip(trip)} className="min-h-11 rounded-xl px-3 text-xs font-semibold text-nihao hover:bg-nihao-soft">Quitar empresa del viaje</button></div>
            <div className="mt-3 grid gap-2">{trip.travelers.map((traveler) => <div key={traveler.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{traveler.name}</p><p className="truncate text-xs text-ink-mute">{traveler.email}</p></div><button type="button" disabled={busy} onClick={() => void unassignTraveler(trip, traveler)} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-nihao"><Unlink className="h-3.5 w-3.5" />Quitar</button></div>)}{!trip.travelers.length ? <p className="text-sm text-ink-mute">Sin viajeros asignados en este viaje.</p> : null}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><AppSelect label="Agregar viajero existente" value={selectedTravelerByTrip[trip.id] ?? ""} onValueChange={(value) => setSelectedTravelerByTrip((current) => ({ ...current, [trip.id]: value }))} searchable clearable placeholder="Buscar nombre o email" options={(tripTravelers[trip.id] ?? []).map((traveler) => ({ value: traveler.id, label: traveler.name, description: traveler.email, disabled: trip.travelers.some((assigned) => assigned.id === traveler.id) }))} /><button type="button" disabled={busy || !selectedTravelerByTrip[trip.id]} className="app-secondary-button min-h-12" onClick={() => void assignTraveler(trip)}><UserPlus className="h-4 w-4" />Asignar</button></div>
          </section>)}{!details.trips.length ? <p className="text-sm text-ink-mute">Esta empresa no está asignada a ningún viaje.</p> : null}</div>
          <div className="mt-4 border-t border-line pt-4"><p className="text-sm font-medium">Incorporar a otro viaje</p><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><AppSelect label="Viaje" value={selectedTripId} onValueChange={setSelectedTripId} searchable clearable placeholder="Elegí un viaje" options={adminTrips.filter((trip) => !details.trips.some((assigned) => assigned.id === trip.id)).map((trip) => ({ value: trip.id, label: trip.name }))} /><button type="button" disabled={busy || !selectedTripId} className="app-secondary-button min-h-12" onClick={() => void addToTrip()}><Plus className="h-4 w-4" />Agregar al viaje</button></div><p className="mt-2 text-xs text-ink-mute">La relación se crea sólo después de confirmar esta acción.</p></div>
        </> : null}</div> : null}
      </article>;
    })}{!companies.length ? <p className="text-sm text-ink-mute">No encontramos empresas con ese nombre.</p> : null}</div>{!search.trim() && companies.length > 8 ? <button type="button" className="app-secondary-button mt-4" onClick={() => setShowAll((current) => !current)}>{showAll ? "Mostrar menos empresas" : `Mostrar las ${companies.length} empresas`}</button> : null}</>}
  </main>;
}
