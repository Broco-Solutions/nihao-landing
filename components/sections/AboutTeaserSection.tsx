"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { aboutCopy, credibilityPills } from "@/lib/content";

export function AboutTeaserSection() {
  const reduced = useReducedMotion();
  return (
    <section
      aria-label="Sobre Nihao"
      className="relative bg-paper py-20 md:py-28"
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
          <motion.h2
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 text-display-lg text-balance"
          >
            {aboutCopy.headline}
          </motion.h2>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mx-auto mt-5 max-w-[64ch] text-[17px] leading-[1.7] text-ink-soft"
          >
            {aboutCopy.intro}
          </motion.p>

          <motion.div
            initial={reduced ? false : "hidden"}
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            variants={{
              hidden: {},
              visible: {
                transition: { staggerChildren: 0.08, delayChildren: 0.2 },
              },
            }}
            className="mt-8 flex flex-wrap justify-center gap-2"
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

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-8"
          >
            <Link
              href="/sobre-nihao"
              className="group inline-flex items-center gap-2 text-[14px] font-medium text-nihao"
            >
              Conocer más sobre nosotras
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
