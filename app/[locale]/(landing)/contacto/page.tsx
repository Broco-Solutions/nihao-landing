import { getTranslations } from "next-intl/server";
import { ContactSection } from "@/components/sections/ContactSection";

export async function generateMetadata() {
  const t = await getTranslations();
  return {
    title: t("auto.app_landing_contacto_page_34"),
    description: t("auto.app_landing_contacto_page_35"),
  };
}

export default function ContactoPage() {
  return <ContactSection />;
}
