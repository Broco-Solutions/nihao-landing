"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Check } from "lucide-react";

const risks = [
  "Evitá proveedores poco confiables.",
  "Llegá preparado a ferias y reuniones.",
  "Reduci riesgos antes de comprar o producir.",
  "Entendé cómo negociar en otro contexto cultural.",
  "Aprovechá mejor tu tiempo en China.",
];

export function ProblemSection() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const imgY = useTransform(scrollYProgress, [0, 1], ["8%", "-12%"]);

  return (
    <section
      ref={ref}
      id="problema"
      aria-label="Problema y oportunidad"
      className="relative overflow-hidden bg-paper-soft py-24 md:py-32"
    >
      <div className="container-page grid gap-12 md:grid-cols-12 md:gap-16">
        <div className="md:col-span-7">
          <motion.span
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-eyebrow-mark text-nihao"
          >
            Contexto
          </motion.span>
          <motion.h2
            initial={reduced ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 text-display-lg text-balance"
          >
            China puede abrirte oportunidades enormes. Pero ir sin guía puede
            costarte caro.
          </motion.h2>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-6 max-w-[60ch] text-[16px] leading-[1.65] text-ink-soft"
          >
            Encontrar proveedores confiables, entender condiciones comerciales,
            negociar, validar fábricas, recorrer ferias y moverse en una
            cultura distinta requiere preparación. En Nihao te ayudamos a tomar
            mejores decisiones antes, durante y después de cada operación.
          </motion.p>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="relative md:col-span-5"
        >
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-paper">
            <motion.div
              aria-hidden
              className="absolute inset-0"
              style={{ y: reduced ? 0 : imgY, scale: 1.15 }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: "url('/photo-empresa.jpeg')",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            </motion.div>
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, oklch(16% 0.012 30 / 0.25) 0%, oklch(16% 0.012 30 / 0.55) 100%)",
              }}
            />
            <div className="absolute inset-x-6 bottom-6 rounded-xl border border-paper/15 bg-night/40 p-5 backdrop-blur-md">
              <p className="font-display text-[18px] leading-[1.25] text-paper text-balance">
                “No se trata solo de comprar más barato. Se trata de comprar
                mejor.”
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="container-page mt-16 md:mt-20">
        <div className="rounded-2xl border border-line bg-paper p-6 shadow-soft md:p-10">
          <p className="text-eyebrow text-ink-mute">Lo que te ayudamos a resolver</p>
          <ul className="mt-6 grid gap-x-10 gap-y-4 md:grid-cols-2">
            {risks.map((r, i) => (
              <motion.li
                key={i}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className="flex items-start gap-3 text-[15.5px] text-ink-soft"
              >
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-nihao-soft text-nihao">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
                {r}
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
