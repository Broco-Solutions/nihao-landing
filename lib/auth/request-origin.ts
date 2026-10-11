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

/** Staging web and API live on sibling hosts under the production parent domain, so
 * they share its cookie scope. A distinct name keeps each environment reading only
 * its own session; a separate registrable domain remains the stronger isolation. */
export function stagingCookiePrefix(env: Record<string, string | undefined> = process.env): string | undefined {
  const staging = env.NIHAO_RUNTIME_ENV === "staging" || env.RAILWAY_ENVIRONMENT_NAME === "staging" || env.VERCEL_ENV === "preview";
  return staging ? "nihao-staging" : undefined;
}
