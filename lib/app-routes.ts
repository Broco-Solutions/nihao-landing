export function slugifyRouteLabel(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "viaje";
}

export function tripRouteKey(trip: { id: string; publicSlug?: string | null }): string { return trip.publicSlug || trip.id; }

export function tripPath(trip: { id: string; publicSlug?: string | null }, section?: string): string {
  const base = `/app/viajes/${encodeURIComponent(tripRouteKey(trip))}`;
  return section ? `${base}?section=${encodeURIComponent(section)}` : base;
}

export function tripManagementPath(trip: { id: string; publicSlug?: string | null }): string { return `/app/viajes/${encodeURIComponent(tripRouteKey(trip))}/gestion`; }

export function safeDownloadStem(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "Viaje";
}

export function tripExportFilename(name: string, format: "pdf" | "xlsx", date: string, kind = "report"): string {
  const label = format === "pdf" ? "Informe" : "Datos";
  const suffix = kind === "report" ? "" : `_${safeDownloadStem(kind)}`;
  return `Nihao_${label}_${safeDownloadStem(name)}_${date}${suffix}.${format}`;
}
