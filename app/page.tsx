import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ScrollProgress } from "@/components/layout/ScrollProgress";
import { WhatsAppFloatingButton } from "@/components/layout/WhatsAppFloatingButton";
import { HeroSection } from "@/components/sections/HeroSection";
import { BridgeSection } from "@/components/sections/BridgeSection";
import { ProblemSection } from "@/components/sections/ProblemSection";
import { MethodSection } from "@/components/sections/MethodSection";
import { ServicesSection } from "@/components/sections/ServicesSection";
import { CantonFairSection } from "@/components/sections/CantonFairSection";
import { SourcingControlSection } from "@/components/sections/SourcingControlSection";
import { DifferentiatorsSection } from "@/components/sections/DifferentiatorsSection";
import { WorkshopsSection } from "@/components/sections/WorkshopsSection";
import { AcademySection } from "@/components/sections/AcademySection";
import { TestimonialsSection } from "@/components/sections/TestimonialsSection";
import { FAQSection } from "@/components/sections/FAQSection";
import { FinalCTASection } from "@/components/sections/FinalCTASection";

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <Navbar />
      <main className="relative">
        <HeroSection />
        <BridgeSection />
        <ProblemSection />
        <MethodSection />
        <ServicesSection />
        <CantonFairSection />
        <SourcingControlSection />
        <DifferentiatorsSection />
        <WorkshopsSection />
        <AcademySection />
        <TestimonialsSection />
        <FAQSection />
        <FinalCTASection />
      </main>
      <Footer />
      <WhatsAppFloatingButton />
    </>
  );
}
