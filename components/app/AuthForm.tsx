"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth/client";

function authMessage(message?: string) {
  const normalized = message?.toLowerCase() ?? "";
  if (normalized.includes("invalid") || normalized.includes("credential")) return "El email o la contraseña no son correctos.";
  if (normalized.includes("already") || normalized.includes("exist")) return "Ya existe una cuenta con ese email.";
  if (normalized.includes("password")) return "La contraseña debe tener al menos 8 caracteres.";
  return message || "No pudimos completar la operación. Intentá nuevamente.";
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    try {
      const result = mode === "register"
        ? await authClient.signUp.email({ name: String(data.get("name") ?? "").trim(), email, password })
        : await authClient.signIn.email({ email, password, rememberMe: true });
      if (result.error) {
        setError(authMessage(result.error.message));
        setBusy(false);
        return;
      }
      const invitation = searchParams.get("invitacion");
      router.replace(invitation ? `/invitacion/${encodeURIComponent(invitation)}` : "/app");
      router.refresh();
    } catch {
      setError("No pudimos conectar con el servidor. Revisá tu conexión e intentá nuevamente.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      {mode === "register" ? (
        <label className="block text-sm font-medium text-ink-soft">
          Nombre
          <input name="name" required minLength={2} autoComplete="name" className="app-input mt-1.5" placeholder="Tu nombre" />
        </label>
      ) : null}
      <label className="block text-sm font-medium text-ink-soft">
        Email
        <input name="email" required type="email" inputMode="email" autoComplete="email" className="app-input mt-1.5" placeholder="vos@empresa.com" />
      </label>
      <div>
        <label htmlFor="account-password" className="block text-sm font-medium text-ink-soft">Contraseña</label>
        <div className="relative mt-1.5">
          <input id="account-password" name="password" required minLength={8} type={mode === "login" && showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} className={`app-input ${mode === "login" ? "pr-12" : ""}`} placeholder="Mínimo 8 caracteres" />
          {mode === "login" ? <button type="button" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-1 grid w-11 place-items-center rounded-lg text-ink-mute hover:text-ink focus-visible:outline-2 focus-visible:outline-nihao">
            {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
          </button> : null}
        </div>
      </div>
      {error ? <p role="alert" className="rounded-xl bg-nihao-soft px-4 py-3 text-sm text-nihao">{error}</p> : null}
      <button disabled={busy} className="app-primary-button w-full" type="submit">
        {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}
        {mode === "login" ? "Ingresar a Nihao Bot" : "Crear mi cuenta"}
      </button>
      <p className="text-center text-sm text-ink-mute">
        {mode === "login" ? "¿Todavía no tenés cuenta? " : "¿Ya tenés cuenta? "}
        <Link className="font-semibold text-nihao" href={mode === "login" ? "/cuenta/registro" : "/cuenta/ingresar"}>
          {mode === "login" ? "Registrate" : "Iniciá sesión"}
        </Link>
      </p>
    </form>
  );
}
