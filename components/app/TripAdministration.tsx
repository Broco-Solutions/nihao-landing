"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, LoaderCircle, Unlink, UserPlus, Users } from "lucide-react";
import type { TripAdminDashboardRecord, TripAdministrationRecord } from "@/lib/bot/types";
import { appApi } from "./api";
import { AppSelect } from "./AppSelect";
import { AppNotice, type AppNoticeTone } from "./AppNotice";

type AdministrationView = TripAdministrationRecord & { canInviteTravelers: boolean };
type ExistingTraveler = { id: string; name: string; email: string; whatsappPhone: string | null; tripRole: "ADMIN" | "TRAVELER" | null; companyIds: string[] };

function assignmentStatus(traveler: ExistingTraveler, selectedCompanyId: string): string {
  if (selectedCompanyId && traveler.companyIds.includes(selectedCompanyId)) return "Ya está en esta empresa";
  if (traveler.companyIds.length) return "Asignado a otra empresa del viaje";
  if (traveler.tripRole === "TRAVELER") return "En el viaje · sin empresa";
  return "Disponible para asignar";
}

export function TripAdministration({ tripId, onViewSuppliers }: { tripId: string; onViewSuppliers?: () => void }) {
  const [data, setData] = useState<AdministrationView | null>(null);
  const [dashboard, setDashboard] = useState<TripAdminDashboardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTravelers, setAvailableTravelers] = useState<ExistingTraveler[]>([]);
  const [travelersLoading, setTravelersLoading] = useState(false);
  const [selectedTravelerId, setSelectedTravelerId] = useState("");
  const [travelerError, setTravelerError] = useState<string | null>(null);
  const [catalogCompanies, setCatalogCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [catalogCompanyId, setCatalogCompanyId] = useState("");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: AppNoticeTone; message: string } | null>(null);
  const [participantSearch, setParticipantSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
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
    const timer = window.setTimeout(() => { void appApi<{ companies: Array<{ id: string; name: string }> }>(`/api/bot/companies?excludeTripId=${encodeURIComponent(tripId)}`).then((result) => { if (active) { setCatalogCompanies(result.companies); setCatalogError(null); } }).catch((caught) => { if (active) { setCatalogCompanies([]); setCatalogError(caught instanceof Error ? caught.message : "No pudimos cargar el catálogo"); } }); }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [tripId, assignedCatalogIds]);
  useEffect(() => { if (data?.canInviteTravelers) queueMicrotask(() => void loadTravelers()); }, [data?.canInviteTravelers, loadTravelers]);

  async function assignTraveler(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      if (!selectedTravelerId || !selectedCompanyId) throw new Error("Elegí un viajero y una empresa");
      const selectedCompany = data?.companies?.find((company) => company.id === selectedCompanyId);
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/admin/travelers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: selectedTravelerId, companyId: selectedCompanyId }) });
      setSelectedTravelerId(""); await Promise.all([load(), loadTravelers()]); setNotice({ tone: "success", message: `Viajero asignado a ${selectedCompany?.name ?? "la empresa"}.` });
    } catch (caught) { setNotice({ tone: "error", message: caught instanceof Error ? caught.message : "No pudimos asignar al viajero" }); }
    finally { setBusy(false); }
  }
  async function unassignTraveler(company: NonNullable<AdministrationView["companies"]>[number], travelerId: string) {
    const traveler = data?.members.find((member) => member.userId === travelerId); const activity = company.activityByUser[travelerId] ?? { captureCount: 0, supplierCount: 0 };
    const history = activity.captureCount || activity.supplierCount ? ` Se conservarán ${activity.captureCount} capturas y ${activity.supplierCount} proveedores históricos.` : "";
    if (!window.confirm(`¿Quitar a ${traveler?.name ?? "este viajero"} de ${company.name}? Seguirá perteneciendo al viaje.${history}`)) return;
    setBusy(true); setNotice(null);
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/companies/${encodeURIComponent(company.id)}/members/${encodeURIComponent(travelerId)}`, { method: "DELETE" });
      await Promise.all([load(), loadTravelers()]); setNotice({ tone: "success", message: `${traveler?.name ?? "El viajero"} quedó sin acceso a ${company.name}. Su membresía del viaje y su historial se conservaron.` });
    } catch (caught) { setNotice({ tone: "error", message: caught instanceof Error ? caught.message : "No pudimos quitar al viajero de la empresa" }); }
    finally { setBusy(false); }
  }
  async function assignCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try { if (!catalogCompanyId) throw new Error("Elegí una empresa del catálogo"); const result = await appApi<{ company: { id: string } }>(`/api/bot/trips/${tripId}/companies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalogCompanyId }) }); setSelectedCompanyId(result.company.id); setCatalogCompanyId(""); await load(); setNotice({ tone: "success", message: "Empresa asignada al viaje." }); }
    catch (caught) { setNotice({ tone: "error", message: caught instanceof Error ? caught.message : "No pudimos asignar la empresa" }); } finally { setBusy(false); }
  }
  async function unassignCompany(company: { id: string; name: string }) {
    const pendingInvitations = data?.invitations.filter((invitation) => invitation.companyId === company.id && invitation.status === "PENDING").length ?? 0;
    const invitationWarning = pendingInvitations ? ` También se revocarán ${pendingInvitations} invitación${pendingInvitations === 1 ? "" : "es"} pendiente${pendingInvitations === 1 ? "" : "s"}; sus enlaces dejarán de funcionar.` : "";
    if (!window.confirm(`¿Quitar a ${company.name} de este viaje? Su información histórica se conservará.${invitationWarning}`)) return;
    setBusy(true); setNotice(null);
    try { await appApi(`/api/bot/trips/${tripId}/companies/${company.id}${pendingInvitations ? "?revokePending=1" : ""}`, { method: "DELETE" }); if (selectedCompanyId === company.id) setSelectedCompanyId(""); await load(); setNotice({ tone: "success", message: pendingInvitations ? "Empresa quitada e invitaciones pendientes revocadas. El historial se conservó." : "Empresa quitada del viaje. Sigue disponible en el catálogo." }); }
    catch (caught) { setNotice({ tone: "error", message: caught instanceof Error ? caught.message : "No pudimos quitar la empresa" }); } finally { setBusy(false); }
  }
  async function revokeInvitation(invitationId: string, label: string) {
    if (!window.confirm(`¿Revocar la invitación pendiente de ${label}? El enlace dejará de funcionar.`)) return;
    setBusy(true); setNotice(null);
    try { await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/invitations/${encodeURIComponent(invitationId)}`, { method: "DELETE" }); await load(); setNotice({ tone: "success", message: "Invitación revocada. No se eliminó ninguna cuenta ni asignación aceptada." }); }
    catch (caught) { setNotice({ tone: "error", message: caught instanceof Error ? caught.message : "No pudimos revocar la invitación" }); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-nihao" /></div>;
  if (error || !data) return <AppNotice tone="error">{error ?? "Esta administración no está disponible."}</AppNotice>;
  const travelers = data.members.filter((member) => member.role === "TRAVELER");
  const assignedIds = new Set(data.companies?.flatMap((company) => company.userIds) ?? []);
  const unassigned = travelers.filter((member) => !assignedIds.has(member.userId));
  const progress = new Map(dashboard?.progress.map((item) => [item.userId, item]) ?? []);
  const normalizedParticipantSearch = participantSearch.trim().toLocaleLowerCase("es");
  const visibleTravelers = travelers.filter((member) => !normalizedParticipantSearch || `${member.name} ${member.email}`.toLocaleLowerCase("es").includes(normalizedParticipantSearch));
  const normalizedCompanySearch = companySearch.trim().toLocaleLowerCase("es");
  const visibleCompanies = data.companies?.filter((company) => !normalizedCompanySearch || company.name.toLocaleLowerCase("es").includes(normalizedCompanySearch)) ?? [];
  const displayedTravelers = normalizedParticipantSearch || showAllParticipants ? visibleTravelers : visibleTravelers.slice(0, 8);
  const displayedCompanies = normalizedCompanySearch || showAllCompanies ? visibleCompanies : visibleCompanies.slice(0, 6);

  return <div>
    {notice ? <AppNotice tone={notice.tone} className="mb-4">{notice.message}</AppNotice> : null}
    <section aria-labelledby="management-summary" className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-eyebrow-mark">Gestión del viaje</p><h2 id="management-summary" className="mt-3 text-2xl">Participantes y empresas</h2><p className="mt-2 max-w-2xl text-sm text-ink-mute">Revisá quién participa, sus empresas y lo que todavía falta asignar.</p></div><div className="flex flex-wrap gap-2"><Link href="/app/viajeros" className="app-primary-button shrink-0"><UserPlus className="h-4 w-4" />Invitar viajero</Link><a href="#assignment-heading" className="app-secondary-button">Asignar viajero</a><a href="#add-company" className="app-secondary-button">Agregar empresa</a></div></div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><SummaryMetric value={travelers.length} label="Viajeros" /><SummaryMetric value={assignedIds.size} label="Con empresa" /><SummaryMetric value={unassigned.length} label="Sin empresa" alert={Boolean(unassigned.length)} /><SummaryMetric value={data.companies?.length ?? 0} label="Empresas" /></div>
      <nav aria-label="Secciones de gestión" className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-nihao"><a href="#participants-heading">Participantes</a><span aria-hidden="true">·</span><a href="#companies-heading">Empresas</a><span aria-hidden="true">·</span><a href="#assignment-heading">Invitaciones y asignaciones</a><span aria-hidden="true">·</span><a href="#tracking-heading">Seguimiento</a></nav>
    </section>

    <section aria-labelledby="participants-heading" className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-nihao" /><h2 id="participants-heading" className="text-xl">Participantes</h2></div><input aria-label="Buscar participantes" className="app-input max-w-xs" value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} placeholder="Buscar nombre o email" /></div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">{displayedTravelers.map((member) => {
        const memberCompanies = data.companies?.filter((company) => company.userIds.includes(member.userId)) ?? []; const memberProgress = progress.get(member.userId);
        return <article key={member.userId} className={`rounded-2xl border bg-white p-4 shadow-soft ${memberCompanies.length ? "border-line" : "border-gold bg-gold-soft/30"}`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold">{member.name}</h3><p className="break-all text-sm text-ink-mute">{member.email}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${memberCompanies.length ? "bg-nihao-soft text-nihao" : "bg-gold-soft text-gold-deep"}`}>{memberCompanies.length ? `${memberCompanies.length} empresa${memberCompanies.length === 1 ? "" : "s"}` : "Sin empresa"}</span></div>
          <div className="mt-3 flex flex-wrap gap-2">{memberCompanies.map((company) => <span key={company.id} className="rounded-full border border-line bg-paper-soft px-2.5 py-1 text-xs">{company.name}</span>)}{!memberCompanies.length ? <button type="button" className="text-sm font-semibold text-nihao underline" onClick={() => { setSelectedTravelerId(member.userId); assignmentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Asignar empresa</button> : null}</div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-xs text-ink-mute">Capturas</dt><dd className="font-semibold">{member.captureCount}</dd></div><div><dt className="text-xs text-ink-mute">Proveedores</dt><dd className="font-semibold">{member.supplierCount}</dd></div><div><dt className="text-xs text-ink-mute">Pendientes</dt><dd className="font-semibold">{memberProgress?.pendingCount ?? 0}</dd></div></dl>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-ink-mute">Pasaporte: {member.passportNumber || "Sin cargar"}</p><Link href={`/app/viajeros/${encodeURIComponent(member.userId)}/viajes/${encodeURIComponent(tripId)}/agenda`} className="text-sm font-semibold text-nihao">Ver agenda →</Link></div>
        </article>;
      })}{!visibleTravelers.length ? <p className="rounded-2xl bg-paper-soft p-5 text-sm text-ink-mute">{travelers.length ? "No encontramos participantes con esa búsqueda." : "Todavía no hay viajeros inscriptos."}</p> : null}</div>
      {!normalizedParticipantSearch && visibleTravelers.length > 8 ? <button type="button" className="app-secondary-button mt-3" onClick={() => setShowAllParticipants((current) => !current)}>{showAllParticipants ? "Mostrar menos participantes" : `Mostrar los ${visibleTravelers.length} participantes`}</button> : null}
    </section>

    <section aria-labelledby="companies-heading" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-nihao" /><h2 id="companies-heading" className="text-xl">Empresas participantes</h2></div><input aria-label="Buscar empresas participantes" className="app-input max-w-xs" value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} placeholder="Buscar empresa" /></div>
      <div className="mt-3 grid gap-3">{displayedCompanies.map((company) => {
        const companyTravelers = travelers.filter((member) => company.userIds.includes(member.userId));
        return <details key={company.id} className="group rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{company.name}</h3><p className="mt-1 text-sm text-ink-mute">{companyTravelers.length ? `${companyTravelers.length} viajero${companyTravelers.length === 1 ? "" : "s"} asignado${companyTravelers.length === 1 ? "" : "s"}` : "Sin viajeros asignados"}</p></div><span className="text-sm font-semibold text-nihao group-open:hidden">Administrar</span><span className="hidden text-sm font-semibold text-nihao group-open:inline">Cerrar</span></summary><div className="mt-4 border-t border-line pt-4"><div className="flex justify-end"><button type="button" className="min-h-11 rounded-xl px-3 text-xs font-semibold text-nihao underline decoration-nihao/30" disabled={busy} onClick={() => void unassignCompany(company)}>Quitar empresa del viaje</button></div>
          <div className="mt-4 grid gap-2">{companyTravelers.map((traveler) => <div key={traveler.userId} className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-paper-soft px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{traveler.name}</p><p className="truncate text-xs text-ink-mute">{traveler.email}</p></div><button type="button" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-nihao hover:bg-nihao-soft" disabled={busy} onClick={() => void unassignTraveler(company, traveler.userId)}><Unlink className="h-3.5 w-3.5" />Quitar de esta empresa</button></div>)}{!companyTravelers.length ? <p className="rounded-xl bg-paper-soft p-3 text-sm text-ink-mute">Asigná un viajero desde el bloque siguiente.</p> : null}</div>
        </div></details>;
      })}{!visibleCompanies.length ? <p className="rounded-2xl bg-paper-soft p-5 text-sm text-ink-mute">{data.companies?.length ? "No encontramos empresas con esa búsqueda." : "Todavía no hay empresas asignadas a este viaje."}</p> : null}</div>
      {!normalizedCompanySearch && visibleCompanies.length > 6 ? <button type="button" className="app-secondary-button mt-3" onClick={() => setShowAllCompanies((current) => !current)}>{showAllCompanies ? "Mostrar menos empresas" : `Mostrar las ${visibleCompanies.length} empresas`}</button> : null}
    </section>

    <section ref={assignmentRef} aria-labelledby="assignment-heading" className="mt-8 rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
      <h2 id="assignment-heading" className="text-xl">Invitaciones y asignaciones</h2><p className="mt-2 text-sm text-ink-mute">Vinculá una cuenta existente con una empresa del viaje o invitá a una persona nueva.</p>
      {data.canInviteTravelers ? <form onSubmit={(event) => void assignTraveler(event)} className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-end">
        <AppSelect label="Buscar viajero" ariaLabel="Buscar viajero" value={selectedTravelerId} onValueChange={setSelectedTravelerId} searchable clearable loading={travelersLoading} error={travelerError} searchPlaceholder="Nombre o email" emptyMessage="No encontramos viajeros con ese nombre o email." options={availableTravelers.map((traveler) => ({ value: traveler.id, label: traveler.name, description: `${traveler.email} · ${assignmentStatus(traveler, selectedCompanyId)}`, disabled: Boolean(selectedCompanyId && traveler.companyIds.includes(selectedCompanyId)) }))} />
        <AppSelect label="Empresa" ariaLabel="Empresa del viajero" value={selectedCompanyId} onValueChange={setSelectedCompanyId} placeholder="Elegí una empresa" options={(data.companies ?? []).map((company) => ({ value: company.id, label: company.name }))} />
        <button disabled={busy || !selectedTravelerId || !selectedCompanyId} type="submit" className="app-primary-button min-h-12 px-5">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Asignar</button>
      </form> : null}
      {data.canInviteTravelers && !data.companies?.length ? <AppNotice tone="warning" className="mt-3">Primero asigná una empresa al viaje.</AppNotice> : null}
      <div id="add-company" className="mt-5 scroll-mt-24 border-t border-line pt-5"><p className="text-sm font-medium">Agregar una empresa del catálogo</p><form onSubmit={assignCompany} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><AppSelect label="Empresa" ariaLabel="Empresa del catálogo" value={catalogCompanyId} onValueChange={setCatalogCompanyId} searchable clearable error={catalogError} searchPlaceholder="Buscar empresa" placeholder="Elegí una empresa" options={catalogCompanies.filter((company) => !data.companies?.some((assigned) => assigned.catalogCompanyId === company.id)).map((company) => ({ value: company.id, label: company.name }))} /><button className="app-secondary-button min-h-12" disabled={busy || !catalogCompanyId} type="submit">Asignar al viaje</button></form></div>
      <div className="mt-5 rounded-xl bg-paper-soft p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink-mute">{data.invitations.filter((invitation) => invitation.status === "PENDING").length} invitaciones pendientes · {data.invitations.filter((invitation) => invitation.status === "ACCEPTED").length} aceptadas</p><Link href="/app/viajeros" className="app-secondary-button">Invitar viajero</Link></div>{data.invitations.some((invitation) => invitation.status === "PENDING") ? <div className="mt-3 grid gap-2">{data.invitations.filter((invitation) => invitation.status === "PENDING").map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{invitation.name || invitation.email}</p><p className="truncate text-xs text-ink-mute">{invitation.email}</p></div><button type="button" disabled={busy} className="min-h-11 rounded-xl px-3 text-xs font-semibold text-nihao hover:bg-nihao-soft" onClick={() => void revokeInvitation(invitation.id, invitation.name || invitation.email)}>Revocar</button></div>)}</div> : null}</div>
    </section>

    <section aria-labelledby="tracking-heading" className="mt-8 rounded-2xl bg-nihao-soft p-5 sm:flex sm:items-center sm:justify-between"><div><h2 id="tracking-heading" className="text-lg">Seguimiento comercial</h2><p className="mt-1 text-sm text-ink-mute">{data.metrics.captureCount} capturas totales · {data.metrics.supplierCount} proveedores confirmados.</p></div>{onViewSuppliers ? <button type="button" onClick={onViewSuppliers} className="app-secondary-button mt-4 sm:mt-0">Ver proveedores y pendientes</button> : <Link href={`/app/viajes/${tripId}?section=proveedores`} className="app-secondary-button mt-4 sm:mt-0">Ver proveedores y pendientes</Link>}</section>
  </div>;
}

function SummaryMetric({ value, label, alert = false }: { value: number; label: string; alert?: boolean }) {
  return <div className={`rounded-2xl p-4 ${alert ? "bg-gold-soft" : "bg-paper-soft"}`}><p className={`text-2xl font-semibold ${alert ? "text-gold-deep" : "text-ink"}`}>{value}</p><p className="mt-1 text-xs text-ink-mute">{label}</p></div>;
}
