import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en", "it"],
  defaultLocale: "es",
  localePrefix: "as-needed",
  pathnames: {
    "/": {
      es: "/",
      en: "/en",
      it: "/it",
    },
    "/sobre-nihao": {
      es: "/sobre-nihao",
      en: "/en/about-nihao",
      it: "/it/chi-siamo",
    },
    "/servicios": {
      es: "/servicios",
      en: "/en/services",
      it: "/it/servizi",
    },
    "/nihao-academy": {
      es: "/nihao-academy",
      en: "/en/nihao-academy",
      it: "/it/nihao-academy",
    },
    "/contacto": {
      es: "/contacto",
      en: "/en/contact",
      it: "/it/contatti",
    },
    "/ingresar": {
      es: "/ingresar",
      en: "/en/demo",
      it: "/it/demo",
    },
    "/demo/asistente": {
      es: "/demo/asistente",
      en: "/en/demo/assistant",
      it: "/it/demo/assistente",
    },
    "/demo/viajero": {
      es: "/demo/viajero",
      en: "/en/demo/traveller",
      it: "/it/demo/viaggiatore",
    },
    "/demo/admin": {
      es: "/demo/admin",
      en: "/en/demo/admin",
      it: "/it/demo/admin",
    },
  },
});
