"use client";

import { cn } from "@/lib/utils";

type Tab = {
  id: string;
  label: string;
};

type DemoTabsProps = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
};

export function DemoTabs({ tabs, active, onChange, className }: DemoTabsProps) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-full border border-line bg-paper-soft p-1",
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-full px-4 py-2 text-[13px] font-medium transition-all",
            active === tab.id
              ? "bg-nihao text-white shadow-sm"
              : "text-ink-mute hover:bg-white hover:text-ink",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
