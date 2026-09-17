"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUpRight, ChevronLeft, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export function DemoHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname();
  const isIngresar = pathname === "/ingresar" || pathname === "/demo" || pathname.endsWith("/demo");
  const t = useTranslations();
  const locale = pathname.startsWith("/en/") || pathname === "/en" ? "en" : pathname.startsWith("/it/") || pathname === "/it" ? "it" : "es";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="container-page flex h-[68px] items-center justify-between md:h-[72px]">
        <Link href={"/ingresar" as never} className="group flex items-center gap-3">
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
              Negocios
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2 md:gap-3">
          {!isIngresar && (
            <Link
              href={"/ingresar" as never}
              className={cn(
                "hidden items-center gap-1.5 rounded-full border border-line px-3 py-2 text-[12px] font-medium text-ink-mute transition-colors hover:border-nihao/30 hover:text-nihao md:inline-flex",
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
              {t("demo.header.portal")}
            </Link>
          )}
          {isAuthenticated && (
            <form action="/api/demo/logout" method="post">
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[11px] font-medium text-ink-mute transition-colors hover:border-nihao/30 hover:text-nihao md:h-10 md:px-4 md:text-[12px]"
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
                {t("demo.header.logout")}
              </button>
            </form>
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
