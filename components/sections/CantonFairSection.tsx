"use client";

import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { cantonFairPillars, whatsappIntents } from "@/lib/content";

export function CantonFairSection() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const imgY = useTransform(scrollYProgress, [0, 1], ["10%", "-12%"]);

  return (
    <section
      ref={ref}
      id="canton"
      aria-label="Feria de Cantón"
      className="relative overflow-hidden bg-night text-paper"
    >
      <div className="container-page grid gap-12 py-24 md:grid-cols-12 md:gap-16 md:py-32">
        <div className="md:col-span-6">
          <motion.span
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-eyebrow-mark gold"
          >
            Feria de Cantón
          </motion.span>
          <motion.h2
            initial={reduced ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 text-display-lg text-balance text-paper"
          >
            Viajá preparado, acompañado y con una estrategia clara.
          </motion.h2>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-6 text-[16px] leading-[1.65] text-paper/70"
          >
            La Feria de Cantón puede ser una gran oportunidad, pero también
            puede ser abrumadora si llegás sin preparación. Te ayudamos a
            definir objetivos, organizar la agenda, recorrer la feria,
            conversar con proveedores, negociar y ordenar la información para
            que el viaje se convierta en decisiones concretas.
          </motion.p>

          <motion.ul
            initial={reduced ? false : "hidden"}
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
            }}
            className="mt-10 flex flex-col gap-3"
          >
            {cantonFairPillars.map((p) => (
              <motion.li
                key={p.title}
                variants={{
                  hidden: { opacity: 0, x: -10 },
                  visible: { opacity: 1, x: 0, transition: { duration: 0.5 } },
                }}
                className="flex items-start gap-3.5 border-b border-paper/10 pb-3.5"
              >
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border border-gold/50 bg-gold/10 text-gold">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <div className="flex flex-col">
                  <span className="font-display text-[15.5px] font-medium text-paper">
                    {p.title}
                  </span>
                  <span className="mt-1 text-[14px] text-paper/65">{p.text}</span>
                </div>
              </motion.li>
            ))}
          </motion.ul>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-10"
          >
            <a
              href={whatsappIntents.canton}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-13 items-center gap-2 rounded-full bg-paper px-6 text-[14.5px] font-medium text-night transition-colors hover:bg-paper-warm sm:h-14"
            >
              Quiero viajar a la Feria de Cantón
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </motion.div>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="md:col-span-6"
        >
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-paper/10 bg-night-soft md:aspect-[5/6]">
            <motion.div
              aria-hidden
              className="absolute inset-0"
              style={{ y: reduced ? 0 : imgY, scale: 1.15 }}
            >
              <Image
                src="/photo-robots.jpeg"
                alt="Experiencia Nihao en China: tecnología, robótica e innovación"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            </motion.div>
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, oklch(16% 0.012 30 / 0.15) 0%, oklch(16% 0.012 30 / 0.6) 100%)",
              }}
            />
            <div className="absolute inset-x-5 top-5 flex flex-wrap items-center gap-2">
              {["Cantón", "Shenzhen", "Auditorías", "Proveedores"].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-paper/20 bg-night/40 px-3 py-1 text-[11.5px] font-medium uppercase tracking-[0.14em] text-paper/80 backdrop-blur"
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="absolute inset-x-5 bottom-5 rounded-xl border border-paper/10 bg-night/50 p-5 backdrop-blur-md">
              <p className="text-[11px] uppercase tracking-[0.18em] text-gold">
                Caso real · Acompañamiento
              </p>
              <p className="mt-2 text-[14.5px] leading-[1.55] text-paper/85">
                Días de feria recorridos con un cliente que llegó sin agenda
                clara. Salió con reuniones agendadas, muestras pedidas y un
                mapa de proveedores validados.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
