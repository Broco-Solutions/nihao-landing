"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { X, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ServiceItem } from "@/lib/content";
import { useWhatsAppIntents } from "@/lib/content-i18n";
import { buildWhatsAppLink, cn } from "@/lib/utils";

export function ServiceDrawer({
  service,
  onClose,
}: {
  service: ServiceItem | null;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const t = useTranslations();
  const whatsappIntents = useWhatsAppIntents();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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

  const panelVariants = isMobile
    ? {
        initial: { y: "100%" },
        animate: { y: 0 },
        exit: { y: "100%" },
      }
    : {
        initial: { opacity: 0, scale: 0.96, y: 16 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.96, y: 16 },
      };

  const intentMap: Record<string, string> = {
    canton: whatsappIntents.canton,
    auditorias: whatsappIntents.audit,
    academy: whatsappIntents.academy,
    proveedores: whatsappIntents.sourcing,
    workshops: whatsappIntents.workshop,
  };

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
            role="dialog"
            aria-modal="true"
            aria-label={service.title}
            initial={reduced ? false : panelVariants.initial}
            animate={panelVariants.animate}
            exit={reduced ? undefined : panelVariants.exit}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "absolute z-10 w-full overflow-y-auto bg-paper shadow-elevated outline-none",
              isMobile
                ? "inset-x-0 bottom-0 max-h-[85svh] rounded-t-2xl"
                : "left-1/2 top-1/2 max-h-[85svh] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl",
            )}
          >
            <div className="p-6 md:p-8">
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

              <h2 className="mt-6 font-display text-[15px] font-medium uppercase tracking-[0.12em] text-nihao">
                {service.title}
              </h2>
              {service.headline && (
                <p className="mt-3 font-display text-[28px] font-medium leading-[1.1] tracking-tight text-ink md:text-[32px]">
                  {service.headline}
                </p>
              )}
              {service.text && (
                <p className="mt-4 text-[16px] leading-[1.65] text-ink-soft">
                  {service.text}
                </p>
              )}

              <div className="mt-8">
                <a
                  href={
                    intentMap[service.id] ??
                    buildWhatsAppLink(
                      t("whatsapp.serviceFallback").replace("{servicio}", service.title),
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
