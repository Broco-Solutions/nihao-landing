"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, Plus } from "lucide-react";
import { appApi } from "./api";

type Company = { id: string; name: string; tripCount: number; tripNames: string[] };

export function CompaniesClient() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (query: string) => {
    const currentRequest = ++requestId.current;
    try {
      const result = await appApi<{ companies: Company[] }>(`/api/bot/companies?search=${encodeURIComponent(query)}`);
      if (currentRequest === requestId.current) { setCompanies(result.companies); setError(null); }
    } catch (caught) { if (currentRequest === requestId.current) setError(caught instanceof Error ? caught.message : "No pudimos cargar las empresas"); }
    finally { if (currentRequest === requestId.current) setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(search); }, 200);
    return () => window.clearTimeout(timer);
  }, [search, load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await appApi("/api/bot/companies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      setName(""); setSearch(""); await load("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos crear la empresa"); }
    finally { setBusy(false); }
  }

  async function rename(company: Company) {
    const next = window.prompt("Nombre de la empresa en todos los viajes", company.name)?.trim();
    if (!next || next === company.name) return;
    setBusy(true); setError(null);
    try {
      await appApi(`/api/bot/companies/${company.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: next }) });
      await load(search);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos renombrar la empresa"); }
    finally { setBusy(false); }
  }

  return <main className="app-page max-w-3xl">
    <Link href="/app" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-mute"><ArrowLeft className="h-4 w-4" />Mis viajes</Link>
    <p className="mt-4 text-eyebrow-mark">Administración</p><h1 className="mt-2 text-3xl">Empresas</h1>
    <p className="mt-2 text-sm text-ink-mute">Las empresas permanecen en el catálogo aunque no estén asignadas a un viaje.</p>
    <form onSubmit={create} className="mt-6 flex gap-2 rounded-2xl border border-line bg-white p-4 shadow-soft"><input className="app-input min-w-0 flex-1" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Nombre de la empresa" aria-label="Nueva empresa" /><button disabled={busy} className="app-primary-button" type="submit"><Plus className="h-4 w-4" />Crear</button></form>
    <label className="mt-7 block text-sm font-medium">Buscar en el catálogo<input className="app-input mt-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre de empresa" /></label>
    {error ? <p role="alert" className="mt-3 rounded-xl bg-nihao-soft p-3 text-sm text-nihao">{error}</p> : null}
    {loading ? <LoaderCircle className="mx-auto mt-8 h-6 w-6 animate-spin text-nihao" /> : <div className="mt-4 grid gap-3">{companies.map((company) => <article key={company.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft"><div><h2 className="font-semibold">{company.name}</h2><p className="mt-1 text-xs text-ink-mute">{company.tripCount ? company.tripNames.join(", ") : "Sin viajes asignados"}</p></div><button type="button" disabled={busy} onClick={() => void rename(company)} className="app-secondary-button text-xs">Renombrar</button></article>)}{!companies.length ? <p className="text-sm text-ink-mute">No encontramos empresas con ese nombre.</p> : null}</div>}
  </main>;
}
