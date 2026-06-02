"use client";

import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "motion/react";
import { useRef } from "react";
import { ArrowDown, ArrowUpRight, Sparkles } from "lucide-react";
import { heroBadges, whatsappIntents } from "@/lib/content";

const titleLines = [
  "Hacé negocios con China",
  "con más claridad,",
  "menos riesgo y",
  "acompañamiento real.",
];

export function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const imgY = useTransform(scrollYProgress, [0, 1], ["0%", "16%"]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.05, 1.18]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 1], [0.55, 0.85]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section
      ref={ref}
      id="top"
      className="relative isolate min-h-[100svh] overflow-hidden bg-night text-paper"
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ y: reduced ? 0 : imgY, scale: reduced ? 1 : imgScale }}
      >
        <Image
          src="/photo-xpeng.jpeg"
          alt="Equipo Nihao en experiencia empresarial en China"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <motion.div
          aria-hidden
          className="absolute inset-0"
          style={{ opacity: reduced ? 0.65 : overlayOpacity }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, oklch(16% 0.012 30 / 0.55) 0%, oklch(16% 0.012 30 / 0.4) 35%, oklch(16% 0.012 30 / 0.7) 70%, oklch(16% 0.012 30 / 0.95) 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 20% 20%, oklch(48% 0.214 25 / 0.18) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, oklch(64% 0.092 75 / 0.10) 0%, transparent 45%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-40"
          style={{
            background:
              "linear-gradient(to top, oklch(98.6% 0.003 80) 0%, oklch(98.6% 0.003 80 / 0) 100%)",
            mixBlendMode: "normal",
          }}
        />
      </motion.div>

      <motion.div
        style={{ y: reduced ? 0 : contentY, opacity: reduced ? 1 : contentOpacity }}
        className="container-page relative z-10 flex min-h-[100svh] flex-col justify-between pt-28 pb-12 md:pt-32 md:pb-16"
      >
        <div className="flex max-w-4xl flex-col">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-paper/15 bg-paper/5 px-3.5 py-1.5 text-[12px] font-medium tracking-tight text-paper/85 backdrop-blur"
          >
            <Sparkles className="h-3.5 w-3.5 text-gold" strokeWidth={1.5} />
            <span>Negocios, proveedores y ferias en China</span>
          </motion.div>

          <h1 className="mt-8 text-display-xl text-paper text-balance">
            {titleLines.map((line, i) => (
              <span key={i} className="block overflow-hidden pb-[0.12em]">
                <motion.span
                  initial={reduced ? false : { y: "110%" }}
                  animate={{ y: "0%" }}
                  transition={{
                    duration: 0.95,
                    delay: 0.25 + i * 0.12,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={
                    i === titleLines.length - 1
                      ? "inline-block bg-gradient-to-r from-paper via-paper to-gold/80 bg-clip-text text-transparent"
                      : "inline-block"
                  }
                  style={
                    i === titleLines.length - 1
                      ? { WebkitTextFillColor: "transparent" }
                      : undefined
                  }
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.95 }}
            className="mt-7 max-w-[58ch] text-[16.5px] leading-[1.6] text-paper/75"
          >
            Acompañamos a empresas, emprendedores e instituciones a encontrar
            proveedores, recorrer ferias, auditar fábricas y desarrollar
            oportunidades comerciales con China. Hablamos español, chino,
            inglés e italiano, y conocemos el terreno desde adentro.
          </motion.p>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.15 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <a
              href={whatsappIntents.general}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-13 items-center justify-center gap-2 rounded-full bg-nihao px-7 text-[15px] font-medium text-white shadow-[0_18px_40px_-12px_oklch(38%_0.182_25/0.6)] transition-all hover:bg-nihao-deep sm:h-14"
            >
              Quiero hacer negocios con China
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            <a
              href={whatsappIntents.canton}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-13 items-center justify-center gap-2 rounded-full border border-paper/25 bg-paper/5 px-6 text-[14.5px] font-medium text-paper backdrop-blur transition-colors hover:bg-paper/10 sm:h-14"
            >
              Quiero viajar a la Feria de Cantón
              <ArrowUpRight className="h-4 w-4 opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </motion.div>
        </div>

        <div className="mt-16 flex flex-col gap-6 md:mt-0 md:flex-row md:items-end md:justify-between">
          <motion.ul
            initial={reduced ? false : "hidden"}
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08, delayChildren: 1.3 } },
            }}
            className="flex flex-wrap items-center gap-2"
          >
            {heroBadges.map((b) => (
              <motion.li
                key={b}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
                }}
                className="rounded-full border border-paper/15 bg-paper/[0.04] px-3.5 py-1.5 text-[12.5px] font-medium tracking-tight text-paper/80 backdrop-blur"
              >
                {b}
              </motion.li>
            ))}
          </motion.ul>

          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.6 }}
            className="flex items-center gap-3 text-[12px] uppercase tracking-[0.18em] text-paper/55"
          >
            <span>Descubrir</span>
            <motion.div
              animate={reduced ? undefined : { y: [0, 6, 0] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
            >
              <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.5} />
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
