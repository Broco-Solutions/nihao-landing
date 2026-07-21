"use client";

import { useTranslations } from "next-intl";
import {
  PlaneTakeoff,
  Search,
  Eye,
  PackageSearch,
  ShieldCheck,
  Languages,
  Presentation,
  Users,
} from "lucide-react";
import type { Testimonial, ServiceItem } from "./content";

export function useNavLinks() {
  const t = useTranslations();
  return [
    { href: "/", label: t("navigation.home") },
    { href: "/sobre-nihao", label: t("navigation.about") },
    { href: "/servicios", label: t("navigation.services") },
    { href: "/nihao-academy", label: t("navigation.academy") },
    { href: "/contacto", label: t("navigation.contact") },
  ];
}

export function useHeroCopy() {
  const t = useTranslations();
  return {
    eyebrow: t("home.hero.eyebrow"),
    headline: [t("home.hero.headline0"), t("home.hero.headline1")],
    highlight: t("home.hero.highlight"),
    subtitle: t("home.hero.subtitle"),
    cta: t("home.hero.cta"),
  };
}

export function useTestimonials(): Testimonial[] {
  const t = useTranslations();
  return [
    {
      quote: t("testimonials.rigran"),
      name: "Gustavo Galeano y Luis Kaufmann",
      role: "Rigran",
      image: "/assets/testimonios/gustavo-galeano-luis-kaufmann-rigran.jpeg",
      imagePosition: "82% 45%",
      imageScale: 1.2,
    },
    {
      quote: t("testimonials.magali"),
      name: "Magalí Lebihan y Tomás Lawrie",
      role: "—",
      image: "/assets/testimonios/magali-lebihan-tomas-lawrie.jpeg",
      imagePosition: "center 25%",
      imageScale: 1,
    },
    {
      quote: t("testimonials.paco"),
      name: "Paco Vaquero",
      role: "IDD",
      image: "/assets/testimonios/paco-vaquero-idd-nueva.jpeg",
      imagePosition: "center 24%",
      imageScale: 1,
    },
    {
      quote: t("testimonials.celina"),
      name: "Celina y Francisco Pontón",
      role: "OXI Mercedes",
      image: "/assets/testimonios/celina-francisco-ponton-oxi-mercedes.jpeg",
      imagePosition: "center 35%",
      imageScale: 1.32,
    },
  ];
}

export function useServices(): ServiceItem[] {
  const t = useTranslations();
  return [
    {
      id: "canton",
      title: t("services.canton.title"),
      category: "principal",
      icon: PlaneTakeoff,
      shortText: t("services.canton.headline"),
      headline: t("services.canton.headline"),
      text: t("services.canton.text"),
      cta: t("services.canton.cta"),
    },
    {
      id: "auditorias",
      title: t("services.audit.title"),
      category: "principal",
      icon: ShieldCheck,
      shortText: "",
      headline: "",
      text: t("services.audit.text"),
      cta: t("services.audit.cta"),
    },
    {
      id: "academy",
      title: "Nihao Academy",
      category: "principal",
      icon: Presentation,
      shortText: t("services.academy.cardText"),
      headline: t("services.academy.headline"),
      text: t("services.academy.text"),
      href: "/nihao-academy",
      cta: t("services.academy.cta"),
    },
    {
      id: "proveedores",
      title: t("services.sourcing.title"),
      category: "otro",
      icon: Search,
      shortText: t("services.sourcing.text"),
      text: t("services.sourcing.text"),
    },
    {
      id: "ojos",
      title: t("services.eyes.title"),
      category: "otro",
      icon: Eye,
      shortText: t("services.eyes.text"),
      text: t("services.eyes.text"),
    },
    {
      id: "muestras",
      title: t("services.samples.title"),
      category: "otro",
      icon: PackageSearch,
      shortText: t("services.samples.text"),
      text: t("services.samples.text"),
    },
    {
      id: "puente",
      title: t("services.bridge.title"),
      category: "otro",
      icon: Languages,
      shortText: t("services.bridge.text"),
      text: t("services.bridge.text"),
    },
    {
      id: "workshops",
      title: t("services.workshops.title"),
      category: "otro",
      icon: Users,
      shortText: t("services.workshops.text"),
      text: t("services.workshops.longText"),
    },
  ];
}

export function useAboutCopy() {
  const t = useTranslations();
  return {
    eyebrow: t("about.eyebrow"),
    headline: t("about.headline"),
    intro: t("about.intro"),
    introSecond: t("about.introSecond"),
  };
}

export function useTeam() {
  const t = useTranslations();
  return [
    {
      name: "Martina",
      emoji: "🌏",
      title: t("team.martina.title"),
      text: t("team.martina.text"),
    },
    {
      name: "Gianella",
      emoji: "📦",
      title: t("team.gianella.title"),
      text: t("team.gianella.text"),
    },
    {
      name: "Sofia",
      emoji: "📊",
      title: t("team.sofia.title"),
      text: t("team.sofia.text"),
    },
  ];
}

export function useCredibilityPills() {
  const t = useTranslations();
  return [
    t("about.pills.languages"),
    t("about.pills.presence"),
    t("about.pills.expertise"),
  ];
}

export function useBridgeCopy() {
  const t = useTranslations();
  return {
    eyebrow: t("bridge.eyebrow"),
    headline: t("bridge.headline"),
    nodes: {
      left: [t("bridge.latinAmerica"), "Europa"],
      center: "Nihao Negocios",
      right: ["China"],
    },
  };
}

export function useServicesPageCopy() {
  const t = useTranslations();
  return {
    eyebrow: t("services.page.eyebrow"),
    headline: t("services.page.headline"),
    intro: t("services.page.intro"),
    cta: t("services.page.cta"),
  };
}

export function useAcademyPageCopy() {
  const t = useTranslations();
  return {
    eyebrow: "Nihao Academy",
    headline: t("academy.hero.headline"),
    intro: t("academy.hero.intro"),
    cta: t("academy.hero.cta"),
    pillars: [
      t("academy.pillars.canton"),
      t("academy.pillars.visits"),
      t("academy.pillars.networking"),
      t("academy.pillars.negotiation"),
      t("academy.pillars.trade"),
      t("academy.pillars.innovation"),
      t("academy.pillars.culture"),
      t("academy.pillars.learning"),
    ],
  };
}

export function useContactPageCopy() {
  const t = useTranslations();
  return {
    eyebrow: t("contact.eyebrow"),
    headline: t("contact.headline"),
    intro: t("contact.intro"),
    sub: t("contact.sub"),
    cta: t("contact.cta"),
  };
}

export function useFaqs() {
  const t = useTranslations();
  return [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
    { q: t("faq.q5"), a: t("faq.a5") },
    { q: t("faq.q6"), a: t("faq.a6") },
    { q: t("faq.q7"), a: t("faq.a7") },
  ];
}

export function useFaqCopy() {
  const t = useTranslations();
  return {
    eyebrow: t("faq.eyebrow"),
    headline: t("faq.headline"),
    intro: t("faq.intro"),
  };
}

export function useFooterCopy() {
  const t = useTranslations();
  return {
    tagline: [t("footer.tagline"), "China made easy."],
    cta: t("footer.cta"),
  };
}

export function useLeadCTA() {
  const t = useTranslations();
  return {
    short: t("home.lead.short"),
    eyebrow: t("home.lead.eyebrow"),
    headline: t("home.lead.eyebrow"),
    intro: t("home.lead.intro"),
    cta: t("home.lead.cta"),
  };
}

import { buildWhatsAppLink } from "./utils";

export function useWhatsAppIntents() {
  const t = useTranslations();
  return {
    general: buildWhatsAppLink(t("whatsapp.general")),
    canton: buildWhatsAppLink(t("whatsapp.canton")),
    sourcing: buildWhatsAppLink(t("whatsapp.sourcing")),
    audit: buildWhatsAppLink(t("whatsapp.audit")),
    academy: buildWhatsAppLink(t("whatsapp.academy")),
    workshop: buildWhatsAppLink(t("whatsapp.workshop")),
    contact: buildWhatsAppLink(t("whatsapp.contact")),
    freeCall: buildWhatsAppLink(t("whatsapp.freeCall")),
  };
}

// WhatsApp fallback messages key
export function useWhatsAppServiceMessage() {
  const t = useTranslations();
  return t("whatsapp.serviceFallback");
}
