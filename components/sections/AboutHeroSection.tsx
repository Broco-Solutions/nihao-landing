"use client";

import { motion, useReducedMotion } from "motion/react";
import { aboutCopy, credibilityPills } from "@/lib/content";

export function AboutHeroSection() {
  const reduced = useReducedMotion();
  return (
    <section
      aria-label="Sobre Nihao"
      className="relative bg-paper pb-12 pt-32 md:pb-16 md:pt-40"
    >
      <div className="container-page">
        <div className="mx-auto max-w-4xl text-center">
          <motion.span
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-eyebrow-mark text-nihao"
          >
            {aboutCopy.eyebrow}
          </motion.span>
          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 text-display-xl text-balance"
          >
            {aboutCopy.headline}
          </motion.h1>
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
                className="rounded-full border border-line bg-paper-soft px-4 py-2 text-[13px] font-medium text-ink-soft whitespace-nowrap"
              >
                {p}
              </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
