"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { academyPageCopy } from "@/lib/content";
import { buildWhatsAppLink } from "@/lib/utils";
import { SectionShell } from "@/components/ui/SectionShell";

export function AcademyHeroSection() {
  const reduced = useReducedMotion();

  return (
    <SectionShell
      variant="glow-pattern"
      ariaLabel="Nihao Academy"
      className="pb-20 pt-32 md:pb-28 md:pt-40"
    >
      <div className="container-page">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <motion.span
              initial={reduced ? false : { opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-eyebrow-mark text-nihao"
            >
              {academyPageCopy.eyebrow}
            </motion.span>
            <motion.h1
              initial={reduced ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 text-display-xl text-balance"
            >
              {academyPageCopy.headline}
            </motion.h1>
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="mt-5 max-w-[58ch] text-[17px] leading-[1.7] text-ink-soft"
            >
              {academyPageCopy.intro}
            </motion.p>

            <motion.div
              initial={reduced ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="mt-10"
            >
              <a
                href={buildWhatsAppLink(
                  "Hola Nihao, quiero conocer Nihao Academy y los programas de inmersión.",
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex h-14 items-center gap-2 rounded-full bg-nihao px-8 text-[15px] font-medium text-white shadow-[0_14px_34px_-10px_oklch(38%_0.182_25/0.55)] transition-colors hover:bg-nihao-deep"
              >
                {academyPageCopy.cta}
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </motion.div>
          </div>

          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line bg-paper shadow-elevated"
          >
            <Image
              src="/photo-robots.jpeg"
              alt="Programa de inmersión Nihao Academy"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-night/40 to-transparent"
            />
          </motion.div>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-16 rounded-3xl border border-line bg-paper p-8 shadow-soft md:p-12"
        >
          <h2 className="text-center font-display text-[16px] font-medium uppercase tracking-[0.14em] text-ink-mute">
            El programa incluye
          </h2>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {academyPageCopy.pillars.map((p) => (
              <li
                key={p}
                className="flex items-center gap-3 rounded-xl border border-line bg-paper-soft px-4 py-3 text-[14px] font-medium text-ink-soft shadow-sm"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-nihao" />
                {p}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </SectionShell>
  );
}
