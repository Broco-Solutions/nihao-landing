"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Clipboard, ClipboardCheck, LoaderCircle, Send, Trash2, Users } from "lucide-react";
import type { TripAdminDashboardRecord, TripAdministrationRecord } from "@/lib/bot/types";
import { appApi } from "./api";
import { invitationDeliveryMessage, invitationResendMessage } from "./invitation-feedback";

export function TripAdministration({ tripId }: { tripId: string }) {
  const [data, setData] = useState<TripAdministrationRecord | null>(null);
  const [dashboard, setDashboard] = useState<TripAdminDashboardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [removeMessage, setRemoveMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [administration, summary] = await Promise.all([
        appApi<TripAdministrationRecord>(`/api/bot/trips/${tripId}/admin`),
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

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null); setLink(null);
    try {
      if (!selectedCompanyId) throw new Error("Elegí una empresa");
      const result = await appApi<{ invitation: TripAdministrationRecord["invitations"][number]; reused: boolean; link: string | null; emailDelivery: "SENT" | "FAILED" | null }>(`/api/bot/trips/${tripId}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, name, companyId: selectedCompanyId }) });
      setData((current) => current ? { ...current, invitations: [result.invitation, ...current.invitations.filter((item) => item.id !== result.invitation.id)] } : current);
      setEmail(""); setName(""); setLink(result.link); setMessage(invitationDeliveryMessage(result.emailDelivery, result.reused));
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos crear la invitación"); } finally { setBusy(false); }
  }

  async function resend(invitationId: string) {
    setBusy(true); setMessage(null);
    try {
      const result = await appApi<{ invitation: TripAdministrationRecord["invitations"][number]; link: string; emailDelivery: "SENT" | "FAILED" }>(`/api/bot/trips/${tripId}/invitations/${invitationId}/resend`, { method: "POST" });
      setData((current) => current ? { ...current, invitations: current.invitations.map((item) => item.id === invitationId ? result.invitation : item) } : current);
      setLink(result.link); setMessage(invitationResendMessage(result.emailDelivery));
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos regenerar el enlace"); } finally { setBusy(false); }
  }

  async function copyLink() { if (link) { await navigator.clipboard.writeText(link); setMessage("Enlace copiado."); } }

  async function createCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { const result = await appApi<{ company: { id: string; name: string } }>(`/api/bot/trips/${tripId}/companies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: companyName }) }); setCompanyName(""); setSelectedCompanyId(result.company.id); await load(); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos crear la empresa"); } finally { setBusy(false); }
  }

  async function renameCompany(company: { id: string; name: string }) {
    const name = window.prompt("Nombre de la empresa", company.name)?.trim(); if (!name || name === company.name) return;
    setBusy(true); try { await appApi(`/api/bot/trips/${tripId}/companies/${company.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }); await load(); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos cambiar el nombre"); } finally { setBusy(false); }
  }

  async function removeFromCompany(companyId: string, userId: string) {
    if (!window.confirm("¿Quitar a este viajero de la empresa?")) return;
    setBusy(true); try { await appApi(`/api/bot/trips/${tripId}/companies/${companyId}/members/${userId}`, { method: "DELETE" }); await load(); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos quitar al viajero"); } finally { setBusy(false); }
  }

  async function removeTraveler(member: TripAdministrationRecord["members"][number]) {
    if (!window.confirm(`¿Quitar a ${member.name || member.email} de este viaje? Perderá el acceso, pero sus capturas y proveedores permanecerán en el historial.`)) return;
    setRemovingUserId(member.userId); setRemoveMessage(null);
    try {
      await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/admin/travelers/${encodeURIComponent(member.userId)}`, { method: "DELETE" });
      setRemoveMessage(`${member.name || member.email} ya no tiene acceso a este viaje.`);
      await load();
    } catch (caught) {
      setRemoveMessage(caught instanceof Error ? caught.message : "No pudimos quitar al viajero");
    } finally { setRemovingUserId(null); }
  }

  if (loading) return <main className="app-page grid min-h-72 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-nihao" /></main>;
  if (error || !data) return <main className="app-page"><Link href={`/app/viajes/${tripId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Volver al viaje</Link><p role="alert" className="mt-6 rounded-xl bg-nihao-soft p-4 text-sm text-nihao">{error ?? "Esta administración no está disponible."}</p></main>;

  return (
    <main className="app-page">
      <Link href={`/app/viajes/${tripId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Volver al viaje</Link>
      <div className="mt-3"><p className="text-eyebrow-mark">Administración del viaje</p><h1 className="mt-3 text-3xl sm:text-4xl">{data.trip.name}</h1><p className="mt-2 text-sm text-ink-mute">Vista general de miembros y actividad.</p></div>

      {dashboard ? <>
        <section aria-labelledby="overview-heading" className="mt-7"><div className="flex items-center justify-between gap-3"><h2 id="overview-heading" className="text-xl">Estado del viaje</h2><Link href={`/app/viajes/${tripId}/admin/proveedores`} className="app-secondary-button text-xs">Ver proveedores</Link></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><Metric label="Viajeros activos" value={dashboard.metrics.activeTravelerCount} helper={`${dashboard.metrics.memberCount} miembros · ${dashboard.metrics.pendingInvitationCount} invitaciones pendientes`} /><Metric label="Proveedores confirmados" value={dashboard.metrics.confirmedSupplierCount} helper={`${dashboard.metrics.captureCount} capturas totales`} /><Metric label="Pendientes" value={dashboard.metrics.pendingCaptureCount} helper={`${dashboard.metrics.todayCaptureCount} capturas hoy (UTC)`} /></div></section>
        <section aria-labelledby="progress-heading" className="mt-8"><div className="flex items-center justify-between gap-3"><div><p className="text-eyebrow-mark">Equipo</p><h2 id="progress-heading" className="mt-2 text-xl">Progreso por viajero</h2></div><a href="#members-heading" className="app-secondary-button text-xs">Gestionar viajeros</a></div>{dashboard.progress.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{dashboard.progress.map((traveler) => <article key={traveler.userId} className="rounded-2xl border border-line bg-white p-4 shadow-soft"><h3 className="truncate font-semibold">{traveler.name}</h3><p className="truncate text-sm text-ink-mute">{traveler.email}</p><p className="mt-3 text-sm text-ink-soft">{traveler.confirmedCount} guardados · {traveler.pendingCount ? `${traveler.pendingCount} pendientes` : "Todo al día"}</p></article>)}</div> : <p className="mt-3 rounded-2xl bg-paper-soft p-4 text-sm text-ink-mute">Agregá viajeros para comenzar a registrar proveedores.</p>}</section>
        <section aria-labelledby="recent-heading" className="mt-8"><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-nihao" /><h2 id="recent-heading" className="text-xl">Actividad reciente</h2></div>{dashboard.recent.length ? <div className="mt-3 grid gap-3">{dashboard.recent.map((item) => <article key={item.captureId} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft"><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{item.companyName ?? "Proveedor pendiente"}</h3><p className="truncate text-sm text-ink-mute">{item.name} · {item.tripCompanyName ? `${item.tripCompanyName} · ` : ""}{item.status === "CONFIRMED" ? "Guardado" : item.needsReanalysis ? "Reanálisis requerido" : "Pendiente"}</p></div><ChevronRight className="h-5 w-5 text-ink-faint" /></article>)}</div> : <p className="mt-3 text-sm text-ink-mute">El equipo todavía no registró proveedores.</p>}</section>
      </> : null}

      <section aria-labelledby="activity-heading" className="mt-7">
        <h2 id="activity-heading" className="text-xl">Actividad</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Miembros" value={data.metrics.memberCount} />
          <Metric label="Viajeros" value={data.metrics.travelerCount} />
          <Metric label="Capturas" value={data.metrics.captureCount} />
          <Metric label="Proveedores" value={data.metrics.supplierCount} />
        </div>
      </section>

      <section aria-labelledby="members-heading" className="mt-8">
        <div className="flex items-center gap-2"><Users className="h-5 w-5 text-nihao" /><h2 id="members-heading" className="text-xl">Miembros</h2></div>
        {removeMessage ? <p role="status" className="mt-3 rounded-xl bg-nihao-soft px-4 py-3 text-sm text-nihao">{removeMessage}</p> : null}
        <div className="mt-3 grid gap-3">
          {data.members.map((member) => (
            <article key={member.userId} className="rounded-2xl border border-line bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold">{member.name}</h3><p className="truncate text-sm text-ink-mute">{member.email}</p></div><span className="shrink-0 rounded-full bg-nihao-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-nihao">{member.role === "ADMIN" ? "Admin" : "Viajero"}</span></div>
              <p className="mt-3 text-xs text-ink-mute">{member.captureCount} captura{member.captureCount === 1 ? "" : "s"} · {member.supplierCount} proveedor{member.supplierCount === 1 ? "" : "es"}</p>
              {member.role === "TRAVELER" ? <button type="button" disabled={Boolean(removingUserId) || busy} onClick={() => void removeTraveler(member)} className="app-secondary-button mt-3 text-xs"><Trash2 className="h-4 w-4" />{removingUserId === member.userId ? "Quitando…" : "Quitar del viaje"}</button> : null}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="companies-heading" className="mt-8">
        <h2 id="companies-heading" className="text-xl">Empresas del viaje</h2>
        <form onSubmit={createCompany} className="mt-3 flex gap-2"><input className="app-input flex-1" aria-label="Nombre de empresa" placeholder="Nombre de la empresa" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required /><button className="app-primary-button" disabled={busy} type="submit">Agregar empresa</button></form>
        <div className="mt-3 grid gap-3">{data.companies?.map((company) => <article key={company.id} className="rounded-2xl border border-line bg-white p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{company.name}</h3><button type="button" className="app-secondary-button text-xs" disabled={busy} onClick={() => void renameCompany(company)}>Renombrar</button></div><p className="mt-2 text-sm text-ink-mute">{company.userIds.length} viajeros</p><div className="mt-2 flex flex-wrap gap-2">{company.userIds.map((userId) => { const member = data.members.find((item) => item.userId === userId); return member ? <span key={userId} className="inline-flex items-center gap-2 rounded-full bg-paper-soft px-3 py-1 text-xs">{member.name || member.email}<button type="button" disabled={busy} aria-label={`Quitar a ${member.name || member.email} de ${company.name}`} onClick={() => void removeFromCompany(company.id, userId)}>×</button></span> : null; })}</div></article>)}</div>
      </section>

      <section aria-labelledby="travelers-heading" className="mt-8">
        <div className="flex items-center gap-2"><Send className="h-5 w-5 text-nihao" /><h2 id="travelers-heading" className="text-xl">Viajeros</h2></div>
        <form onSubmit={invite} className="mt-3 grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm font-medium text-ink-soft">Empresa<select className="app-input mt-1.5" value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} required><option value="">Elegí una empresa</option>{data.companies?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label className="text-sm font-medium text-ink-soft">Nombre<input value={name} onChange={(event) => setName(event.target.value)} className="app-input mt-1.5" placeholder="Nombre opcional" /></label>
          <label className="text-sm font-medium text-ink-soft">Email<input value={email} onChange={(event) => setEmail(event.target.value)} required type="email" className="app-input mt-1.5" placeholder="viajero@empresa.com" /></label>
          <button disabled={busy} className="app-primary-button min-h-11" type="submit">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Invitar</button>
        </form>
        {message ? <p role="status" className="mt-3 rounded-xl bg-nihao-soft px-4 py-3 text-sm text-nihao">{message}</p> : null}
        {link ? <div className="mt-3 flex flex-col gap-2 rounded-xl border border-nihao/20 bg-white p-3 text-sm sm:flex-row sm:items-center"><code className="min-w-0 flex-1 truncate text-ink-mute">{link}</code><button type="button" onClick={() => void copyLink()} className="app-secondary-button"><Clipboard className="h-4 w-4" />Copiar enlace</button></div> : null}
        <div className="mt-3 grid gap-3">
          {data.invitations.map((invitation) => <article key={invitation.id} className="rounded-2xl border border-line bg-white p-4 shadow-soft"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{invitation.name || invitation.email}</h3><p className="text-sm text-ink-mute">{invitation.email} · {data.companies?.find((company) => company.id === invitation.companyId)?.name ?? "Empresa"}</p></div><span className="rounded-full bg-nihao-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-nihao">{invitation.status === "PENDING" ? "Pendiente" : invitation.status === "ACCEPTED" ? "Aceptada" : "Vencida"}</span></div><p className="mt-3 text-xs text-ink-mute">{invitation.status === "PENDING" ? `Vence ${new Date(invitation.expiresAt).toLocaleDateString("es-AR")}` : `Creada ${new Date(invitation.createdAt).toLocaleDateString("es-AR")}`}</p>{invitation.status === "PENDING" ? <button disabled={busy} type="button" onClick={() => void resend(invitation.id)} className="app-secondary-button mt-3">Regenerar enlace</button> : null}</article>)}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, helper }: { label: string; value: number; helper?: string }) {
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-soft"><p className="text-xs text-ink-mute">{label}</p><p className="mt-2 text-2xl font-semibold text-ink">{value}</p>{helper ? <p className="mt-1 text-xs text-ink-mute">{helper}</p> : null}</div>;
}
