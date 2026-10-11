/** Browsers must prove an allowed origin for cookie-authenticated mutations.
 * Server integrations without cookies remain subject to their normal auth. */
export function cookieMutationOriginAllowed(request: { method: string; url: string; headers: Pick<Headers, "get"> }, origins: ReadonlySet<string>) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase()) || !request.headers.get("cookie")) return true;
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  let normalized: string;
  try { const parsed = new URL(origin); if (parsed.origin !== origin) return false; normalized = parsed.origin; } catch { return false; }
  return normalized === new URL(request.url).origin || origins.has(normalized);
}

export function assertIsolatedStagingCookieDomain(domain: string | undefined, env: Record<string, string | undefined> = process.env) {
  const staging = env.NIHAO_RUNTIME_ENV === "staging" || env.RAILWAY_ENVIRONMENT_NAME === "staging" || env.VERCEL_ENV === "preview";
  // Shared production domains are forbidden even when a preview deployment uses
  // different session secrets: browsers would still send production cookies.
  if (staging && domain && /(^|\.)nihaonegocios\.com$/i.test(domain.replace(/^\./, ""))) {
    throw new Error("Staging requiere cookies host-only; no comparte el dominio de producción");
  }
  if (staging) for (const name of ["BETTER_AUTH_URL", "PUBLIC_APP_URL"]) {
    const url = env[name];
    if (url && /(^|\.)nihaonegocios\.com$/i.test(new URL(url).hostname)) {
      throw new Error("Staging requiere un hostname fuera del dominio de cookies de producción");
    }
  }
}
