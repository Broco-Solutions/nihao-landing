"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAboutCopy, useCredibilityPills } from "@/lib/content-i18n";
import { SectionShell } from "@/components/ui/SectionShell";
import { ConnectionLine } from "@/components/ui/ConnectionLine";

export function AboutTeaserSection() {
  const t = useTranslations();
  const aboutCopy = useAboutCopy();
  const credibilityPills = useCredibilityPills();
  const reduced = useReducedMotion();
  return (
    <SectionShell variant="pattern" ariaLabel="Sobre Nihao" className="py-24 md:py-32">
      <div className="container-page">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-20">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-eyebrow-mark text-nihao">{aboutCopy.eyebrow}</span>
            <h2 className="mt-5 text-display-xl text-balance">{aboutCopy.headline}</h2>
          </motion.div>

          <div className="lg:pt-12">
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-[17px] leading-[1.7] text-ink-soft lg:max-w-[54ch]"
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
              className="mt-8 flex flex-wrap gap-2.5"
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
                {t("about.learnMore")}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-16"
        >
          <ConnectionLine />
        </motion.div>
      </div>
    </SectionShell>
  );
}
