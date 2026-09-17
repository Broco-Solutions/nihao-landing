import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function ProtectedDemoLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const cookieStore = await cookies();

  if (cookieStore.get("demo_auth")?.value !== "true") {
    redirect(locale === "es" ? "/demo" : `/${locale}/demo`);
  }

  return children;
}
