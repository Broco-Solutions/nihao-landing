"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "dark";
type Size = "sm" | "md" | "lg";

const base =
  "group relative inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight select-none will-change-transform isolate overflow-hidden";

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-[15px]",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-nihao text-white hover:bg-nihao-deep shadow-[0_1px_0_oklch(100%_0_0/0.16)_inset,0_8px_24px_-8px_#730D0D/0.45]",
  secondary:
    "bg-ink text-paper hover:bg-night-soft",
  ghost:
    "bg-transparent text-ink hover:bg-paper-warm",
  outline:
    "bg-transparent text-ink ring-1 ring-inset ring-line-strong hover:ring-ink/40 hover:bg-paper-warm/60",
  dark:
    "bg-paper text-night hover:bg-paper-warm",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  withArrow?: boolean;
  children: ReactNode;
};

type AsButton = CommonProps & {
  href?: undefined;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  ariaLabel?: string;
};

type AsLink = CommonProps & {
  href: string;
  external?: boolean;
};

export function Button(props: AsButton | AsLink) {
  const reduced = useReducedMotion();
  const {
    variant = "primary",
    size = "md",
    className,
    withArrow = false,
    children,
  } = props;

  const classes = cn(base, sizes[size], variants[variant], className);

  const content = (
    <>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      {withArrow && (
        <span
          aria-hidden
          className="relative z-10 inline-flex h-5 w-5 items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        >
          <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
        </span>
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
      />
    </>
  );

  const motionProps: HTMLMotionProps<"a"> = {
    whileHover: reduced ? undefined : { y: -1 },
    whileTap: reduced ? undefined : { y: 0, scale: 0.985 },
    transition: { type: "spring", stiffness: 500, damping: 30 },
  };

  if ("href" in props && props.href) {
    const { href, external } = props;
    if (external || href.startsWith("http") || href.startsWith("wa.me")) {
      return (
        <motion.a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={classes}
          {...motionProps}
        >
          {content}
        </motion.a>
      );
    }
    return (
      <motion.span
        className="inline-block"
        whileHover={reduced ? undefined : { y: -1 }}
        whileTap={reduced ? undefined : { y: 0, scale: 0.985 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        <Link href={href} className={classes}>
          {content}
        </Link>
      </motion.span>
    );
  }

  const { onClick, type = "button", disabled, ariaLabel } = props as AsButton;
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={classes}
      whileHover={reduced || disabled ? undefined : { y: -1 }}
      whileTap={reduced || disabled ? undefined : { y: 0, scale: 0.985 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
    >
      {content}
    </motion.button>
  );
}
