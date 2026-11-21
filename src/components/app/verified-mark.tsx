import React from "react";

/**
 * Minimal monochrome verified mark: a small solid dot with a thin check.
 * Follows text colour (white on dark, black on light) — no shields, no blue.
 */
export function VerifiedMark({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label="Tasdiqlangan"
      className={`shrink-0 text-[var(--text-primary)] ${className ?? ""}`}
    >
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path
        d="M4.9 8.2l2.1 2.1 4.1-4.4"
        fill="none"
        stroke="var(--bg-canvas, #000)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
