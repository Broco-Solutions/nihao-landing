"use client";

import { motion, useReducedMotion, useInView } from "motion/react";
import { useRef } from "react";

type Rank = "primary" | "secondary" | "destination";

type Node = {
  id: string;
  label: string;
  side: "L" | "R";
  rank: Rank;
  y: number;
};

const nodes: Node[] = [
  { id: "ar", label: "Argentina", side: "L", rank: "primary", y: 100 },
  { id: "la", label: "Latinoamérica", side: "L", rank: "primary", y: 240 },
  { id: "eu", label: "Europa", side: "L", rank: "secondary", y: 380 },
  { id: "cn", label: "China", side: "R", rank: "destination", y: 240 },
];

const VB_W = 1000;
const VB_H = 480;
const NIH_X = 500;
const NIH_Y = 240;
const ORIGIN_X = 60;
const DEST_X = 940;

const left = nodes.filter((n) => n.side === "L");
const right = nodes.filter((n) => n.side === "R");

type Curve = {
  id: string;
  rank: Rank;
  visible: string;
  motion: string;
};

const inputCurves: Curve[] = left.map((n) => {
  const oy = n.y;
  return {
    id: n.id,
    rank: n.rank,
    visible: `M ${ORIGIN_X} ${oy} C ${ORIGIN_X + 200} ${oy}, ${NIH_X - 200} ${NIH_Y}, ${NIH_X} ${NIH_Y}`,
    motion: `M ${ORIGIN_X} ${oy} C ${ORIGIN_X + 200} ${oy}, ${NIH_X - 200} ${NIH_Y}, ${NIH_X} ${NIH_Y} L ${DEST_X} ${NIH_Y}`,
  };
});

const outputCurve: Curve = {
  id: "out",
  rank: "destination",
  visible: `M ${NIH_X} ${NIH_Y} L ${DEST_X} ${NIH_Y}`,
  motion: `M ${NIH_X} ${NIH_Y} L ${DEST_X} ${NIH_Y}`,
};

type DotGroup = {
  curveId: string;
  count: number;
  color: string;
  r: number;
  dur: string;
  opacity: number;
  beginStep: number;
};

const dotGroups: DotGroup[] = [
  { curveId: "ar", count: 2, color: "oklch(38% 0.182 25)", r: 3.2, dur: "9s", opacity: 1, beginStep: 0 },
  { curveId: "la", count: 2, color: "oklch(38% 0.182 25)", r: 3.2, dur: "9s", opacity: 1, beginStep: 0.3 },
  { curveId: "eu", count: 2, color: "oklch(55% 0.01 30)", r: 3.2, dur: "9s", opacity: 0.6, beginStep: 0.6 },
];

export function BridgeSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduced = useReducedMotion();

  return (
    <section
      id="puente"
      aria-label="Puente entre mercados"
      className="relative bg-paper py-24 md:py-32"
    >
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-eyebrow-mark text-nihao">Conexión</span>
          <h2 className="mt-5 text-display-md text-balance">
            Un puente real entre Latinoamérica y China.
          </h2>
          <p className="mt-5 text-[15.5px] leading-[1.65] text-ink-soft">
            Conectamos empresas, emprendedores e instituciones con proveedores,
            ferias y oportunidades en China. Traducimos idioma, cultura y
            operación para que tomes mejores decisiones.
          </p>
        </div>

        <div
          ref={ref}
          className="relative mx-auto mt-16 h-[420px] max-w-5xl md:mt-20 md:h-[480px]"
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="absolute inset-0 h-full w-full"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="inputGrad" x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="oklch(48% 0.214 25)" stopOpacity="0" />
                <stop offset="25%" stopColor="oklch(48% 0.214 25)" stopOpacity="0.6" />
                <stop offset="100%" stopColor="oklch(38% 0.182 25)" stopOpacity="0.95" />
              </linearGradient>
              <linearGradient id="inputGradMuted" x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="oklch(50% 0.01 30)" stopOpacity="0" />
                <stop offset="50%" stopColor="oklch(50% 0.01 30)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="oklch(50% 0.01 30)" stopOpacity="0.55" />
              </linearGradient>
              <linearGradient id="outputGrad" x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="oklch(38% 0.182 25)" stopOpacity="0.95" />
                <stop offset="55%" stopColor="oklch(48% 0.214 25)" stopOpacity="0.85" />
                <stop offset="100%" stopColor="oklch(64% 0.092 75)" stopOpacity="0.55" />
              </linearGradient>
            </defs>

            {[...inputCurves, outputCurve].map((c) => (
              <path
                key={`motion-${c.id}`}
                id={`motion-${c.id}`}
                d={c.motion}
                style={{ visibility: "hidden" }}
              />
            ))}

            {inputCurves.map((c) => (
              <motion.path
                key={`visible-${c.id}`}
                d={c.visible}
                stroke={c.rank === "secondary" ? "url(#inputGradMuted)" : "url(#inputGrad)"}
                strokeWidth={c.rank === "secondary" ? 1.2 : 1.5}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={inView && !reduced ? { pathLength: 1, opacity: 1 } : { pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.8, ease: [0.65, 0, 0.35, 1] }}
              />
            ))}

            <motion.path
              d={outputCurve.visible}
              stroke="url(#outputGrad)"
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={inView && !reduced ? { pathLength: 1, opacity: 1 } : { pathLength: 1, opacity: 1 }}
              transition={{ duration: 2, delay: 0.6, ease: [0.65, 0, 0.35, 1] }}
              style={{ filter: "drop-shadow(0 0 8px oklch(48% 0.214 25 / 0.35))" }}
            />

            {dotGroups.map((group) =>
              Array.from({ length: group.count }).map((_, d) => (
                <motion.circle
                  key={`dot-${group.curveId}-${d}`}
                  r={group.r}
                  fill={group.color}
                  initial={{ opacity: 0 }}
                  animate={inView && !reduced ? { opacity: group.opacity } : { opacity: group.opacity }}
                  transition={{ delay: 0.6 + d * 0.3, duration: 0.4 }}
                >
                  <animateMotion
                    dur={group.dur}
                    repeatCount="indefinite"
                    begin={reduced ? "indefinite" : `${group.beginStep + d * 0.6}s`}
                  >
                    <mpath href={`#motion-${group.curveId}`} />
                  </animateMotion>
                </motion.circle>
              ))
            )}

            <motion.circle
              r="4"
              fill="oklch(64% 0.092 75)"
              initial={{ opacity: 0 }}
              animate={inView && !reduced ? { opacity: 1 } : { opacity: 1 }}
              transition={{ delay: 1, duration: 0.4 }}
              style={{ filter: "drop-shadow(0 0 6px oklch(64% 0.092 75 / 0.6))" }}
            >
              <animateMotion
                dur="7s"
                repeatCount="indefinite"
                begin={reduced ? "indefinite" : "0.2s"}
              >
                <mpath href="#motion-out" />
              </animateMotion>
            </motion.circle>
          </svg>

          <div className="absolute inset-y-0 left-0 flex w-32 flex-col justify-around md:w-44">
            {left.map((n, i) => (
              <motion.div
                key={n.id}
                initial={reduced ? false : { opacity: 0, x: -20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.7, delay: 0.5 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3"
              >
                <span
                  className={
                    n.rank === "secondary"
                      ? "relative flex h-1.5 w-1.5"
                      : "relative flex h-2 w-2"
                  }
                >
                  <span
                    className={
                      n.rank === "secondary"
                        ? "absolute inset-0 rounded-full bg-ink-faint"
                        : "absolute inset-0 rounded-full bg-nihao"
                    }
                  />
                </span>
                <span
                  className={
                    n.rank === "secondary"
                      ? "text-[11px] uppercase tracking-[0.18em] text-ink-mute"
                      : "text-[12.5px] uppercase tracking-[0.16em] text-ink-soft"
                  }
                >
                  {n.label}
                </span>
              </motion.div>
            ))}
          </div>

          <div className="absolute inset-y-0 right-0 flex w-32 flex-col justify-center md:w-44">
            {right.map((n, i) => (
              <motion.div
                key={n.id}
                initial={reduced ? false : { opacity: 0, x: 20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.7, delay: 1.0 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-end gap-3"
              >
                <span className="text-[12.5px] uppercase tracking-[0.16em] text-ink-soft">
                  {n.label}
                </span>
                <span className="relative flex h-3 w-3">
                  <span className="absolute inset-0 animate-ping rounded-full bg-nihao/30" />
                  <span className="relative h-3 w-3 rounded-full bg-nihao" />
                </span>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 1.4, duration: 0.6 }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="flex flex-col items-center gap-1 rounded-full border border-line bg-paper/80 px-5 py-2.5 backdrop-blur">
              <span className="text-[10.5px] uppercase tracking-[0.18em] text-nihao">
                Nihao
              </span>
              <span className="font-display text-[13px] font-medium text-ink">
                Puente estratégico
              </span>
            </div>
          </motion.div>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-4 text-center text-[14px] text-ink-soft md:grid-cols-3 md:gap-8">
          <p className="flex flex-col items-center gap-1.5">
            <span className="font-display text-[15px] font-medium text-ink">Idioma</span>
            <span>Español, chino, inglés, italiano.</span>
          </p>
          <p className="flex flex-col items-center gap-1.5">
            <span className="font-display text-[15px] font-medium text-ink">Cultura</span>
            <span>Cómo se negocia, qué se lee entre líneas.</span>
          </p>
          <p className="flex flex-col items-center gap-1.5">
            <span className="font-display text-[15px] font-medium text-ink">Operación</span>
            <span>Antes, durante y después del viaje.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
