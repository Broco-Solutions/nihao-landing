"use client";

import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { academyPillars, whatsappIntents } from "@/lib/content";

export function AcademySection() {
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
      id="academy"
      aria-label="Nihao Academy"
      className="relative isolate overflow-hidden bg-paper-soft py-24 md:py-32"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 100% 0%, oklch(48% 0.214 25 / 0.05) 0%, transparent 50%)",
        }}
      />

      <div className="container-page grid gap-12 md:grid-cols-12 md:gap-16">
        <div className="md:col-span-7">
          <motion.span
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-nihao" />
            Unidad aparte · Programa de inmersión
          </motion.span>
          <motion.h2
            initial={reduced ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7 }}
            className="mt-5 text-display-lg text-balance"
          >
            Nihao Academy: formación e inmersión internacional en China.
          </motion.h2>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-5 max-w-[58ch] text-[16px] leading-[1.65] text-ink-soft"
          >
            Experiencias educativas y empresariales enfocadas en China,
            innovación, negocios internacionales y cultura. Programas
            pensados para universidades, jóvenes profesionales, emprendedores
            y empresarios que quieren entender cómo se mueve uno de los
            ecosistemas más influyentes del mundo.
          </motion.p>

          <motion.p
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-8 max-w-[40ch] font-display text-[20px] font-medium leading-[1.3] tracking-tight text-ink md:text-[22px]"
          >
            No desde un video. No desde una teoría. Desde adentro.
          </motion.p>

          <div className="mt-10 flex flex-wrap gap-2">
            {academyPillars.map((p, i) => (
              <motion.span
                key={p}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.04 }}
                className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-[13px] font-medium text-ink-soft"
              >
                {p}
              </motion.span>
            ))}
          </div>

          <a
            href={whatsappIntents.academy}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-10 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-paper transition-colors hover:bg-night-soft"
          >
            Quiero conocer Nihao Academy
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
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
                src="/photo-robots.jpeg"
                alt="Programa de inmersión Nihao Academy"
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
                  "linear-gradient(180deg, oklch(16% 0.012 30 / 0.15) 0%, oklch(16% 0.012 30 / 0.65) 100%)",
              }}
            />
            <div className="absolute inset-x-5 top-5 inline-flex w-fit items-center gap-2 rounded-full border border-paper/20 bg-night/40 px-3 py-1.5 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-paper/80">
                Próxima edición
              </span>
            </div>
            <div className="absolute inset-x-5 bottom-5 flex flex-col gap-2 rounded-xl border border-paper/10 bg-night/50 p-4 backdrop-blur-md">
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-gold">
                Desde adentro
              </p>
              <p className="text-[14px] leading-[1.5] text-paper/85">
                Una semana en China recorriendo empresas, ferias, universidades
                y contactos que cambian la forma de entender el negocio.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
