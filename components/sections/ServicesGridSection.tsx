"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { serviceDetails, servicesPageCopy } from "@/lib/content";
import type { ServiceDetail } from "@/lib/content";
import { ServiceDrawer } from "./ServiceDrawer";

export function ServicesGridSection() {
  const [selected, setSelected] = useState<ServiceDetail | null>(null);
  const reduced = useReducedMotion();

  return (
    <section
      aria-label="Servicios"
      className="relative bg-paper py-20 md:py-28"
    >
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-eyebrow-mark text-nihao">
            {servicesPageCopy.eyebrow}
          </span>
          <h1 className="mt-5 text-display-lg text-balance">
            {servicesPageCopy.headline}
          </h1>
          <p className="mt-5 text-[17px] leading-[1.65] text-ink-soft">
            {servicesPageCopy.intro}
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
          className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {serviceDetails.map((s) => (
            <motion.li
              key={s.id}
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
              }}
              id={s.id}
            >
              <button
                type="button"
                onClick={() => setSelected(s)}
                className="group flex h-full w-full flex-col justify-between gap-6 rounded-2xl border border-line bg-paper-soft p-6 text-left transition-all hover:border-nihao/30 hover:bg-paper hover:shadow-card"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-paper text-nihao transition-all group-hover:border-nihao group-hover:bg-nihao group-hover:text-white">
                  <s.icon className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <div>
                  <h2 className="font-display text-[18px] font-medium leading-[1.25] tracking-tight text-ink">
                    {s.title}
                  </h2>
                  <p className="mt-2 text-[14px] leading-[1.55] text-ink-soft">
                    {s.headline}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium tracking-tight text-ink-mute transition-colors group-hover:text-nihao">
                  Ver más
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </button>
            </motion.li>
          ))}
        </motion.ul>
      </div>

      <ServiceDrawer service={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
