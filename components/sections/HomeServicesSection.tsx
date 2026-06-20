"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { homeServices } from "@/lib/content";

export function HomeServicesSection() {
  const reduced = useReducedMotion();
  return (
    <section aria-label="Servicios principales" className="bg-paper-soft py-20 md:py-28">
      <div className="container-page">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="text-eyebrow-mark text-nihao">Servicios</span>
            <h2 className="mt-5 text-display-lg text-balance">
              Criterio, idioma y presencia real.
            </h2>
          </div>
          <Link
            href="/servicios"
            className="group inline-flex h-11 items-center gap-2 rounded-full border border-line bg-paper px-5 text-[13px] font-medium text-ink transition-colors hover:border-nihao hover:text-nihao"
          >
            Ver todos los servicios
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <motion.ul
          initial={reduced ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
          }}
          className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {homeServices.map((s) => (
            <motion.li
              key={s.id}
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
              }}
            >
              <Link
                href={`/servicios#${s.id}`}
                className="group flex h-full flex-col justify-between gap-6 rounded-2xl border border-line bg-paper p-6 transition-all hover:border-nihao/30 hover:shadow-card"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-paper text-nihao transition-all group-hover:border-nihao group-hover:bg-nihao group-hover:text-white">
                  <s.icon className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <div>
                  <h3 className="font-display text-[18px] font-medium leading-[1.25] tracking-tight text-ink">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-[1.55] text-ink-soft">
                    {s.shortText}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium tracking-tight text-ink-mute transition-colors group-hover:text-nihao">
                  Ver más
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
