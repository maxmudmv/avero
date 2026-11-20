"use client";

import React from "react";
import { motion } from "framer-motion";
import { useDesignSystem } from "../providers/design-system-provider";
import { LIQUID_BUTTON_SPRING, LIQUID_BUTTON_TAP } from "../tokens/motion";
import { Z_INDEX } from "../tokens/z-index";
import { cn } from "../utils/cn";
import { triggerHapticSelection } from "../utils/haptics";

export interface GlassDockItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
  active?: boolean;
  onSelect: () => void;
}

export interface GlassDockProps {
  items: GlassDockItem[];
  ariaLabel?: string;
  className?: string;
}

export function GlassDock({
  items,
  ariaLabel = "Primary navigation dock",
  className,
}: GlassDockProps) {
  const { reducedMotion } = useDesignSystem();

  return (
    <nav
      aria-label={ariaLabel}
      style={{ zIndex: Z_INDEX.dock }}
      className={cn(
        "liquid-glass mx-auto inline-flex items-center gap-1.5 rounded-[28px] p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]",
        className
      )}
    >
      {items.map((item) => (
        <motion.button
          key={item.id}
          type="button"
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
          whileTap={reducedMotion ? undefined : LIQUID_BUTTON_TAP}
          transition={LIQUID_BUTTON_SPRING}
          onClick={() => {
            triggerHapticSelection();
            item.onSelect();
          }}
          className={cn(
            "glass-focus-ring relative flex h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-[22px] px-3.5 text-[11px] font-medium transition-colors duration-150 cursor-pointer",
            item.active
              ? "liquid-glass text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--glass-fill-subtle)] hover:text-[var(--text-primary)]"
          )}
        >
          <span className="relative z-10 flex items-center justify-center">
            {item.icon}
          </span>
          <span className="relative z-10 leading-none">{item.label}</span>
          {item.badge !== undefined ? (
            <span className="absolute right-2 top-1.5 z-20 min-w-4 rounded-full bg-sky-400/25 px-1 text-center text-[10px] font-semibold text-[var(--text-primary)]">
              {item.badge}
            </span>
          ) : null}
        </motion.button>
      ))}
    </nav>
  );
}
