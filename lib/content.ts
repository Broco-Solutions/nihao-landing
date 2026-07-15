import {
  PlaneTakeoff,
  Search,
  Eye,
  PackageSearch,
  ShieldCheck,
  Languages,
  Presentation,
  Users,
  type LucideIcon,
} from "lucide-react";
import { buildWhatsAppLink } from "./utils";

export const brand = {
  name: "Nihao Negocios",
  domain: "nihaonegocios.com",
  email: "nihaonegocios@gmail.com",
  instagram: "@nihaonegocios",
  whatsapp: "+54 9 3412 426309",
};

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/sobre-nihao", label: "Sobre Nihao" },
  { href: "/servicios", label: "Servicios" },
  { href: "/nihao-academy", label: "Nihao Academy" },
  { href: "/contacto", label: "Contacto" },
];

export const whatsappIntents = {
  general: buildWhatsAppLink(
    "Hola Nihao, quiero recibir información sobre sus servicios.",
  ),
  canton: buildWhatsAppLink(
    "Hola Nihao, quiero recibir información para viajar a la Feria de Cantón.",
  ),
  sourcing: buildWhatsAppLink(
    "Hola Nihao, quiero buscar proveedores en China y conocer cómo trabajan el sourcing.",
  ),
  audit: buildWhatsAppLink(
    "Hola Nihao, quiero solicitar una auditoría de fábrica y entender el proceso.",
  ),
  academy: buildWhatsAppLink(
    "Hola Nihao, quiero conocer Nihao Academy y los programas de inmersión.",
  ),
  workshop: buildWhatsAppLink(
    "Hola Nihao, quiero prepararme antes de viajar y conocer los workshops.",
  ),
  contact: buildWhatsAppLink(
    "Hola Nihao, quiero recibir información sobre sus servicios.",
  ),
  freeCall: buildWhatsAppLink(
    "Hola Nihao, quiero agendar mi primera llamada gratis.",
  ),
};

export const heroCopy = {
  eyebrow: "FERIA DE CANTÓN",
  headline: [
    "Vos soñás con importar desde China.",
    "Nosotras te llevamos.",
  ],
  highlight: "China sin improvisar.",
  subtitle:
    "Acompañamos a empresas y emprendedores a importar, validar fábricas y recorrer ferias en China: sin perderse, sin pagar de más, sin riesgos evitables.",
  cta: "Quiero viajar a la Feria de Cantón",
};

export const tagline = "China made easy.";

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  image: string;
  imagePosition?: string;
  imageScale?: number;
};

export const testimonials: Testimonial[] = [
  {
    quote:
      "La experiencia fue excelente. La organización estuvo impecable y, a pesar de tener una agenda muy intensa, todo salió perfecto. Tener resueltos de antemano los pagos, la conectividad y toda la logística nos dio muchísima tranquilidad. Además, detalles como contar con nombres en chino ayudaron a romper el hielo y generaron una muy buena impresión con nuestros contactos locales. Gracias a esta preparación, pudimos enfocarnos en lo más importante: generar oportunidades de negocio y sentar las bases para futuras colaboraciones en China.",
    name: "Gustavo Galeano y Luis Kaufmann",
    role: "Rigran",
    image: "/assets/testimonios/gustavo-galeano-luis-kaufmann-rigran.jpeg",
    imagePosition: "82% 45%",
    imageScale: 1.2,
  },
  {
    quote:
      "Antes de viajar nos preocupaba no saber cómo movernos en la Feria de Cantón, perder tiempo o no poder comunicarnos con los proveedores. Gracias al acompañamiento de Nihao Negocios, el viaje fue mucho más simple de lo que imaginábamos. Pudimos enfocarnos en generar oportunidades y entendimos que hacer negocios con China es totalmente posible cuando contás con el equipo indicado.",
    name: "Magalí Lebihan y Tomás Lawrie",
    role: "—",
    image: "/assets/testimonios/magali-lebihan-tomas-lawrie.jpeg",
    imagePosition: "center 25%",
    imageScale: 1,
  },
  {
    quote:
      "Antes de viajar tenía el miedo lógico de irme al otro lado del mundo, a un país tan distinto como China. Pero con Nihao me sentí acompañado desde el primer día y pude enfocarme en disfrutar y aprovechar la experiencia al máximo. Fue un viaje que me abrió la cabeza, me hizo crecer muchísimo y que sin dudas volvería a elegir.",
    name: "Paco Vaquero",
    role: "IDD",
    image: "/assets/testimonios/paco-vaquero-idd-nueva.jpeg",
    imagePosition: "center 24%",
    imageScale: 1,
  },
  {
    quote:
      "Creemos que el equipo de Nihao se toma con seriedad y responsabilidad el servicio que brindan. Hicieron todas las preguntas necesarias para poder comprender el mercado en el que trabajamos. También el acompañamiento previo a la feria de canton fue fundamental para poder llegar a China tranquilos, también siempre dispuestas a ayudarnos en las situaciones que se nos presentaban allí. Sin duda son para recomendar!!",
    name: "Celina y Francisco Pontón",
    role: "OXI Mercedes",
    image: "/assets/testimonios/celina-francisco-ponton-oxi-mercedes.jpeg",
    imagePosition: "center 35%",
    imageScale: 1.32,
  },
];

export type ServiceCategory = "principal" | "otro";

export type ServiceItem = {
  id: string;
  title: string;
  category: ServiceCategory;
  icon: LucideIcon;
  shortText: string;
  headline?: string;
  text?: string;
  href?: string;
  cta?: string;
};

export const services: ServiceItem[] = [
  {
    id: "canton",
    title: "Viajes a la Feria de Cantón",
    category: "principal",
    icon: PlaneTakeoff,
    shortText: "Vos soñás con importar. Nosotras te llevamos a la Feria.",
    headline: "Vos soñás con importar. Nosotras te llevamos a la Feria.",
    text: "La Canton Fair es la feria de proveedores más grande del mundo — y puede ser abrumadora si llegás solo. Te acompañamos antes, durante y después: agenda, reuniones, negociación en chino y un mapa claro de qué hacer cuando volvés.",
    cta: "Quiero viajar a Cantón",
  },
  {
    id: "auditorias",
    title: "Auditorías y Pre-Shipment Inspections",
    category: "principal",
    icon: ShieldCheck,
    shortText: "",
    headline: "",
    text: "Auditamos fábricas para confirmar que existen, que pueden producir y que cumplen lo que prometieron. E inspeccionamos tu carga antes de que salga del puerto: calidad, cantidad, embalaje y estado del contenedor. Sin sorpresas del otro lado del océano.",
    cta: "Quiero validar un proveedor",
  },
  {
    id: "academy",
    title: "Nihao Academy",
    category: "principal",
    icon: Presentation,
    shortText: "Una experiencia en China que cambia cómo ves los negocios.",
    headline: "Una experiencia en China que cambia cómo ves los negocios.",
    text: "Feria de Cantón, visitas a empresas chinas, networking internacional y aprendizaje práctico. Un programa de inmersión para estudiantes, jóvenes profesionales e instituciones que quieren entender China desde adentro.",
    href: "/nihao-academy",
    cta: "Quiero conocer Nihao Academy",
  },
  {
    id: "proveedores",
    title: "Búsqueda de proveedores",
    category: "otro",
    icon: Search,
    shortText: "Fabricantes validados por precio, MOQ y trayectoria.",
    text: "Fabricantes validados por precio, MOQ y trayectoria.",
  },
  {
    id: "ojos",
    title: "Tus ojos en China",
    category: "otro",
    icon: Eye,
    shortText: "Te representamos si no podés viajar.",
    text: "Te representamos si no podés viajar.",
  },
  {
    id: "muestras",
    title: "Análisis de muestras",
    category: "otro",
    icon: PackageSearch,
    shortText: "Revisamos antes de que comprometás volumen.",
    text: "Revisamos antes de que comprometás volumen.",
  },
  {
    id: "puente",
    title: "Puente cultural",
    category: "otro",
    icon: Languages,
    shortText: "Reuniones, ferias y negociaciones sin malentendidos.",
    text: "Reuniones, ferias y negociaciones sin malentendidos.",
  },
  {
    id: "workshops",
    title: "Workshops",
    category: "otro",
    icon: Users,
    shortText: "Preparación práctica antes de viajar.",
    text: "Nuestra metodología de preparación previa. Cultura, Comex, cómo moverte en la Feria y en China, te transmitimos todos los puntos más importantes antes de negociar y viajar a China.",
  },
];

export const principalServices = services.filter((s) => s.category === "principal");
export const otherServices = services.filter((s) => s.category === "otro");

export const aboutCopy = {
  eyebrow: "Sobre Nihao",
  headline: "Hablamos tu idioma. Y el de ellos.",
  intro:
    "Somos tres profesionales apasionadas por China y el comercio internacional. Distintas áreas, un solo objetivo: que tomes mejores decisiones antes, durante y después de cada operación.",
  introSecond:
    "Hablamos español, chino, inglés e italiano — y sabemos cómo se negocia, qué se lee entre líneas y cómo moverse en un ecosistema que para muchos es una caja negra.",
};

export const team = [
  {
    name: "Martina",
    emoji: "🌏",
    title: "CHINA & NEGOCIOS INTERNACIONALES",
    text: "9 años estudiando chino mandarin. Vivió en Shanghai y acompaña clientes en sus viajes de Negocios por China. Conoce el idioma, la cultura, los proveedores y sabe cómo moverse en el terreno real.",
  },
  {
    name: "Gianella",
    emoji: "📦",
    title: "LOGÍSTICA & OPERACIONES",
    text: "Lic. en Comercio Internacional. Coordina proyectos, procesos y relaciones comerciales para acompañar a las empresas en sus negocios con China.",
  },
  {
    name: "Sofia",
    emoji: "📊",
    title: "FINANZAS, MANAGEMENT & DATOS",
    text: "Traduce los números en decisiones claras. Antes de avanzar, sabes exactamente cuánto te cuesta traer la mercadería hasta tu puerta.",
  },
];

export const credibilityPills = [
  "Español · Chino · Inglés · Italiano",
  "Presencia real en China",
  "Comercio Internacional · Finanzas · Logística",
];

export const bridgeCopy = {
  eyebrow: "Conexión",
  headline: "Un puente estratégico entre el mundo y China.",
  nodes: {
    left: ["Latinoamérica", "Europa"],
    center: "Nihao Negocios",
    right: ["China"],
  },
};

export const servicesPageCopy = {
  eyebrow: "Servicios",
  headline: "Lo que hacemos",
  intro: "No contratás paquetes. Contratás criterio, idioma y presencia real.",
  cta: "Hablar con Nihao",
};

export const academyPageCopy = {
  eyebrow: "Nihao Academy",
  headline: "Una experiencia en China que cambia cómo ves los negocios.",
  intro:
    "Un programa de inmersión internacional que combina negocios, innovación, cultura china y experiencias reales. Recorremos ferias, empresas y espacios estratégicos para transformar la teoría en conocimiento práctico y nuevas oportunidades profesionales.",
  cta: "Hablar con Nihao",
  pillars: [
    "Feria de Cantón",
    "Visitas a empresas chinas",
    "Networking internacional",
    "Negociación y comunicación intercultural",
    "Comercio internacional aplicado",
    "Innovación y tecnología",
    "Cultura china",
    "Aprendizaje práctico en terreno",
  ],
};

export const contactPageCopy = {
  eyebrow: "Contacto",
  headline: "Contactate con nosotras",
  intro: "El primer paso es contarnos qué necesitás.",
  sub: "Sin compromiso. Solo una conversación por WhatsApp.",
  cta: "Hablar con Nihao",
};

export const faqs = [
  {
    q: "¿Necesito experiencia previa para contratar sus servicios?",
    a: "No. Trabajamos tanto con quienes recién empiezan como con empresas que ya importan. Acompañamos el proceso a tu ritmo.",
  },
  {
    q: "¿Pueden ayudarme a encontrar un proveedor si no sé bien qué quiero importar?",
    a: "Sí. Primero nos sentamos a entender tu proyecto, presupuesto y objetivo. A partir de ahí buscamos opciones que tengan sentido.",
  },
  {
    q: "¿Qué pasa si no puedo viajar a China?",
    a: "Podemos representarte. Visitamos ferias, proveedores o fábricas por vos y te reportamos con fotos, videos y análisis.",
  },
  {
    q: "¿Realizan auditorías de fábrica?",
    a: "Sí. Auditamos fábricas e inspeccionamos carga antes del embarque para reducir riesgos.",
  },
  {
    q: "¿Se necesita visa para viajar a China?",
    a: "Depende de tu nacionalidad y de la normativa vigente. Te ayudamos a verificar los requisitos antes de viajar.",
  },
  {
    q: "¿Necesito hablar inglés o chino?",
    a: "No. Nosotras hablamos español, chino mandarín, inglés e italiano. Vos podés negociar en tu idioma.",
  },
  {
    q: "¿Solo trabajan con empresas grandes?",
    a: "No. Acompañamos emprendedores, pymes y empresas. Cada proyecto se adapta a tu escala.",
  },
];

export const faqCopy = {
  eyebrow: "FAQ",
  headline: "Dudas frecuentes",
  intro: "Si no encontrás lo que buscás, escribinos. Respondemos rápido y sin vueltas.",
};

export const footerCopy = {
  tagline: ["Hablamos chino. Conocemos el terreno.", "China made easy."],
  cta: "Hablar con Nihao",
};

export const leadCTA = {
  short: "Primera llamada gratis  ·  Sin compromiso",
  eyebrow: "¿No sabés por dónde empezar?",
  headline: "¿No sabés por dónde empezar?",
  intro:
    "Contanos qué estás buscando. La primera llamada es gratis y sin compromiso — solo para entender si podemos ayudarte.",
  cta: "Quiero mi llamada gratuita",
};
