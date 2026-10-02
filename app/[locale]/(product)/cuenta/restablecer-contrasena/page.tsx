import type { Metadata } from "next";
import { PasswordResetForm } from "@/components/app/PasswordReset";

export const metadata: Metadata = { title: "Restablecer contraseña · Nihao Negocios", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  return <PasswordResetForm token={params.token} invalidToken={params.error === "INVALID_TOKEN"} />;
}
