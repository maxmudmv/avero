"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useDesignSystem } from "../providers/design-system-provider";
import { LIQUID_MODAL_SPRING } from "../tokens/motion";
import { Z_INDEX } from "../tokens/z-index";
import { cn } from "../utils/cn";
import { GlassButton } from "./glass-button";

export interface GlassModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

export function GlassModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: GlassModalProps) {
  const { reducedMotion } = useDesignSystem();
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      if (
        dialogRef.current &&
        !dialogRef.current.contains(document.activeElement)
      ) {
        dialogRef.current.focus();
      }
    }, 10);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          style={{ zIndex: Z_INDEX.modal }}
          className="fixed inset-0 flex items-center justify-center p-4 sm:p-6"
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
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={
              reducedMotion
                ? { opacity: 1 }
                : { opacity: 0, scale: 0.96, y: 12 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.96, y: 10 }
            }
            transition={LIQUID_MODAL_SPRING}
            className={cn(
              "oled-matte-card relative z-10 flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-[28px] outline-none",
              SIZE_CLASSES[size],
              className
            )}
          >
            {/* Sticky Header */}
            <header className="sticky top-0 z-20 flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border-matte)] bg-[var(--surface-matte)] px-6 py-4 backdrop-blur-xl">
              <div>
                <h2
                  id={titleId}
                  className="text-[17px] font-semibold tracking-[-0.015em] text-[var(--text-primary)]"
                >
                  {title}
                </h2>
                {description ? (
                  <p
                    id={descId}
                    className="mt-0.5 text-[13px] text-[var(--text-secondary)]"
                  >
                    {description}
                  </p>
                ) : null}
              </div>

              <GlassButton
                size="icon"
                variant="subtle"
                aria-label="Close modal"
                onClick={onClose}
                className="h-9 w-9 shrink-0"
              >
                <X className="h-4 w-4" />
              </GlassButton>
            </header>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 text-[14.5px] leading-relaxed text-[var(--text-secondary)]">
              {children}
            </div>

            {/* Sticky Footer */}
            {footer ? (
              <footer className="sticky bottom-0 z-20 flex shrink-0 items-center justify-end gap-2.5 border-t border-[var(--border-matte)] bg-[var(--surface-matte)] px-6 py-4 backdrop-blur-xl">
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
