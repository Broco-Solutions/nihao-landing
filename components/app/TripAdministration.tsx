"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, LoaderCircle, Search, Unlink, UserPlus, Users, X } from "lucide-react";
import type { TripAdminDashboardRecord, TripAdministrationRecord } from "@/lib/bot/types";
import { appApi } from "./api";

type AdministrationView = TripAdministrationRecord & { canInviteTravelers: boolean };
type ExistingTraveler = { id: string; name: string; email: string; whatsappPhone: string | null; tripRole: "ADMIN" | "TRAVELER" | null; companyIds: string[] };

function assignmentStatus(traveler: ExistingTraveler, selectedCompanyId: string): string {
  if (selectedCompanyId && traveler.companyIds.includes(selectedCompanyId)) return "Ya está en esta empresa";
  if (traveler.companyIds.length) return "Asignado a otra empresa del viaje";
  if (traveler.tripRole === "TRAVELER") return "En el viaje · sin empresa";
  return "Disponible para asignar";
}

function TravelerCombobox({ travelers, selectedCompanyId, value, loading, error, onChange }: { travelers: ExistingTraveler[]; selectedCompanyId: string; value: string; loading: boolean; error: string | null; onChange(value: string): void }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = travelers.find((traveler) => traveler.id === value) ?? null;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return travelers.filter((traveler) => !normalized || `${traveler.name} ${traveler.email}`.toLocaleLowerCase("es").includes(normalized)).slice(0, 50);
  }, [query, travelers]);

  function choose(traveler: ExistingTraveler): void {
    if (selectedCompanyId && traveler.companyIds.includes(selectedCompanyId)) return;
    onChange(traveler.id); setQuery(""); setOpen(false); setActiveIndex(0);
  }

  return <div className="relative">
    <label htmlFor={`${listId}-input`} className="text-sm font-medium text-ink-soft">Buscar viajero</label>
    <div className="relative mt-1.5">
      <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-faint" />
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && filtered[activeIndex] ? `${listId}-${filtered[activeIndex].id}` : undefined}
        className="app-input pr-20 pl-10"
        value={selected && !open ? `${selected.name} · ${selected.email}` : query}
        placeholder="Nombre o email"
        autoComplete="off"
        onFocus={() => { setOpen(true); if (selected) setQuery(""); }}
        onChange={(event) => { if (value) onChange(""); setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0))); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)); }
          if (event.key === "Enter" && open && filtered[activeIndex]) { event.preventDefault(); choose(filtered[activeIndex]); }
          if (event.key === "Escape") { setOpen(false); setQuery(""); }
        }}
      />
      {value ? <button type="button" aria-label="Limpiar viajero seleccionado" className="absolute right-11 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-paper-soft" onClick={() => { onChange(""); setQuery(""); setOpen(true); }}><X className="h-4 w-4" /></button> : null}
      <button type="button" aria-label={open ? "Cerrar búsqueda" : "Abrir búsqueda"} className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-paper-soft" onClick={() => setOpen((current) => !current)}><ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} /></button>
    </div>
    {open ? <div id={listId} role="listbox" className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-elevated">
      {loading ? <p className="flex items-center gap-2 p-3 text-sm text-ink-mute"><LoaderCircle className="h-4 w-4 animate-spin" />Cargando viajeros…</p> : null}
      {error ? <p role="alert" className="p-3 text-sm text-nihao">{error}</p> : null}
      {!loading && !error && !filtered.length ? <p className="p-3 text-sm text-ink-mute">No encontramos viajeros con ese nombre o email.</p> : null}
      {!loading && !error ? filtered.map((traveler, index) => {
        const unavailable = Boolean(selectedCompanyId && traveler.companyIds.includes(selectedCompanyId));
        return <button key={traveler.id} id={`${listId}-${traveler.id}`} role="option" aria-selected={value === traveler.id} disabled={unavailable} type="button" className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${index === activeIndex ? "bg-nihao-soft" : "hover:bg-paper-soft"} disabled:cursor-not-allowed disabled:opacity-55`} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(traveler)}>
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{traveler.name}</strong><span className="block truncate text-xs text-ink-mute">{traveler.email}</span><span className={`mt-1 block text-[11px] ${unavailable ? "text-nihao" : "text-ink-mute"}`}>{assignmentStatus(traveler, selectedCompanyId)}</span></span>
          {value === traveler.id ? <Check className="h-4 w-4 shrink-0 text-nihao" /> : null}
        </button>;
      }) : null}
    </div> : null}
  </div>;
}

export function TripAdministration({ tripId }: { tripId: string }) {
  const [data, setData] = useState<AdministrationView | null>(null);
  const [dashboard, setDashboard] = useState<TripAdminDashboardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTravelers, setAvailableTravelers] = useState<ExistingTraveler[]>([]);
  const [travelersLoading, setTravelersLoading] = useState(false);
  const [selectedTravelerId, setSelectedTravelerId] = useState("");
  const [travelerError, setTravelerError] = useState<string | null>(null);
  const [catalogCompanies, setCatalogCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCompanyId, setCatalogCompanyId] = useState("");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const assignmentRef = useRef<HTMLElement>(null);
  const assignedCatalogIds = data?.companies?.map((company) => company.catalogCompanyId).toSorted().join(",") ?? "";

  const load = useCallback(async () => {
    try {
      setError(null);
      const [administration, summary] = await Promise.all([
        appApi<AdministrationView>(`/api/bot/trips/${tripId}/admin`),
        appApi<{ dashboard: TripAdminDashboardRecord }>(`/api/bot/trips/${tripId}/admin/dashboard`),
      ]);
      setData(administration); setDashboard(summary.dashboard);
      setSelectedCompanyId((current) => administration.companies?.some((company) => company.id === current) ? current : administration.companies?.[0]?.id ?? "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos cargar la administración del viaje"); }
    finally { setLoading(false); }
  }, [tripId]);

  const loadTravelers = useCallback(async () => {
    setTravelersLoading(true);
    try { const result = await appApi<{ travelers: ExistingTraveler[] }>(`/api/bot/trips/${encodeURIComponent(tripId)}/admin/travelers`); setAvailableTravelers(result.travelers); setTravelerError(null); }
    catch (caught) { setTravelerError(caught instanceof Error ? caught.message : "No pudimos cargar los viajeros existentes"); }
    finally { setTravelersLoading(false); }
  }, [tripId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => { void appApi<{ companies: Array<{ id: string; name: string }> }>(`/api/bot/companies?search=${encodeURIComponent(catalogSearch)}&excludeTripId=${encodeURIComponent(tripId)}`).then((result) => { if (active) { setCatalogCompanies(result.companies); setCatalogError(null); } }).catch((caught) => { if (active) { setCatalogCompanies([]); setCatalogError(caught instanceof Error ? caught.message : "No pudimos cargar el catálogo"); } }); }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [catalogSearch, tripId, assignedCatalogIds]);
  useEffect(() => { if (data?.canInviteTravelers) queueMicrotask(() => void loadTravelers()); }, [data?.canInviteTravelers, loadTravelers]);

  async function assignTraveler(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      if (!selectedTravelerId || !selectedCompanyId) throw new Error("Elegí un viajero y una empresa");
      const selectedCompany = data?.companies?.find((company) => company.id === selectedCompanyId);
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/admin/travelers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: selectedTravelerId, companyId: selectedCompanyId }) });
      setSelectedTravelerId(""); await Promise.all([load(), loadTravelers()]); setMessage(`Viajero asignado a ${selectedCompany?.name ?? "la empresa"}.`);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos asignar al viajero"); }
    finally { setBusy(false); }
  }
  async function unassignTraveler(company: NonNullable<AdministrationView["companies"]>[number], travelerId: string) {
    const traveler = data?.members.find((member) => member.userId === travelerId); const activity = company.activityByUser[travelerId] ?? { captureCount: 0, supplierCount: 0 };
    const history = activity.captureCount || activity.supplierCount ? ` Se conservarán ${activity.captureCount} capturas y ${activity.supplierCount} proveedores históricos.` : "";
    if (!window.confirm(`¿Quitar a ${traveler?.name ?? "este viajero"} de ${company.name}? Seguirá perteneciendo al viaje.${history}`)) return;
    setBusy(true); setMessage(null);
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/companies/${encodeURIComponent(company.id)}/members/${encodeURIComponent(travelerId)}`, { method: "DELETE" });
      await Promise.all([load(), loadTravelers()]); setMessage(`${traveler?.name ?? "El viajero"} quedó sin acceso a ${company.name}. Su membresía del viaje y su historial se conservaron.`);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos quitar al viajero de la empresa"); }
    finally { setBusy(false); }
  }
  async function assignCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { if (!catalogCompanyId) throw new Error("Elegí una empresa del catálogo"); const result = await appApi<{ company: { id: string } }>(`/api/bot/trips/${tripId}/companies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalogCompanyId }) }); setSelectedCompanyId(result.company.id); setCatalogCompanyId(""); await load(); setMessage("Empresa asignada al viaje."); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos asignar la empresa"); } finally { setBusy(false); }
  }
  async function unassignCompany(company: { id: string; name: string }) {
    if (!window.confirm(`¿Quitar a ${company.name} de este viaje? Su información histórica se conservará.`)) return;
    setBusy(true); setMessage(null);
    try { await appApi(`/api/bot/trips/${tripId}/companies/${company.id}`, { method: "DELETE" }); if (selectedCompanyId === company.id) setSelectedCompanyId(""); await load(); setMessage("Empresa quitada del viaje. Sigue disponible en el catálogo."); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos quitar la empresa"); } finally { setBusy(false); }
  }

  if (loading) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-nihao" /></div>;
  if (error || !data) return <p role="alert" className="rounded-xl bg-nihao-soft p-4 text-sm text-nihao">{error ?? "Esta administración no está disponible."}</p>;
  const travelers = data.members.filter((member) => member.role === "TRAVELER");
  const assignedIds = new Set(data.companies?.flatMap((company) => company.userIds) ?? []);
  const unassigned = travelers.filter((member) => !assignedIds.has(member.userId));
  const progress = new Map(dashboard?.progress.map((item) => [item.userId, item]) ?? []);

  return <div>
    {message ? <p role="status" className="rounded-xl bg-nihao-soft px-4 py-3 text-sm text-nihao">{message}</p> : null}
    <section aria-labelledby="management-summary" className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-eyebrow-mark">Gestión del viaje</p><h2 id="management-summary" className="mt-3 text-2xl">Participantes y empresas</h2><p className="mt-2 max-w-2xl text-sm text-ink-mute">Revisá quién participa, sus empresas y lo que todavía falta asignar.</p></div><Link href="/app/viajeros" className="app-primary-button shrink-0"><UserPlus className="h-4 w-4" />Invitar viajero</Link></div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><SummaryMetric value={travelers.length} label="Viajeros" /><SummaryMetric value={assignedIds.size} label="Con empresa" /><SummaryMetric value={unassigned.length} label="Sin empresa" alert={Boolean(unassigned.length)} /><SummaryMetric value={data.companies?.length ?? 0} label="Empresas" /></div>
    </section>

    <section aria-labelledby="participants-heading" className="mt-7">
      <div className="flex items-center gap-2"><Users className="h-5 w-5 text-nihao" /><h2 id="participants-heading" className="text-xl">Participantes</h2></div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">{travelers.map((member) => {
        const memberCompanies = data.companies?.filter((company) => company.userIds.includes(member.userId)) ?? []; const memberProgress = progress.get(member.userId);
        return <article key={member.userId} className={`rounded-2xl border bg-white p-4 shadow-soft ${memberCompanies.length ? "border-line" : "border-gold bg-gold-soft/30"}`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold">{member.name}</h3><p className="break-all text-sm text-ink-mute">{member.email}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${memberCompanies.length ? "bg-nihao-soft text-nihao" : "bg-gold-soft text-gold-deep"}`}>{memberCompanies.length ? `${memberCompanies.length} empresa${memberCompanies.length === 1 ? "" : "s"}` : "Sin empresa"}</span></div>
          <div className="mt-3 flex flex-wrap gap-2">{memberCompanies.map((company) => <span key={company.id} className="rounded-full border border-line bg-paper-soft px-2.5 py-1 text-xs">{company.name}</span>)}{!memberCompanies.length ? <button type="button" className="text-sm font-semibold text-nihao underline" onClick={() => { setSelectedTravelerId(member.userId); assignmentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Asignar empresa</button> : null}</div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-xs text-ink-mute">Capturas</dt><dd className="font-semibold">{member.captureCount}</dd></div><div><dt className="text-xs text-ink-mute">Proveedores</dt><dd className="font-semibold">{member.supplierCount}</dd></div><div><dt className="text-xs text-ink-mute">Pendientes</dt><dd className="font-semibold">{memberProgress?.pendingCount ?? 0}</dd></div></dl>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-ink-mute">Pasaporte: {member.passportNumber || "Sin cargar"}</p><Link href={`/app/viajeros/${encodeURIComponent(member.userId)}/viajes/${encodeURIComponent(tripId)}/agenda`} className="text-sm font-semibold text-nihao">Ver agenda →</Link></div>
        </article>;
      })}{!travelers.length ? <p className="rounded-2xl bg-paper-soft p-5 text-sm text-ink-mute">Todavía no hay viajeros inscriptos.</p> : null}</div>
    </section>

    <section aria-labelledby="companies-heading" className="mt-8">
      <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-nihao" /><h2 id="companies-heading" className="text-xl">Empresas participantes</h2></div>
      <div className="mt-3 grid gap-3">{data.companies?.map((company) => {
        const companyTravelers = travelers.filter((member) => company.userIds.includes(member.userId));
        return <article key={company.id} className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{company.name}</h3><p className="mt-1 text-sm text-ink-mute">{companyTravelers.length ? `${companyTravelers.length} viajero${companyTravelers.length === 1 ? "" : "s"} asignado${companyTravelers.length === 1 ? "" : "s"}` : "Sin viajeros asignados"}</p></div><button type="button" className="min-h-11 rounded-xl px-3 text-xs font-semibold text-nihao underline decoration-nihao/30" disabled={busy} onClick={() => void unassignCompany(company)}>Quitar empresa del viaje</button></div>
          <div className="mt-4 grid gap-2">{companyTravelers.map((traveler) => <div key={traveler.userId} className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-paper-soft px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{traveler.name}</p><p className="truncate text-xs text-ink-mute">{traveler.email}</p></div><button type="button" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-nihao hover:bg-nihao-soft" disabled={busy} onClick={() => void unassignTraveler(company, traveler.userId)}><Unlink className="h-3.5 w-3.5" />Quitar de esta empresa</button></div>)}{!companyTravelers.length ? <p className="rounded-xl bg-paper-soft p-3 text-sm text-ink-mute">Asigná un viajero desde el bloque siguiente.</p> : null}</div>
        </article>;
      })}{!data.companies?.length ? <p className="rounded-2xl bg-paper-soft p-5 text-sm text-ink-mute">Todavía no hay empresas asignadas a este viaje.</p> : null}</div>
    </section>

    <section ref={assignmentRef} aria-labelledby="assignment-heading" className="mt-8 rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
      <h2 id="assignment-heading" className="text-xl">Invitaciones y asignaciones</h2><p className="mt-2 text-sm text-ink-mute">Vinculá una cuenta existente con una empresa del viaje o invitá a una persona nueva.</p>
      {data.canInviteTravelers ? <form onSubmit={(event) => void assignTraveler(event)} className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-end">
        <TravelerCombobox travelers={availableTravelers} selectedCompanyId={selectedCompanyId} value={selectedTravelerId} loading={travelersLoading} error={travelerError} onChange={setSelectedTravelerId} />
        <label className="text-sm font-medium text-ink-soft">Empresa<select aria-label="Empresa del viajero" className="app-input mt-1.5" value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} required><option value="">Elegí una empresa</option>{data.companies?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <button disabled={busy || !selectedTravelerId || !selectedCompanyId} type="submit" className="app-primary-button min-h-12 px-5">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Asignar</button>
      </form> : null}
      {data.canInviteTravelers && !data.companies?.length ? <p className="mt-3 rounded-xl bg-gold-soft p-3 text-sm text-gold-deep">Primero asigná una empresa al viaje.</p> : null}
      <div className="mt-5 border-t border-line pt-5"><p className="text-sm font-medium">Agregar una empresa del catálogo</p><form onSubmit={assignCompany} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="text-sm text-ink-mute">Buscar<input className="app-input mt-1.5" value={catalogSearch} onChange={(event) => { setCatalogSearch(event.target.value); setCatalogCompanyId(""); }} placeholder="Nombre de empresa" /></label><label className="text-sm text-ink-mute">Resultado<select className="app-input mt-1.5" aria-label="Empresa del catálogo" value={catalogCompanyId} onChange={(event) => setCatalogCompanyId(event.target.value)} required><option value="">Elegí una empresa</option>{catalogCompanies.filter((company) => !data.companies?.some((assigned) => assigned.catalogCompanyId === company.id)).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><button className="app-secondary-button min-h-12" disabled={busy || !catalogCompanyId} type="submit">Asignar al viaje</button>{catalogError ? <p role="alert" className="text-sm text-nihao sm:col-span-3">{catalogError}</p> : null}</form></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper-soft p-4"><p className="text-sm text-ink-mute">{data.invitations.filter((invitation) => invitation.status === "PENDING").length} invitaciones pendientes · {data.invitations.filter((invitation) => invitation.status === "ACCEPTED").length} aceptadas</p><Link href="/app/viajeros" className="app-secondary-button">Administrar invitaciones</Link></div>
    </section>

    <section aria-labelledby="tracking-heading" className="mt-8 rounded-2xl bg-nihao-soft p-5 sm:flex sm:items-center sm:justify-between"><div><h2 id="tracking-heading" className="text-lg">Seguimiento comercial</h2><p className="mt-1 text-sm text-ink-mute">{data.metrics.captureCount} capturas · {data.metrics.supplierCount} proveedores registrados.</p></div><Link href={`/app/viajes/${tripId}/admin/proveedores`} className="app-secondary-button mt-4 sm:mt-0">Ver proveedores</Link></section>
  </div>;
}

function SummaryMetric({ value, label, alert = false }: { value: number; label: string; alert?: boolean }) {
  return <div className={`rounded-2xl p-4 ${alert ? "bg-gold-soft" : "bg-paper-soft"}`}><p className={`text-2xl font-semibold ${alert ? "text-gold-deep" : "text-ink"}`}>{value}</p><p className="mt-1 text-xs text-ink-mute">{label}</p></div>;
}
