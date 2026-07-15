"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, X, ArrowUpRight, LogIn, Globe } from "lucide-react";
import { useNavLinks } from "@/lib/content-i18n";
import { buildWhatsAppLink, cn } from "@/lib/utils";
import { usePathname } from "@/i18n/navigation";
import { useParams } from "next/navigation";

export function Navbar() {
  const t = useTranslations();
  const navLinks = useNavLinks();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const params = useParams();
  const locale = (params?.locale as string) ?? "es";

  const locales = [
    { code: "es", label: "Español", short: "ES" },
    { code: "en", label: "English", short: "EN" },
    { code: "it", label: "Italiano", short: "IT" },
  ];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLangOpen(false);
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <motion.header
        initial={false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "fixed inset-x-0 top-0 z-40 transition-all duration-500",
          scrolled
            ? "bg-nihao/95 backdrop-blur-md border-b border-white/10"
            : "bg-nihao border-b border-white/10",
        )}
      >
        <div className="container-page flex h-[72px] items-center justify-between md:h-20">
          <Link
            href="/"
            aria-label="Nihao Negocios"
            className="group flex items-center gap-4"
          >
            <span
              className={cn(
                "relative flex h-[52px] w-[52px] items-center justify-center overflow-visible transition-all duration-500 md:h-14 md:w-14",
              )}
            >
              <Image
                src="/logo-nihao.png"
                alt="Nihao"
                fill
                sizes="56px"
                className="scale-[1.35] object-contain object-center transition-transform duration-500 group-hover:scale-[1.42] md:scale-[1.45] md:group-hover:scale-[1.52]"
                style={{
                  objectPosition: "50% 50%",
                  filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
                }}
                priority
              />
            </span>
            <span className="hidden flex-col leading-none md:flex">
              <span
                className={cn(
                  "font-display text-[18px] font-semibold tracking-tight transition-colors md:text-[21px]",
                  "text-paper",
                )}
              >
                NIHAO
              </span>
              <span
                className={cn(
                  "text-[11px] uppercase tracking-[0.16em] transition-colors",
                  "text-paper/70",
                )}
              >
                Negocios
              </span>
            </span>
          </Link>

          <nav
            className="hidden items-center gap-2 lg:flex"
            aria-label={t("a11y.mainNav")}
          >
            {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href as "/"}
                  className={cn(
                    "rounded-full px-3.5 py-2.5 text-[14.5px] font-medium transition-colors",
                    "text-paper/85 hover:bg-white/10 hover:text-paper",
                  )}
                >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block" ref={langRef}>
              <button
                type="button"
                onClick={() => setLangOpen(!langOpen)}
                aria-label={`${t("language.select")} ${locale.toUpperCase()}`}
                aria-expanded={langOpen}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
                  "border border-white/30 bg-white/10 text-paper backdrop-blur-sm hover:bg-white/20",
                )}
              >
                <Globe className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{locales.find((l) => l.code === locale)?.short}</span>
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 overflow-hidden rounded-xl border border-line bg-paper shadow-elevated">
                  {locales.map((l) => (
                    <Link
                      key={l.code}
                      href={pathname as "/"}
                      locale={l.code}
                      onClick={() => setLangOpen(false)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 text-[14px] font-medium transition-colors hover:bg-paper-warm",
                        locale === l.code ? "text-nihao" : "text-ink",
                      )}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link
              href="/ingresar"
              className={cn(
                "hidden h-11 items-center gap-2 rounded-full px-5 text-[13px] font-medium transition-colors sm:inline-flex",
                "border border-white/30 bg-white/10 text-paper backdrop-blur-sm hover:bg-white/20",
              )}
            >
              {t("navigation.signin")}
              <LogIn className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
            <a
              href={buildWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "hidden h-11 items-center gap-2 rounded-full px-5 text-[13px] font-medium transition-colors sm:inline-flex",
                "bg-paper text-nihao shadow-[0_10px_28px_-10px_oklch(20%_0.02_30/0.35)] hover:bg-paper-warm",
              )}
            >
              {t("navigation.talkToNihao")}
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </a>
            <button
              type="button"
              aria-label={t("a11y.openMenu")}
              onClick={() => setOpen(true)}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full backdrop-blur lg:hidden",
                "border border-white/20 bg-white/10 text-paper",
              )}
            >
              <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            <div
              className="absolute inset-0 bg-ink/40 backdrop-blur-md"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={reduced ? false : { y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? undefined : { y: -10, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-3 top-3 overflow-hidden rounded-2xl border border-line bg-paper shadow-elevated"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-11 w-11 items-center justify-center overflow-visible">
                    <Image
                      src="/logo-nihao.png"
                      alt="Nihao"
                      fill
                      sizes="44px"
                      className="scale-[1.3] object-contain"
                    />
                  </span>
                  <span className="font-display text-[16px] font-medium text-ink">
                    Nihao Negocios
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("a11y.closeMenu")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
              <nav className="flex flex-col p-2" aria-label={t("a11y.mobileNav")}>
                {navLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href as "/"}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-xl px-4 py-3.5 text-[15px] font-medium text-ink hover:bg-paper-warm"
                  >
                    {l.label}
                    <ArrowUpRight className="h-4 w-4 text-ink-mute" />
                  </Link>
                ))}
              </nav>
              <div className="border-t border-line px-4 py-3">
                <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.12em] text-ink-mute">
                  {locales.find((l) => l.code === locale)?.label}
                </p>
                <div className="flex gap-2">
                  {locales.map((l) => (
                    <Link
                      key={l.code}
                      href={pathname as "/"}
                      locale={l.code}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "rounded-full px-4 py-2 text-[14px] font-medium transition-colors",
                        locale === l.code
                          ? "bg-nihao text-white"
                          : "border border-line bg-paper text-ink hover:bg-paper-warm",
                      )}
                    >
                      {l.short}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="border-t border-line p-3">
                <Link
                  href="/ingresar"
                  onClick={() => setOpen(false)}
                  className="mb-2 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line bg-paper text-sm font-medium text-ink transition-colors hover:bg-paper-warm"
                >
                  {t("navigation.signin")}
                  <LogIn className="h-4 w-4" />
                </Link>
                <a
                  href={buildWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-nihao text-sm font-medium text-white"
                >
                  {t("navigation.talkToNihao")}
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
