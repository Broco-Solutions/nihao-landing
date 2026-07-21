"use client";

import { useTranslations } from "next-intl";
import { ExpandableImage } from "@/components/ui/ExpandableImage";

export function ExpandableImageSection() {
  const t = useTranslations();

  return (
    <section className="container-page py-16 md:py-24">
      <div className="relative mx-auto aspect-[16/9] w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-paper shadow-soft">
        <ExpandableImage
          src="/somos-nihao.jpeg"
          alt={t("a11y.aboutNihao")}
          priority
        />
      </div>
    </section>
  );
}