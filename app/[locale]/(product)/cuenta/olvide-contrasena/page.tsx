import type { Metadata } from "next";
import { PasswordResetRequest } from "@/components/app/PasswordReset";

export const metadata: Metadata = { title: "Recuperar contraseña · Nihao Negocios", robots: { index: false } };

export default function ForgotPasswordPage() {
  return <PasswordResetRequest />;
}
