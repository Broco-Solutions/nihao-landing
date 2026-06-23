"use client";

import { motion, useReducedMotion } from "motion/react";
import { leadCTA } from "@/lib/content";

export function HomeLeadBanner() {
  const reduced = useReducedMotion();
  return (
    <div className="border-y border-line bg-paper-soft">
      <div className="container-page">
        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-center gap-3 py-6 text-center"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-nihao" />
          <span className="text-[15px] font-medium leading-relaxed tracking-tight text-ink-soft">
            {leadCTA.short}
          </span>
        </motion.div>
      </div>
    </div>
  );
}
