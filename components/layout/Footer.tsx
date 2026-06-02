import Image from "next/image";
import Link from "next/link";
import { AtSign, Mail, ArrowUpRight } from "lucide-react";
import { brand, navLinks } from "@/lib/content";
import { buildWhatsAppLink } from "@/lib/utils";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden bg-night text-paper">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, oklch(48% 0.214 25) 0%, transparent 40%), radial-gradient(circle at 80% 80%, oklch(64% 0.092 75) 0%, transparent 35%)",
        }}
      />
      <div className="container-page relative grid gap-14 py-20 md:grid-cols-12 md:py-24">
        <div className="md:col-span-5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-paper/5 ring-1 ring-inset ring-paper/10">
              <Image
                src="/logo-nihao.png"
                alt="Nihao"
                fill
                sizes="44px"
                className="object-contain p-1"
              />
            </span>
            <div className="flex flex-col leading-none">
              <span className="font-display text-[17px] font-medium tracking-tight">
                Nihao
              </span>
              <span className="text-[10.5px] uppercase tracking-[0.18em] text-paper/55">
                Negocios
              </span>
            </div>
          </div>
          <p className="mt-6 max-w-[42ch] text-[15px] leading-[1.6] text-paper/70">
            Hablamos tu idioma, hablamos el de ellos y sabemos movernos en
            China. Un puente estratégico entre Argentina, Latinoamérica y
            Europa, con el ecosistema comercial chino como destino.
          </p>
          <div className="mt-8 flex flex-col gap-2.5 text-sm text-paper/70">
            <a
              href={buildWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 hover:text-paper"
            >
              <span className="text-paper/45">WA</span>
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
              <AtSign className="h-3.5 w-3.5 text-paper/45" strokeWidth={1.5} />
              {brand.instagram}
            </a>
          </div>
        </div>

        <div className="md:col-span-3">
          <h4 className="text-eyebrow-mark text-paper/45">Sitio</h4>
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
          <h4 className="text-eyebrow-mark text-paper/45">Hablemos</h4>
          <p className="mt-5 text-[15px] leading-[1.6] text-paper/70">
            Contanos qué estás buscando y te ayudamos a pensar el mejor camino
            antes de tomar decisiones.
          </p>
          <a
            href={buildWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-paper px-5 text-sm font-medium text-night transition-colors hover:bg-paper-warm"
          >
            Hablar por WhatsApp
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
      <div className="relative border-t border-paper/10">
        <div className="container-page flex flex-col gap-3 py-6 text-[12.5px] text-paper/45 md:flex-row md:items-center md:justify-between">
          <span>© {year} Nihao Negocios. Todos los derechos reservados.</span>
          <span>
            {brand.domain} · Hecho con estrategia, idioma y código.
          </span>
        </div>
      </div>
    </footer>
  );
}
