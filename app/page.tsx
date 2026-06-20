import { HomeHeroSection } from "@/components/sections/HomeHeroSection";
import { TaglineBand } from "@/components/sections/TaglineBand";
import { AboutTeaserSection } from "@/components/sections/AboutTeaserSection";
import { HomeServicesSection } from "@/components/sections/HomeServicesSection";
import { TestimonialsSection } from "@/components/sections/TestimonialsSection";
import { HomeCTASection } from "@/components/sections/HomeCTASection";

export default function Home() {
  return (
    <>
      <HomeHeroSection />
      <TaglineBand />
      <AboutTeaserSection />
      <HomeServicesSection />
      <TestimonialsSection />
      <HomeCTASection />
    </>
  );
}
