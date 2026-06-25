"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DetailDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function DetailDrawer({ open, onClose, title, subtitle, children }: DetailDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="absolute bottom-0 right-0 top-0 w-full max-w-lg overflow-y-auto border-l border-line bg-paper shadow-elevated sm:bottom-0 sm:top-0"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-line bg-paper/95 px-6 py-5 backdrop-blur">
              <div>
                <h3 className="font-display text-xl font-medium tracking-tight text-ink">{title}</h3>
                {subtitle && <p className="mt-1 text-[13px] text-ink-mute">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="rounded-full border border-line p-2 text-ink-mute transition-colors hover:bg-paper-warm hover:text-ink"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className={cn("p-6")}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
