import { HomeHeroSection } from "@/components/sections/HomeHeroSection";
import { TaglineBand } from "@/components/sections/TaglineBand";
import { HomeLeadBanner } from "@/components/sections/HomeLeadBanner";
import { AboutTeaserSection } from "@/components/sections/AboutTeaserSection";
import { HomeServicesSection } from "@/components/sections/HomeServicesSection";
import { TestimonialsSection } from "@/components/sections/TestimonialsSection";
import { HomeClosingCTA } from "@/components/sections/HomeClosingCTA";

export default function Home() {
  return (
    <>
      <HomeHeroSection />
      <TaglineBand />
      <HomeLeadBanner />
      <AboutTeaserSection />
      <HomeServicesSection />
      <TestimonialsSection />
      <HomeClosingCTA />
    </>
  );
}
