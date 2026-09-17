import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { AuthenticationRequiredError, getAuthenticatedUser } from "@/lib/auth/session";

async function requireUser() {
  try {
    return await getAuthenticatedUser();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/cuenta/ingresar");
    throw error;
  }
}

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
