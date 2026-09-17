"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, Users } from "lucide-react";
import type { TripAdministrationRecord } from "@/lib/bot/types";
import { appApi } from "./api";

export function TripAdministration({ tripId }: { tripId: string }) {
  const [data, setData] = useState<TripAdministrationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-soft"><p className="text-xs text-ink-mute">{label}</p><p className="mt-2 text-2xl font-semibold text-ink">{value}</p></div>;
}
