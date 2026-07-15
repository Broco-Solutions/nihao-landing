"use client";

import { useTranslations } from "next-intl";
import { WhatsAppSimulator } from "@/components/demo/WhatsAppSimulator";

export default function AsistentePage() {
  const t = useTranslations();
  return (
    <div className="container-page py-6 md:py-8">
      <div className="mb-4 md:mb-6">
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink md:text-3xl">
          {t("auto.app_demo_demo_asistente_page_183")}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-mute md:text-[15px]">
          {t("auto.app_demo_demo_asistente_page_184")}
        </p>
      </div>
      <WhatsAppSimulator />
    </div>
  );
}
