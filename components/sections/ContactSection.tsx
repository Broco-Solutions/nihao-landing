"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Mail, AtSign } from "lucide-react";
import { brand, contactPageCopy } from "@/lib/content";
import { buildWhatsAppLink } from "@/lib/utils";

export function ContactSection() {
  const reduced = useReducedMotion();
  return (
    <section
      aria-label="Contacto"
      className="relative overflow-hidden bg-paper-soft py-24 md:py-36"
    >
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <motion.span
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-eyebrow-mark text-nihao"
          >
            {contactPageCopy.eyebrow}
          </motion.span>
          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 text-display-xl text-balance"
          >
            {contactPageCopy.headline}
          </motion.h1>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-5 text-[18px] leading-[1.65] text-ink-soft"
          >
            {contactPageCopy.intro}
          </motion.p>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-2 text-[15px] text-ink-faint"
          >
            {contactPageCopy.sub}
          </motion.p>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-10"
          >
            <a
              href={buildWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-14 items-center gap-2 rounded-full bg-nihao px-8 text-[15px] font-medium text-white shadow-[0_14px_34px_-10px_oklch(38%_0.182_25/0.55)] transition-colors hover:bg-nihao-deep"
            >
              {contactPageCopy.cta}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </motion.div>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4 text-[14.5px] text-ink-mute"
          >
            <a
              href={buildWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 hover:text-nihao"
            >
              <span className="text-[12px] uppercase tracking-wider">WA</span>
              {brand.whatsapp}
            </a>
            <a
              href={`mailto:${brand.email}`}
              className="inline-flex items-center gap-2 hover:text-nihao"
            >
              <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
              {brand.email}
            </a>
            <a
              href={`https://instagram.com/${brand.instagram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 hover:text-nihao"
            >
              <AtSign className="h-3.5 w-3.5" strokeWidth={1.5} />
              {brand.instagram}
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
