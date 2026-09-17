import { cookies } from "next/headers";
import { DemoLayout } from "@/components/demo/DemoLayout";

export default async function DemoRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get("demo_auth")?.value === "true";

  return <DemoLayout isAuthenticated={isAuthenticated}>{children}</DemoLayout>;
}
