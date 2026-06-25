"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, X, ArrowUpRight, LogIn } from "lucide-react";
import { navLinks } from "@/lib/content";
import { buildWhatsAppLink, cn } from "@/lib/utils";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

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
            aria-label="Principal"
          >
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
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
            <Link
              href="/ingresar"
              className={cn(
                "hidden h-11 items-center gap-2 rounded-full px-5 text-[13px] font-medium transition-colors sm:inline-flex",
                "border border-white/30 bg-white/10 text-paper backdrop-blur-sm hover:bg-white/20",
              )}
            >
              Ingresar
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
              Hablar con Nihao
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </a>
            <button
              type="button"
              aria-label="Abrir menú"
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
                  aria-label="Cerrar menú"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
              <nav className="flex flex-col p-2" aria-label="Móvil">
                {navLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-xl px-4 py-3.5 text-[15px] font-medium text-ink hover:bg-paper-warm"
                  >
                    {l.label}
                    <ArrowUpRight className="h-4 w-4 text-ink-mute" />
                  </Link>
                ))}
              </nav>
              <div className="border-t border-line p-3">
                <Link
                  href="/ingresar"
                  onClick={() => setOpen(false)}
                  className="mb-2 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line bg-paper text-sm font-medium text-ink transition-colors hover:bg-paper-warm"
                >
                  Ingresar
                  <LogIn className="h-4 w-4" />
                </Link>
                <a
                  href={buildWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-nihao text-sm font-medium text-white"
                >
                  Hablar con Nihao
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
