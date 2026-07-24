import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { DemoPortal } from "./DemoPortal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("demo.seo.title"),
    description: t("seo.description"),
  };
}

export default async function IngresarPage() {
  const cookieStore = await cookies();
  const authed = cookieStore.get("demo_auth")?.value === "true";

  if (authed) {
    return <DemoPortal />;
  }

  return <LoginForm />;
}