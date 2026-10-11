import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { cookieMutationOriginAllowed } from "@/lib/auth/request-origin";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);
const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
// Behind a TLS proxy request.url can carry the internal host; the public app and
// auth origins that Better Auth already trusts stay valid for cookie mutations.
const mutationOrigins = new Set([
  ...allowedOrigins,
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(","),
  process.env.PUBLIC_APP_URL ?? "",
  process.env.BETTER_AUTH_URL ?? "",
].flatMap((value) => { try { return value.trim() ? [new URL(value.trim()).origin] : []; } catch { return []; } }));

function corsHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    headers.set("Access-Control-Max-Age", "600");
    headers.set("Vary", "Origin");
  }
  return headers;
}

export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const headers = corsHeaders(request);
    if (!cookieMutationOriginAllowed(request, mutationOrigins)) return NextResponse.json({ error: "Origen no autorizado" }, { status: 403, headers });
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: headers.has("Access-Control-Allow-Origin") ? 204 : 403, headers });
    }
    const response = NextResponse.next();
    headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!_next|_vercel|.*\\..*).*)",
    "/(es|en|it)/:path*",
  ],
};
