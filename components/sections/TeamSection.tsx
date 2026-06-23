"use client";

import { motion, useReducedMotion } from "motion/react";
import { team } from "@/lib/content";
import { SectionShell } from "@/components/ui/SectionShell";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function TeamSection() {
  const reduced = useReducedMotion();
  return (
    <SectionShell variant="paper" ariaLabel="Equipo" className="py-24 md:py-32">
      <div className="container-page">
        <SectionHeader
          eyebrow="Quiénes somos"
          title="Tres profesionales. Un solo objetivo."
          align="center"
          decorativeLine
        />

        <motion.ul
          initial={reduced ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.1 } },
          }}
          className="mt-14 grid gap-5 md:mt-16 md:grid-cols-3"
        >
          {team.map((m) => (
            <motion.li
              key={m.name}
              variants={{
                hidden: { opacity: 0, y: 18 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
              }}
              className="flex flex-col gap-5 rounded-2xl border border-line bg-paper-soft p-7 shadow-card"
            >
              <div className="flex items-center gap-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-nihao text-[22px] shadow-sm">
                  {m.emoji}
                </span>
                <div>
                  <h3 className="font-display text-[20px] font-medium tracking-tight text-ink">
                    {m.name}
                  </h3>
                </div>
              </div>
              <div>
                <p className="font-display text-[16px] font-medium text-nihao">
                  {m.title}
                </p>
                <p className="mt-3 text-[15px] leading-[1.6] text-ink-soft">
                  {m.text}
                </p>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </SectionShell>
  );
}
