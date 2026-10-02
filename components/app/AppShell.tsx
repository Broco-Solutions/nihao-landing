"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { indexedDbCaptureStore } from "@/lib/offline/capture-store";

export function AppShell({ user, children }: { user: { id: string; name: string; email: string }; children: React.ReactNode }) {
  const [logoutWarning, setLogoutWarning] = useState<number | null>(null);
  async function logout() {
    const pending = await indexedDbCaptureStore.list(user.id);
    if (pending.length) { setLogoutWarning(pending.length); return; }
    await completeLogout();
  }
  async function completeLogout() {
    await authClient.signOut();
    window.location.assign("/cuenta/ingresar");
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/app" className="inline-flex items-center gap-2 font-semibold text-ink">
            <Image src="/logo-nihao.png" width={36} height={36} alt="" className="h-9 w-9 rounded-xl" priority />
            Nihao App
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-right text-xs text-ink-mute sm:block"><strong className="block text-ink">{user.name}</strong>{user.email}</span>
            <button onClick={logout} type="button" aria-label="Cerrar sesión" className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white text-ink-mute"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>
      {logoutWarning ? <div role="alertdialog" aria-labelledby="logout-title" className="fixed inset-x-4 top-20 z-50 mx-auto max-w-md rounded-2xl border border-line bg-white p-5 shadow-card"><h2 id="logout-title" className="font-semibold">Tenés información pendiente</h2><p className="mt-2 text-sm text-ink-mute">Hay {logoutWarning} captura{logoutWarning === 1 ? "" : "s"} guardada{logoutWarning === 1 ? "" : "s"} en este dispositivo. Podrás sincronizarla cuando vuelvas a ingresar con esta cuenta.</p><div className="mt-4 flex gap-2"><button type="button" className="app-secondary-button flex-1 justify-center" onClick={() => setLogoutWarning(null)}>Seguir trabajando</button><button type="button" className="app-primary-button flex-1 justify-center" onClick={() => void completeLogout()}>Cerrar sesión</button></div></div> : null}
      {children}
    </div>
  );
}
