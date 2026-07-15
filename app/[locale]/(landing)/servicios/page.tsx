import { getTranslations } from "next-intl/server";
import { ServicesGridSection } from "@/components/sections/ServicesGridSection";
import { FAQSection } from "@/components/sections/FAQSection";

export async function generateMetadata() {
  const t = await getTranslations();
  return {
    title: t("auto.app_landing_servicios_page_36"),
    description: t("auto.app_landing_servicios_page_37"),
  };
}

export default function ServiciosPage() {
  return (
    <>
      <ServicesGridSection />
      <FAQSection />
    </>
  );
}
