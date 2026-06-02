"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Plus } from "lucide-react";
import { faqs } from "@/lib/content";
import { cn } from "@/lib/utils";

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);
  const reduced = useReducedMotion();

  return (
    <section
      id="faq"
      aria-label="Preguntas frecuentes"
      className="relative bg-paper-soft py-24 md:py-32"
    >
      <div className="container-page grid gap-12 md:grid-cols-12 md:gap-16">
        <div className="md:col-span-4">
          <span className="text-eyebrow-mark text-nihao">Preguntas</span>
          <h2 className="mt-5 text-display-md text-balance">
            Respuestas claras antes de decidir.
          </h2>
          <p className="mt-5 text-[15.5px] leading-[1.65] text-ink-soft">
            Si tu pregunta no está acá, escribinos por WhatsApp. Respondemos
            personalmente y, si tiene sentido, agendamos una llamada breve.
          </p>
        </div>

        <div className="md:col-span-8">
          <ul className="flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {faqs.map((f, i) => {
              const isOpen = open === i;
              return (
                <li key={i} className="bg-paper">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-6 px-5 py-5 text-left transition-colors hover:bg-paper-warm md:px-7 md:py-6"
                  >
                    <span
                      className={cn(
                        "font-display text-[16.5px] font-medium leading-[1.3] tracking-tight md:text-[17.5px]",
                        isOpen ? "text-ink" : "text-ink-soft",
                      )}
                    >
                      {f.q}
                    </span>
                    <span
                      className={cn(
                        "flex h-7 w-7 flex-none items-center justify-center rounded-full border border-line text-ink-mute transition-all duration-500",
                        isOpen && "rotate-45 border-nihao bg-nihao text-white",
                      )}
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="content"
                        initial={
                          reduced
                            ? { height: "auto", opacity: 1 }
                            : { height: 0, opacity: 0 }
                        }
                        animate={{ height: "auto", opacity: 1 }}
                        exit={
                          reduced
                            ? { height: "auto", opacity: 1 }
                            : { height: 0, opacity: 0 }
                        }
                        transition={{
                          duration: 0.45,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="overflow-hidden"
                      >
                        <p className="max-w-[68ch] px-5 pb-6 text-[15px] leading-[1.65] text-ink-soft md:px-7">
                          {f.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
