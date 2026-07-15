"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ArrowUpRight, ChevronLeft, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function DemoHeader() {
  const pathname = usePathname();
  const isIngresar = pathname === "/ingresar";
  const t = useTranslations();
  const [mobileOpen, setMobileOpen] = useState(false);

  const demoNav = [
    { href: "/demo/asistente" as any, label: t("demo.header.assistant") },
    { href: "/demo/viajero" as any, label: t("demo.header.traveller") },
    { href: "/demo/admin" as any, label: "Nihao" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="container-page flex h-[68px] items-center justify-between md:h-[72px]">
        <div className="flex items-center gap-4 md:gap-6">
          <Link href={"/ingresar" as any} className="group flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center overflow-visible md:h-11 md:w-11">
              <Image
                src="/logo-nihao.png"
                alt="Nihao"
                fill
                sizes="44px"
                className="scale-[1.35] object-contain transition-transform duration-500 group-hover:scale-[1.42]"
              />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-display text-[16px] font-semibold tracking-tight text-ink md:text-[18px]">
                NIHAO
              </span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-ink-faint md:text-[11px]">
                {t("demo.header.demo")}
              </span>
            </span>
          </Link>

          {!isIngresar && (
            <>
              <nav className="hidden items-center gap-1 md:flex" aria-label={t("demo.header.menuLabel")}>
                {demoNav.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href as any}
                      className={cn(
                        "rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-nihao text-white"
                          : "text-ink-mute hover:bg-paper-warm hover:text-ink",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="relative md:hidden">
                <button
                  onClick={() => setMobileOpen((v) => !v)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-paper px-3 text-[12px] font-medium text-ink-mute"
                  aria-label={t("demo.header.menuLabel")}
                >
                  {mobileOpen ? <X className="h-4 w-4" strokeWidth={2} /> : <Menu className="h-4 w-4" strokeWidth={2} />}
                  {t("demo.header.demo")}
                </button>
                {mobileOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 w-44 rounded-xl border border-line bg-paper p-1.5 shadow-elevated">
                    {demoNav.map((item) => {
                      const active = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href as any}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "block rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                            active ? "bg-nihao text-white" : "text-ink hover:bg-paper-warm",
                          )}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {!isIngresar && (
            <Link
              href={"/ingresar" as any}
              className={cn(
                "hidden items-center gap-1.5 rounded-full border border-line px-3 py-2 text-[12px] font-medium text-ink-mute transition-colors hover:border-nihao/30 hover:text-nihao md:inline-flex",
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
              {t("demo.header.portal")}
            </Link>
          )}
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-nihao px-4 text-[12px] font-medium text-white transition-colors hover:bg-nihao-deep md:h-10 md:px-5 md:text-[13px]"
          >
            Nihao Negocios
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </header>
  );
}
