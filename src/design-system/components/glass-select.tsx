"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useDesignSystem } from "../providers/design-system-provider";
import {
  LIQUID_BUTTON_SPRING,
  LIQUID_BUTTON_TAP,
  LIQUID_SHEET_SPRING,
} from "../tokens/motion";
import { Z_INDEX } from "../tokens/z-index";
import { cn } from "../utils/cn";
import {
  triggerHapticImpact,
  triggerHapticSelection,
} from "../utils/haptics";
import { GlassButton } from "./glass-button";

export interface GlassSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface GlassSelectProps {
  label?: string;
  placeholder?: string;
  sheetTitle?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: GlassSelectOption[];
  searchable?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
}

/**
 * Custom bottom-sheet Select replacing native HTML <select>.
 * Portals to document.body at z-index 90.
 */
export function GlassSelect({
  label,
  placeholder = "Tanlang...",
  sheetTitle,
  value,
  onValueChange,
  options,
  searchable = false,
  disabled = false,
  error,
  className,
}: GlassSelectProps) {
  const { reducedMotion } = useDesignSystem();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const labelId = useId();
  const sheetTitleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.description?.toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (searchable) {
      window.setTimeout(() => searchInputRef.current?.focus(), 40);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      setQuery("");
    };
  }, [open, searchable]);

  const handleSelect = (option: GlassSelectOption) => {
    if (option.disabled) return;
    triggerHapticSelection();
    onValueChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      {label ? (
        <span
          id={labelId}
          className="text-[13px] font-medium tracking-[-0.005em] text-[var(--text-secondary)]"
        >
          {label}
        </span>
      ) : null}

      <motion.button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? labelId : undefined}
        whileTap={disabled || reducedMotion ? undefined : LIQUID_BUTTON_TAP}
        transition={LIQUID_BUTTON_SPRING}
        onClick={() => {
          triggerHapticImpact("light");
          setOpen(true);
        }}
        className={cn(
          "glass-focus-ring flex h-11 w-full items-center justify-between gap-3 rounded-2xl border bg-[var(--surface-input)] px-3.5 text-left text-[14.5px] transition-colors duration-150 cursor-pointer",
          error
            ? "border-rose-500/45"
            : "border-[var(--border-matte)] hover:border-[var(--border-matte-hover)]",
          disabled && "pointer-events-none opacity-45"
        )}
      >
        <span
          className={cn(
            "truncate",
            selectedOption
              ? "text-[var(--text-primary)]"
              : "text-[var(--text-muted)]"
          )}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </motion.button>

      {error ? (
        <p role="alert" className="text-[12px] text-rose-400">
          {error}
        </p>
      ) : null}

      {mounted
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <div
                  style={{ zIndex: Z_INDEX.select }}
                  className="fixed inset-0 flex items-end justify-center sm:p-4"
                >
                  <motion.div
                    aria-hidden="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.18 }}
                    onClick={() => {
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    className="fixed inset-0 bg-[var(--surface-backdrop)] backdrop-blur-md"
                  />

                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={sheetTitleId}
                    initial={reducedMotion ? { opacity: 1 } : { y: "100%" }}
                    animate={{ y: 0 }}
                    exit={reducedMotion ? { opacity: 0 } : { y: "100%" }}
                    transition={LIQUID_SHEET_SPRING}
                    className="oled-matte-card relative z-10 flex max-h-[78dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[30px] sm:rounded-[30px]"
                  >
                    <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border-matte)] bg-[var(--surface-matte)] px-5 pb-3.5 pt-2.5 backdrop-blur-xl">
                      <div
                        aria-hidden="true"
                        className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--text-muted)] opacity-45"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <h2
                          id={sheetTitleId}
                          className="text-[16px] font-semibold tracking-[-0.015em] text-[var(--text-primary)]"
                        >
                          {sheetTitle || label || "Tanlang"}
                        </h2>
                        <GlassButton
                          size="icon"
                          variant="subtle"
                          aria-label="Close select"
                          onClick={() => {
                            setOpen(false);
                            triggerRef.current?.focus();
                          }}
                          className="h-8 w-8"
                        >
                          <X className="h-4 w-4" />
                        </GlassButton>
                      </div>

                      {searchable ? (
                        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--border-matte)] bg-[var(--surface-input)] px-3">
                          <Search
                            aria-hidden="true"
                            className="h-4 w-4 text-[var(--text-muted)]"
                          />
                          <input
                            ref={searchInputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Qidirish..."
                            aria-label="Filter options"
                            className="h-9 w-full bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                          />
                        </div>
                      ) : null}
                    </header>

                    <div
                      role="listbox"
                      aria-labelledby={sheetTitleId}
                      className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3.5 pb-[max(1rem,env(safe-area-inset-bottom))]"
                    >
                      {filteredOptions.length === 0 ? (
                        <p className="py-8 text-center text-[13.5px] text-[var(--text-muted)]">
                          Mos variant topilmadi
                        </p>
                      ) : (
                        filteredOptions.map((opt) => {
                          const isSelected = opt.value === value;
                          return (
                            <motion.button
                              key={opt.value}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              disabled={opt.disabled}
                              whileTap={
                                opt.disabled || reducedMotion
                                  ? undefined
                                  : LIQUID_BUTTON_TAP
                              }
                              transition={LIQUID_BUTTON_SPRING}
                              onClick={() => handleSelect(opt)}
                              className={cn(
                                "glass-focus-ring flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors cursor-pointer",
                                isSelected
                                  ? "border-[var(--border-matte-hover)] bg-white/[0.07] text-[var(--text-primary)]"
                                  : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--glass-fill-subtle)] hover:text-[var(--text-primary)]",
                                opt.disabled && "pointer-events-none opacity-40"
                              )}
                            >
                              <div className="relative z-10 min-w-0">
                                <div className="truncate text-[14.5px] font-medium">
                                  {opt.label}
                                </div>
                                {opt.description ? (
                                  <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                                    {opt.description}
                                  </div>
                                ) : null}
                              </div>
                              {isSelected ? (
                                <Check
                                  aria-hidden="true"
                                  className="relative z-10 h-4 w-4 shrink-0 text-sky-400"
                                />
                              ) : null}
                            </motion.button>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                </div>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}
    </div>
  );
}
