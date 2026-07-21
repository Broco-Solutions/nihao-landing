import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { AboutHeroSection } from "@/components/sections/AboutHeroSection";
import { TeamSection } from "@/components/sections/TeamSection";
import { BridgeSection } from "@/components/sections/BridgeSection";

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
      <section className="container-page py-16 md:py-24">
        <div className="relative mx-auto aspect-[16/9] w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-paper shadow-soft">
          <Image
            src="/somos-nihao.jpeg"
            alt="Nihao Negocios"
            fill
            sizes="(min-width: 768px) 75vw, 100vw"
            className="object-cover"
          />
        </div>
      </section>
      <BridgeSection />
    </>
  );
}
