import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow?: string;
  eyebrowTone?: "nihao" | "gold" | "ink";
  title: ReactNode;
  intro?: ReactNode;
  align?: "left" | "center";
  className?: string;
  inverse?: boolean;
  maxTitle?: "sm" | "md" | "lg";
  children?: ReactNode;
};

export function SectionHeading({
  eyebrow,
  eyebrowTone = "nihao",
  title,
  intro,
  align = "left",
  className,
  inverse = false,
  maxTitle = "md",
  children,
}: Props) {
  const titleMax = {
    sm: "max-w-[20ch]",
    md: "max-w-[24ch]",
    lg: "max-w-[28ch]",
  }[maxTitle];

  return (
    <header
      className={cn(
        "flex flex-col gap-5",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      {eyebrow && (
        <span
          className={cn(
            "text-eyebrow-mark",
            eyebrowTone === "gold" && "gold",
            eyebrowTone === "nihao" && "text-nihao",
            eyebrowTone === "ink" &&
              (inverse ? "text-paper/70" : "text-ink-mute"),
          )}
        >
          {eyebrow}
        </span>
      )}
      <h2
        className={cn(
          maxTitle,
          "text-display-lg",
          inverse ? "text-paper" : "text-ink",
        )}
      >
        {title}
      </h2>
      {intro && (
        <p
          className={cn(
            "max-w-[60ch] text-[1.0625rem] leading-[1.65]",
            inverse ? "text-paper/75" : "text-ink-soft",
          )}
        >
          {intro}
        </p>
      )}
      {children}
    </header>
  );
}
