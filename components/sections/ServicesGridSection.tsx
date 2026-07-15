"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { services, servicesPageCopy } from "@/lib/content";
import type { ServiceItem } from "@/lib/content";
import { ServiceDrawer } from "./ServiceDrawer";
import { SectionShell } from "@/components/ui/SectionShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ConnectionLine } from "@/components/ui/ConnectionLine";

function ServiceCard({
  service,
  onSelect,
}: {
  service: ServiceItem;
  onSelect: (s: ServiceItem) => void;
}) {
  const isLink = Boolean(service.href);
  const className =
    "group relative flex h-full w-full flex-col justify-between gap-6 overflow-hidden rounded-2xl border border-line bg-paper p-7 text-left shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-nihao/20 hover:bg-paper-soft hover:shadow-elevated md:p-8";

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
        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
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
    <button type="button" onClick={() => onSelect(service)} className={className}>
      {content}
    </button>
  );
}

function SecondaryServiceCard({ service }: { service: ServiceItem }) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-line bg-paper p-6 shadow-soft transition-shadow hover:shadow-card">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-paper-soft text-nihao">
        <service.icon className="h-4 w-4" strokeWidth={1.5} />
      </span>
      <div>
        <h3 className="font-display text-[16px] font-medium leading-[1.25] tracking-tight text-ink">
          {service.title}
        </h3>
        <p className="mt-1 text-[14px] leading-[1.55] text-ink-soft">
          {service.shortText}
        </p>
      </div>
    </div>
  );
}

export function ServicesGridSection() {
  const [selected, setSelected] = useState<ServiceItem | null>(null);
  const reduced = useReducedMotion();

  const principal = services.filter((s) => s.category === "principal");
  const others = services.filter((s) => s.category === "otro");
  const othersTop = others.slice(0, 3);
  const othersBottom = others.slice(3);

  return (
    <SectionShell
      variant="glow-pattern"
      ariaLabel="Servicios"
      className="py-24 md:py-32"
    >
      <div className="container-page relative">
        <SectionHeader
          eyebrow={servicesPageCopy.eyebrow}
          title={servicesPageCopy.headline}
          subtitle={servicesPageCopy.intro}
          align="center"
          decorativeLine
        />

        <div className="mt-16">
          <h2 className="text-center font-display text-[16px] font-medium uppercase tracking-[0.14em] text-ink-mute">
            Servicios principales
          </h2>
          <motion.ul
            initial={reduced ? false : "hidden"}
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            variants={{
              hidden: {},
              visible: {
                transition: { staggerChildren: 0.08, delayChildren: 0.1 },
              },
            }}
            className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {principal.map((s) => (
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
                id={s.id}
              >
                <ServiceCard service={s} onSelect={setSelected} />
              </motion.li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mx-auto my-14 max-w-xs"
        >
          <ConnectionLine />
        </motion.div>

        <div className="rounded-3xl border border-line bg-paper p-8 shadow-soft md:p-12">
          <h2 className="text-center font-display text-[16px] font-medium uppercase tracking-[0.14em] text-ink-mute">
            Otros servicios
          </h2>
          <div className="mt-7">
            <motion.ul
              initial={reduced ? false : "hidden"}
              whileInView="visible"
              viewport={{ once: true, amount: 0.1 }}
              variants={{
                hidden: {},
                visible: {
                  transition: { staggerChildren: 0.06, delayChildren: 0.1 },
                },
              }}
              className="flex flex-wrap justify-center gap-5"
            >
              {othersTop.map((s) => (
                <motion.li
                  key={s.id}
                  variants={{
                    hidden: { opacity: 0, y: 14 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.55 },
                    },
                  }}
                  className="w-full sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.875rem)]"
                >
                  <SecondaryServiceCard service={s} />
                </motion.li>
              ))}
            </motion.ul>

            <motion.ul
              initial={reduced ? false : "hidden"}
              whileInView="visible"
              viewport={{ once: true, amount: 0.1 }}
              variants={{
                hidden: {},
                visible: {
                  transition: { staggerChildren: 0.06, delayChildren: 0.1 },
                },
              }}
              className="mt-5 flex flex-wrap justify-center gap-5"
            >
              {othersBottom.map((s) => (
                <motion.li
                  key={s.id}
                  variants={{
                    hidden: { opacity: 0, y: 14 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.55 },
                    },
                  }}
                  className="w-full sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.875rem)]"
                >
                  <SecondaryServiceCard service={s} />
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </div>
      </div>

      <ServiceDrawer service={selected} onClose={() => setSelected(null)} />
    </SectionShell>
  );
}
