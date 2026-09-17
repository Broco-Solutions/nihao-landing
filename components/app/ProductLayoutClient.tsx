"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { AppShell } from "./AppShell";

export function ProductLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = authClient.useSession();

  useEffect(() => {
    if (!session.isPending && !session.data) router.replace("/cuenta/ingresar");
  }, [router, session.data, session.isPending]);

  if (session.isPending) {
    return <div className="grid min-h-dvh place-items-center bg-paper text-sm text-ink-mute">Cargando tu sesión…</div>;
  }
  if (!session.data) return null;

  return <AppShell user={{ name: session.data.user.name, email: session.data.user.email }}>{children}</AppShell>;
}
