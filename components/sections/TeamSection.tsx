"use client";

import { motion, useReducedMotion } from "motion/react";
import { team } from "@/lib/content";

export function TeamSection() {
  const reduced = useReducedMotion();
  return (
    <section aria-label="Equipo" className="bg-paper-soft py-20 md:py-28">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-eyebrow-mark text-nihao">Quiénes somos</span>
          <h2 className="mt-5 text-display-lg text-balance">
            Tres profesionales. Un solo objetivo.
          </h2>
        </div>

        <motion.ul
          initial={reduced ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.1 } },
          }}
          className="mt-12 grid gap-5 md:mt-16 md:grid-cols-3"
        >
          {team.map((m) => (
            <motion.li
              key={m.name}
              variants={{
                hidden: { opacity: 0, y: 18 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
              }}
              className="flex flex-col gap-5 rounded-2xl border border-line bg-paper p-7"
            >
              <div className="flex items-center gap-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-nihao font-display text-[18px] font-medium text-white">
                  {m.name.charAt(0)}
                </span>
                <div>
                  <h3 className="font-display text-[20px] font-medium tracking-tight text-ink">
                    {m.name}
                  </h3>
                </div>
              </div>
              <div>
                <p className="font-display text-[16px] font-medium text-nihao">
                  {m.title}
                </p>
                <p className="mt-3 text-[15px] leading-[1.6] text-ink-soft">
                  {m.text}
                </p>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
