"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { brand, navLinks } from "@/lib/content";
import { buildWhatsAppLink, cn } from "@/lib/utils";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 32);
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
        initial={reduced ? false : { y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "fixed inset-x-0 top-0 z-40 transition-all duration-500",
          scrolled
            ? "bg-paper/80 backdrop-blur-xl border-b border-line/70 text-ink"
            : "bg-transparent text-paper [text-shadow:0_1px_2px_oklch(0%_0_0/0.25)]",
        )}
      >
        <div className="container-page flex h-16 items-center justify-between md:h-20">
          <Link
            href="#top"
            aria-label={brand.name}
            className="group flex items-center gap-2.5"
          >
            <span
              className={cn(
                "relative flex h-9 w-9 items-center justify-center md:h-10 md:w-10",
                scrolled
                  ? ""
                  : "ring-1 ring-inset ring-paper/20 rounded-full bg-paper/10 backdrop-blur",
              )}
            >
              <Image
                src="/logo-nihao.png"
                alt="Nihao"
                fill
                sizes="40px"
                className="object-contain p-1"
                priority
              />
            </span>
            <span className="hidden flex-col leading-none md:flex">
              <span
                className={cn(
                  "font-display text-[15px] font-medium tracking-tight",
                  scrolled ? "text-ink" : "text-paper",
                )}
              >
                Nihao
              </span>
              <span
                className={cn(
                  "text-[10.5px] uppercase tracking-[0.16em]",
                  scrolled ? "text-ink-mute" : "text-paper/65",
                )}
              >
                Negocios
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors",
                  scrolled
                    ? "text-ink-soft hover:text-ink"
                    : "text-paper/85 hover:text-paper",
                )}
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={buildWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "hidden h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors sm:inline-flex",
                scrolled
                  ? "bg-nihao text-white hover:bg-nihao-deep"
                  : "bg-paper text-night hover:bg-paper-warm",
              )}
            >
              Hablar por WhatsApp
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </a>
            <button
              type="button"
              aria-label="Abrir menú"
              onClick={() => setOpen(true)}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full backdrop-blur lg:hidden",
                scrolled
                  ? "border border-line bg-paper/60 text-ink"
                  : "border border-paper/20 bg-paper/10 text-paper",
              )}
            >
              <Menu className="h-4.5 w-4.5" strokeWidth={1.75} />
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
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-3 top-3 overflow-hidden rounded-2xl border border-line bg-paper shadow-elevated"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-9 w-9 items-center justify-center">
                    <Image
                      src="/logo-nihao.png"
                      alt="Nihao"
                      fill
                      sizes="36px"
                      className="object-contain"
                    />
                  </span>
                  <span className="font-display text-[15px] font-medium text-ink">
                    Nihao
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
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-xl px-4 py-3.5 text-[15px] font-medium text-ink hover:bg-paper-warm"
                  >
                    {l.label}
                    <ArrowUpRight className="h-4 w-4 text-ink-mute" />
                  </a>
                ))}
              </nav>
              <div className="border-t border-line p-3">
                <a
                  href={buildWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-nihao text-sm font-medium text-white"
                >
                  Hablar por WhatsApp
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
