"use client";

import { DemoHeader } from "./DemoHeader";
import { DemoFooter } from "./DemoFooter";

type DemoLayoutProps = {
  children: React.ReactNode;
  isAuthenticated: boolean;
};

export function DemoLayout({ children, isAuthenticated }: DemoLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-paper-soft">
      <DemoHeader isAuthenticated={isAuthenticated} />
      <main className="flex-1">{children}</main>
      <DemoFooter />
    </div>
  );
}
