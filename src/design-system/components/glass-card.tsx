import React from "react";
import { cn } from "../utils/cn";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: "matte" | "glass";
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
}

const PADDING_CLASSES = {
  none: "",
  sm: "p-3.5",
  md: "p-5",
  lg: "p-6 sm:p-7",
} as const;

export function GlassCard({
  children,
  className,
  surface = "matte",
  padding = "md",
  interactive = false,
  ...rest
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-3xl transition-colors duration-200",
        surface === "matte" ? "oled-matte-card" : "liquid-glass",
        interactive &&
          "hover:border-[var(--border-matte-hover)] hover:bg-[var(--surface-matte-hover)]",
        PADDING_CLASSES[padding],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
