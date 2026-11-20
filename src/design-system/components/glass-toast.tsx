"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  useDesignSystem,
  type ToastItem,
  type ToastVariant,
} from "../providers/design-system-provider";
import { LIQUID_MODAL_SPRING } from "../tokens/motion";
import { Z_INDEX } from "../tokens/z-index";
import { cn } from "../utils/cn";

const VARIANT_ICON: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="h-4 w-4 text-sky-400" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  error: <XCircle className="h-4 w-4 text-rose-400" />,
};

export function GlassToast({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const { reducedMotion } = useDesignSystem();

  return (
    <motion.div
      layout
      role="status"
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.96 }}
      transition={LIQUID_MODAL_SPRING}
      className={cn(
        "liquid-glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 text-[var(--text-primary)]"
      )}
    >
      <span aria-hidden="true" className="relative z-10 mt-0.5 shrink-0">
        {VARIANT_ICON[item.variant]}
      </span>
      <div className="relative z-10 min-w-0 flex-1">
        <p className="text-[13.5px] font-medium leading-snug">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-secondary)]">
            {item.description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
        className="glass-focus-ring relative z-10 rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

export function GlassToastViewport() {
  const { toasts, dismissToast } = useDesignSystem();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{ zIndex: Z_INDEX.toast }}
      className="pointer-events-none fixed inset-x-0 top-0 flex flex-col items-center gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((item) => (
          <GlassToast key={item.id} item={item} onDismiss={dismissToast} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}
