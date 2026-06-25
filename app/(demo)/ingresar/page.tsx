"use client";

import Link from "next/link";
import Image from "next/image";
import { MessageSquare, Briefcase, Shield, ArrowRight } from "lucide-react";
import { demoCopy } from "@/components/demo/demo-data";

const demoCards = [
  {
    title: "Conocer Asistente Nihao",
    description:
      "Explorá conversaciones simuladas de WhatsApp con audios, fotos, tarjetas y respuestas inteligentes.",
    href: "/demo/asistente",
    button: "Ver simulador",
    icon: MessageSquare,
  },
  {
    title: "Entrar como viajero demo",
    description:
      "Visualizá el tablero personal de un viajero con proveedores, productos, contactos, timeline y exportaciones.",
    href: "/demo/viajero",
    button: "Entrar como viajero",
    icon: Briefcase,
  },
  {
    title: "Entrar como equipo Nihao",
    description:
      "Accedé a la vista interna del equipo Nihao con viajeros activos, recorridos, reportes y métricas generales.",
    href: "/demo/admin",
    button: "Entrar como Nihao",
    icon: Shield,
  },
];

export default function IngresarPage() {
  return (
    <div className="relative flex min-h-[calc(100vh-72px-56px)] flex-col items-center justify-center bg-paper-soft px-4 py-12 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-glow" />

      <div className="relative z-10 mx-auto max-w-5xl text-center">
        <div className="mb-6 flex justify-center">
          <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-card">
            <Image
              src="/logo-nihao.png"
              alt="Nihao"
              fill
              sizes="80px"
              className="scale-[1.25] object-contain p-2"
            />
          </div>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-nihao/15 bg-nihao-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-nihao">
          Demo interactiva
        </span>

        <h1 className="mt-5 font-display text-3xl font-medium tracking-tight text-ink md:text-5xl">
          Portal del Asistente Nihao
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-soft md:text-[18px]">
          Una demo interactiva para visualizar cómo el bot de WhatsApp acompaña al viajero, organiza
          proveedores y genera reportes accionables.
        </p>

        <div className="mt-10 grid gap-5 text-left sm:grid-cols-2 lg:grid-cols-3">
          {demoCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group flex flex-col rounded-2xl border border-line bg-paper p-6 shadow-soft transition-all hover:-translate-y-1 hover:shadow-card"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-nihao/10 text-nihao transition-colors group-hover:bg-nihao group-hover:text-white">
                <card.icon className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h2 className="mt-5 font-display text-xl font-medium tracking-tight text-ink">
                {card.title}
              </h2>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-mute">
                {card.description}
              </p>
              <span className="mt-6 inline-flex items-center gap-2 text-[14px] font-semibold text-nihao">
                {card.button}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2} />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 text-[12px] text-ink-faint">
          <a
            href="https://www.brocosolutions.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 transition-colors hover:border-nihao/20"
          >
            <span className="relative flex h-4 w-16 items-center justify-center overflow-hidden">
              <Image
                src="/logos/broco-solutions-logo.png"
                alt="Broco Solutions"
                fill
                sizes="64px"
                className="object-contain opacity-80 transition-opacity group-hover:opacity-100"
              />
            </span>
            <span className="font-medium text-ink-mute transition-colors group-hover:text-nihao">
              {demoCopy.poweredBy}
            </span>
          </a>
          <p className="rounded-full border border-line bg-paper px-3 py-1 text-[11px]">
            Acceso directo, sin login real
          </p>
        </div>
      </div>
    </div>
  );
}
