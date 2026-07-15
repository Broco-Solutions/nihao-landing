"use client";

import { useTranslations } from "next-intl";

export function useDemoTranslations() {
  const t = useTranslations();

  return {
    // Navigation
    navAssistant: t("demo.header.assistant"),
    navTraveller: t("demo.header.traveller"),
    navNihao: "Nihao",
    navDemo: t("demo.header.demo"),
    navPortal: t("demo.header.portal"),
    navMenuLabel: t("demo.header.menuLabel"),

    // Brand / Copy
    brandTagline: t("demo.general.brandTagline"),
    helperText: t("demo.general.helperText"),
    reportText: t("demo.general.reportText"),
    poweredBy: t("demo.general.poweredBy"),
    demoLabel: t("demo.general.demoLabel"),

    // Login page
    loginEyebrow: t("demo.login.eyebrow"),
    loginTitle: t("demo.login.title"),
    loginIntro: t("demo.login.intro"),
    loginCta1: t("demo.login.cta1"),
    loginCard1Text: t("demo.login.card1Text"),
    loginCard1Cta: t("demo.login.card1Cta"),
    loginCard2Cta: t("demo.login.card2Cta"),
    loginCard2Text: t("demo.login.card2Text"),
    loginCard2Cta2: t("demo.login.card2Cta2"),
    loginCard3Cta: t("demo.login.card3Cta"),
    loginCard3Text: t("demo.login.card3Text"),
    loginCard3Cta2: t("demo.login.card3Cta2"),
    loginNoLogin: t("demo.login.noLogin"),

    // Status labels helper
    t,
  };
}
