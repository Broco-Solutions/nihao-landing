import { ServicesGridSection } from "@/components/sections/ServicesGridSection";
import { FAQSection } from "@/components/sections/FAQSection";

export const metadata = {
  title: "Servicios",
  description:
    "No contratás paquetes. Contratás criterio, idioma y presencia real. Feria de Cantón, auditorías, Nihao Academy, búsqueda de proveedores y más.",
};

export default function ServiciosPage() {
  return (
    <>
      <ServicesGridSection />
      <FAQSection />
    </>
  );
}
