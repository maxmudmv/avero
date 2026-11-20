"use client";

import React, { useCallback, useRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { useDesignSystem } from "../providers/design-system-provider";
import { LIQUID_BUTTON_SPRING, LIQUID_BUTTON_TAP } from "../tokens/motion";
import { cn } from "../utils/cn";
import { triggerHapticImpact } from "../utils/haptics";

export type GlassButtonVariant =
  | "glass"
  | "subtle"
  | "accent"
  | "danger"
  | "ghost";
export type GlassButtonSize = "sm" | "md" | "lg" | "icon";

export interface GlassButtonProps
  extends Omit<HTMLMotionProps<"button">, "children"> {
  children: React.ReactNode;
  variant?: GlassButtonVariant;
  size?: GlassButtonSize;
  loading?: boolean;
  haptic?: boolean;
}

const SIZE_CLASSES: Record<GlassButtonSize, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-xl gap-1.5",
  md: "h-11 px-5 text-[14px] rounded-2xl gap-2",
  lg: "h-12 px-6 text-[15px] rounded-2xl gap-2.5",
  icon: "h-10 w-10 p-0 rounded-full",
};

const VARIANT_CLASSES: Record<GlassButtonVariant, string> = {
  glass: "liquid-glass liquid-glass-glare text-[var(--text-primary)]",
  subtle:
    "liquid-glass liquid-glass-glare bg-[var(--glass-fill-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
  accent:
    "liquid-glass liquid-glass-glare bg-sky-400/12 text-[var(--text-primary)]",
  danger:
    "liquid-glass liquid-glass-glare bg-rose-500/12 text-rose-500 dark:text-rose-300",
  ghost:
    "liquid-glass-glare bg-transparent hover:bg-[var(--glass-fill-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent",
};

export const GlassButton = React.forwardRef<
  HTMLButtonElement,
  GlassButtonProps
>(function GlassButton(
  {
    children,
    className,
    variant = "glass",
    size = "md",
    disabled = false,
    loading = false,
    haptic = true,
    type = "button",
    onPointerDown,
    onPointerMove,
    onPointerLeave,
    onPointerUp,
    onClick,
    ...rest
  },
  forwardedRef
) {
  const { reducedMotion } = useDesignSystem();
  const localRef = useRef<HTMLButtonElement | null>(null);
  const isDisabled = disabled || loading;

  const setRefs = useCallback(
    (node: HTMLButtonElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef]
  );

  const updateGlare = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, visible: boolean) => {
      const el = localRef.current;
      if (!el || reducedMotion || isDisabled) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
      el.style.setProperty("--glare-x", `${x.toFixed(1)}%`);
      el.style.setProperty("--glare-y", `${y.toFixed(1)}%`);
      el.style.setProperty("--glare-opacity", visible ? "1" : "0");
    },
    [reducedMotion, isDisabled]
  );

  return (
    <motion.button
      ref={setRefs}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      whileTap={isDisabled || reducedMotion ? undefined : LIQUID_BUTTON_TAP}
      transition={LIQUID_BUTTON_SPRING}
      onPointerDown={(e) => {
        updateGlare(e, true);
        if (haptic && !isDisabled) {
          triggerHapticImpact("light");
        }
        onPointerDown?.(e);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse") {
          updateGlare(e, true);
        }
        onPointerMove?.(e);
      }}
      onPointerUp={(e) => {
        updateGlare(e, e.pointerType === "mouse");
        onPointerUp?.(e);
      }}
      onPointerLeave={(e) => {
        localRef.current?.style.setProperty("--glare-opacity", "0");
        onPointerLeave?.(e);
      }}
      onClick={onClick}
      className={cn(
        "glass-focus-ring relative inline-flex select-none items-center justify-center font-medium tracking-[-0.01em] transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-45 cursor-pointer",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className
      )}
      {...rest}
    >
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {loading ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : null}
        {children}
      </span>
    </motion.button>
  );
});
