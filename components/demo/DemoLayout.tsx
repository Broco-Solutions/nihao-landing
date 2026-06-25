"use client";

import { DemoHeader } from "./DemoHeader";
import { DemoFooter } from "./DemoFooter";

type DemoLayoutProps = {
  children: React.ReactNode;
};

export function DemoLayout({ children }: DemoLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-paper-soft">
      <DemoHeader />
      <main className="flex-1">{children}</main>
      <DemoFooter />
    </div>
  );
}
