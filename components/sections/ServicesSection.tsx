"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { services, whatsappIntents } from "@/lib/content";

export function ServicesSection() {
  const reduced = useReducedMotion();
  return (
    <section
      id="servicios"
      aria-label="Servicios"
      className="relative bg-paper-soft py-24 md:py-32"
    >
      <div className="container-page">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="text-eyebrow-mark text-nihao">Servicios</span>
            <h2 className="mt-5 text-display-lg text-balance">
              Servicios para cada etapa de tu negocio con China.
            </h2>
          </div>
          <p className="max-w-md text-[15.5px] leading-[1.65] text-ink-soft md:text-right">
            Desde la preparación del viaje hasta la validación de proveedores,
            auditorías, negociación y seguimiento operativo. No contratás
            paquetes, contratás criterio.
          </p>
        </div>

        <motion.ul
          initial={reduced ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
          }}
          className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:mt-20 md:grid-cols-3"
        >
          {services.map((s, i) => (
            <motion.li
              key={s.title}
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
              }}
              className="group relative bg-paper p-7 transition-colors duration-500 hover:bg-paper md:p-8"
            >
              <div className="flex items-start justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-paper text-nihao transition-all duration-500 group-hover:border-nihao group-hover:bg-nihao group-hover:text-white">
                  <s.icon className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <span className="font-display text-[11px] font-medium tracking-[0.18em] text-ink-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-6 font-display text-[18.5px] font-medium leading-[1.25] tracking-tight text-ink">
                {s.title}
              </h3>
              <p className="mt-3 text-[14.5px] leading-[1.6] text-ink-soft">
                {s.description}
              </p>
              <a
                href={whatsappIntents.general}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] font-medium tracking-tight text-ink-mute transition-colors group-hover:text-nihao"
              >
                Consultar por este servicio
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
