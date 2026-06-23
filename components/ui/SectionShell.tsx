import { cn } from "@/lib/utils";

type SectionShellProps = {
  children: React.ReactNode;
  variant?: "paper" | "paper-soft" | "glow" | "pattern" | "glow-pattern";
  className?: string;
  id?: string;
  ariaLabel?: string;
};

export function SectionShell({
  children,
  variant = "paper",
  className,
  id,
  ariaLabel,
}: SectionShellProps) {
  return (
    <section
      id={id}
      aria-label={ariaLabel}
      className={cn(
        "relative overflow-hidden",
        variant === "paper" && "bg-paper",
        variant === "paper-soft" && "bg-paper-soft",
        variant === "glow" && "bg-paper-soft",
        variant === "pattern" && "bg-paper",
        variant === "glow-pattern" && "bg-paper-soft",
        className,
      )}
    >
      {(variant === "glow" || variant === "glow-pattern") && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute -left-[10%] -top-[30%] h-[70%] w-[50%] rounded-full bg-nihao/[0.04] blur-[100px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-[30%] -right-[10%] h-[70%] w-[50%] rounded-full bg-nihao/[0.03] blur-[100px]"
          />
        </>
      )}
      {(variant === "pattern" || variant === "glow-pattern") && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] opacity-[0.02] [background-size:28px_28px]"
        />
      )}
      <div className="relative z-10">{children}</div>
    </section>
  );
}
