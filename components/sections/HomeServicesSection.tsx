"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { principalServices } from "@/lib/content";
import type { ServiceItem } from "@/lib/content";
import { ServiceDrawer } from "./ServiceDrawer";
import { SectionShell } from "@/components/ui/SectionShell";
import { SectionHeader } from "@/components/ui/SectionHeader";

function PrincipalCard({
  service,
  onSelect,
}: {
  service: ServiceItem;
  onSelect: (s: ServiceItem) => void;
}) {
  const isLink = Boolean(service.href);
  const className =
    "group flex h-full flex-col justify-between gap-6 rounded-2xl border border-line bg-paper p-7 text-left shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-nihao/20 hover:bg-paper-soft hover:shadow-elevated md:p-8";

  const content = (
    <>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-paper-soft text-nihao transition-all duration-300 group-hover:border-nihao group-hover:bg-nihao group-hover:text-white md:h-14 md:w-14">
        <service.icon
          className="h-5 w-5 transition-transform duration-300 group-hover:scale-105 md:h-6 md:w-6"
          strokeWidth={1.5}
        />
      </span>
      <div>
        <h3 className="font-display text-[19px] font-medium leading-[1.2] tracking-tight text-ink md:text-[20px]">
          {service.title}
        </h3>
        {(service.headline || service.shortText) ? (
          <p className="mt-2.5 text-[15px] leading-[1.6] text-ink-soft">
            {service.headline || service.shortText}
          </p>
        ) : null}
      </div>
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium tracking-tight text-ink-mute transition-colors group-hover:text-nihao">
        {isLink ? "Ver programa" : "Ver más"}
        {isLink ? (
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        ) : (
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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
      className={className}
    >
      {content}
    </button>
  );
}

export function HomeServicesSection() {
  const [selected, setSelected] = useState<ServiceItem | null>(null);
  const reduced = useReducedMotion();

  return (
    <SectionShell
      variant="glow-pattern"
      ariaLabel="Servicios principales"
      className="py-24 md:py-32"
    >
      <div className="container-page">
        <SectionHeader
          eyebrow="Servicios"
          title="Criterio, idioma y presencia real."
          align="center"
          decorativeLine
        />

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
          className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {principalServices.map((s) => (
            <motion.li
              key={s.id}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.6 },
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
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-nihao px-7 text-[14px] font-medium text-white shadow-[0_14px_34px_-10px_#730D0D/0.55] transition-colors hover:bg-nihao-deep"
          >
            Ver todos los servicios
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </div>

      <ServiceDrawer service={selected} onClose={() => setSelected(null)} />
    </SectionShell>
  );
}
