"use client";

import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  className?: string;
};

export function MetricCard({ label, value, subtext, icon, className }: MetricCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-soft transition-all hover:shadow-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wider text-ink-faint">{label}</p>
          <p className="mt-2 font-display text-3xl font-medium tracking-tight text-ink">{value}</p>
          {subtext && <p className="mt-1 text-[13px] text-ink-mute">{subtext}</p>}
        </div>
        {icon && <div className="text-nihao/80">{icon}</div>}
      </div>
    </div>
  );
}
