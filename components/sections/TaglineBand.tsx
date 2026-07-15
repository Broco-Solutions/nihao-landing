"use client";

import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";

export function TaglineBand() {
  const t = useTranslations();
  const reduced = useReducedMotion();
  return (
    <section className="relative overflow-hidden bg-nihao py-16 md:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 80% 20%, oklch(100% 0 0) 0%, transparent 40%)",
        }}
      />
      <div className="container-page relative">
        <motion.h2
          initial={reduced ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-center font-display text-[clamp(2.5rem,7vw,5.5rem)] font-medium leading-[0.95] tracking-tight text-paper text-balance"
        >
          {t("brand.slogan")}
        </motion.h2>
      </div>
    </section>
  );
}
