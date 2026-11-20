"use client";

import React, { createContext, useCallback, useContext, useId, useRef } from "react";
import { motion } from "framer-motion";
import { useDesignSystem } from "../providers/design-system-provider";
import {
  LIQUID_BUTTON_SPRING,
  LIQUID_BUTTON_TAP,
  LIQUID_TAB_SPRING,
} from "../tokens/motion";
import { cn } from "../utils/cn";
import { triggerHapticSelection } from "../utils/haptics";

interface TabsContextValue {
  value: string;
  onChange: (nextValue: string) => void;
  layoutId: string;
  registerTab: (id: string, el: HTMLButtonElement | null) => void;
  focusRelativeTab: (currentId: string, delta: number) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export interface GlassTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  ariaLabel?: string;
  className?: string;
  fullWidth?: boolean;
}

export function GlassTabs({
  value,
  onValueChange,
  children,
  ariaLabel = "Navigation tabs",
  className,
  fullWidth = false,
}: GlassTabsProps) {
  const layoutId = useId();
  const tabRefs = useRef<Array<{ id: string; el: HTMLButtonElement | null }>>(
    []
  );

  const registerTab = useCallback(
    (id: string, el: HTMLButtonElement | null) => {
      const idx = tabRefs.current.findIndex((item) => item.id === id);
      if (el === null) {
        if (idx >= 0) tabRefs.current.splice(idx, 1);
        return;
      }
      if (idx >= 0) {
        tabRefs.current[idx] = { id, el };
      } else {
        tabRefs.current.push({ id, el });
      }
    },
    []
  );

  const focusRelativeTab = useCallback(
    (currentId: string, delta: number) => {
      const items = tabRefs.current.filter((t) => t.el && !t.el.disabled);
      if (items.length === 0) return;
      const idx = items.findIndex((t) => t.id === currentId);
      const nextIndex = (idx + delta + items.length) % items.length;
      const next = items[nextIndex];
      if (next?.el) {
        next.el.focus();
        triggerHapticSelection();
        onValueChange(next.id);
      }
    },
    [onValueChange]
  );

  const handleChange = useCallback(
    (next: string) => {
      if (next !== value) {
        triggerHapticSelection();
        onValueChange(next);
      }
    },
    [onValueChange, value]
  );

  return (
    <TabsContext.Provider
      value={{
        value,
        onChange: handleChange,
        layoutId,
        registerTab,
        focusRelativeTab,
      }}
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          "oled-matte-card inline-flex items-center gap-1 rounded-2xl p-1",
          fullWidth && "flex w-full",
          className
        )}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface GlassTabProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function GlassTab({
  value,
  children,
  disabled = false,
  className,
}: GlassTabProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error("GlassTab must be used inside GlassTabs");
  }
  const { reducedMotion } = useDesignSystem();
  const isActive = ctx.value === value;
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const handlePointerGlare = (
    e: React.PointerEvent<HTMLButtonElement>,
    visible: boolean
  ) => {
    const el = buttonRef.current;
    if (!el || reducedMotion || disabled) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    el.style.setProperty("--glare-x", `${x.toFixed(1)}%`);
    el.style.setProperty("--glare-y", `${y.toFixed(1)}%`);
    el.style.setProperty("--glare-opacity", visible ? "1" : "0");
  };

  return (
    <motion.button
      ref={(node) => {
        buttonRef.current = node;
        ctx.registerTab(value, node);
      }}
      type="button"
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      whileTap={disabled || reducedMotion ? undefined : LIQUID_BUTTON_TAP}
      transition={LIQUID_BUTTON_SPRING}
      onPointerDown={(e) => handlePointerGlare(e, true)}
      onPointerUp={(e) => handlePointerGlare(e, false)}
      onPointerLeave={() =>
        buttonRef.current?.style.setProperty("--glare-opacity", "0")
      }
      onClick={() => ctx.onChange(value)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          ctx.focusRelativeTab(value, 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          ctx.focusRelativeTab(value, -1);
        }
      }}
      className={cn(
        "glass-focus-ring liquid-glass-glare relative flex-1 select-none rounded-xl px-4 py-2 text-[13.5px] font-medium transition-colors duration-150 cursor-pointer",
        isActive
          ? "text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
        disabled && "pointer-events-none opacity-40",
        className
      )}
    >
      {isActive ? (
        <motion.span
          layoutId={`lg-tab-pill-${ctx.layoutId}`}
          transition={LIQUID_TAB_SPRING}
          aria-hidden="true"
          className="liquid-glass absolute inset-0 rounded-xl"
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
        {children}
      </span>
    </motion.button>
  );
}
