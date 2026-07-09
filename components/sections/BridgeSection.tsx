"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { bridgeCopy } from "@/lib/content";

const nodes = bridgeCopy.nodes;

function OriginCard({ label }: { label: string }) {
  return (
    <div className="relative z-10 flex w-40 flex-col gap-3 rounded-2xl border border-line/40 bg-paper/80 p-5 shadow-soft backdrop-blur-md md:w-44">
      <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-nihao/60">
        Origen
      </span>
      <span className="flex items-center gap-2 text-[17px] font-medium tracking-tight text-ink md:text-lg">
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-nihao/30 animate-ping" />
          <span className="relative h-2 w-2 rounded-full bg-nihao" />
        </span>
        {label}
      </span>
    </div>
  );
}

function DestinationCard({ label }: { label: string }) {
  return (
    <div className="relative z-10 flex w-40 flex-col gap-3 rounded-2xl border border-line/40 bg-paper/80 p-5 shadow-soft backdrop-blur-md md:w-44">
      <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-nihao/60">
        Destino
      </span>
      <span className="flex items-center gap-2 text-[17px] font-medium tracking-tight text-ink md:text-lg">
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-nihao/30 animate-ping" />
          <span className="relative h-2 w-2 rounded-full bg-nihao" />
        </span>
        {label}
      </span>
    </div>
  );
}

function HubNode() {
  const reduced = useReducedMotion();
  return (
    <div className="relative z-20 flex h-48 w-48 flex-col items-center justify-center rounded-full border border-nihao/15 bg-paper p-6 shadow-elevated md:h-64 md:w-64 md:p-8">
      {/* outer glow ring */}
      <motion.div
        animate={reduced ? { opacity: 0.06 } : { opacity: [0.05, 0.1, 0.05] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -inset-6 -z-10 rounded-full bg-nihao blur-3xl"
      />
      {/* subtle inner ring */}
      <div className="absolute inset-3 rounded-full border border-dashed border-nihao/20" />
      <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-nihao/55 md:text-[11px]">
        Hub
      </span>
      <span className="mt-1 font-display text-[32px] font-medium tracking-tight text-nihao md:text-[44px]">
        Nihao
      </span>
      <span className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-nihao-ink md:text-[11px]">
        Negocios
      </span>
    </div>
  );
}

export function BridgeSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() ?? false;

  return (
    <section
      ref={sectionRef}
      aria-label="Puente entre mercados"
      className="relative overflow-hidden bg-paper py-24 md:py-32"
    >
      {/* subtle global network / map texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, oklch(14.5% 0.012 30) 1.5px, transparent 1.5px)",
          backgroundSize: "36px 36px",
        }}
      />
      {/* soft ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[880px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-nihao/[0.04] blur-3xl" />

      <div className="container-page relative">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-eyebrow-mark text-nihao text-[13px] font-medium tracking-[0.1em] md:text-[14px]">
            {bridgeCopy.eyebrow}
          </span>
          <h2 className="mt-5 text-display-md text-balance md:mt-5">
            {bridgeCopy.headline}
          </h2>
        </div>

        {/* Desktop bridge */}
        <div className="relative mx-auto mt-16 hidden h-[420px] max-w-6xl md:block lg:h-[480px]">
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 1000 480"
            preserveAspectRatio="xMidYMid meet"
            fill="none"
            aria-hidden
          >
            <defs>
              <linearGradient
                id="bridgeGradient"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor="rgba(147, 17, 17, 0.35)" />
                <stop offset="50%" stopColor="rgba(147, 17, 17, 0.55)" />
                <stop offset="100%" stopColor="rgba(147, 17, 17, 0.35)" />
              </linearGradient>
            </defs>
            {/* faint global arc guides */}
            <path
              d="M120 240 C 300 80, 700 80, 880 240"
              stroke="rgba(147, 17, 17, 0.06)"
              strokeWidth="1"
              fill="none"
            />
            <path
              d="M120 240 C 300 400, 700 400, 880 240"
              stroke="rgba(147, 17, 17, 0.06)"
              strokeWidth="1"
              fill="none"
            />
            {/* bridge arcs from each origin to hub */}
            <path
              d="M230 108 C 310 108, 360 240, 390 240"
              stroke="url(#bridgeGradient)"
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            <path
              d="M230 372 C 310 372, 360 240, 390 240"
              stroke="url(#bridgeGradient)"
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            {/* bridge arc from hub to destination */}
            <path
              d="M610 240 C 680 220, 740 260, 790 240"
              stroke="url(#bridgeGradient)"
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            {!reduced && (
              <>
                <circle r="3" fill="#931111">
                  <animateMotion
                    dur="3.2s"
                    repeatCount="indefinite"
                    path="M230 108 C 310 108, 360 240, 390 240"
                  />
                </circle>
                <circle r="3" fill="#931111">
                  <animateMotion
                    dur="3.6s"
                    repeatCount="indefinite"
                    path="M230 372 C 310 372, 360 240, 390 240"
                  />
                </circle>
                <circle r="3" fill="#931111">
                  <animateMotion
                    dur="2.8s"
                    repeatCount="indefinite"
                    path="M610 240 C 680 220, 740 260, 790 240"
                  />
                </circle>
              </>
            )}
          </svg>

          <div className="absolute left-[8%] top-[12%]">
            <OriginCard label={nodes.left[0]} />
          </div>
          <div className="absolute left-[8%] bottom-[12%]">
            <OriginCard label={nodes.left[1]} />
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <HubNode />
          </div>
          <div className="absolute right-[6%] top-1/2 -translate-y-1/2">
            <DestinationCard label={nodes.right[0]} />
          </div>
        </div>

        {/* Mobile bridge */}
        <div className="relative mx-auto mt-12 block h-[720px] max-w-xs md:hidden">
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 420 720"
            preserveAspectRatio="xMidYMid meet"
            fill="none"
            aria-hidden
          >
            <defs>
              <linearGradient
                id="bridgeGradientMobile"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="rgba(147, 17, 17, 0.35)" />
                <stop offset="50%" stopColor="rgba(147, 17, 17, 0.55)" />
                <stop offset="100%" stopColor="rgba(147, 17, 17, 0.35)" />
              </linearGradient>
            </defs>
            {/* faint vertical arcs */}
            <path
              d="M210 80 C 320 200, 320 360, 210 360"
              stroke="rgba(147, 17, 17, 0.06)"
              strokeWidth="1"
              fill="none"
            />
            <path
              d="M210 80 C 100 200, 100 360, 210 360"
              stroke="rgba(147, 17, 17, 0.06)"
              strokeWidth="1"
              fill="none"
            />
            {/* bridge paths from each origin to hub */}
            <path
              d="M210 155 C 210 195, 170 235, 170 270"
              stroke="url(#bridgeGradientMobile)"
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            <path
              d="M210 255 C 210 285, 250 260, 250 270"
              stroke="url(#bridgeGradientMobile)"
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            {/* bridge path from hub to destination */}
            <path
              d="M210 450 C 250 500, 170 560, 210 580"
              stroke="url(#bridgeGradientMobile)"
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            {!reduced && (
              <>
                <circle r="3" fill="#931111">
                  <animateMotion
                    dur="3.2s"
                    repeatCount="indefinite"
                    path="M210 155 C 210 195, 170 235, 170 270"
                  />
                </circle>
                <circle r="3" fill="#931111">
                  <animateMotion
                    dur="3.6s"
                    repeatCount="indefinite"
                    path="M210 255 C 210 285, 250 260, 250 270"
                  />
                </circle>
                <circle r="3" fill="#931111">
                  <animateMotion
                    dur="2.8s"
                    repeatCount="indefinite"
                    path="M210 450 C 250 500, 170 560, 210 580"
                  />
                </circle>
              </>
            )}
          </svg>

          <div className="absolute left-1/2 top-[5%] -translate-x-1/2">
            <OriginCard label={nodes.left[0]} />
          </div>
          <div className="absolute left-1/2 top-[19%] -translate-x-1/2">
            <OriginCard label={nodes.left[1]} />
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <HubNode />
          </div>
          <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2">
            <DestinationCard label={nodes.right[0]} />
          </div>
        </div>
      </div>
    </section>
  );
}
