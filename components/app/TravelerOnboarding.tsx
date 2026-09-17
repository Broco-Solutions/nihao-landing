"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, ImageIcon, LoaderCircle, Mic, Sparkles, Type } from "lucide-react";
import { useRouter } from "next/navigation";
import { appApi } from "./api";

type State = { tripId: string; tripName: string; role: "ADMIN" | "TRAVELER"; onboardingRequired: boolean; onboardingCompletedAt: string | null };

export function TravelerOnboarding({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void appApi<State>(`/api/bot/trips/${encodeURIComponent(tripId)}/onboarding`).then((value) => {
      if (!value.onboardingRequired) router.replace(`/app/viajes/${tripId}`);
      else setState(value);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "No pudimos cargar el onboarding"));
  }, [router, tripId]);

  async function complete() {
    setBusy(true); setError(null);
    try { await appApi(`/api/bot/trips/${encodeURIComponent(tripId)}/onboarding`, { method: "POST" }); router.replace(`/app/viajes/${tripId}`); router.refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos activar tu acceso"); setBusy(false); }
  }

  if (error) return <main className="app-page"><div className="mx-auto mt-10 max-w-lg rounded-3xl border border-line bg-white p-6 text-center shadow-soft"><p role="alert" className="rounded-xl bg-nihao-soft px-4 py-3 text-sm text-nihao">{error}</p></div></main>;
  if (!state) return <main className="app-page grid min-h-72 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-nihao" /></main>;

  const screens = [
    <section key="welcome" className="space-y-5"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-nihao text-white"><Sparkles className="h-8 w-8" /></div><div><p className="text-eyebrow-mark">Tu viaje empieza acá</p><h1 className="mt-3 text-4xl leading-tight text-ink">Bienvenido a Nihao</h1><p className="mt-3 text-lg text-ink-mute">{state.tripName}</p></div><p className="text-base leading-7 text-ink-soft">Durante la feria vas a poder guardar información de tus proveedores en pocos segundos.</p></section>,
    <section key="capture" className="space-y-5"><p className="text-eyebrow-mark">Paso 2 de 3</p><h1 className="text-3xl leading-tight text-ink">Capturá como te resulte más fácil</h1><div className="grid gap-3"><CaptureOption icon={<ImageIcon />} title="Tarjetas y fotos" text="Guardá una business card o una imagen." /><CaptureOption icon={<Mic />} title="Notas de voz" text="Contá lo importante mientras caminás." /><CaptureOption icon={<Type />} title="Texto" text="Escribí una nota rápida." /></div><p className="text-sm leading-6 text-ink-mute">No hace falta completar formularios largos mientras hablás con un proveedor.</p></section>,
    <section key="review" className="space-y-5"><p className="text-eyebrow-mark">Paso 3 de 3</p><h1 className="text-3xl leading-tight text-ink">Nosotros lo organizamos</h1><p className="text-base leading-7 text-ink-soft">Nihao detecta empresa, contacto, FOB, MOQ y tiempo de entrega.</p><div className="rounded-2xl bg-nihao-soft p-5"><p className="font-semibold text-ink">Vos revisás lo detectado</p><p className="mt-2 text-sm leading-6 text-ink-mute">La información queda guardada sólo después de que la confirmás.</p></div></section>,
  ];
  return <main className="app-page flex min-h-[calc(100dvh-2rem)] items-center"><div className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-white p-6 shadow-card sm:p-8"><div className="flex items-center justify-between" aria-label={`Paso ${step + 1} de 3`}><span className="text-sm font-semibold text-ink-mute">{step + 1} / 3</span><div className="flex gap-1.5" aria-hidden="true">{screens.map((_, index) => <span key={index} className={`h-1.5 w-8 rounded-full ${index <= step ? "bg-nihao" : "bg-line"}`} />)}</div></div><div className="mt-10 min-h-[23rem]">{screens[step]}</div>{error ? <p role="alert" className="mb-3 rounded-xl bg-nihao-soft px-4 py-3 text-sm text-nihao">{error}</p> : null}<button disabled={busy} onClick={() => step < screens.length - 1 ? setStep((current) => current + 1) : void complete()} className="app-primary-button min-h-12 w-full justify-center">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : step === screens.length - 1 ? <Check className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}{step === screens.length - 1 ? "Empezar" : "Continuar"}</button></div></main>;
}

function CaptureOption({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="flex items-center gap-4 rounded-2xl border border-line p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-nihao-soft text-nihao">{icon}</span><span><strong className="block text-ink">{title}</strong><span className="mt-1 block text-sm text-ink-mute">{text}</span></span></div>; }
