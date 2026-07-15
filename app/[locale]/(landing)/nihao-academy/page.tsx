import { getTranslations } from "next-intl/server";
import { AcademyHeroSection } from "@/components/sections/AcademyHeroSection";

export async function generateMetadata() {
  const t = await getTranslations();
  return {
    title: t("navigation.academy"),
    description: t("auto.app_landing_nihao_academy_page_40"),
  };
}

export default function NihaoAcademyPage() {
  return <AcademyHeroSection />;
}
