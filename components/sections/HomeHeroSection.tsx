"use client";

import Image from "next/image";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { useHeroCopy, useWhatsAppIntents } from "@/lib/content-i18n";
import { useTranslations } from "next-intl";

export function HomeHeroSection() {
  const t = useTranslations();
  const heroCopy = useHeroCopy();
  const whatsappIntents = useWhatsAppIntents();
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const imgY = useTransform(scrollYProgress, [0, 1], ["0%", "14%"]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.05, 1.15]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <section
      ref={ref}
      id="top"
      className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-night text-paper md:items-center"
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ y: reduced ? 0 : imgY, scale: reduced ? 1 : imgScale }}
      >
        <Image
          src="/hero-canton-tower.png"
          alt={t("home.hero.imageAlt")}
          fill
          priority
          sizes="100vw"
          className="object-cover object-[70%_center] md:object-center"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-night/75 via-night/50 to-night/30"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-night/80 via-night/40 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 20% 20%, rgba(147, 17, 17, 0.22) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(196, 147, 48, 0.10) 0%, transparent 45%)",
          }}
        />
      </motion.div>

      <motion.div
        style={{ y: reduced ? 0 : contentY, opacity: reduced ? 1 : contentOpacity }}
        className="container-page relative z-10 w-full pb-24 pt-36 md:pb-28 md:pt-40"
      >
        <h1 className="mt-6 max-w-4xl text-display-xl text-paper text-balance">
          {heroCopy.headline.map((line, i) => (
            <motion.span
              key={i}
              initial={reduced ? false : { opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.8,
                delay: 0.25 + i * 0.12,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="block"
            >
              {line}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55 }}
          className="mt-6 max-w-[42ch] font-display text-[clamp(1.5rem,3vw,2.25rem)] font-medium leading-[1.1] tracking-tight text-paper"
        >
          {heroCopy.highlight}
        </motion.p>

        <motion.p
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.75 }}
          className="mt-6 max-w-[56ch] text-[16.5px] leading-[1.6] text-paper/80"
        >
          {heroCopy.subtitle}
        </motion.p>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.95 }}
          className="mt-9"
        >
          <a
            href={whatsappIntents.canton}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-nihao px-6 text-center text-[15px] font-medium text-white shadow-[0_18px_40px_-12px_#730D0D/0.6] transition-all hover:bg-nihao-deep sm:px-8"
          >
            {heroCopy.cta}
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
