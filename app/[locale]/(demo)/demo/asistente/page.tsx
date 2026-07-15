"use client";

import { WhatsAppSimulator } from "@/components/demo/WhatsAppSimulator";

export default function AsistentePage() {
  return (
    <div className="container-page py-6 md:py-8">
      <div className="mb-4 md:mb-6">
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink md:text-3xl">
          Simulador WhatsApp
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-mute md:text-[15px]">
          Conversaciones simuladas que muestran cómo el Asistente Nihao procesa mensajes, audios, fotos y tarjetas.
        </p>
      </div>
      <WhatsAppSimulator />
    </div>
  );
}
