"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, Users } from "lucide-react";
import type { TripAdminDashboardRecord, TripAdministrationRecord } from "@/lib/bot/types";
import { appApi } from "./api";

type AdministrationView = TripAdministrationRecord & { canInviteTravelers: boolean };

export function TripAdministration({ tripId }: { tripId: string }) {
  const [data, setData] = useState<AdministrationView | null>(null);
  const [dashboard, setDashboard] = useState<TripAdminDashboardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTravelers, setAvailableTravelers] = useState<Array<{ id: string; name: string; email: string; whatsappPhone: string | null }>>([]);
  const [travelerSearch, setTravelerSearch] = useState("");
  const [selectedTravelerId, setSelectedTravelerId] = useState("");
  const [travelerError, setTravelerError] = useState<string | null>(null);
  const [catalogCompanies, setCatalogCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCompanyId, setCatalogCompanyId] = useState("");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const assignedCatalogIds = data?.companies?.map((company) => company.catalogCompanyId).sort().join(",") ?? "";

  const load = useCallback(async () => {
    try {
      const [administration, summary] = await Promise.all([
        appApi<AdministrationView>(`/api/bot/trips/${tripId}/admin`),
        appApi<{ dashboard: TripAdminDashboardRecord }>(`/api/bot/trips/${tripId}/admin/dashboard`),
      ]);
      setData(administration); setDashboard(summary.dashboard);
      setSelectedCompanyId((current) => current || administration.companies?.[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos cargar la administración del viaje");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void appApi<{ companies: Array<{ id: string; name: string }> }>(`/api/bot/companies?search=${encodeURIComponent(catalogSearch)}&excludeTripId=${encodeURIComponent(tripId)}`)
        .then((result) => { if (active) { setCatalogCompanies(result.companies); setCatalogError(null); } })
        .catch((caught) => { if (active) { setCatalogCompanies([]); setCatalogError(caught instanceof Error ? caught.message : "No pudimos cargar el catálogo"); } });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [catalogSearch, tripId, assignedCatalogIds]);

  useEffect(() => {
    if (!data?.canInviteTravelers) return;
    let active = true;
    void appApi<{ travelers: typeof availableTravelers }>(`/api/bot/trips/${encodeURIComponent(tripId)}/admin/travelers`)
      .then((result) => { if (active) { setAvailableTravelers(result.travelers); setTravelerError(null); } })
      .catch((caught) => { if (active) setTravelerError(caught instanceof Error ? caught.message : "No pudimos cargar los viajeros existentes"); });
    return () => { active = false; };
  }, [tripId, data?.canInviteTravelers, data?.members.length]);

  async function assignTraveler(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      if (!selectedTravelerId || !selectedCompanyId) throw new Error("Elegí un viajero y una empresa");
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/admin/travelers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: selectedTravelerId, companyId: selectedCompanyId }) });
      setSelectedTravelerId(""); await load(); setMessage("Viajero existente asignado al viaje.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos asignar al viajero"); }
    finally { setBusy(false); }
  }

  async function assignCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      if (!catalogCompanyId) throw new Error("Elegí una empresa del catálogo");
      const result = await appApi<{ company: { id: string } }>(`/api/bot/trips/${tripId}/companies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalogCompanyId }) });
      setSelectedCompanyId(result.company.id); setCatalogCompanyId(""); await load();
      setMessage("Empresa asignada al viaje.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos asignar la empresa"); } finally { setBusy(false); }
  }

  async function unassignCompany(company: { id: string; name: string }) {
    if (!window.confirm(`¿Quitar a ${company.name} de este viaje? Su información histórica se conservará.`)) return;
    setBusy(true); setMessage(null);
    try {
      await appApi(`/api/bot/trips/${tripId}/companies/${company.id}`, { method: "DELETE" });
      if (selectedCompanyId === company.id) setSelectedCompanyId("");
      await load(); setMessage("Empresa quitada del viaje. Sigue disponible en el catálogo.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos quitar la empresa"); } finally { setBusy(false); }
  }

  if (loading) return <main className="app-page grid min-h-72 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-nihao" /></main>;
  if (error || !data) return <main className="app-page"><Link href="/app" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Mis viajes</Link><p role="alert" className="mt-6 rounded-xl bg-nihao-soft p-4 text-sm text-nihao">{error ?? "Esta administración no está disponible."}</p></main>;

  return (
    <main className="app-page">
      <Link href="/app" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Mis viajes</Link>
      <div className="mt-3"><p className="text-eyebrow-mark">Administración del viaje</p><h1 className="mt-3 text-3xl sm:text-4xl">{data.trip.name}</h1><p className="mt-2 text-sm text-ink-mute">Vista general de miembros y actividad.</p></div>
      {message ? <p role="status" className="mt-4 rounded-xl bg-nihao-soft px-4 py-3 text-sm text-nihao">{message}</p> : null}

      <section aria-labelledby="members-heading" className="mt-8">
        <div className="flex items-center gap-2"><Users className="h-5 w-5 text-nihao" /><h2 id="members-heading" className="text-xl">Datos de los participantes</h2></div>
        <p className="mt-2 text-sm text-ink-mute">Viajeros inscriptos en este viaje. Para editar sus datos, usá Administrar viajeros desde Mis viajes.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.members.filter((member) => member.role === "TRAVELER").map((member) => <article key={member.userId} className="rounded-2xl border border-line bg-white p-4 shadow-soft">
            <h3 className="font-semibold">{member.name}</h3><p className="break-all text-sm text-ink-mute">{member.email}</p>
            <p className="mt-2 text-sm text-ink-soft">Pasaporte: {member.passportNumber || "Sin cargar"}</p>
            <p className="mt-1 text-sm text-ink-soft">Empresa: {data.companies?.filter((company) => company.userIds.includes(member.userId)).map((company) => company.name).join(", ") || "Sin asignar"}</p>
          </article>)}
          {!data.members.some((member) => member.role === "TRAVELER") ? <p className="rounded-2xl bg-paper-soft p-4 text-sm text-ink-mute">Todavía no hay viajeros inscriptos.</p> : null}
        </div>
      </section>

      <section aria-labelledby="progress-heading" className="mt-8">
        <div className="flex items-center justify-between gap-3"><h2 id="progress-heading" className="text-xl">Progreso por viajero</h2><Link href={`/app/viajes/${tripId}/admin/proveedores`} className="app-secondary-button text-xs">Ver proveedores</Link></div>
        {dashboard?.progress.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{dashboard.progress.map((traveler) => <article key={traveler.userId} className="rounded-2xl border border-line bg-white p-4 shadow-soft"><h3 className="font-semibold">{traveler.name}</h3><p className="mt-2 text-sm text-ink-soft">{traveler.confirmedCount} guardados · {traveler.pendingCount ? `${traveler.pendingCount} pendientes` : "Todo al día"}</p></article>)}</div> : <p className="mt-3 rounded-2xl bg-paper-soft p-4 text-sm text-ink-mute">Todavía no hay progreso para mostrar.</p>}
      </section>

      <section aria-labelledby="companies-heading" className="mt-8">
        <h2 id="companies-heading" className="text-xl">Empresas del viaje</h2>
        <p className="mt-2 text-sm text-ink-mute">Asigná empresas existentes del catálogo. Las nuevas se crean en Administrar empresas.</p>
        <form onSubmit={assignCompany} className="mt-3 grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-sm font-medium text-ink-soft">Buscar empresa existente<input className="app-input mt-1.5" value={catalogSearch} onChange={(event) => { setCatalogSearch(event.target.value); setCatalogCompanyId(""); }} placeholder="Nombre de empresa" /></label>
          {catalogError ? <p role="alert" className="text-sm text-nihao sm:col-span-2">{catalogError}</p> : null}
          <select className="app-input sm:col-start-1" aria-label="Empresa del catálogo" value={catalogCompanyId} onChange={(event) => setCatalogCompanyId(event.target.value)} required><option value="">Elegí una empresa</option>{catalogCompanies.filter((company) => !data.companies?.some((assigned) => assigned.catalogCompanyId === company.id)).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
          <button className="app-secondary-button min-h-11" disabled={busy || !catalogCompanyId} type="submit">Asignar al viaje</button>
        </form>
        <div className="mt-3 grid gap-3">{data.companies?.map((company) => <article key={company.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4"><div><h3 className="font-semibold">{company.name}</h3><p className="mt-1 text-sm text-ink-mute">{company.userIds.length} viajeros</p></div><button type="button" className="app-secondary-button text-xs" disabled={busy} onClick={() => void unassignCompany(company)}>Quitar del viaje</button></article>)}</div>
      </section>

      <section aria-labelledby="travelers-heading" className="mt-8">
        <h2 id="travelers-heading" className="text-xl">Asignar viajero existente</h2>
        <p className="mt-2 text-sm text-ink-mute">Elegí una cuenta ya creada y una empresa del viaje. Sus datos se conservarán.</p>
        {data.canInviteTravelers ? <form onSubmit={(event) => void assignTraveler(event)} className="mt-3 grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft sm:grid-cols-2 sm:items-end">
          <label className="text-sm font-medium text-ink-soft">Buscar viajero<input className="app-input mt-1.5" value={travelerSearch} onChange={(event) => { setTravelerSearch(event.target.value); setSelectedTravelerId(""); }} placeholder="Nombre o email" /></label>
          <label className="text-sm font-medium text-ink-soft">Viajero<select aria-label="Viajero existente" className="app-input mt-1.5" value={selectedTravelerId} onChange={(event) => setSelectedTravelerId(event.target.value)} required><option value="">Elegí un viajero existente</option>{availableTravelers.filter((traveler) => `${traveler.name} ${traveler.email}`.toLocaleLowerCase("es").includes(travelerSearch.toLocaleLowerCase("es"))).map((traveler) => <option key={traveler.id} value={traveler.id}>{traveler.name} · {traveler.email}</option>)}</select></label>
          <label className="text-sm font-medium text-ink-soft">Empresa<select aria-label="Empresa del viajero" className="app-input mt-1.5" value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} required><option value="">Elegí una empresa</option>{data.companies?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <button disabled={busy || !selectedTravelerId || !selectedCompanyId} type="submit" className="app-primary-button min-h-11">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Asignar al viaje</button>
        </form> : null}
        {data.canInviteTravelers && !availableTravelers.length ? <p className="mt-3 text-sm text-ink-mute">No hay otros viajeros con cuenta para asignar.</p> : null}
        {data.canInviteTravelers && !data.companies?.length ? <p className="mt-3 text-sm text-ink-mute">Primero asigná una empresa al viaje.</p> : null}
        {travelerError ? <p role="alert" className="mt-3 text-sm text-nihao">{travelerError}</p> : null}
        <p className="mt-3 text-sm text-ink-mute">¿Todavía no tiene cuenta? <Link href="/app/viajeros" className="font-semibold text-nihao underline">Invitar viajero nuevo</Link></p>
      </section>
    </main>
  );
}
