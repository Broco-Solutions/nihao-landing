"use server";

import { cookies } from "next/headers";

const DEMO_USER = "nihaonegocios";
const DEMO_PASS = "SMG2026";

export async function loginAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = formData.get("user") as string;
  const pass = formData.get("pass") as string;

  if (user !== DEMO_USER || pass !== DEMO_PASS) {
    return { error: "Credenciales incorrectas" };
  }

  const cookieStore = await cookies();
  cookieStore.set("demo_auth", "true", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 86400,
    path: "/",
  });

  return {};
}