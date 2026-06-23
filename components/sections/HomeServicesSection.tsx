"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { principalServices } from "@/lib/content";
import type { ServiceItem } from "@/lib/content";
import { ServiceDrawer } from "./ServiceDrawer";

function PrincipalCard({
  service,
  onSelect,
}: {
  service: ServiceItem;
  onSelect: (s: ServiceItem) => void;
}) {
  const isLink = Boolean(service.href);
  const className =
    "group flex h-full flex-col justify-between gap-6 rounded-2xl border border-line bg-paper p-6 transition-all hover:border-nihao/30 hover:shadow-card";

  const content = (
    <>
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-paper text-nihao transition-all group-hover:border-nihao group-hover:bg-nihao group-hover:text-white">
        <service.icon className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <div>
        <h3 className="font-display text-[18px] font-medium leading-[1.25] tracking-tight text-ink">
          {service.title}
        </h3>
        <p className="mt-2 text-[14px] leading-[1.55] text-ink-soft">
          {service.headline ?? service.shortText}
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium tracking-tight text-ink-mute transition-colors group-hover:text-nihao">
        {isLink ? "Ver programa" : "Ver más"}
        {isLink ? (
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        ) : (
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        )}
      </span>
    </>
  );

  if (isLink) {
    return (
      <Link href={service.href!} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(service)}
      className={`${className} text-left`}
    >
      {content}
    </button>
  );
}

export function HomeServicesSection() {
  const [selected, setSelected] = useState<ServiceItem | null>(null);
  const reduced = useReducedMotion();

  return (
    <section
      aria-label="Servicios principales"
      className="bg-paper-soft py-20 md:py-28"
    >
      <div className="container-page">
        <div className="max-w-2xl">
          <span className="text-eyebrow-mark text-nihao">Servicios</span>
          <h2 className="mt-5 text-display-lg text-balance">
            Criterio, idioma y presencia real.
          </h2>
        </div>

        <motion.ul
          initial={reduced ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: 0.08, delayChildren: 0.1 },
            },
          }}
          className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {principalServices.map((s) => (
            <motion.li
              key={s.id}
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.55 },
                },
              }}
            >
              <PrincipalCard service={s} onSelect={setSelected} />
            </motion.li>
          ))}
        </motion.ul>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-12 flex justify-center"
        >
          <Link
            href="/servicios"
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-nihao px-7 text-[14px] font-medium text-white shadow-[0_14px_34px_-10px_oklch(38%_0.182_25/0.55)] transition-colors hover:bg-nihao-deep"
          >
            Ver todos los servicios
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </div>

      <ServiceDrawer service={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
