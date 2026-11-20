"use client";

import React, { useId } from "react";
import { cn } from "../utils/cn";

export interface GlassInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: React.ReactNode;
  trailingSlot?: React.ReactNode;
}

export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  function GlassInput(
    {
      label,
      hint,
      error,
      leadingIcon,
      trailingSlot,
      id,
      className,
      ...rest
    },
    ref
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;
    const describedBy = [
      error ? errorId : null,
      hint ? hintId : null,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className="flex w-full flex-col gap-1.5">
        {label ? (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium tracking-[-0.005em] text-[var(--text-secondary)]"
          >
            {label}
          </label>
        ) : null}

        <div
          className={cn(
            "relative flex items-center rounded-2xl border bg-[var(--surface-input)] transition-colors duration-150",
            error
              ? "border-rose-500/45 focus-within:border-rose-400/70"
              : "border-[var(--border-matte)] focus-within:border-[var(--border-matte-hover)]",
            "focus-within:shadow-[0_0_0_3px_var(--focus-ring)]"
          )}
        >
          {leadingIcon ? (
            <span
              aria-hidden="true"
              className="pl-3.5 text-[var(--text-muted)]"
            >
              {leadingIcon}
            </span>
          ) : null}

          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            className={cn(
              "h-11 w-full bg-transparent px-3.5 text-[14.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
            {...rest}
          />

          {trailingSlot ? (
            <span className="pr-3 text-[var(--text-muted)]">{trailingSlot}</span>
          ) : null}
        </div>

        {error ? (
          <p id={errorId} role="alert" className="text-[12px] text-rose-400">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-[12px] text-[var(--text-muted)]">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
