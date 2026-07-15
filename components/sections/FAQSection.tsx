"use client";

import { motion, useReducedMotion } from "motion/react";
import { Plus, Minus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFaqs, useFaqCopy } from "@/lib/content-i18n";
import { cn } from "@/lib/utils";

export function FAQSection() {
  const t = useTranslations();
  const faqs = useFaqs();
  const faqCopy = useFaqCopy();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section aria-label={t("faq.ariaLabel")} className="bg-paper-soft py-20 md:py-28">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-eyebrow-mark text-nihao">{faqCopy.eyebrow}</span>
          <h2 className="mt-5 text-display-lg text-balance">{faqCopy.headline}</h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-ink-soft">
            {faqCopy.intro}
          </p>
        </div>

        <motion.ul
          initial={reduced ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
          }}
          className="mt-12 mx-auto max-w-3xl"
        >
          {faqs.map((f, i) => (
            <motion.li
              key={i}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="border-b border-line"
            >
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left"
              >
                <span className="font-display text-[17px] font-medium tracking-tight text-ink md:text-[18px]">
                  {f.q}
                </span>
                <span
                  className={cn(
                    "flex h-8 w-8 flex-none items-center justify-center rounded-full border border-line bg-paper text-ink-mute transition-colors",
                    open === i && "border-nihao bg-nihao text-white",
                  )}
                >
                  {open === i ? (
                    <Minus className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <Plus className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </span>
              </button>
              <div
                className={cn(
                  "grid transition-all duration-300 ease-out",
                  open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="overflow-hidden">
                  <p className="pb-5 text-[15.5px] leading-[1.65] text-ink-soft">
                    {f.a}
                  </p>
                </div>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
