import Image from "next/image";
import Link from "next/link";
import { Mail, MessageCircle, ArrowUpRight } from "lucide-react";
import { brand, footerCopy, navLinks } from "@/lib/content";
import { buildWhatsAppLink } from "@/lib/utils";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden bg-night text-paper">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, #931111 0%, transparent 40%), radial-gradient(circle at 80% 80%, #C49330 0%, transparent 35%)",
        }}
      />
      <div className="container-page relative grid gap-14 py-20 md:grid-cols-12 md:py-24">
        <div className="md:col-span-5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-12 w-12 items-center justify-center">
              <Image
                src="/logo-nihao.png"
                alt="Nihao"
                fill
                sizes="48px"
                className="object-contain"
              />
            </span>
            <div className="flex flex-col leading-none">
              <span className="font-display text-[18px] font-medium tracking-tight">
                Nihao
              </span>
              <span className="text-[11px] uppercase tracking-[0.16em] text-paper/55">
                Negocios
              </span>
            </div>
          </div>
          <p className="mt-7 max-w-[36ch] font-display text-[22px] font-medium leading-[1.25] tracking-tight text-paper">
            {footerCopy.tagline[0]}
            <span className="text-nihao"> {footerCopy.tagline[1]}</span>
          </p>
          <div className="mt-8 flex flex-col gap-2.5 text-sm text-paper/70">
            <a
              href={buildWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 hover:text-paper"
            >
              <MessageCircle className="h-3.5 w-3.5 text-paper/45" strokeWidth={1.5} />
              {brand.whatsapp}
              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
            <a
              href={`mailto:${brand.email}`}
              className="group inline-flex items-center gap-2 hover:text-paper"
            >
              <Mail className="h-3.5 w-3.5 text-paper/45" strokeWidth={1.5} />
              {brand.email}
            </a>
            <a
              href={`https://instagram.com/${brand.instagram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 hover:text-paper"
            >
              <InstagramIcon className="h-3.5 w-3.5 text-paper/45" />
              {brand.instagram.replace("@", "")}
            </a>
          </div>
        </div>

        <div className="md:col-span-3 md:col-start-7">
          <h4 className="text-[11px] uppercase tracking-[0.16em] text-paper/45">
            Sitio
          </h4>
          <ul className="mt-5 flex flex-col gap-3 text-[15px] text-paper/75">
            {navLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-paper">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="md:col-span-4">
          <h4 className="text-[11px] uppercase tracking-[0.16em] text-paper/45">
            Hablemos
          </h4>
          <p className="mt-5 text-[15px] leading-[1.6] text-paper/70">
            Contanos qué estás buscando y te ayudamos a pensar el mejor camino.
          </p>
          <a
            href={buildWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-nihao px-5 text-sm font-medium text-white transition-colors hover:bg-nihao-deep"
          >
            {footerCopy.cta}
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
      <div className="relative border-t border-paper/10">
        <div className="container-page flex flex-col gap-4 py-6 text-[12.5px] text-paper/45 md:flex-row md:items-center md:justify-between">
          <span>© {year} Nihao Negocios. Todos los derechos reservados.</span>
          <a
            href="https://www.brocosolutions.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 transition-colors hover:text-paper/70"
          >
            <span>Tecnología y desarrollo por</span>
            <span className="relative flex h-4 w-16 items-center justify-center overflow-hidden">
              <Image
                src="/logos/broco-solutions-logo.png"
                alt="Broco Solutions"
                fill
                sizes="64px"
                className="object-contain opacity-80 transition-opacity group-hover:opacity-100"
              />
            </span>
          </a>
          <span>{brand.domain}</span>
        </div>
      </div>
    </footer>
  );
}
