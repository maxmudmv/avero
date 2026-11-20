import React from "react";
import { cn } from "../utils/cn";

export type GlassBadgeVariant =
  | "glass"
  | "matte"
  | "accent"
  | "success"
  | "warning"
  | "danger";

export interface GlassBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: GlassBadgeVariant;
}

const BADGE_CLASSES: Record<GlassBadgeVariant, string> = {
  glass: "liquid-glass text-[var(--text-primary)]",
  matte:
    "bg-[var(--surface-matte)] border border-[var(--border-matte)] text-[var(--text-secondary)]",
  accent:
    "bg-sky-400/12 border border-sky-400/25 text-sky-700 dark:text-sky-300",
  success:
    "bg-emerald-400/12 border border-emerald-400/25 text-emerald-700 dark:text-emerald-300",
  warning:
    "bg-amber-400/12 border border-amber-400/25 text-amber-700 dark:text-amber-300",
  danger:
    "bg-rose-500/12 border border-rose-500/25 text-rose-700 dark:text-rose-300",
};

export function GlassBadge({
  children,
  variant = "glass",
  className,
  ...rest
}: GlassBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium tracking-[0.01em]",
        BADGE_CLASSES[variant],
        className
      )}
      {...rest}
    >
      <span className="relative z-10 inline-flex items-center gap-1">
        {children}
      </span>
    </span>
  );
}
