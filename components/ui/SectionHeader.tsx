import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  decorativeLine?: boolean;
  dark?: boolean;
  className?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
  decorativeLine = false,
  dark = false,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {eyebrow && (
        <span className="text-eyebrow-mark text-nihao">{eyebrow}</span>
      )}
      <h2 className="mt-5 text-display-lg text-balance">{title}</h2>
      {subtitle && (
        <p
          className={cn(
            "mt-5 text-[17px] leading-[1.65] md:text-[18px]",
            dark ? "text-paper/70" : "text-ink-soft",
            align === "center" && "mx-auto max-w-[64ch]",
          )}
        >
          {subtitle}
        </p>
      )}
      {decorativeLine && (
        <div
          className={cn(
            "mt-8 h-px w-16",
            dark ? "bg-paper/20" : "bg-nihao/20",
            align === "center" && "mx-auto",
          )}
        />
      )}
    </div>
  );
}
