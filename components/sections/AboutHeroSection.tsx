"use client";

import { motion, useReducedMotion } from "motion/react";
import { useAboutCopy, useCredibilityPills } from "@/lib/content-i18n";
import { SectionShell } from "@/components/ui/SectionShell";
import { ConnectionLine } from "@/components/ui/ConnectionLine";
import { useTranslations } from "next-intl";

export function AboutHeroSection() {
  const t = useTranslations();
  const reduced = useReducedMotion();
  const aboutCopy = useAboutCopy();
  const credibilityPills = useCredibilityPills();
  return (
    <SectionShell
      variant="glow-pattern"
      ariaLabel={t("a11y.aboutNihao")}
      className="pb-16 pt-32 md:pb-20 md:pt-40"
    >
      <div className="container-page">
        <div className="grid items-end gap-10 lg:grid-cols-2 lg:gap-20">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-eyebrow-mark text-nihao">{aboutCopy.eyebrow}</span>
            <h1 className="mt-6 text-display-xl text-balance">{aboutCopy.headline}</h1>
          </motion.div>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="lg:pb-3"
          >
            <p className="text-[17px] leading-[1.7] text-ink-soft">
              {aboutCopy.intro}
            </p>
            <p className="mt-4 text-[17px] leading-[1.7] text-ink-soft">
              {aboutCopy.introSecond}
            </p>
          </motion.div>
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
          className="mt-12 flex flex-wrap justify-center gap-3"
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
          initial={reduced ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-14"
        >
          <ConnectionLine />
        </motion.div>
      </div>
    </SectionShell>
  );
}
