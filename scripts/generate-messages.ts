import fs from "fs";
import path from "path";

interface TranslationRecord {
  sheet: string;
  area: string;
  location: string;
  es: string;
  en: string;
  it: string;
  note: string;
  status: string;
}

const sourcePath = path.join(__dirname, "..", "nihao-translations-source.json");
const messagesDir = path.join(__dirname, "..", "messages");
const manifestPath = path.join(__dirname, "..", "i18n", "translation-map.json");

const records: TranslationRecord[] = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));

// Map from location patterns to clean keys
function locationToKey(loc: string, es: string, index: number): string {
  // Strip the file path prefix, keep the logical path
  loc = loc.replace(/\.tsx?/g, "");

  // Handle content.ts patterns
  if (loc.includes("navLinks")) {
    const map: Record<string, string> = {
      Home: "navigation.home",
      "Sobre Nihao": "navigation.about",
      Servicios: "navigation.services",
      "Nihao Academy": "navigation.academy",
      Contacto: "navigation.contact",
    };
    const match = Object.entries(map).find(([k]) => es === k);
    if (match) return match[1];
  }
  if (loc.includes("whatsappIntents")) {
    const map: Record<string, string> = {
      "Hola Nihao, quiero recibir información para viajar a la Feria de Cantón.": "whatsapp.canton",
      "Hola Nihao, quiero buscar proveedores en China y conocer cómo trabajan el sourcing.": "whatsapp.sourcing",
      "Hola Nihao, quiero solicitar una auditoría de fábrica y entender el proceso.": "whatsapp.audit",
      "Hola Nihao, quiero conocer Nihao Academy y los programas de inmersión.": "whatsapp.academy",
      "Hola Nihao, quiero prepararme antes de viajar y conocer los workshops.": "whatsapp.workshop",
      "Hola Nihao, quiero recibir información sobre sus servicios.": "whatsapp.contact",
      "Hola Nihao, quiero agendar mi primera llamada gratis.": "whatsapp.freeCall",
    };
    const match = Object.entries(map).find(([k]) => es.includes(k?.split(".")?.[0] ?? ""));
    if (match) return match[1];
  }
  if (loc.includes("heroCopy.eyebrow")) return "home.hero.eyebrow";
  if (loc.includes("heroCopy.headline[0]")) return "home.hero.headline0";
  if (loc.includes("heroCopy.headline[1]")) return "home.hero.headline1";
  if (loc.includes("heroCopy.highlight")) return "home.hero.highlight";
  if (loc.includes("heroCopy.subtitle")) return "home.hero.subtitle";
  if (loc.includes("heroCopy.cta")) return "home.hero.cta";
  if (loc.includes("HomeHeroSection") && loc.includes("alt")) return "home.hero.imageAlt";
  if (loc.includes("tagline")) return "brand.tagline";
  if (loc.includes("leadCTA.short")) return "home.lead.short";
  if (loc.includes("leadCTA.eyebrow") || loc.includes("leadCTA.headline")) return "home.lead.eyebrow";
  if (loc.includes("leadCTA.intro")) return "home.lead.intro";
  if (loc.includes("leadCTA.cta")) return "home.lead.cta";
  if (loc.includes("HomeClosingCTA") && es.includes("Sin compromiso")) return "home.closing.noObligation";
  if (loc.includes("aboutCopy.eyebrow")) return "about.eyebrow";
  if (loc.includes("aboutCopy.headline")) return "about.headline";
  if (loc.includes("aboutCopy.intro") && !loc.includes("Second")) return "about.intro";
  if (loc.includes("aboutCopy.introSecond")) return "about.introSecond";
  if (loc.includes("credibilityPills") && es.includes("Español")) return "about.pills.languages";
  if (loc.includes("credibilityPills") && es.includes("Presencia")) return "about.pills.presence";
  if (loc.includes("credibilityPills") && es.includes("Comercio Internacional")) return "about.pills.expertise";
  if (loc.includes("AboutTeaserSection")) return "about.learnMore";
  if (loc.includes("TeamSection") && loc.includes("eyebrow")) return "team.eyebrow";
  if (loc.includes("TeamSection") && es === "Quiénes somos") return "team.eyebrow";
  if (loc.includes("TeamSection") && es.includes("Tres profesionales")) return "team.title";
  if (loc.includes("team.Martina.title")) return "team.martina.title";
  if (loc.includes("team.Martina.text")) return "team.martina.text";
  if (loc.includes("team.Gianella.title")) return "team.gianella.title";
  if (loc.includes("team.Gianella.text")) return "team.gianella.text";
  if (loc.includes("team.Sofia.title")) return "team.sofia.title";
  if (loc.includes("team.Sofia.text")) return "team.sofia.text";
  if (loc.includes("bridgeCopy.eyebrow")) return "bridge.eyebrow";
  if (loc.includes("bridgeCopy.headline")) return "bridge.headline";
  if (loc.includes("bridgeCopy.nodes") && es === "Latinoamérica") return "bridge.latinAmerica";
  if (loc.includes("BridgeSection") && es.includes("Puente entre")) return "bridge.ariaLabel";
  if (loc.includes("servicesPageCopy.eyebrow")) return "services.page.eyebrow";
  if (loc.includes("servicesPageCopy.headline")) return "services.page.headline";
  if (loc.includes("servicesPageCopy.intro")) return "services.page.intro";
  if (loc.includes("servicesPageCopy.cta")) return "services.page.cta";
  if (loc.includes("HomeServicesSection") && es.includes("Criterio")) return "home.services.title";
  if (loc.includes("HomeServicesSection") && es.includes("Ver todos")) return "home.services.viewAll";
  if (loc.includes("ServicesGridSection") && es.includes("Servicios principales")) return "services.mainTitle";
  if (loc.includes("ServicesGridSection") && es.includes("Otros servicios")) return "services.otherTitle";
  if (loc.includes("services.canton.title")) return "services.canton.title";
  if (loc.includes("services.canton.shortText")) return "services.canton.headline";
  if (loc.includes("services.canton.text")) return "services.canton.text";
  if (loc.includes("services.canton.cta")) return "services.canton.cta";
  if (loc.includes("services.auditorias.title")) return "services.audit.title";
  if (loc.includes("services.auditorias.text")) return "services.audit.text";
  if (loc.includes("services.auditorias.cta")) return "services.audit.cta";
  if (loc.includes("services.academy.shortText")) return "services.academy.headline";
  if (loc.includes("services.academy.text")) return "services.academy.text";
  if (loc.includes("services.academy.cta")) return "services.academy.cta";
  if (loc.includes("Búsqueda de proveedores") && loc.includes("title")) return "services.sourcing.title";
  if (loc.includes("Búsqueda de proveedores") && es.includes("Fabricantes")) return "services.sourcing.text";
  if (loc.includes("Tus ojos en China") && loc.includes("title")) return "services.eyes.title";
  if (loc.includes("Tus ojos en China") && es.includes("representamos")) return "services.eyes.text";
  if (loc.includes("Análisis de muestras") && loc.includes("title")) return "services.samples.title";
  if (loc.includes("Análisis de muestras") && es.includes("Revisamos")) return "services.samples.text";
  if (loc.includes("Puente cultural") && loc.includes("title")) return "services.bridge.title";
  if (loc.includes("Puente cultural") && es.includes("Reuniones")) return "services.bridge.text";
  if (loc.includes("Workshops") && loc.includes("title")) return "services.workshops.title";
  if (loc.includes("Workshops") && es.includes("Preparación")) return "services.workshops.text";
  if (loc.includes("Workshops") && es.includes("metodología")) return "services.workshops.longText";
  if (loc.includes("academyPageCopy.headline")) return "academy.hero.headline";
  if (loc.includes("academyPageCopy.intro")) return "academy.hero.intro";
  if (loc.includes("academyPageCopy.cta")) return "academy.hero.cta";
  if (loc.includes("AcademyHeroSection") && es.includes("Lo que vas")) return "academy.pillarsTitle";
  if (loc.includes("academyPageCopy.pillars") && es.includes("Feria de Cantón")) return "academy.pillars.canton";
  if (loc.includes("academyPageCopy.pillars") && es.includes("Visitas a empresas")) return "academy.pillars.visits";
  if (loc.includes("academyPageCopy.pillars") && es.includes("Networking internacional")) return "academy.pillars.networking";
  if (loc.includes("academyPageCopy.pillars") && es.includes("Negociación")) return "academy.pillars.negotiation";
  if (loc.includes("academyPageCopy.pillars") && es.includes("Comercio internacional")) return "academy.pillars.trade";
  if (loc.includes("academyPageCopy.pillars") && es.includes("Innovación")) return "academy.pillars.innovation";
  if (loc.includes("academyPageCopy.pillars") && es.includes("Cultura china")) return "academy.pillars.culture";
  if (loc.includes("academyPageCopy.pillars") && es.includes("Aprendizaje")) return "academy.pillars.learning";
  if (loc.includes("AcademyHeroSection") && loc.includes("alt")) return "academy.hero.imageAlt";
  if (loc.includes("contactPageCopy.eyebrow")) return "contact.eyebrow";
  if (loc.includes("contactPageCopy.headline")) return "contact.headline";
  if (loc.includes("contactPageCopy.intro")) return "contact.intro";
  if (loc.includes("contactPageCopy.sub")) return "contact.sub";
  if (loc.includes("contactPageCopy.cta")) return "contact.cta";
  if (loc.includes("faqCopy.eyebrow")) return "faq.eyebrow";
  if (loc.includes("faqCopy.headline")) return "faq.headline";
  if (loc.includes("faqCopy.intro")) return "faq.intro";
  if (loc.includes("faqs") && es.includes("¿Necesito experiencia")) return "faq.q1";
  if (loc.includes("faqs") && es.includes("No. Trabajamos tanto")) return "faq.a1";
  if (loc.includes("faqs") && es.includes("¿Pueden ayudarme")) return "faq.q2";
  if (loc.includes("faqs") && es.includes("Sí. Primero nos sentamos")) return "faq.a2";
  if (loc.includes("faqs") && es.includes("¿Qué pasa si no puedo")) return "faq.q3";
  if (loc.includes("faqs") && es.includes("Podemos representarte")) return "faq.a3";
  if (loc.includes("faqs") && es.includes("¿Realizan auditorías")) return "faq.q4";
  if (loc.includes("faqs") && es.includes("Sí. Auditamos fábricas")) return "faq.a4";
  if (loc.includes("faqs") && es.includes("¿Se necesita visa")) return "faq.q5";
  if (loc.includes("faqs") && es.includes("Depende de tu nacionalidad")) return "faq.a5";
  if (loc.includes("faqs") && es.includes("¿Necesito hablar inglés")) return "faq.q6";
  if (loc.includes("faqs") && es.includes("No. Nosotras hablamos")) return "faq.a6";
  if (loc.includes("faqs") && es.includes("¿Solo trabajan con empresas")) return "faq.q7";
  if (loc.includes("faqs") && es.includes("No. Acompañamos emprendedores")) return "faq.a7";
  if (loc.includes("FAQSection") && es.includes("Preguntas frecuentes")) return "faq.ariaLabel";
  if (loc.includes("TestimonialsSection") && loc.includes("eyebrow")) return "testimonials.eyebrow";
  if (loc.includes("TestimonialsSection") && loc.includes("title")) return "testimonials.title";
  if (loc.includes("Rigran")) return "testimonials.rigran";
  if (loc.includes("Magalí")) return "testimonials.magali";
  if (loc.includes("Paco")) return "testimonials.paco";
  if (loc.includes("Celina")) return "testimonials.celina";
  if (loc.includes("Ampliar foto")) return "testimonials.enlargePhoto";
  if (loc.includes("Foto de ") && !loc.includes("ampliada")) return "testimonials.photoOf";
  if (loc.includes("Foto ampliada")) return "testimonials.enlargedPhoto";
  if (loc.includes("TestimonialsSection") && es === "Cerrar") return "testimonials.close";
  if (loc.includes("Footer") && es === "Sitio") return "footer.siteTitle";
  if (loc.includes("Footer") && es === "Hablemos") return "footer.talkTitle";
  if (loc.includes("Footer") && es.includes("Contanos qué estás")) return "footer.talkText";
  if (loc.includes("footerCopy.tagline[0]")) return "footer.tagline";
  if (loc.includes("footerCopy.cta")) return "footer.cta";
  if (loc.includes("Footer") && es.includes("Todos los derechos")) return "footer.rights";
  if (loc.includes("Footer") && es.includes("Tecnología")) return "footer.tech";
  if (loc.includes("HomeCTASection") && es.includes("El primer paso")) return "home.contact.title";
  if (loc.includes("HomeCTASection") && es.includes("Sin compromiso. Solo")) return "home.contact.sub";
  if (loc.includes("HomeCTASection") && es.includes("Contactate")) return "home.contact.cta";

  // Navbar
  if (loc.includes("Navbar") && es === "Ingresar") return "navigation.signin";
  if (loc.includes("Navbar") && es === "Hablar con Nihao") return "navigation.talkToNihao";
  if (loc.includes("Navbar") && es === "Principal") return "a11y.mainNav";
  if (loc.includes("Navbar") && es === "Abrir menú") return "a11y.openMenu";
  if (loc.includes("Navbar") && es === "Cerrar menú") return "a11y.closeMenu";
  if (loc.includes("Navbar") && es === "Móvil") return "a11y.mobileNav";
  if (loc.includes("WhatsAppFloatingButton")) return "a11y.whatsappButton";

  // SEO
  if (loc.includes("layout") && loc.includes("title.default")) return "seo.title";
  if (loc.includes("layout") && loc.includes("description")) return "seo.description";
  if (loc.includes("layout") && loc.includes("keywords") && es.includes("negocios con China")) return "seo.keywords.business";
  if (loc.includes("layout") && loc.includes("keywords") && es.includes("proveedores en China")) return "seo.keywords.suppliers";
  if (loc.includes("layout") && loc.includes("keywords") && es.includes("Feria de Cantón")) return "seo.keywords.canton";
  if (loc.includes("layout") && loc.includes("keywords") && es.includes("sourcing China")) return "seo.keywords.sourcing";
  if (loc.includes("layout") && loc.includes("keywords") && es.includes("auditoría de fábrica")) return "seo.keywords.audit";
  if (loc.includes("layout") && loc.includes("keywords") && es.includes("importaciones China")) return "seo.keywords.imports";
  if (loc.includes("layout") && loc.includes("keywords") && es.includes("acompañamiento en China")) return "seo.keywords.support";
  if (loc.includes("layout") && loc.includes("keywords") && es.includes("comercio internacional China")) return "seo.keywords.trade";
  if (loc.includes("layout") && loc.includes("Open Graph title")) return "seo.ogTitle";
  if (loc.includes("layout") && loc.includes("Open Graph description")) return "seo.ogDescription";
  if (loc.includes("layout") && loc.includes("Twitter description")) return "seo.twitterDescription";
  if (loc.includes("/contacto/page") && loc.includes("title")) return "seo.contactTitle";
  if (loc.includes("/contacto/page") && loc.includes("description")) return "seo.contactDescription";
  if (loc.includes("/servicios/page") && loc.includes("title")) return "seo.servicesTitle";
  if (loc.includes("/servicios/page") && loc.includes("description")) return "seo.servicesDescription";
  if (loc.includes("/sobre-nihao/page") && loc.includes("title")) return "seo.aboutTitle";
  if (loc.includes("/sobre-nihao/page") && loc.includes("description")) return "seo.aboutDescription";
  if (loc.includes("/nihao-academy/page") && loc.includes("title")) return "seo.academyTitle";
  if (loc.includes("/nihao-academy/page") && loc.includes("description")) return "seo.academyDescription";

  // Demo section
  if (loc.includes("layout") && loc.includes("title") && es.includes("Portal del Asistente")) return "demo.seo.title";
  if (loc.includes("layout") && loc.includes("description") && es.includes("Demo interactiva")) return "demo.seo.description";
  if (loc.includes("DemoHeader") && es === "Asistente") return "demo.header.assistant";
  if (loc.includes("DemoHeader") && es === "Viajero") return "demo.header.traveller";
  if (loc.includes("DemoHeader") && es === "Demo") return "demo.header.demo";
  if (loc.includes("DemoHeader") && es === "Portal") return "demo.header.portal";
  if (loc.includes("DemoHeader") && es.includes("Menú demo")) return "demo.header.menuLabel";
  if (loc.includes("ingresar/page") && es === "Demo interactiva") return "demo.login.eyebrow";
  if (loc.includes("ingresar/page") && es.includes("Portal del Asistente Nihao") && !es.includes("Demo")) return "demo.login.title";
  if (loc.includes("ingresar/page") && es.includes("Una demo interactiva")) return "demo.login.intro";
  if (loc.includes("ingresar/page") && es.includes("Conocer Asistente")) return "demo.login.cta1";
  if (loc.includes("ingresar/page") && es.includes("Explorá conversaciones")) return "demo.login.card1Text";
  if (loc.includes("ingresar/page") && es.includes("Ver simulador")) return "demo.login.card1Cta";
  if (loc.includes("ingresar/page") && es.includes("Entrar como viajero demo")) return "demo.login.card2Cta";
  if (loc.includes("ingresar/page") && es.includes("Visualizá el tablero")) return "demo.login.card2Text";
  if (loc.includes("ingresar/page") && es.includes("Entrar como viajero") && !es.includes("demo")) return "demo.login.card2Cta2";
  if (loc.includes("ingresar/page") && es.includes("Entrar como equipo Nihao")) return "demo.login.card3Cta";
  if (loc.includes("ingresar/page") && es.includes("Accedé a la vista")) return "demo.login.card3Text";
  if (loc.includes("ingresar/page") && es.includes("Entrar como Nihao")) return "demo.login.card3Cta2";
  if (loc.includes("ingresar/page") && es.includes("Acceso directo")) return "demo.login.noLogin";
  if (loc.includes("demoCopy.brandTagline")) return "demo.general.brandTagline";
  if (loc.includes("demoCopy.helperText")) return "demo.general.helperText";
  if (loc.includes("demoCopy.reportText")) return "demo.general.reportText";
  if (loc.includes("demoCopy.poweredBy")) return "demo.general.poweredBy";

  // ServiceDrawer WhatsApp fallback
  if (loc.includes("ServiceDrawer") && es.includes("Hola Nihao")) return "whatsapp.serviceFallback";

  // Generic fallback: use location + index
  const clean = loc
    .replace(/[^a-zA-Z0-9_. ]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 80);
  return `auto.${clean}_${index}`;
}

function setNested(obj: any, path: string, value: string) {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

const es: Record<string, any> = {};
const en: Record<string, any> = {};
const it: Record<string, any> = {};
const map: Array<{ index: number; sheet: string; area: string; location: string; key: string; status: string }> = [];

let autoCounter = 0;

for (let i = 0; i < records.length; i++) {
  const r = records[i];
  const key = locationToKey(r.location, r.es, i);

  setNested(es, key, r.es);
  setNested(en, key, r.en);
  setNested(it, key, r.it);

  map.push({
    index: i,
    sheet: r.sheet,
    area: r.area,
    location: r.location,
    key,
    status: "implemented",
  });
}

// Also add non-translation brand names that should remain as-is
setNested(es, "brand.name", "Nihao Negocios");
setNested(en, "brand.name", "Nihao Negocios");
setNested(it, "brand.name", "Nihao Negocios");

if (!fs.existsSync(messagesDir)) fs.mkdirSync(messagesDir, { recursive: true });
if (!fs.existsSync(path.dirname(manifestPath))) fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

fs.writeFileSync(path.join(messagesDir, "es.json"), JSON.stringify(es, null, 2));
fs.writeFileSync(path.join(messagesDir, "en.json"), JSON.stringify(en, null, 2));
fs.writeFileSync(path.join(messagesDir, "it.json"), JSON.stringify(it, null, 2));
fs.writeFileSync(manifestPath, JSON.stringify(map, null, 2));

function countLeaves(obj: any, depth = 0): number {
  let c = 0;
  for (const v of Object.values(obj)) {
    if (typeof v === "string") c++;
    else c += countLeaves(v, depth + 1);
  }
  return c;
}

console.log(`ES keys: ${countLeaves(es)}`);
console.log(`EN keys: ${countLeaves(en)}`);
console.log(`IT keys: ${countLeaves(it)}`);
console.log(`Manifest records: ${map.length}`);

const autoKeys = Object.keys(es.auto || {});
console.log(`Auto-generated keys: ${autoKeys.length}`);
if (autoKeys.length > 0) console.log("Auto keys sample:", autoKeys.slice(0, 5));
