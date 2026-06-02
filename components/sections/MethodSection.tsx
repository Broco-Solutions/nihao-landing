"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { methodSteps } from "@/lib/content";

export function MethodSection() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const lineHeight = useTransform(scrollYProgress, [0.1, 0.85], ["0%", "100%"]);

  return (
    <section
      ref={ref}
      id="metodo"
      aria-label="El método Nihao"
      className="relative bg-paper py-24 md:py-32"
    >
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="text-eyebrow-mark text-nihao">El método Nihao</span>
          <h2 className="mt-5 text-display-lg text-balance">
            Un acompañamiento pensado para que no improvises en China.
          </h2>
          <p className="mt-5 max-w-[58ch] text-[16px] leading-[1.65] text-ink-soft">
            Cinco pasos. Una estructura clara. Aplicable a un primer viaje, a
            una búsqueda puntual o a una operación de varios meses. La misma
            disciplina para una pyme que para una empresa con experiencia.
          </p>
        </div>

        <div className="relative mt-20 md:mt-24">
          <div
            aria-hidden
            className="absolute left-[19px] top-2 bottom-2 hidden w-px bg-line md:left-1/2 md:block"
          />
          <motion.div
            aria-hidden
            style={{ height: reduced ? "100%" : lineHeight }}
            className="absolute left-[19px] top-2 hidden w-px origin-top bg-nihao md:left-1/2 md:block"
          />

          <ol className="flex flex-col gap-12 md:gap-20">
            {methodSteps.map((s, i) => {
              const isLeft = i % 2 === 0;
              return (
                <StepItem
                  key={s.n}
                  step={s}
                  align={isLeft ? "left" : "right"}
                  index={i}
                  reduced={!!reduced}
                />
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

function StepItem({
  step,
  align,
  index,
  reduced,
}: {
  step: { n: string; title: string; text: string };
  align: "left" | "right";
  index: number;
  reduced: boolean;
}) {
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={`relative md:grid md:grid-cols-2 md:items-center md:gap-16 ${
        align === "right" ? "md:[&>*:first-child]:order-2" : ""
      }`}
    >
      <div className="relative pl-12 md:pl-0">
        <div
          className={`flex flex-col gap-3 ${
            align === "right" ? "md:pl-12" : "md:items-end md:pr-12 md:text-right"
          }`}
        >
          <span className="font-display text-[64px] font-light leading-none text-line-strong md:text-[88px]">
            {step.n}
          </span>
          <h3 className="font-display text-[24px] font-medium tracking-tight text-ink md:text-[28px]">
            {step.title}
          </h3>
          <p className="max-w-[42ch] text-[15.5px] leading-[1.6] text-ink-soft md:max-w-[44ch]">
            {step.text}
          </p>
        </div>
        <span
          aria-hidden
          className="absolute left-[14px] top-3 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-nihao ring-4 ring-paper md:hidden"
        />
      </div>
      <div
        aria-hidden
        className={`hidden md:block ${
          align === "right" ? "md:pr-12 md:text-right" : "md:pl-12"
        }`}
      >
        <Deco index={index} align={align} reduced={reduced} />
      </div>
    </motion.li>
  );
}

function Deco({
  index,
  align,
  reduced,
}: {
  index: number;
  align: "left" | "right";
  reduced: boolean;
}) {
  const palettes = [
    "from-nihao-soft to-paper",
    "from-gold-soft to-paper",
    "from-nihao-soft to-paper-warm",
    "from-paper-warm to-nihao-soft",
    "from-gold-soft to-paper-warm",
  ];
  return (
    <div
      className={`relative aspect-[5/4] w-full overflow-hidden rounded-2xl border border-line bg-gradient-to-br ${
        palettes[index % palettes.length]
      } ${align === "left" ? "" : "md:ml-auto"}`}
    >
      <DecoShape index={index} reduced={reduced} />
    </div>
  );
}

function DecoShape({ index, reduced }: { index: number; reduced: boolean }) {
  if (index === 0) {
    return (
      <svg viewBox="0 0 200 160" className="h-full w-full">
        <motion.circle
          cx="100"
          cy="80"
          r="40"
          fill="none"
          stroke="oklch(48% 0.214 25)"
          strokeWidth="1"
          strokeDasharray="2 4"
          initial={reduced ? false : { rotate: 0 }}
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "100px 80px" }}
        />
        <circle cx="100" cy="80" r="6" fill="oklch(38% 0.182 25)" />
        <circle cx="100" cy="40" r="3" fill="oklch(48% 0.214 25)" />
        <circle cx="100" cy="120" r="3" fill="oklch(48% 0.214 25)" />
        <circle cx="60" cy="80" r="3" fill="oklch(48% 0.214 25)" />
        <circle cx="140" cy="80" r="3" fill="oklch(48% 0.214 25)" />
      </svg>
    );
  }
  if (index === 1) {
    return (
      <svg viewBox="0 0 200 160" className="h-full w-full">
        {[20, 50, 80, 110, 140].map((y, i) => (
          <line
            key={y}
            x1="20"
            y1={y}
            x2="180"
            y2={y}
            stroke="oklch(48% 0.214 25)"
            strokeOpacity={0.15 + i * 0.08}
            strokeWidth="1"
          />
        ))}
        <rect x="30" y="60" width="60" height="40" rx="4" fill="oklch(48% 0.214 25)" />
        <rect x="100" y="50" width="70" height="50" rx="4" fill="oklch(38% 0.182 25)" />
      </svg>
    );
  }
  if (index === 2) {
    return (
      <svg viewBox="0 0 200 160" className="h-full w-full">
        <path
          d="M 20 100 C 60 60, 100 140, 140 100 S 200 60, 200 100"
          fill="none"
          stroke="oklch(48% 0.214 25)"
          strokeWidth="1.5"
        />
        <circle cx="20" cy="100" r="4" fill="oklch(48% 0.214 25)" />
        <circle cx="100" cy="100" r="4" fill="oklch(38% 0.182 25)" />
        <circle cx="180" cy="100" r="4" fill="oklch(48% 0.214 25)" />
      </svg>
    );
  }
  if (index === 3) {
    return (
      <svg viewBox="0 0 200 160" className="h-full w-full">
        <polygon
          points="100,30 160,70 160,130 100,160 40,130 40,70"
          fill="none"
          stroke="oklch(48% 0.214 25)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <polygon
          points="100,50 140,80 140,120 100,150 60,120 60,80"
          fill="oklch(48% 0.214 25 / 0.1)"
          stroke="oklch(48% 0.214 25)"
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 160" className="h-full w-full">
      <text
        x="100"
        y="100"
        textAnchor="middle"
        fontSize="80"
        fontWeight="300"
        fill="oklch(48% 0.214 25 / 0.18)"
        fontFamily="serif"
      >
        N
      </text>
    </svg>
  );
}
