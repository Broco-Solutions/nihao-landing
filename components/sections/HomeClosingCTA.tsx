"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { leadCTA, whatsappIntents } from "@/lib/content";
import { SectionShell } from "@/components/ui/SectionShell";
import { SectionHeader } from "@/components/ui/SectionHeader";

export function HomeClosingCTA() {
  const reduced = useReducedMotion();
  return (
    <SectionShell
      variant="paper"
      ariaLabel="Primera llamada gratis"
      className="py-24 md:py-32"
    >
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <SectionHeader
            eyebrow={leadCTA.eyebrow}
            title={leadCTA.headline}
            subtitle={leadCTA.intro}
            align="center"
            decorativeLine
          />

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-10"
          >
            <a
              href={whatsappIntents.freeCall}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-14 items-center gap-2 rounded-full bg-nihao px-8 text-[15px] font-medium text-white shadow-[0_14px_34px_-10px_oklch(38%_0.182_25/0.55)] transition-colors hover:bg-nihao-deep"
            >
              {leadCTA.cta}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </motion.div>

          <motion.p
            initial={reduced ? false : { opacity: 0 } }
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-4 text-[13px] text-ink-faint"
          >
            Sin compromiso. Respondemos rápido.
          </motion.p>
        </div>
      </div>
    </SectionShell>
  );
}
