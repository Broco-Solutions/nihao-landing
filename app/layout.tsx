import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppFloatingButton } from "@/components/layout/WhatsAppFloatingButton";

const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const body = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Nihao Negocios · China sin improvisar",
    template: "%s · Nihao Negocios",
  },
  description:
    "Acompañamos a empresas y emprendedores a importar, validar fábricas y recorrer ferias en China: sin perderse, sin pagar de más, sin riesgos evitables.",
  keywords: [
    "negocios con China",
    "proveedores en China",
    "Feria de Cantón",
    "sourcing China",
    "auditoría de fábrica China",
    "importaciones China",
    "acompañamiento en China",
    "comercio internacional China",
  ],
  authors: [{ name: "Nihao Negocios" }],
  creator: "Nihao Negocios",
  metadataBase: new URL("https://nihaonegocios.com"),
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "https://nihaonegocios.com",
    siteName: "Nihao Negocios",
    title: "Nihao Negocios · China sin improvisar",
    description:
      "Acompañamos a empresas y emprendedores a importar, validar fábricas y recorrer ferias en China.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nihao Negocios",
    description:
      "Acompañamos negocios con China: proveedores, ferias, auditorías, sourcing e inmersión internacional.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#fefefe",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es-AR"
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-paper text-ink antialiased">
        <Navbar />
        <main className="relative">{children}</main>
        <Footer />
        <WhatsAppFloatingButton />
      </body>
    </html>
  );
}
