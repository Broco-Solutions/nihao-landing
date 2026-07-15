import type { Metadata } from "next";
import { Manrope, DM_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import "../globals.css";

const display = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const body = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const OG_LOCALE: Record<string, string> = {
  es: "es_AR",
  en: "en_US",
  it: "it_IT",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations();
  return {
    title: {
      default: t("seo.title"),
      template: `%s · Nihao Negocios`,
    },
    description: t("seo.description"),
    authors: [{ name: "Nihao Negocios" }],
    creator: "Nihao Negocios",
    metadataBase: new URL("https://nihaonegocios.com"),
    alternates: {
      canonical: locale === "es" ? "https://nihaonegocios.com" : `https://nihaonegocios.com/${locale}`,
      languages: {
        es: "https://nihaonegocios.com",
        en: "https://nihaonegocios.com/en",
        it: "https://nihaonegocios.com/it",
      },
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale] ?? "es_AR",
      url: "https://nihaonegocios.com",
      siteName: "Nihao Negocios",
      title: t("seo.ogTitle"),
      description: t("seo.ogDescription"),
    },
    twitter: {
      card: "summary_large_image",
      title: "Nihao Negocios",
      description: t("seo.twitterDescription"),
    },
    robots: { index: true, follow: true },
  };
}

export const viewport = {
  themeColor: "#FAFAFA",
  width: "device-width" as const,
  initialScale: 1,
  maximumScale: 5,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-paper text-ink antialiased">
        <NextIntlClientProvider messages={messages} locale={locale}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
