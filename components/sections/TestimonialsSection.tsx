"use client";

import { motion, useReducedMotion } from "motion/react";
import { Quote } from "lucide-react";
import { testimonials } from "@/lib/content";

export function TestimonialsSection() {
  const reduced = useReducedMotion();
  return (
    <section
      id="testimonios"
      aria-label="Testimonios"
      className="relative bg-paper py-24 md:py-32"
    >
      <div className="container-page">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="text-eyebrow-mark text-nihao">Testimonios</span>
            <h2 className="mt-5 text-display-lg text-balance">
              Lo que más destacan nuestros clientes: claridad, confianza y
              acompañamiento.
            </h2>
          </div>
          <p className="max-w-sm text-[13px] leading-[1.55] text-ink-faint">
            Placeholders editables. Reemplazar con testimonios reales cuando
            estén disponibles.
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
          className="mt-14 grid gap-5 md:mt-20 md:grid-cols-3"
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
              <div className="mt-auto flex items-center gap-3 border-t border-line pt-4 text-[12.5px] text-ink-mute">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-nihao-soft font-display text-[11px] font-medium text-nihao">
                  {t.name.charAt(0)}
                </span>
                {t.name}
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
