"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { Quote, X } from "lucide-react";
import { testimonials } from "@/lib/content";
import { SectionShell } from "@/components/ui/SectionShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ConnectionLine } from "@/components/ui/ConnectionLine";

const imageStyle: Record<string, { objectPosition?: string; transform?: string }> = {
  "magali-lebihan-tomas-lawrie.jpeg": {},
  "paco-vaquero-idd.jpeg": { objectPosition: "center 15%" },
  "celina-francisco-ponton-oxi-mercedes.jpeg": { objectPosition: "center 35%", transform: "scale(1.10)" },
  "gustavo-galeano-luis-kaufmann-rigran.jpeg": { objectPosition: "center 35%", transform: "scale(1.12)" },
};

export function TestimonialsSection() {
  const reduced = useReducedMotion();
  const [activeImage, setActiveImage] = useState<{ src: string; name: string } | null>(null);

  useEffect(() => {
    if (!activeImage) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveImage(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeImage]);

  return (
    <SectionShell variant="glow-pattern" ariaLabel="Testimonios" className="py-24 md:py-32">
      <div className="container-page">
        <SectionHeader
          eyebrow="Testimonios"
          title="Lo que dicen quienes ya viajaron con nosotras."
          align="center"
          decorativeLine
        />

        <motion.ul
          initial={reduced ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.1 } },
          }}
          className="mt-14 grid gap-6 md:mt-16"
        >
          {testimonials.map((t, i) => (
            <motion.li
              key={i}
              variants={{
                hidden: { opacity: 0, y: 18 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
              }}
              className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-line border-t-2 border-t-nihao/30 bg-paper shadow-card md:flex-row"
            >
              <button
                type="button"
                onClick={() => setActiveImage({ src: t.image, name: t.name })}
                className="group relative h-[260px] w-full shrink-0 cursor-pointer overflow-hidden md:h-[340px] md:w-[40%]"
                aria-label={`Ampliar foto de ${t.name}`}
              >
                <Image
                  src={t.image}
                  alt={`Foto de ${t.name}`}
                  fill
                  className="object-cover transition-transform duration-300"
                  style={imageStyle[t.image.split("/").pop() ?? ""]}
                  sizes="(max-width: 768px) 100vw, 40vw"
                  priority={i < 2}
                />
                <div className="absolute inset-0 z-10 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" />
              </button>
              <div className="flex flex-1 flex-col gap-5 p-7 md:p-9">
                <Quote
                  className="h-5 w-5 text-nihao"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <p className="font-display text-[15px] leading-relaxed tracking-tight text-ink text-balance md:text-[16px]">
                  “{t.quote}”
                </p>
                <div className="mt-auto border-t border-line pt-5">
                  <div className="text-[14px] font-semibold text-ink">
                    {t.name}
                  </div>
                  {t.role && t.role !== "—" && (
                    <div className="text-[13px] font-medium text-ink-mute">
                      {t.role}
                    </div>
                  )}
                </div>
              </div>
            </motion.li>
          ))}
        </motion.ul>

        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-16"
        >
          <ConnectionLine />
        </motion.div>
      </div>

      {activeImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setActiveImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ampliada de ${activeImage.name}`}
        >
          <button
            type="button"
            onClick={() => setActiveImage(null)}
            className="absolute right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-paper/90 text-ink shadow-lg transition-colors hover:bg-paper"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative max-h-[85vh] max-w-[90vw] overflow-hidden rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={activeImage.src}
              alt={`Foto ampliada de ${activeImage.name}`}
              width={1200}
              height={900}
              className="max-h-[85vh] max-w-[90vw] object-contain"
              sizes="90vw"
              priority
            />
          </div>
        </div>
      )}
    </SectionShell>
  );
}
