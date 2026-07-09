"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Mail, MessageCircle } from "lucide-react";
import { brand, contactPageCopy } from "@/lib/content";
import { buildWhatsAppLink } from "@/lib/utils";
import { SectionShell } from "@/components/ui/SectionShell";
import { SectionHeader } from "@/components/ui/SectionHeader";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function ContactSection() {
  const reduced = useReducedMotion();
  return (
    <SectionShell
      variant="glow-pattern"
      ariaLabel="Contacto"
      className="py-28 md:py-40"
    >
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <SectionHeader
            eyebrow={contactPageCopy.eyebrow}
            title={contactPageCopy.headline}
            subtitle={contactPageCopy.intro}
            align="center"
            decorativeLine
          />

          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-4 text-[15px] text-ink-faint"
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
              className="group inline-flex h-14 items-center gap-2 rounded-full bg-nihao px-8 text-[15px] font-medium text-white shadow-[0_14px_34px_-10px_#730D0D/0.55] transition-colors hover:bg-nihao-deep"
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
              <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
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
              <InstagramIcon className="h-3.5 w-3.5" />
              {brand.instagram.replace("@", "")}
            </a>
          </motion.div>
        </div>
      </div>
    </SectionShell>
  );
}
