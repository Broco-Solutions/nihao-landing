"use client";

import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Check } from "lucide-react";
import { differentiators } from "@/lib/content";

export function DifferentiatorsSection() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const imgY = useTransform(scrollYProgress, [0, 1], ["8%", "-10%"]);

  return (
    <section
      ref={ref}
      id="diferencial"
      aria-label="Diferencial Nihao"
      className="relative overflow-hidden bg-paper-warm py-24 md:py-32"
    >
      <div className="container-page grid gap-12 md:grid-cols-12 md:gap-16">
        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="md:col-span-5"
        >
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-line bg-paper">
            <motion.div
              aria-hidden
              className="absolute inset-0"
              style={{ y: reduced ? 0 : imgY, scale: 1.15 }}
            >
              <Image
                src="/photo-empresa.jpeg"
                alt="Equipo Nihao en visita empresarial"
                fill
                sizes="(min-width: 768px) 40vw, 100vw"
                className="object-cover"
              />
            </motion.div>
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, oklch(16% 0.012 30 / 0.05) 0%, oklch(16% 0.012 30 / 0.5) 100%)",
              }}
            />
            <div className="absolute inset-x-5 bottom-5 flex flex-col gap-1.5 rounded-xl border border-paper/10 bg-night/40 p-4 backdrop-blur-md">
              <span className="text-[10.5px] uppercase tracking-[0.18em] text-gold">
                Quiénes estamos detrás
              </span>
              <p className="font-display text-[15px] leading-[1.3] text-paper text-balance">
                Dos profesionales con experiencia real viviendo y trabajando
                en China.
              </p>
            </div>
          </div>
        </motion.div>

        <div className="md:col-span-7">
          <motion.span
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-eyebrow-mark text-nihao"
          >
            El diferencial
          </motion.span>
          <motion.h2
            initial={reduced ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7 }}
            className="mt-5 text-display-lg text-balance"
          >
            No solo conocemos China. Sabemos cómo moverse, negociar y
            conectar culturas.
          </motion.h2>

          <ul className="mt-10 flex flex-col gap-1">
            {differentiators.map((d, i) => (
              <motion.li
                key={i}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className="flex items-start gap-4 border-b border-line/80 py-4"
              >
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-nihao-soft text-nihao">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <span className="text-[15.5px] leading-[1.55] text-ink-soft">
                  {d}
                </span>
              </motion.li>
            ))}
          </ul>

          <motion.p
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-10 max-w-[44ch] font-display text-[20px] font-medium leading-[1.3] tracking-tight text-ink"
          >
            Te ayudamos a entender China antes de tomar decisiones
            importantes.
          </motion.p>
        </div>
      </div>
    </section>
  );
}
