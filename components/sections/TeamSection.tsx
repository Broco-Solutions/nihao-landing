"use client";

import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useTeam } from "@/lib/content-i18n";
import { SectionShell } from "@/components/ui/SectionShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ConnectionLine } from "@/components/ui/ConnectionLine";

export function TeamSection() {
  const t = useTranslations();
  const team = useTeam();
  const reduced = useReducedMotion();
  return (
    <SectionShell variant="paper" ariaLabel={t("a11y.team")} className="py-24 md:py-32">
      <div className="container-page">
        <SectionHeader
          eyebrow={t("team.eyebrow")}
          title={t("team.title")}
          align="center"
          decorativeLine
        />

        <div className="mt-14 md:mt-16">
          <div className="hidden justify-center md:flex">
            <ConnectionLine className="w-full max-w-2xl" />
          </div>

          <motion.ul
            initial={reduced ? false : "hidden"}
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.1 } },
            }}
            className="mt-6 grid gap-5 md:grid-cols-3"
          >
            {team.map((m) => (
              <motion.li
                key={m.name}
                variants={{
                  hidden: { opacity: 0, y: 18 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
                }}
                className="relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-line border-l-4 border-l-nihao/30 bg-paper-soft p-7 shadow-card"
              >
                <div className="absolute -right-3 -top-4 font-display text-[5rem] font-medium leading-none text-nihao/[0.04]">
                  {m.emoji}
                </div>
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
      </div>
    </SectionShell>
  );
}
