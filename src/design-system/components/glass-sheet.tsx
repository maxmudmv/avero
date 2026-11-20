"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useDesignSystem } from "../providers/design-system-provider";
import { LIQUID_SHEET_SPRING } from "../tokens/motion";
import { Z_INDEX } from "../tokens/z-index";
import { cn } from "../utils/cn";
import { GlassButton } from "./glass-button";

export interface GlassSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function GlassSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: GlassSheetProps) {
  const { reducedMotion } = useDesignSystem();
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const timer = window.setTimeout(() => {
      sheetRef.current?.focus();
    }, 10);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          style={{ zIndex: Z_INDEX.sheet }}
          className="fixed inset-0 flex items-end justify-center sm:p-4"
        >
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-[var(--surface-backdrop)] backdrop-blur-md"
          />

          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reducedMotion ? { opacity: 1 } : { y: "100%" }}
            animate={{ y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { y: "100%" }}
            transition={LIQUID_SHEET_SPRING}
            className={cn(
              "oled-matte-card relative z-10 flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[30px] sm:rounded-[30px] outline-none",
              className
            )}
          >
            {/* Drag Handle + Sticky Header */}
            <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border-matte)] bg-[var(--surface-matte)] px-5 pb-3.5 pt-2.5 backdrop-blur-xl">
              <div
                aria-hidden="true"
                className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--text-muted)] opacity-45"
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2
                    id={titleId}
                    className="text-[16.5px] font-semibold tracking-[-0.015em] text-[var(--text-primary)]"
                  >
                    {title}
                  </h2>
                  {description ? (
                    <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">
                      {description}
                    </p>
                  ) : null}
                </div>

                <GlassButton
                  size="icon"
                  variant="subtle"
                  aria-label="Close sheet"
                  onClick={onClose}
                  className="h-8 w-8 shrink-0"
                >
                  <X className="h-4 w-4" />
                </GlassButton>
              </div>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 text-[14.5px] text-[var(--text-secondary)]">
              {children}
            </div>

            {/* Sticky Footer */}
            {footer ? (
              <footer className="sticky bottom-0 z-20 flex shrink-0 items-center justify-end gap-2.5 border-t border-[var(--border-matte)] bg-[var(--surface-matte)] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
