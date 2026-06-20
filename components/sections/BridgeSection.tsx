"use client";

import { motion, useReducedMotion, useInView } from "motion/react";
import { useRef } from "react";
import { bridgeCopy } from "@/lib/content";

const nodes = bridgeCopy.nodes;

function Connector({
  delay = 0,
  reduced,
}: {
  delay?: number;
  reduced: boolean;
}) {
  return (
    <div className="relative hidden w-14 items-center md:flex md:w-20">
      {/* Track */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-nihao/25 to-transparent" />
      <div className="absolute inset-0 h-px w-full border-t border-dashed border-nihao/15" />

      {/* Arrow head */}
      <svg
        width="7"
        height="7"
        viewBox="0 0 10 10"
        className="absolute right-0 top-1/2 -translate-y-1/2 text-nihao/35"
        aria-hidden
      >
        <path
          d="M 1 1 L 8 5 L 1 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Traveling particle */}
      {!reduced && (
        <motion.div
          animate={{ x: [0, 56, 80] }}
          transition={{
            duration: 3.6,
            repeat: Infinity,
            delay,
            ease: "linear",
          }}
          className="absolute left-0 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-nihao shadow-[0_0_6px_oklch(48%_0.214_25_/_0.45)]"
        />
      )}
    </div>
  );
}

function MobileConnector({
  delay = 0,
  reduced,
}: {
  delay?: number;
  reduced: boolean;
}) {
  return (
    <div className="relative flex h-12 w-px flex-col items-center md:hidden">
      <div className="h-full w-px bg-gradient-to-b from-transparent via-nihao/25 to-transparent" />
      <div className="absolute inset-0 h-full w-px border-l border-dashed border-nihao/15" />

      <svg
        width="7"
        height="7"
        viewBox="0 0 10 10"
        className="absolute bottom-0 text-nihao/35"
        aria-hidden
      >
        <path
          d="M 1 1 L 5 8 L 9 1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {!reduced && (
        <motion.div
          animate={{ y: [0, 48] }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay,
            ease: "linear",
          }}
          className="absolute left-1/2 top-0 h-1 w-1 -translate-x-1/2 rounded-full bg-nihao shadow-[0_0_6px_oklch(48%_0.214_25_/_0.45)]"
        />
      )}
    </div>
  );
}

function RouteItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inset-0 rounded-full bg-nihao/30 animate-ping" />
        <span className="relative h-2 w-2 rounded-full bg-nihao" />
      </span>
      <span className="text-[15px] font-medium tracking-tight text-ink md:text-base">
        {label}
      </span>
    </div>
  );
}

function OriginCard({
  inView,
  reduced,
}: {
  inView: boolean;
  reduced: boolean;
}) {
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, x: -30 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }}
      className="relative z-10 flex w-full flex-col overflow-hidden rounded-[24px] border border-line/30 bg-paper/70 p-6 shadow-soft backdrop-blur-md transition-all duration-300 hover:border-nihao/20 hover:shadow-card md:w-56 md:p-7"
    >
      <span className="mb-4 text-[10px] uppercase tracking-[0.22em] text-nihao/55">
        Orígenes
      </span>
      <div className="flex flex-col gap-3">
        {nodes.left.map((label) => (
          <RouteItem key={label} label={label} />
        ))}
      </div>
    </motion.div>
  );
}

function HubCard({
  inView,
  reduced,
}: {
  inView: boolean;
  reduced: boolean;
}) {
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 24, scale: 0.98 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3, scale: 1.01 }}
      className="relative z-10 flex w-full flex-col items-center justify-center overflow-hidden rounded-[28px] border border-nihao/15 bg-paper p-8 text-center shadow-elevated transition-all duration-300 hover:border-nihao/25 md:w-80 md:p-10"
    >
      {/* Outer glow */}
      <motion.div
        animate={
          reduced
            ? { opacity: 0.08 }
            : { opacity: [0.06, 0.12, 0.06] }
        }
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -inset-12 -z-20 rounded-full bg-nihao blur-3xl"
      />

      {/* Soft radial gradient */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_35%_25%,_var(--color-nihao-soft),_transparent_65%)] opacity-70" />

      {/* Warm top highlight */}
      <div className="absolute inset-x-0 top-0 -z-10 h-1/2 bg-gradient-to-b from-nihao-soft/25 to-transparent" />

      <span className="mb-4 text-[10px] uppercase tracking-[0.22em] text-nihao/55">
        Hub
      </span>
      <span className="font-display text-[26px] font-medium tracking-tight text-nihao md:text-[32px]">
        Nihao
      </span>
      <span className="mt-1 text-[10px] uppercase tracking-[0.2em] text-nihao-ink md:text-[11px]">
        Negocios
      </span>
    </motion.div>
  );
}

function DestinationCard({
  inView,
  reduced,
}: {
  inView: boolean;
  reduced: boolean;
}) {
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, x: 30 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.8, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }}
      className="relative z-10 flex w-full flex-col overflow-hidden rounded-[24px] border border-line/30 bg-paper/70 p-6 shadow-soft backdrop-blur-md transition-all duration-300 hover:border-nihao/20 hover:shadow-card md:w-56 md:p-7"
    >
      <span className="mb-4 text-[10px] uppercase tracking-[0.22em] text-nihao/55">
        Destino
      </span>
      <RouteItem label={nodes.right[0]} />
    </motion.div>
  );
}

export function BridgeSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { once: true, amount: 0.25 });
  const reduced = useReducedMotion() ?? false;

  return (
    <section
      ref={sectionRef}
      aria-label="Puente entre mercados"
      className="relative overflow-hidden bg-paper py-24 md:py-32"
    >
      {/* Soft ambient glow behind the route board */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[560px] w-[880px] rounded-full bg-nihao/[0.035] blur-3xl" />

      <div className="container-page relative">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-eyebrow-mark text-nihao">
            {bridgeCopy.eyebrow}
          </span>
          <h2 className="mt-6 text-display-md text-balance md:mt-5">
            {bridgeCopy.headline}
          </h2>
        </div>

        {/* Desktop route board */}
        <div className="relative mx-auto mt-16 hidden max-w-5xl items-center justify-center md:mt-24 md:flex">
          <OriginCard inView={inView} reduced={reduced} />
          <Connector delay={0.3} reduced={reduced} />
          <HubCard inView={inView} reduced={reduced} />
          <Connector delay={0.9} reduced={reduced} />
          <DestinationCard inView={inView} reduced={reduced} />
        </div>

        {/* Mobile vertical route */}
        <div className="relative mx-auto mt-12 flex max-w-xs flex-col items-center md:hidden">
          <OriginCard inView={inView} reduced={reduced} />
          <MobileConnector delay={0.3} reduced={reduced} />
          <HubCard inView={inView} reduced={reduced} />
          <MobileConnector delay={0.7} reduced={reduced} />
          <DestinationCard inView={inView} reduced={reduced} />
        </div>
      </div>
    </section>
  );
}
