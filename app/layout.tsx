import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "./globals.css";

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
    default:
      "Nihao Negocios · Hacé negocios con China con más claridad y acompañamiento real",
    template: "%s · Nihao Negocios",
  },
  description:
    "Acompañamos a empresas, emprendedores e instituciones a encontrar proveedores, recorrer ferias, auditar fábricas y desarrollar negocios con China con menos riesgo y más claridad.",
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
    title:
      "Nihao Negocios · Hacé negocios con China con más claridad y acompañamiento real",
    description:
      "Encontrar proveedores, recorrer ferias, auditar fábricas y decidir mejor. Hablamos tu idioma y el de ellos.",
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
        {children}
      </body>
    </html>
  );
}
