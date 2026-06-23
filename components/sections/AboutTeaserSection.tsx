"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { aboutCopy, credibilityPills } from "@/lib/content";
import { SectionShell } from "@/components/ui/SectionShell";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function AboutTeaserSection() {
  const reduced = useReducedMotion();
  return (
    <SectionShell variant="pattern" ariaLabel="Sobre Nihao" className="py-24 md:py-32">
      <div className="container-page">
        <div className="mx-auto max-w-4xl text-center">
          <SectionHeader
            eyebrow={aboutCopy.eyebrow}
            title={aboutCopy.headline}
            subtitle={aboutCopy.intro}
            align="center"
            decorativeLine
          />

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
            className="mt-10 flex flex-wrap justify-center gap-2.5"
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

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-10"
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
    </SectionShell>
  );
}
