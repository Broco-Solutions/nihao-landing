"use client";

import { motion, useReducedMotion } from "motion/react";
import { Quote } from "lucide-react";
import { testimonials } from "@/lib/content";

export function TestimonialsSection() {
  const reduced = useReducedMotion();
  return (
    <section
      aria-label="Testimonios"
      className="relative bg-paper py-20 md:py-28"
    >
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-eyebrow-mark text-nihao">Testimonios</span>
          <h2 className="mt-5 text-display-lg text-balance">
            Lo que dicen quienes ya viajaron con nosotras.
          </h2>
          <p className="mt-4 text-[14px] text-ink-faint">
            Placeholders provisorios. Pronto reemplazamos por testimonios reales.
          </p>
        </div>

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
              className="relative flex flex-col gap-5 rounded-2xl border border-dashed border-line bg-paper-soft p-7"
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
      </div>
    </section>
  );
}
