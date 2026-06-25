"use client";

import { cn } from "@/lib/utils";
import type { InterestLevel } from "./demo-data";
import { interestColor, statusColor } from "./demo-data";

type StatusBadgeProps = {
  children: React.ReactNode;
  type?: "interest" | "status";
  value?: InterestLevel | string;
  className?: string;
};

export function StatusBadge({ children, type = "status", value, className }: StatusBadgeProps) {
  const colorKey = value?.toLowerCase() || String(children).toLowerCase();
  const color =
    type === "interest"
      ? interestColor[colorKey as InterestLevel] || interestColor.bajo
      : statusColor[colorKey] || "bg-paper-warm text-ink-soft ring-line";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1",
        color,
        className,
      )}
    >
      {children}
    </span>
  );
}
