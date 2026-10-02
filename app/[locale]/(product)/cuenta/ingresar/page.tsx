import type { Metadata } from "next";
import { AuthCard } from "@/components/app/AuthCard";

export const metadata: Metadata = { title: "Ingresar a Nihao App", robots: { index: false } };

export default function LoginPage() {
  return <AuthCard mode="login" />;
}
