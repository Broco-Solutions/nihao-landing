"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { AuthShell } from "./AuthCard";

export function PasswordResetRequest() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const redirectTo = new URL("/cuenta/restablecer-contrasena", window.location.origin).toString();
      const result = await authClient.requestPasswordReset({ email: String(form.get("email") ?? "").trim(), redirectTo });
      if (result.error) throw new Error(result.error.message || "Request failed");
      setSent(true);
    } catch {
      setError("No pudimos enviar la solicitud. Revisá tu conexión e intentá nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return <AuthShell title="Recuperá tu contraseña" description="Te enviaremos un enlace si el correo está asociado a una cuenta.">
    {sent ? <div className="mt-7 space-y-5"><p role="status" className="rounded-xl bg-nihao-soft px-4 py-3 text-sm text-ink-soft">Si el correo está asociado a una cuenta, recibirás un enlace para restablecer la contraseña.</p><Link className="app-primary-button w-full" href="/cuenta/ingresar">Volver a ingresar</Link></div> : <form onSubmit={submit} className="mt-7 space-y-4">
      <label className="block text-sm font-medium text-ink-soft">Email<input name="email" required type="email" inputMode="email" autoComplete="email" className="app-input mt-1.5" placeholder="vos@empresa.com" /></label>
      {error ? <p role="alert" className="rounded-xl bg-nihao-soft px-4 py-3 text-sm text-nihao">{error}</p> : null}
      <button disabled={busy} className="app-primary-button w-full" type="submit">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}Enviar enlace</button>
      <p className="text-center text-sm text-ink-mute"><Link className="font-semibold text-nihao" href="/cuenta/ingresar">Volver a ingresar</Link></p>
    </form>}
  </AuthShell>;
}

export function PasswordResetForm({ token, invalidToken }: { token?: string; invalidToken: boolean }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalid = invalidToken || !token;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      setBusy(false);
      return;
    }
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        const code = result.error.code?.toUpperCase() ?? "";
        if (code.includes("INVALID_TOKEN")) {
          setError("El enlace no es válido o venció. Solicitá uno nuevo.");
        } else {
          setError("No pudimos guardar la contraseña. Intentá nuevamente.");
        }
        return;
      }
      setSaved(true);
    } catch {
      setError("No pudimos conectar con el servidor. Revisá tu conexión e intentá nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return <AuthShell title={invalid ? "Enlace no válido" : saved ? "Contraseña actualizada" : "Elegí una contraseña nueva"}>
    {invalid ? <div className="mt-7 space-y-5"><p role="alert" className="rounded-xl bg-nihao-soft px-4 py-3 text-sm text-ink-soft">El enlace no es válido o venció. Solicitá uno nuevo.</p><Link className="app-primary-button w-full" href="/cuenta/olvide-contrasena">Solicitar otro enlace</Link></div>
      : saved ? <div className="mt-7 space-y-5"><p role="status" className="rounded-xl bg-nihao-soft px-4 py-3 text-sm text-ink-soft">La contraseña se guardó correctamente.</p><Link className="app-primary-button w-full" href="/cuenta/ingresar">Ingresar a Nihao</Link></div>
        : <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-sm font-medium text-ink-soft">Nueva contraseña<input name="password" required minLength={8} type="password" autoComplete="new-password" className="app-input mt-1.5" /></label>
          <label className="block text-sm font-medium text-ink-soft">Repetí la contraseña<input name="confirmation" required minLength={8} type="password" autoComplete="new-password" className="app-input mt-1.5" /></label>
          {error ? <p role="alert" className="rounded-xl bg-nihao-soft px-4 py-3 text-sm text-nihao">{error}</p> : null}
          <button disabled={busy} className="app-primary-button w-full" type="submit">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}Guardar contraseña</button>
        </form>}
  </AuthShell>;
}
