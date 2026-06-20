"use client";

import { useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { X, ArrowUpRight } from "lucide-react";
import type { ServiceDetail } from "@/lib/content";
import { whatsappIntents } from "@/lib/content";
import { buildWhatsAppLink } from "@/lib/utils";

export function ServiceDrawer({
  service,
  onClose,
}: {
  service: ServiceDetail | null;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!service) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [service, onClose]);

  return (
    <AnimatePresence>
      {service && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={reduced ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={reduced ? undefined : { x: "100%" }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-line bg-paper shadow-elevated md:max-w-lg"
          >
            <div className="flex min-h-full flex-col p-6 md:p-10">
              <div className="flex items-start justify-between">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-paper-soft text-nihao">
                  <service.icon className="h-6 w-6" strokeWidth={1.5} />
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper text-ink transition-colors hover:bg-paper-warm"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>

              <h2 className="mt-8 font-display text-[15px] font-medium uppercase tracking-[0.12em] text-nihao">
                {service.title}
              </h2>
              <p className="mt-3 font-display text-[28px] font-medium leading-[1.1] tracking-tight text-ink md:text-[32px]">
                {service.headline}
              </p>
              <p className="mt-5 text-[16px] leading-[1.65] text-ink-soft">
                {service.text}
              </p>

              <div className="mt-auto pt-10">
                <a
                  href={
                    service.id === "canton"
                      ? whatsappIntents.canton
                      : service.id === "auditorias"
                        ? whatsappIntents.audit
                        : service.id === "academy"
                          ? whatsappIntents.academy
                          : buildWhatsAppLink(
                              `Hola Nihao, quiero consultar por ${service.title}.`,
                            )
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-nihao px-6 text-center text-[15px] font-medium text-white transition-colors hover:bg-nihao-deep sm:px-7"
                >
                  {service.cta ?? "Hablar con Nihao"}
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
