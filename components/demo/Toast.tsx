"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "info";

export type ToastItem = {
  id: string;
  message: string;
  type?: ToastType;
};

type ToastProps = {
  toasts: ToastItem[];
  onClose: (id: string) => void;
};

export function Toast({ toasts, onClose }: ToastProps) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={onClose} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: ToastItem; onClose: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), 2800);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      className={cn(
        "flex min-w-[260px] max-w-[360px] items-center gap-3 rounded-xl border px-4 py-3 shadow-elevated",
        toast.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-nihao/15 bg-nihao-soft text-nihao-ink",
      )}
    >
      {toast.type === "success" ? (
        <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-nihao text-[10px] font-bold text-white">
          i
        </span>
      )}
      <p className="flex-1 text-[13px] font-medium leading-snug">{toast.message}</p>
      <button
        onClick={() => onClose(toast.id)}
        className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
        aria-label="Cerrar"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </motion.div>
  );
}
