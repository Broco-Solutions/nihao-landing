import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en", "it"],
  defaultLocale: "es",
  localePrefix: "as-needed",
  pathnames: {
    "/": "/",
    "/sobre-nihao": {
      es: "/sobre-nihao",
      en: "/about-nihao",
      it: "/chi-siamo",
    },
    "/servicios": {
      es: "/servicios",
      en: "/services",
      it: "/servizi",
    },
    "/nihao-academy": {
      es: "/nihao-academy",
      en: "/nihao-academy",
      it: "/nihao-academy",
    },
    "/contacto": {
      es: "/contacto",
      en: "/contact",
      it: "/contatti",
    },
    "/ingresar": {
      es: "/demo",
      en: "/demo",
      it: "/demo",
    },
    "/demo/asistente": {
      es: "/demo/asistente",
      en: "/demo/assistant",
      it: "/demo/assistente",
    },
    "/demo/viajero": {
      es: "/demo/viajero",
      en: "/demo/traveller",
      it: "/demo/viaggiatore",
    },
    "/demo/admin": {
      es: "/demo/admin",
      en: "/demo/admin",
      it: "/demo/admin",
    },
  },
});
