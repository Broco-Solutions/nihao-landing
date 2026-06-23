"use client";

import { motion, useReducedMotion } from "motion/react";
import { aboutCopy, credibilityPills } from "@/lib/content";
import { SectionShell } from "@/components/ui/SectionShell";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function AboutHeroSection() {
  const reduced = useReducedMotion();
  return (
    <SectionShell
      variant="glow-pattern"
      ariaLabel="Sobre Nihao"
      className="pb-16 pt-32 md:pb-20 md:pt-40"
    >
      <div className="container-page">
        <div className="mx-auto max-w-4xl text-center">
          <SectionHeader
            eyebrow={aboutCopy.eyebrow}
            title={aboutCopy.headline}
            align="center"
            decorativeLine
          />

          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mx-auto mt-6 max-w-[64ch] text-[17px] leading-[1.7] text-ink-soft"
          >
            {aboutCopy.intro}
          </motion.p>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mx-auto mt-4 max-w-[64ch] text-[17px] leading-[1.7] text-ink-soft"
          >
            {aboutCopy.introSecond}
          </motion.p>
        </div>

        <motion.div
          initial={reduced ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: 0.08, delayChildren: 0.3 },
            },
          }}
          className="mt-10 flex flex-wrap justify-center gap-3"
        >
          {credibilityPills.map((p) => (
            <motion.span
              key={p}
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="rounded-full border border-line bg-paper px-4 py-2 text-[13px] font-medium text-ink-soft shadow-sm whitespace-nowrap"
            >
              {p}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </SectionShell>
  );
}
