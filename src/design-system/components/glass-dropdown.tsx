"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useDesignSystem } from "../providers/design-system-provider";
import { LIQUID_BUTTON_SPRING, LIQUID_BUTTON_TAP, LIQUID_MODAL_SPRING } from "../tokens/motion";
import { Z_INDEX } from "../tokens/z-index";
import { cn } from "../utils/cn";
import { triggerHapticImpact, triggerHapticSelection } from "../utils/haptics";

export interface GlassDropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface GlassDropdownProps {
  trigger: React.ReactNode;
  items: GlassDropdownItem[];
  align?: "start" | "end";
  ariaLabel?: string;
}

export function GlassDropdown({
  trigger,
  items,
  align = "end",
  ariaLabel = "Options menu",
}: GlassDropdownProps) {
  const { reducedMotion } = useDesignSystem();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerWrapperRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerWrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuWidth = 220;
    const left =
      align === "end"
        ? Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth))
        : Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.left));
    const top = Math.min(window.innerHeight - 220, rect.bottom + 8);
    setCoords({ top, left });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerWrapperRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerWrapperRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [open, updatePosition]);

  return (
    <>
      <motion.button
        ref={triggerWrapperRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        whileTap={reducedMotion ? undefined : LIQUID_BUTTON_TAP}
        transition={LIQUID_BUTTON_SPRING}
        onClick={() => {
          triggerHapticImpact("light");
          setOpen((prev) => !prev);
        }}
        className="glass-focus-ring inline-flex items-center justify-center rounded-2xl cursor-pointer"
      >
        {trigger}
      </motion.button>

      {mounted
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  ref={menuRef}
                  id={menuId}
                  role="menu"
                  aria-label={ariaLabel}
                  style={{
                    zIndex: Z_INDEX.dropdown,
                    top: coords.top,
                    left: coords.left,
                  }}
                  initial={
                    reducedMotion
                      ? { opacity: 1 }
                      : { opacity: 0, scale: 0.94, y: -6 }
                  }
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.94, y: -6 }
                  }
                  transition={LIQUID_MODAL_SPRING}
                  className="liquid-glass fixed w-[220px] origin-top rounded-2xl p-1.5"
                >
                  <div className="relative z-10 flex flex-col gap-0.5">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        disabled={item.disabled}
                        onClick={() => {
                          if (item.disabled) return;
                          triggerHapticSelection();
                          setOpen(false);
                          item.onSelect();
                        }}
                        className={cn(
                          "glass-focus-ring flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] font-medium transition-colors cursor-pointer",
                          item.danger
                            ? "text-rose-400 hover:bg-rose-500/12"
                            : "text-[var(--text-primary)] hover:bg-[var(--glass-fill-hover)]",
                          item.disabled && "pointer-events-none opacity-40"
                        )}
                      >
                        {item.icon ? (
                          <span aria-hidden="true" className="shrink-0">
                            {item.icon}
                          </span>
                        ) : null}
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}
    </>
  );
}
