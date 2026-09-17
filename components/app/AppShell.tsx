"use client";

import Link from "next/link";
import { Bot, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";

export function AppShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  async function logout() {
    await authClient.signOut();
    window.location.assign("/cuenta/ingresar");
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/app" className="inline-flex items-center gap-2 font-semibold text-ink">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-nihao text-white"><Bot className="h-5 w-5" /></span>
            Nihao Bot <span className="rounded-full bg-nihao-soft px-2 py-0.5 text-[9px] uppercase tracking-wide text-nihao">App</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-right text-xs text-ink-mute sm:block"><strong className="block text-ink">{user.name}</strong>{user.email}</span>
            <button onClick={logout} type="button" aria-label="Cerrar sesión" className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white text-ink-mute"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
