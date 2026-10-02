import Link from "next/link";
import Image from "next/image";
import { AuthForm } from "./AuthForm";

export function AuthShell({ eyebrow = "Cuenta productiva", title, description, children, showDemoLink = false }: { eyebrow?: string; title: string; description?: string; children: React.ReactNode; showDemoLink?: boolean }) {
  return (
    <main className="min-h-dvh bg-paper px-5 py-8 sm:grid sm:place-items-center">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-line bg-white p-6 shadow-card sm:p-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <Image src="/logo-nihao.png" width={40} height={40} alt="Nihao Negocios" className="h-10 w-10 rounded-xl" priority />
          Nihao Negocios
        </Link>
        <p className="mt-8 text-eyebrow-mark">{eyebrow}</p>
        <h1 className="mt-3 text-3xl text-ink">{title}</h1>
        {description ? <p className="mt-2 text-sm text-ink-mute">{description}</p> : null}
        {children}
        {showDemoLink ? <div className="mt-6 border-t border-line pt-5 text-center text-xs text-ink-faint">¿Buscabas la demostración comercial? <Link className="font-semibold text-ink-mute" href="/demo">Ir a la demo</Link></div> : null}
      </div>
    </main>
  );
}

export function AuthCard({ mode }: { mode: "login" | "register" }) {
  return <AuthShell
    title={mode === "login" ? "Volvé a tus viajes" : "Empezá tu próximo viaje"}
    description={mode === "login" ? "Entra a tu viaje para registrar y comparar proveedores" : "Tus proveedores se guardan de forma privada y quedan disponibles cuando vuelvas a abrir la app."}
    showDemoLink
  ><AuthForm mode={mode} /></AuthShell>;
}
