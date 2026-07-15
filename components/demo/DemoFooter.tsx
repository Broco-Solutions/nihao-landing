"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

export function DemoFooter() {
  const t = useTranslations();
  return (
    <footer className="border-t border-line bg-paper-soft">
      <div className="container-page flex flex-col items-center justify-between gap-3 py-5 text-[12px] text-ink-faint md:flex-row">
        <a
          href="https://www.brocosolutions.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1.5 transition-colors hover:text-ink-mute"
        >
          <span className="relative flex h-4 w-16 items-center justify-center overflow-hidden">
            <Image
              src="/logos/broco-solutions-logo.png"
              alt="Broco Solutions"
              fill
              sizes="64px"
              className="object-contain opacity-80 transition-opacity group-hover:opacity-100"
            />
          </span>
          <span className="font-medium text-ink-soft transition-colors group-hover:text-nihao">
            {t("demo.general.poweredBy")}
          </span>
        </a>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-nihao/10 px-2.5 py-1 text-[11px] font-medium text-nihao">
            {t("demo.general.demoLabel")}
          </span>
        </div>
      </div>
    </footer>
  );
}
