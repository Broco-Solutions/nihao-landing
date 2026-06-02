"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Globe2, Smartphone, Banknote, Users2, MessageSquare, Compass } from "lucide-react";
import { whatsappIntents } from "@/lib/content";

const topics = [
  { icon: MessageSquare, label: "WeChat" },
  { icon: Smartphone, label: "Alipay" },
  { icon: Banknote, label: "Medios de pago" },
  { icon: Compass, label: "Cultura de negocios" },
  { icon: Users2, label: "Estrategia de negociación" },
  { icon: Globe2, label: "Ferias y reuniones" },
];

export function WorkshopsSection() {
  const reduced = useReducedMotion();
  return (
    <section
      id="webinars"
      aria-label="Webinars y workshops"
      className="relative bg-paper py-24 md:py-32"
    >
      <div className="container-page grid gap-12 md:grid-cols-12 md:gap-16">
        <div className="md:col-span-6">
          <span className="text-eyebrow-mark text-nihao">Workshops</span>
          <h2 className="mt-5 text-display-lg text-balance">
            China funciona diferente. Nosotras te ayudamos a entenderla.
          </h2>
          <p className="mt-5 max-w-[55ch] text-[16px] leading-[1.65] text-ink-soft">
            Capacitaciones prácticas para llegar preparado: WeChat, Alipay,
            herramientas digitales, medios de pago, cultura de negocios,
            estrategias de negociación y claves para aprovechar ferias,
            reuniones y viajes comerciales.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            {topics.map((t) => (
              <span
                key={t.label}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-paper-soft px-3.5 py-1.5 text-[13px] font-medium text-ink-soft"
              >
                <t.icon className="h-3.5 w-3.5 text-nihao" strokeWidth={1.75} />
                {t.label}
              </span>
            ))}
          </div>

          <a
            href={whatsappIntents.workshop}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-10 inline-flex h-12 items-center gap-2 rounded-full border border-ink bg-transparent px-5 text-[14px] font-medium text-ink transition-colors hover:bg-ink hover:text-paper"
          >
            Quiero prepararme antes de viajar
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="md:col-span-6"
        >
          <div className="relative overflow-hidden rounded-2xl border border-line bg-paper-soft p-7 md:p-10">
            <div
              aria-hidden
              className="absolute inset-0 opacity-50"
              style={{
                background:
                  "radial-gradient(circle at 80% 0%, oklch(48% 0.214 25 / 0.10) 0%, transparent 50%)",
              }}
            />
            <div className="relative">
              <p className="text-eyebrow text-ink-mute">Modalidad</p>
              <h3 className="mt-3 font-display text-[26px] font-medium leading-[1.2] tracking-tight text-ink md:text-[30px]">
                Workshops cortos, aplicables, dictados por quienes lo viven.
              </h3>
              <ul className="mt-7 flex flex-col gap-3 text-[14.5px] text-ink-soft">
                {[
                  "Grupos reducidos y casos reales.",
                  "Material descargable y plantillas.",
                  "Acceso a Nihao para dudas puntuales.",
                  "Modalidad online y presencial en Rosario.",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2.5">
                    <span className="mt-2 h-1 w-1 flex-none rounded-full bg-nihao" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
