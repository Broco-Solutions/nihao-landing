"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Clipboard, LoaderCircle } from "lucide-react";
import type { TripRecord, TripAdministrationRecord } from "@/lib/bot/types";
import { appApi } from "./api";
import { invitationDeliveryMessage, invitationResendMessage } from "./invitation-feedback";

type Company = { id: string; name: string };
type Invitation = TripAdministrationRecord["invitations"][number];

export function NewTravelerInvitation() {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [tripId, setTripId] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    void appApi<{ trips: TripRecord[] }>("/api/bot/trips")
      .then((result) => { const adminTrips = result.trips.filter((trip) => trip.role === "ADMIN"); setTrips(adminTrips); setTripId((current) => current || adminTrips[0]?.id || ""); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "No pudimos cargar los viajes"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!tripId) return;
    let active = true;
    void Promise.all([
      appApi<{ companies: Company[] }>(`/api/bot/trips/${encodeURIComponent(tripId)}/companies`),
      appApi<{ invitations: Invitation[] }>(`/api/bot/trips/${encodeURIComponent(tripId)}/invitations`),
    ]).then(([companyResult, invitationResult]) => {
      if (!active) return;
      setCompanies(companyResult.companies);
      setInvitations(invitationResult.invitations);
      setCompanyId((current) => companyResult.companies.some((company) => company.id === current) ? current : companyResult.companies[0]?.id || "");
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "No pudimos cargar las empresas del viaje"); });
    return () => { active = false; };
  }, [tripId]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null); setLink(null);
    try {
      if (!tripId || !companyId) throw new Error("Elegí un viaje y una empresa asignada");
      const result = await appApi<{ invitation: Invitation; reused: boolean; link: string | null; emailDelivery: "SENT" | "FAILED" | null }>(`/api/bot/trips/${encodeURIComponent(tripId)}/invitations`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, name, whatsappPhone, companyId }),
      });
      setInvitations((current) => [result.invitation, ...current.filter((item) => item.id !== result.invitation.id)]);
      setEmail(""); setName(""); setWhatsappPhone(""); setLink(result.link);
      setMessage(invitationDeliveryMessage(result.emailDelivery, result.reused));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos invitar al viajero"); }
    finally { setBusy(false); }
  }

  async function resend(invitationId: string) {
    setBusy(true); setError(null); setMessage(null); setLink(null);
    try {
      const result = await appApi<{ invitation: Invitation; link: string; emailDelivery: "SENT" | "FAILED" }>(`/api/bot/trips/${encodeURIComponent(tripId)}/invitations/${encodeURIComponent(invitationId)}/resend`, { method: "POST" });
      setInvitations((current) => current.map((item) => item.id === invitationId ? result.invitation : item));
      setLink(result.link); setMessage(invitationResendMessage(result.emailDelivery));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos regenerar el enlace"); }
    finally { setBusy(false); }
  }

  async function copyLink() { if (link) { await navigator.clipboard.writeText(link); setMessage("Enlace copiado."); } }

  return <section aria-labelledby="invite-new-traveler-heading" className="mt-7 rounded-2xl border border-line bg-white p-4 shadow-soft">
    <h2 id="invite-new-traveler-heading" className="text-xl">Invitar viajero nuevo</h2>
    <p className="mt-1 text-sm text-ink-mute">Elegí el viaje y la empresa. Si la persona ya tiene cuenta, agregala desde la administración del viaje.</p>
    {loading ? <LoaderCircle aria-label="Cargando viajes" className="mt-4 h-5 w-5 animate-spin text-nihao" /> : <form onSubmit={(event) => void invite(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Viaje<select required className="app-input mt-1" value={tripId} onChange={(event) => { setTripId(event.target.value); setCompanyId(""); setCompanies([]); setInvitations([]); setLink(null); }}><option value="">Elegí un viaje</option>{trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.name}</option>)}</select></label>
      <label className="text-sm font-medium">Empresa<select required className="app-input mt-1" value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">Elegí una empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <label className="text-sm font-medium">Nombre<input className="app-input mt-1" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Nombre opcional" /></label>
      <label className="text-sm font-medium">Email<input required type="email" className="app-input mt-1" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="viajero@empresa.com" /></label>
      <label className="text-sm font-medium sm:col-span-2">WhatsApp<input required type="tel" inputMode="tel" className="app-input mt-1" value={whatsappPhone} onChange={(event) => setWhatsappPhone(event.target.value)} placeholder="Con código de país" /></label>
      <button disabled={busy || !tripId || !companyId} type="submit" className="app-primary-button sm:col-span-2">{busy ? "Enviando…" : "Enviar invitación"}</button>
    </form>}
    {tripId && !loading && !companies.length ? <p className="mt-3 text-sm text-ink-mute">Primero asigná una empresa a este viaje. <Link href={`/app/viajes/${tripId}/admin`} className="font-semibold text-nihao underline">Ir al viaje</Link></p> : null}
    {error ? <p role="alert" className="mt-3 rounded-xl bg-nihao-soft p-3 text-sm text-nihao">{error}</p> : null}
    {message ? <p role="status" className="mt-3 rounded-xl bg-nihao-soft p-3 text-sm text-nihao">{message}</p> : null}
    {link ? <div className="mt-3 flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 truncate text-xs">{link}</code><button type="button" onClick={() => void copyLink()} className="app-secondary-button"><Clipboard className="h-4 w-4" />Copiar enlace</button></div> : null}
    {invitations.some((invitation) => invitation.status !== "ACCEPTED") ? <div className="mt-5 border-t border-line pt-4"><h3 className="font-semibold">Invitaciones de este viaje</h3><div className="mt-3 grid gap-2">{invitations.filter((invitation) => invitation.status !== "ACCEPTED").map((invitation) => <article key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper-soft p-3"><div><p className="text-sm font-medium">{invitation.name || invitation.email}</p><p className="text-xs text-ink-mute">{invitation.email} · {invitation.status === "PENDING" ? "Pendiente" : "Vencida"}</p></div><button type="button" disabled={busy} onClick={() => void resend(invitation.id)} className="app-secondary-button text-xs">Regenerar enlace</button></article>)}</div></div> : null}
  </section>;
}
