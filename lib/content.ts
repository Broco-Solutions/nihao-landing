import {
  PlaneTakeoff,
  Building2,
  Eye,
  Search,
  PackageSearch,
  ShieldCheck,
  ClipboardCheck,
  Languages,
  Presentation,
  Handshake,
  Microscope,
  Container,
  ScrollText,
} from "lucide-react";
import { buildWhatsAppLink } from "./utils";

export const brand = {
  name: "Nihao Negocios",
  domain: "nihaonegocios.com",
  email: "nihaonegocios@gmail.com",
  instagram: "@nihaonegocios",
  whatsapp: "+54 9 3412 426309",
};

export const heroBadges = [
  "Hablamos chino",
  "Experiencia en China",
  "Comercio internacional",
  "Acompañamiento real",
];

export const navLinks = [
  { href: "#metodo", label: "Método" },
  { href: "#servicios", label: "Servicios" },
  { href: "#canton", label: "Feria de Cantón" },
  { href: "#sourcing", label: "Sourcing" },
  { href: "#academy", label: "Academy" },
  { href: "#faq", label: "Preguntas" },
];

export const methodSteps = [
  {
    n: "01",
    title: "Entendemos tu objetivo",
    text: "Producto, industria, presupuesto, experiencia previa y expectativas. Sin diagnóstico, no avanzamos.",
  },
  {
    n: "02",
    title: "Diseñamos el plan",
    text: "Feria, proveedores, agenda, reuniones, auditorías o búsqueda remota. Una ruta, no un PDF genérico.",
  },
  {
    n: "03",
    title: "Nos movemos en China",
    text: "Te acompañamos en destino o actuamos como tus ojos si no podés viajar. Idioma, cultura, código y acceso.",
  },
  {
    n: "04",
    title: "Validamos antes de avanzar",
    text: "Proveedores, muestras, fábricas, condiciones, inspecciones y carga. Datos antes que promesas.",
  },
  {
    n: "05",
    title: "Te ayudamos a decidir mejor",
    text: "Ordenamos información, riesgos y próximos pasos para que avances con claridad, no con presión.",
  },
];

export const services = [
  {
    icon: PlaneTakeoff,
    title: "Viajes de negocios e inmersión internacional",
    description:
      "Diseñamos y acompañamos experiencias empresariales en China para detectar oportunidades, entender el mercado y conectar con proveedores, empresas e innovación.",
  },
  {
    icon: Building2,
    title: "Acompañamiento integral a la Feria de Cantón",
    description:
      "Te acompañamos antes, durante y después de la feria para que aproveches el viaje, organices reuniones y transformes la visita en oportunidades reales.",
  },
  {
    icon: Eye,
    title: "Somos tus ojos en China",
    description:
      "Si no podés viajar, te representamos. Entendemos qué producto buscás, visitamos ferias o proveedores, relevamos opciones y negociamos en tu nombre.",
  },
  {
    icon: Search,
    title: "Búsqueda de proveedores y sourcing",
    description:
      "Encontramos fabricantes según tu necesidad evaluando precios, MOQ, condiciones de pago, capacidad productiva y trayectoria real.",
  },
  {
    icon: PackageSearch,
    title: "Recepción y análisis de muestras",
    description:
      "Recibimos y revisamos muestras en China antes de avanzar con producciones o compras de mayor volumen. Reducís errores caros.",
  },
  {
    icon: ShieldCheck,
    title: "Auditorías de fábrica",
    description:
      "Verificamos existencia, estructura y capacidad operativa de proveedores antes de avanzar comercialmente.",
  },
  {
    icon: ClipboardCheck,
    title: "Inspección pre embarque y supervisión de carga",
    description:
      "Coordinamos controles de calidad, cantidad, embalaje, estado del contenedor, sellado y carga para reducir riesgos logísticos y comerciales.",
  },
  {
    icon: Languages,
    title: "Traducción, interpretación y negociación cultural",
    description:
      "Facilitamos reuniones, ferias, visitas a fábricas y negociaciones reduciendo barreras idiomáticas y culturales.",
  },
  {
    icon: Presentation,
    title: "Webinars y workshops",
    description:
      "Te preparamos para entender herramientas, cultura de negocios, medios de pago, WeChat, Alipay y estrategias de negociación antes de viajar.",
  },
];

export const cantonFairPillars = [
  {
    title: "Preparación previa",
    text: "Definimos objetivos, prioridades, agenda y proveedores clave antes del viaje.",
  },
  {
    title: "Acompañamiento en la feria",
    text: "Recorremos juntos, filtramos, organizamos reuniones y maximizamos cada día.",
  },
  {
    title: "Reuniones y negociación",
    text: "Actuamos como puente cultural y lingüístico para cerrar conversaciones reales.",
  },
  {
    title: "Análisis posterior",
    text: "Ordenamos contactos, muestras, cotizaciones y próximos pasos luego del viaje.",
  },
  {
    title: "Representación sin viaje",
    text: "Si no podés viajar, vamos por vos, con objetivos claros y reporte a la vuelta.",
  },
];

export const sourcingFlow = [
  { icon: Search, label: "Búsqueda de proveedores" },
  { icon: Microscope, label: "Validación inicial" },
  { icon: Handshake, label: "Negociación" },
  { icon: PackageSearch, label: "Muestras" },
  { icon: ShieldCheck, label: "Auditoría de fábrica" },
  { icon: ClipboardCheck, label: "Inspección pre embarque" },
  { icon: Container, label: "Supervisión de carga" },
  { icon: ScrollText, label: "Reporte y próximos pasos" },
];

export const differentiators = [
  "Hablamos español, chino mandarín, inglés e italiano.",
  "Vivimos y trabajamos en China.",
  "Somos licenciadas en Comercio Internacional.",
  "Tenemos experiencia en importación y exportación en Argentina, España, Europa y Alemania.",
  "Conectamos Argentina y Latinoamérica con China desde la práctica.",
  "Te acompañamos con estrategia, idioma, cultura y operación.",
];

export const academyPillars = [
  "Negocios internacionales",
  "Innovación",
  "Tecnología",
  "Cultura china",
  "Sourcing y proveedores",
  "Networking",
  "Visitas empresariales",
  "Aprendizaje práctico",
  "Experiencias culturales reales",
];

export const testimonials = [
  {
    quote:
      "Nos ayudaron a entender cómo movernos en China y llegar mucho mejor preparados.",
    name: "Cliente · Importación de productos",
  },
  {
    quote:
      "El acompañamiento fue clave para ordenar proveedores, reuniones y decisiones.",
    name: "Cliente · Marca en expansión",
  },
  {
    quote:
      "Se nota la experiencia real en China y la cercanía en todo el proceso.",
    name: "Cliente · Primera importación",
  },
];

export const faqs = [
  {
    q: "¿Quiero importar un producto, me pueden ayudar a encontrar proveedor?",
    a: "Sí. Nos especializamos en búsqueda de proveedores y también podemos asesorarte durante el proceso de importación.",
  },
  {
    q: "¿Realizan auditorías de fábrica?",
    a: "Sí. Coordinamos auditorías, inspecciones pre embarque y supervisión de carga.",
  },
  {
    q: "¿Pueden ayudarme si nunca importé desde China?",
    a: "Sí. Trabajamos tanto con personas que recién empiezan como con empresas con experiencia importando.",
  },
  {
    q: "¿Solo trabajan con empresas grandes?",
    a: "No. También acompañamos emprendedores y pymes.",
  },
  {
    q: "¿Cómo encuentran proveedores?",
    a: "Utilizamos redes de contacto, investigación de mercado, ferias internacionales y validación directa en China.",
  },
  {
    q: "¿Pueden ayudarme a viajar a la Feria de Cantón?",
    a: "Sí. Organizamos acompañamiento integral antes, durante y después de la feria.",
  },
  {
    q: "¿Se necesita visa para viajar a China?",
    a: "Depende de tu nacionalidad y de la normativa vigente al momento del viaje. Te ayudamos a verificar los requisitos actualizados antes de viajar.",
  },
  {
    q: "¿Necesito hablar inglés o chino para viajar?",
    a: "No necesitás hablar otro idioma para viajar. Nosotras hablamos español, inglés, chino mandarín e italiano.",
  },
  {
    q: "¿Qué pasa si no puedo viajar a China?",
    a: "Podemos representarte en ferias y hacer búsqueda de proveedores con reuniones previas donde entendemos qué necesitás.",
  },
];

export const whatsappIntents = {
  general: buildWhatsAppLink(),
  canton: buildWhatsAppLink(
    "Hola Nihao, quiero viajar a la Feria de Cantón y recibir información sobre el acompañamiento.",
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
