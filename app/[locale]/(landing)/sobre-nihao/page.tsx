import { AboutHeroSection } from "@/components/sections/AboutHeroSection";
import { TeamSection } from "@/components/sections/TeamSection";
import { BridgeSection } from "@/components/sections/BridgeSection";

export const metadata = {
  title: "Sobre Nihao",
  description:
    "Somos tres profesionales apasionadas por China y el comercio internacional. Hablamos español, chino, inglés e italiano.",
};

export default function SobreNihaoPage() {
  return (
    <>
      <AboutHeroSection />
      <TeamSection />
      <BridgeSection />
    </>
  );
}
