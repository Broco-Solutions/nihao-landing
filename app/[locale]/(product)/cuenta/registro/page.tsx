import type { Metadata } from "next";
import { AuthCard } from "@/components/app/AuthCard";

export const metadata: Metadata = { title: "Crear cuenta en Nihao Bot", robots: { index: false } };

export default function RegisterPage() {
  return <AuthCard mode="register" />;
}
