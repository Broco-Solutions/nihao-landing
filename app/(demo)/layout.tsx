import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "../globals.css";
import { DemoLayout } from "@/components/demo/DemoLayout";

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
  title: "Portal del Asistente Nihao · Demo",
  description:
    "Demo interactiva del Asistente Nihao: simulador WhatsApp, tablero del viajero y panel del equipo Nihao.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#fefefe",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function DemoRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es-AR"
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-paper text-ink antialiased">
        <DemoLayout>{children}</DemoLayout>
      </body>
    </html>
  );
}
