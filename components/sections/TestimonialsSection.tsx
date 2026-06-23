"use client";

import { motion, useReducedMotion } from "motion/react";
import { Quote } from "lucide-react";
import { testimonials } from "@/lib/content";
import { SectionShell } from "@/components/ui/SectionShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ConnectionLine } from "@/components/ui/ConnectionLine";

export function TestimonialsSection() {
  const reduced = useReducedMotion();
  return (
    <SectionShell variant="glow-pattern" ariaLabel="Testimonios" className="py-24 md:py-32">
      <div className="container-page">
        <SectionHeader
          eyebrow="Testimonios"
          title="Lo que dicen quienes ya viajaron con nosotras."
          align="center"
          decorativeLine
        />

        <motion.ul
          initial={reduced ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.1 } },
          }}
          className="mt-14 grid gap-5 md:mt-16 md:grid-cols-3"
        >
          {testimonials.map((t, i) => (
            <motion.li
              key={i}
              variants={{
                hidden: { opacity: 0, y: 18 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
              }}
              className="relative flex flex-col gap-5 rounded-2xl border border-line border-t-2 border-t-nihao/30 bg-paper p-7 shadow-card"
            >
              <Quote
                className="h-5 w-5 text-nihao"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="font-display text-[18px] leading-[1.35] tracking-tight text-ink text-balance">
                “{t.quote}”
              </p>
              <div className="mt-auto border-t border-line pt-4 text-[13px] font-medium text-ink-mute">
                {t.name}
              </div>
            </motion.li>
          ))}
        </motion.ul>

        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-16"
        >
          <ConnectionLine />
        </motion.div>
      </div>
    </SectionShell>
  );
}
