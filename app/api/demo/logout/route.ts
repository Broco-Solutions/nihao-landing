import { NextResponse } from "next/server";

const SUPPORTED_LOCALES = new Set(["es", "en", "it"]);

export async function POST(request: Request) {
  const formData = await request.formData();
  const requestedLocale = formData.get("locale");
  const locale = typeof requestedLocale === "string" && SUPPORTED_LOCALES.has(requestedLocale)
    ? requestedLocale
    : "es";
  const destination = locale === "es" ? "/demo" : `/${locale}/demo`;
  const response = NextResponse.redirect(new URL(destination, request.url), 303);

  response.cookies.set("demo_auth", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
    expires: new Date(0),
    path: "/",
  });

  return response;
}
