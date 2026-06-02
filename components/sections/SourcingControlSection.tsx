"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { sourcingFlow, whatsappIntents } from "@/lib/content";

export function SourcingControlSection() {
  const reduced = useReducedMotion();
  return (
    <section
      id="sourcing"
      aria-label="Sourcing y control"
      className="relative bg-paper py-24 md:py-32"
    >
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="text-eyebrow-mark text-nihao">Sourcing & control</span>
          <h2 className="mt-5 text-display-lg text-balance">
            Del proveedor al contenedor: reducimos riesgos en cada etapa.
          </h2>
          <p className="mt-5 max-w-[58ch] text-[16px] leading-[1.65] text-ink-soft">
            Buscar un proveedor es solo el comienzo. Nihao puede acompañarte en
            la validación, negociación, muestras, auditorías, inspecciones pre
            embarque y supervisión de carga para que tomes decisiones con más
            información y menos incertidumbre.
          </p>
        </div>

        <div className="relative mt-16 md:mt-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-0 hidden lg:block"
            style={{ top: "2.25rem" }}
          >
            <div className="h-px w-full bg-gradient-to-r from-transparent via-ink-faint/60 to-transparent" />
          </div>

          <motion.ol
            initial={reduced ? false : "hidden"}
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08 } },
            }}
            className="relative grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8"
          >
            {sourcingFlow.map((s, i) => (
              <motion.li
                key={s.label}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
                }}
                className="group relative"
              >
                <div className="relative z-10 flex h-full flex-col gap-3 rounded-2xl border border-line bg-paper p-5 transition-all duration-500 hover:border-nihao/30 hover:shadow-soft">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[11px] font-medium tracking-[0.18em] text-ink-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-nihao-soft text-nihao transition-colors group-hover:bg-nihao group-hover:text-white">
                      <s.icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                  </div>
                  <p className="font-display text-[15px] font-medium leading-[1.25] text-ink">
                    {s.label}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 z-20 hidden h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-nihao/70 transition-all duration-500 group-hover:scale-125 group-hover:bg-nihao lg:block"
                  style={{ top: "2.25rem" }}
                />
              </motion.li>
            ))}
          </motion.ol>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-14 flex flex-col items-start justify-between gap-6 rounded-2xl border border-line bg-paper-warm p-6 md:flex-row md:items-center md:p-8"
        >
          <p className="max-w-[55ch] text-[15.5px] leading-[1.6] text-ink-soft">
            ¿Necesitás validar un proveedor antes de avanzar con un pedido
            grande? Coordinamos auditorías e inspecciones adaptadas al tipo de
            producto, volumen y urgencia.
          </p>
          <a
            href={whatsappIntents.audit}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex h-12 flex-none items-center gap-2 rounded-full bg-ink px-5 text-[13.5px] font-medium text-paper transition-colors hover:bg-night-soft"
          >
            Quiero solicitar una auditoría
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
