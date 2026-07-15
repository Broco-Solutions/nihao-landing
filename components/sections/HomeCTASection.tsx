"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/utils";

export function HomeCTASection() {
  const reduced = useReducedMotion();
  return (
    <section
      aria-label="Contacto"
      className="relative overflow-hidden bg-night py-20 text-paper md:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, #931111 0%, transparent 40%), radial-gradient(circle at 80% 80%, #C49330 0%, transparent 35%)",
        }}
      />
      <div className="container-page relative">
        <div className="mx-auto max-w-3xl text-center">
          <motion.h2
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-display-lg text-balance"
          >
            El primer paso es contarnos qué necesitás.
          </motion.h2>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-5 text-[17px] leading-[1.65] text-paper/75"
          >
            Sin compromiso. Solo una conversación por WhatsApp.
          </motion.p>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-9"
          >
            <a
              href={buildWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-14 items-center gap-2 rounded-full bg-paper px-8 text-[15px] font-medium text-nihao shadow-[0_14px_34px_-10px_oklch(20%_0.02_30/0.35)] transition-colors hover:bg-paper-warm"
            >
              Contactate con nosotras
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
