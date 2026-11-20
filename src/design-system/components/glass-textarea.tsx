"use client";

import React, { useId } from "react";
import { cn } from "../utils/cn";

export interface GlassTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  showCounter?: boolean;
}

export const GlassTextarea = React.forwardRef<
  HTMLTextAreaElement,
  GlassTextareaProps
>(function GlassTextarea(
  {
    label,
    hint,
    error,
    showCounter = true,
    maxLength,
    value,
    defaultValue,
    id,
    className,
    ...rest
  },
  ref
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hintId = `${textareaId}-hint`;
  const errorId = `${textareaId}-error`;

  const currentLength =
    typeof value === "string"
      ? value.length
      : typeof defaultValue === "string"
        ? defaultValue.length
        : 0;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label ? (
        <label
          htmlFor={textareaId}
          className="text-[13px] font-medium tracking-[-0.005em] text-[var(--text-secondary)]"
        >
          {label}
        </label>
      ) : null}

      <div
        className={cn(
          "relative rounded-2xl border bg-[var(--surface-input)] transition-colors duration-150",
          error
            ? "border-rose-500/45 focus-within:border-rose-400/70"
            : "border-[var(--border-matte)] focus-within:border-[var(--border-matte-hover)]",
          "focus-within:shadow-[0_0_0_3px_var(--focus-ring)]"
        )}
      >
        <textarea
          ref={ref}
          id={textareaId}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            "min-h-[112px] w-full resize-y bg-transparent px-3.5 py-3 text-[15px] leading-[1.6] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...rest}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
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

        {showCounter && typeof maxLength === "number" ? (
          <span
            className={cn(
              "font-mono text-[11.5px] tabular-nums",
              currentLength >= maxLength
                ? "text-rose-400"
                : currentLength > maxLength * 0.85
                  ? "text-amber-400"
                  : "text-[var(--text-muted)]"
            )}
          >
            {currentLength}/{maxLength}
          </span>
        ) : null}
      </div>
    </div>
  );
});
