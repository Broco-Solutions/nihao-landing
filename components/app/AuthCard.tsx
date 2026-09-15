import Link from "next/link";
import { Bot } from "lucide-react";
import { AuthForm } from "./AuthForm";

export function AuthCard({ mode }: { mode: "login" | "register" }) {
  return (
    <main className="min-h-dvh bg-paper px-5 py-8 sm:grid sm:place-items-center">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-line bg-white p-6 shadow-card sm:p-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-nihao text-white"><Bot className="h-5 w-5" /></span>
          Nihao Bot <span className="rounded-full bg-nihao-soft px-2 py-0.5 text-[10px] uppercase tracking-wide text-nihao">App</span>
        </Link>
        <p className="mt-8 text-eyebrow-mark">Cuenta productiva</p>
        <h1 className="mt-3 text-3xl text-ink">{mode === "login" ? "Volvé a tus viajes" : "Empezá tu próximo viaje"}</h1>
        <p className="mt-2 text-sm text-ink-mute">Tus proveedores se guardan de forma privada y quedan disponibles cuando vuelvas a abrir la app.</p>
        <AuthForm mode={mode} />
        <div className="mt-6 border-t border-line pt-5 text-center text-xs text-ink-faint">
          ¿Buscabas la demostración comercial? <Link className="font-semibold text-ink-mute" href="/demo">Ir a la demo</Link>
        </div>
      </div>
    </main>
  );
}
