"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { brand, whatsappIntents } from "@/lib/content";

export function FinalCTASection() {
  const reduced = useReducedMotion();
  return (
    <section
      id="contacto"
      aria-label="Contacto"
      className="relative overflow-hidden bg-night text-paper"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: "url('/photo-xpeng.jpeg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.18,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, oklch(48% 0.214 25 / 0.35) 0%, transparent 55%), linear-gradient(180deg, oklch(16% 0.012 30 / 0.4) 0%, oklch(16% 0.012 30 / 0.95) 100%)",
        }}
      />
      <div className="container-page relative grid gap-14 py-24 md:grid-cols-12 md:gap-16 md:py-32">
        <div className="md:col-span-7">
          <motion.span
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-eyebrow-mark gold"
          >
            Contacto
          </motion.span>
          <motion.h2
            initial={reduced ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 text-display-xl text-balance text-paper"
          >
            ¿Querés hacer negocios con China sin improvisar?
          </motion.h2>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-6 max-w-[58ch] text-[16.5px] leading-[1.65] text-paper/75"
          >
            Contanos qué estás buscando y te ayudamos a pensar el mejor camino:
            viajar, buscar proveedores, validar una fábrica, preparar una
            feria o avanzar con una operación.
          </motion.p>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center"
          >
            <a
              href={whatsappIntents.contact}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-14 items-center gap-2 rounded-full bg-nihao px-7 text-[15px] font-medium text-white shadow-[0_18px_50px_-12px_oklch(38%_0.182_25/0.7)] transition-colors hover:bg-nihao-deep"
            >
              Hablar con Nihao por WhatsApp
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </motion.div>

          <motion.dl
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="mt-12 grid gap-6 border-t border-paper/10 pt-10 sm:grid-cols-3"
          >
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.18em] text-paper/50">
                WhatsApp
              </dt>
              <dd className="mt-2 font-display text-[15.5px] font-medium text-paper">
                {brand.whatsapp}
              </dd>
            </div>
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.18em] text-paper/50">
                Email
              </dt>
              <dd className="mt-2 font-display text-[15.5px] font-medium text-paper">
                {brand.email}
              </dd>
            </div>
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.18em] text-paper/50">
                Instagram
              </dt>
              <dd className="mt-2 font-display text-[15.5px] font-medium text-paper">
                {brand.instagram}
              </dd>
            </div>
          </motion.dl>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="hidden items-center justify-center md:col-span-5 md:flex"
        >
          <div className="relative flex aspect-square w-full max-w-sm items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-paper/10" />
            <div className="absolute inset-6 rounded-full border border-paper/10" />
            <div className="absolute inset-12 rounded-full border border-paper/10" />
            <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-paper p-6">
              <Image
                src="/logo-nihao.png"
                alt="Nihao"
                width={140}
                height={140}
                className="object-contain"
              />
            </div>
            <motion.div
              aria-hidden
              animate={reduced ? undefined : { rotate: 360 }}
              transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0"
            >
              <svg viewBox="0 0 200 200" className="h-full w-full">
                <defs>
                  <path
                    id="circle"
                    d="M 100, 100 m -88, 0 a 88,88 0 1,1 176,0 a 88,88 0 1,1 -176,0"
                  />
                </defs>
                <text
                  fill="oklch(64% 0.092 75)"
                  fontSize="10"
                  letterSpacing="6"
                  fontFamily="var(--font-sans)"
                >
                  <textPath href="#circle" startOffset="0">
                    NEGOCIOS · PROVEEDORES · FERIAS · AUDITORÍAS · INMERSIÓN ·
                  </textPath>
                </text>
              </svg>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
