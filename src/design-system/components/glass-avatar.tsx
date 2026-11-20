import React from "react";
import { getAvatarById, type AvatarCatalogItem } from "@/lib/avatars/catalog";
import { cn } from "../utils/cn";

export type GlassAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface GlassAvatarProps {
  name: string;
  seed?: string;
  avatarId?: string | null;
  online?: boolean;
  size?: GlassAvatarSize;
  className?: string;
}

const SIZE_CLASSES: Record<GlassAvatarSize, string> = {
  xs: "h-7 w-7 text-[11px]",
  sm: "h-9 w-9 text-[12.5px]",
  md: "h-11 w-11 text-[14px]",
  lg: "h-14 w-14 text-[17px]",
  xl: "h-20 w-20 text-[22px]",
};

function AvatarSvgArtwork({ item }: { item: AvatarCatalogItem }) {
  const c1 = item.accentColor;
  const c2 = item.secondaryColor;
  const v = item.glyphVariant;

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="h-[68%] w-[68%]"
    >
      {item.category === "illustration" ? (
        <>
          {v % 5 === 1 ? (
            // Geometric Fox / Cat ears
            <path
              d="M11 16L17 24H31L37 16L35 32L24 39L13 32L11 16Z"
              stroke={c1}
              strokeWidth="2.4"
              strokeLinejoin="round"
              fill={c2}
              fillOpacity="0.22"
            />
          ) : v % 5 === 2 ? (
            // Owl / Eyes
            <>
              <circle cx="18" cy="22" r="5" stroke={c1} strokeWidth="2.2" />
              <circle cx="30" cy="22" r="5" stroke={c1} strokeWidth="2.2" />
              <path
                d="M24 26L21.5 31H26.5L24 26Z"
                fill={c2}
              />
            </>
          ) : v % 5 === 3 ? (
            // Cat / Minimal face
            <>
              <path
                d="M13 18L17 12L21 17H27L31 12L35 18V30C35 34.4 30.1 38 24 38C17.9 38 13 34.4 13 30V18Z"
                stroke={c1}
                strokeWidth="2.2"
                fill={c2}
                fillOpacity="0.18"
              />
              <circle cx="19.5" cy="24" r="1.7" fill={c1} />
              <circle cx="28.5" cy="24" r="1.7" fill={c1} />
            </>
          ) : v % 5 === 4 ? (
            // Astronaut / Mountain / Crest
            <>
              <circle
                cx="24"
                cy="24"
                r="13"
                stroke={c1}
                strokeWidth="2.2"
                fill={c2}
                fillOpacity="0.16"
              />
              <rect
                x="16"
                y="18"
                width="16"
                height="9"
                rx="4.5"
                stroke={c1}
                strokeWidth="2"
                fill={c1}
                fillOpacity="0.25"
              />
            </>
          ) : (
            // Mountain / Wave / Lotus
            <>
              <path
                d="M9 34L19 16L26 27L31 20L39 34H9Z"
                stroke={c1}
                strokeWidth="2.3"
                strokeLinejoin="round"
                fill={c2}
                fillOpacity="0.24"
              />
              <circle cx="33" cy="14" r="3" fill={c1} />
            </>
          )}
        </>
      ) : item.category === "abstract" ? (
        <>
          {v % 3 === 0 ? (
            <>
              <polygon
                points="24,8 38,24 24,40 10,24"
                stroke={c1}
                strokeWidth="2.2"
                fill={c2}
                fillOpacity="0.24"
              />
              <polygon
                points="24,14 32,24 24,34 16,24"
                stroke={c2}
                strokeWidth="1.8"
              />
            </>
          ) : v % 3 === 1 ? (
            <>
              <circle
                cx="20"
                cy="24"
                r="10"
                stroke={c1}
                strokeWidth="2.2"
                fill={c1}
                fillOpacity="0.14"
              />
              <circle
                cx="28"
                cy="24"
                r="10"
                stroke={c2}
                strokeWidth="2.2"
                fill={c2}
                fillOpacity="0.14"
              />
            </>
          ) : (
            <>
              <path
                d="M11 29C15 15 33 33 37 19"
                stroke={c1}
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <path
                d="M11 21C17 34 31 14 37 27"
                stroke={c2}
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </>
          )}
        </>
      ) : (
        // Minimal category
        <>
          {v % 3 === 0 ? (
            <path
              d="M29 13A11 11 0 1 0 35 31A8.5 8.5 0 1 1 29 13Z"
              stroke={c1}
              strokeWidth="2.2"
              fill={c2}
              fillOpacity="0.24"
            />
          ) : v % 3 === 1 ? (
            <>
              <rect
                x="15"
                y="12"
                width="18"
                height="24"
                rx="6"
                stroke={c1}
                strokeWidth="2.2"
                fill={c2}
                fillOpacity="0.16"
              />
              <line
                x1="19"
                y1="24"
                x2="29"
                y2="24"
                stroke={c1}
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <circle cx="24" cy="24" r="11" stroke={c1} strokeWidth="2.2" />
              <circle cx="24" cy="24" r="3.5" fill={c2} />
            </>
          )}
        </>
      )}
    </svg>
  );
}

/**
 * Built-in SVG Avatar renderer (30 original built-in assets; no uploads).
 */
export function GlassAvatar({
  name,
  avatarId,
  online = false,
  size = "md",
  className,
}: GlassAvatarProps) {
  const item = getAvatarById(avatarId);

  return (
    <span
      role="img"
      aria-label={`${name} avatar (${item.name})`}
      className={cn(
        "liquid-glass relative inline-flex shrink-0 select-none items-center justify-center rounded-full text-[var(--text-primary)]",
        "bg-gradient-to-br",
        item.bgGradient,
        SIZE_CLASSES[size],
        className
      )}
    >
      <span className="relative z-10 flex h-full w-full items-center justify-center">
        <AvatarSvgArtwork item={item} />
      </span>

      {online ? (
        <span
          aria-label="Onlayn"
          className="absolute bottom-0 right-0 z-20 h-3 w-3 rounded-full border-2 border-[var(--bg-canvas)] bg-emerald-400"
        />
      ) : null}
    </span>
  );
}
