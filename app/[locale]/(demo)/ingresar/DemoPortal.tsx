"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { MessageSquare, Briefcase, Shield, ArrowRight } from "lucide-react";

export function DemoPortal() {
  const t = useTranslations();

  const demoCards = [
    {
      title: t("demo.login.cta1"),
      description: t("demo.login.card1Text"),
      href: "/demo/asistente" as any,
      button: t("demo.login.card1Cta"),
      icon: MessageSquare,
    },
    {
      title: t("demo.login.card2Cta"),
      description: t("demo.login.card2Text"),
      href: "/demo/viajero" as any,
      button: t("demo.login.card2Cta2"),
      icon: Briefcase,
    },
    {
      title: t("demo.login.card3Cta"),
      description: t("demo.login.card3Text"),
      href: "/demo/admin" as any,
      button: t("demo.login.card3Cta2"),
      icon: Shield,
    },
  ];

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

        <h1 className="mt-6 font-display text-3xl font-medium tracking-tight text-ink md:text-5xl">
          {t("demo.login.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-soft md:text-[18px]">
          {t("demo.login.intro")}
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
      </div>
    </div>
  );
}