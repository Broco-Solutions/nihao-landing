import { DemoLayout } from "@/components/demo/DemoLayout";

export default function DemoRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DemoLayout>{children}</DemoLayout>;
}
