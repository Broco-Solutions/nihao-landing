import { getTranslations } from "next-intl/server";
import { AboutHeroSection } from "@/components/sections/AboutHeroSection";
import { TeamSection } from "@/components/sections/TeamSection";
import { BridgeSection } from "@/components/sections/BridgeSection";
import { ExpandableImageSection } from "./ExpandableImageSection";

export async function generateMetadata() {
  const t = await getTranslations();
  return {
    title: t("auto.app_landing_sobre_nihao_page_38"),
    description: t("auto.app_landing_sobre_nihao_page_39"),
  };
}

export default function SobreNihaoPage() {
  return (
    <>
      <AboutHeroSection />
      <TeamSection />
      <ExpandableImageSection />
      <BridgeSection />
    </>
  );
}