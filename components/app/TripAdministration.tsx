"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Clipboard, LoaderCircle, Send, Users } from "lucide-react";
import type { TripAdministrationRecord } from "@/lib/bot/types";
import { appApi } from "./api";

export function TripAdministration({ tripId }: { tripId: string }) {
  const [data, setData] = useState<TripAdministrationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await appApi<TripAdministrationRecord>(`/api/bot/trips/${tripId}/admin`));
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
      const result = await appApi<{ invitation: TripAdministrationRecord["invitations"][number]; reused: boolean; link: string | null }>(`/api/bot/trips/${tripId}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, name }) });
      setData((current) => current ? { ...current, invitations: [result.invitation, ...current.invitations.filter((item) => item.id !== result.invitation.id)] } : current);
      setEmail(""); setName(""); setLink(result.link); setMessage(result.reused ? "Ya había una invitación pendiente. Regenerá el enlace para obtener uno nuevo." : "Invitación creada. Copiá el enlace para compartirlo.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos crear la invitación"); } finally { setBusy(false); }
  }

  async function resend(invitationId: string) {
    setBusy(true); setMessage(null);
    try {
      const result = await appApi<{ invitation: TripAdministrationRecord["invitations"][number]; link: string }>(`/api/bot/trips/${tripId}/invitations/${invitationId}/resend`, { method: "POST" });
      setData((current) => current ? { ...current, invitations: current.invitations.map((item) => item.id === invitationId ? result.invitation : item) } : current);
      setLink(result.link); setMessage("Enlace regenerado: el anterior dejó de funcionar.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "No pudimos regenerar el enlace"); } finally { setBusy(false); }
  }

  async function copyLink() { if (link) { await navigator.clipboard.writeText(link); setMessage("Enlace copiado."); } }

  if (loading) return <main className="app-page grid min-h-72 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-nihao" /></main>;
  if (error || !data) return <main className="app-page"><Link href={`/app/viajes/${tripId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Volver al viaje</Link><p role="alert" className="mt-6 rounded-xl bg-nihao-soft p-4 text-sm text-nihao">{error ?? "Esta administración no está disponible."}</p></main>;

  return (
    <main className="app-page">
      <Link href={`/app/viajes/${tripId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Volver al viaje</Link>
      <div className="mt-3"><p className="text-eyebrow-mark">Administración del viaje</p><h1 className="mt-3 text-3xl sm:text-4xl">{data.trip.name}</h1><p className="mt-2 text-sm text-ink-mute">Vista general de miembros y actividad.</p></div>

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
        <div className="mt-3 grid gap-3">
          {data.members.map((member) => (
            <article key={member.userId} className="rounded-2xl border border-line bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold">{member.name}</h3><p className="truncate text-sm text-ink-mute">{member.email}</p></div><span className="shrink-0 rounded-full bg-nihao-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-nihao">{member.role === "ADMIN" ? "Admin" : "Viajero"}</span></div>
              <p className="mt-3 text-xs text-ink-mute">{member.captureCount} captura{member.captureCount === 1 ? "" : "s"} · {member.supplierCount} proveedor{member.supplierCount === 1 ? "" : "es"}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="travelers-heading" className="mt-8">
        <div className="flex items-center gap-2"><Send className="h-5 w-5 text-nihao" /><h2 id="travelers-heading" className="text-xl">Viajeros</h2></div>
        <form onSubmit={invite} className="mt-3 grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm font-medium text-ink-soft">Nombre<input value={name} onChange={(event) => setName(event.target.value)} className="app-input mt-1.5" placeholder="Nombre opcional" /></label>
          <label className="text-sm font-medium text-ink-soft">Email<input value={email} onChange={(event) => setEmail(event.target.value)} required type="email" className="app-input mt-1.5" placeholder="viajero@empresa.com" /></label>
          <button disabled={busy} className="app-primary-button min-h-11" type="submit">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Invitar</button>
        </form>
        {message ? <p role="status" className="mt-3 rounded-xl bg-nihao-soft px-4 py-3 text-sm text-nihao">{message}</p> : null}
        {link ? <div className="mt-3 flex flex-col gap-2 rounded-xl border border-nihao/20 bg-white p-3 text-sm sm:flex-row sm:items-center"><code className="min-w-0 flex-1 truncate text-ink-mute">{link}</code><button type="button" onClick={() => void copyLink()} className="app-secondary-button"><Clipboard className="h-4 w-4" />Copiar enlace</button></div> : null}
        <div className="mt-3 grid gap-3">
          {data.invitations.map((invitation) => <article key={invitation.id} className="rounded-2xl border border-line bg-white p-4 shadow-soft"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{invitation.name || invitation.email}</h3><p className="text-sm text-ink-mute">{invitation.email}</p></div><span className="rounded-full bg-nihao-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-nihao">{invitation.status === "PENDING" ? "Pendiente" : invitation.status === "ACCEPTED" ? "Aceptada" : "Vencida"}</span></div><p className="mt-3 text-xs text-ink-mute">{invitation.status === "PENDING" ? `Vence ${new Date(invitation.expiresAt).toLocaleDateString("es-AR")}` : `Creada ${new Date(invitation.createdAt).toLocaleDateString("es-AR")}`}</p>{invitation.status === "PENDING" ? <button disabled={busy} type="button" onClick={() => void resend(invitation.id)} className="app-secondary-button mt-3">Regenerar enlace</button> : null}</article>)}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-soft"><p className="text-xs text-ink-mute">{label}</p><p className="mt-2 text-2xl font-semibold text-ink">{value}</p></div>;
}
