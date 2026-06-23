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
  general: buildWhatsAppLink(),
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
};

export const heroCopy = {
  eyebrow: "FERIA DE CANTÓN",
  headline: [
    "Vos soñás con importar desde China.",
    "Nosotras te llevamos de la mano.",
  ],
  highlight: "China sin improvisar.",
  subtitle:
    "Acompañamos a empresas y emprendedores a importar, validar fábricas y recorrer ferias en China: sin perderse, sin pagar de más, sin riesgos evitables.",
  cta: "Quiero viajar a la Feria de Cantón",
};

export const tagline = "China made easy.";

export const testimonials = [
  {
    quote: "[Testimonio real cliente 1]",
    name: "Nombre · Rubro",
  },
  {
    quote: "[Testimonio real cliente 2]",
    name: "Nombre · Rubro",
  },
  {
    quote: "[Testimonio real cliente 3]",
    name: "Nombre · Rubro",
  },
];

export type ServiceSummary = {
  id: string;
  title: string;
  shortText: string;
  icon: LucideIcon;
};

export const homeServices: ServiceSummary[] = [
  {
    id: "canton",
    title: "Viajes a la Feria de Cantón",
    shortText: "Acompañamiento antes, durante y después de la feria.",
    icon: PlaneTakeoff,
  },
  {
    id: "auditorias",
    title: "Auditorías y PSI",
    shortText: "Verificamos fábricas y carga antes de que pagues.",
    icon: ShieldCheck,
  },
  {
    id: "academy",
    title: "Nihao Academy",
    shortText: "Una semana de inmersión en China para entender el mercado.",
    icon: Presentation,
  },
  {
    id: "proveedores",
    title: "Búsqueda de proveedores",
    shortText: "Fabricantes validados por precio, MOQ y trayectoria.",
    icon: Search,
  },
];

export type ServiceDetail = {
  id: string;
  title: string;
  headline: string;
  text: string;
  icon: LucideIcon;
  cta?: string;
};

export const serviceDetails: ServiceDetail[] = [
  {
    id: "canton",
    title: "Viajes a la Feria de Cantón",
    headline: "Vos soñás con importar. Nosotras te llevamos a la Feria.",
    text: "La Canton Fair es la feria de proveedores más grande del mundo — y puede ser abrumadora si llegás solo. Te acompañamos antes, durante y después: agenda, reuniones, negociación en chino y un mapa claro de qué hacer cuando volvés.",
    icon: PlaneTakeoff,
    cta: "Quiero viajar a Cantón",
  },
  {
    id: "auditorias",
    title: "Auditorías y Pre-Shipment Inspections",
    headline: "Antes de pagar, verificamos.",
    text: "Auditamos fábricas para confirmar que existen, que pueden producir y que cumplen lo que prometieron. E inspeccionamos tu carga antes de que salga del puerto: calidad, cantidad, embalaje y estado del contenedor. Sin sorpresas del otro lado del océano.",
    icon: ShieldCheck,
    cta: "Quiero validar un proveedor",
  },
  {
    id: "academy",
    title: "Nihao Academy",
    headline: "Una semana en China que cambia cómo ves los negocios.",
    text: "Empresas, ferias, universidades y contactos reales. Un programa de inmersión para emprendedores, jóvenes profesionales e instituciones que quieren entender China desde adentro — no desde un video.",
    icon: Presentation,
    cta: "Quiero conocer Nihao Academy",
  },
  {
    id: "proveedores",
    title: "Búsqueda de proveedores",
    headline: "Encontramos opciones. Vos decidís.",
    text: "Encontramos fabricantes según tu necesidad evaluando precios, MOQ, condiciones de pago, capacidad productiva y trayectoria real.",
    icon: Search,
  },
  {
    id: "ojos",
    title: "Tus ojos en China",
    headline: "Si no podés viajar, te representamos.",
    text: "Si no podés viajar, te representamos. Entendemos qué producto buscás, visitamos ferias o proveedores, relevamos opciones y negociamos en tu nombre.",
    icon: Eye,
  },
  {
    id: "muestras",
    title: "Análisis de muestras",
    headline: "Revisamos antes de que comprometás volumen.",
    text: "Recibimos y revisamos muestras en China antes de avanzar con producciones o compras de mayor volumen. Reducís errores caros.",
    icon: PackageSearch,
  },
  {
    id: "puente",
    title: "Puente cultural",
    headline: "Reuniones, ferias y negociaciones sin malentendidos.",
    text: "Facilitamos reuniones, ferias, visitas a fábricas y negociaciones reduciendo barreras idiomáticas y culturales.",
    icon: Languages,
  },
  {
    id: "workshops",
    title: "Workshops",
    headline: "Preparación práctica antes de viajar.",
    text: "Nuestra metodología de preparación previa. Cultura, Comex, cómo moverte en la Feria y en China, te transmitimos todos los puntos más importantes antes de negociar y viajar a China.",
    icon: Users,
  },
];

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
    title: "China & Negocios Internacionales",
    text: "Vivió y estudió en China. Es el puente directo con el mercado chino: idioma, cultura, contactos y terreno real.",
  },
  {
    name: "Gianella",
    emoji: "📦",
    title: "Logística & Operaciones",
    text: "Licenciada en Comercio Internacional. Coordina proyectos, procesos y relaciones comerciales para acompañar a las empresas en sus negocios con China.",
  },
  {
    name: "Sofia",
    emoji: "📊",
    title: "Finanzas, Management & Datos",
    text: "Aporta el número detrás de cada decisión — costos y análisis antes de avanzar.",
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
  headline: "Una semana en China que cambia cómo ves los negocios.",
  intro:
    "Empresas, ferias, universidades y contactos reales. Un programa de inmersión para emprendedores, jóvenes profesionales e instituciones que quieren entender China desde adentro — no desde un video.",
  cta: "Hablar con Nihao",
  pillars: [
    "Negocios internacionales",
    "Innovación",
    "Tecnología",
    "Cultura china",
    "Sourcing y proveedores",
    "Networking",
    "Visitas empresariales",
    "Aprendizaje práctico",
    "Experiencias culturales reales",
  ],
};

export const contactPageCopy = {
  eyebrow: "Contacto",
  headline: "Contactate con nosotros",
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
