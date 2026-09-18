"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { appApi } from "./api";

type InvitationView = { status: "PENDING" | "ACCEPTED" | "EXPIRED"; tripId: string; tripName?: string };

export function InvitationPage({ token }: { token: string }) {
  const router = useRouter();
  const session = authClient.useSession();
  const [invitation, setInvitation] = useState<InvitationView | null>(null);
  const [state, setState] = useState<"loading" | "invalid" | "ready" | "error" | "accepted">("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void appApi<InvitationView>(`/api/bot/invitations/${encodeURIComponent(token)}`).then((value) => { setInvitation(value); setState(value.status === "PENDING" ? "ready" : value.status === "ACCEPTED" ? "accepted" : "error"); }).catch(() => setState("invalid")); }, [token]);
  async function accept() { setBusy(true); try { const result = await appApi<{ result: { tripId: string; onboardingRequired: boolean } }>(`/api/bot/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }); router.replace(`/app/viajes/${result.result.tripId}${result.result.onboardingRequired ? "/onboarding" : ""}`); } catch { setState("error"); } finally { setBusy(false); } }
  if (state === "loading") return <main className="app-page grid min-h-72 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-nihao" /></main>;
  if (state === "invalid") return <main className="app-page"><Card title="Invitación no válida">Este enlace no existe o ya no está disponible.</Card></main>;
  if (state === "error") return <main className="app-page"><Card title="Invitación vencida">Pedile al administrador del viaje que genere un enlace nuevo.</Card></main>;
  if (state === "accepted") return <main className="app-page"><Card title="Acceso ya activado"><Link className="app-primary-button mt-5" href={`/app/viajes/${invitation?.tripId}`}>Entrar al viaje</Link></Card></main>;
  return <main className="app-page"><Card title="Fuiste invitado a un viaje"><p className="mt-2 text-ink-mute">{invitation?.tripName ?? "Nihao Negocios"}</p>{session.data?.user ? <button disabled={busy} onClick={() => void accept()} className="app-primary-button mt-6">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Activar mi acceso</button> : <div className="mt-6 flex flex-wrap gap-3"><Link className="app-primary-button" href={`/cuenta/ingresar?invitacion=${encodeURIComponent(token)}`}>Iniciar sesión</Link><Link className="app-secondary-button" href={`/cuenta/registro?invitacion=${encodeURIComponent(token)}`}>Crear cuenta</Link></div>}</Card></main>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mx-auto mt-10 max-w-xl rounded-3xl border border-line bg-white p-7 text-center shadow-soft"><p className="text-eyebrow-mark">Nihao Negocios</p><h1 className="mt-3 text-3xl">{title}</h1>{children}</section>; }
