"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MotionConfig, useReducedMotion } from "framer-motion";
import {
  LiquidGlassPhysicsEngine,
  type ComputedLightAngles,
} from "../physics/light-physics";
import { triggerHapticNotification } from "../utils/haptics";

export type ThemeMode = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export type ToastVariant = "default" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
}

interface DesignSystemContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
  reducedMotion: boolean;
  requestGyroPermission: () => Promise<string>;
  subscribeLightAngles: (
    fn: (angles: ComputedLightAngles) => void
  ) => () => void;
  getLightAngles: () => ComputedLightAngles;
  toasts: ToastItem[];
  toast: (input: {
    title: string;
    description?: string;
    variant?: ToastVariant;
    durationMs?: number;
  }) => string;
  dismissToast: (id: string) => void;
}

const DesignSystemContext = createContext<DesignSystemContextValue | null>(
  null
);

export function DesignSystemProvider({
  children,
  initialTheme = "system",
}: {
  children: React.ReactNode;
  initialTheme?: ThemeMode;
}) {
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const prefersReduced = useReducedMotion() ?? false;

  const engineRef = useRef<LiquidGlassPhysicsEngine | null>(null);
  if (!engineRef.current && typeof window !== "undefined") {
    engineRef.current = new LiquidGlassPhysicsEngine();
  }

  // Start light physics engine once with zero per-frame React re-renders
  useEffect(() => {
    const engine = engineRef.current ?? new LiquidGlassPhysicsEngine();
    engineRef.current = engine;
    return engine.start();
  }, []);

  // Resolve and apply `data-theme` attribute cleanly
  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia("(prefers-color-scheme: light)");

    const syncTheme = () => {
      const nextResolved: ResolvedTheme =
        theme === "system" ? (mql.matches ? "light" : "dark") : theme;
      setResolvedTheme(nextResolved);
      if (theme === "system") {
        root.removeAttribute("data-theme");
      } else {
        root.setAttribute("data-theme", theme);
      }
      root.style.colorScheme = nextResolved;
    };

    syncTheme();
    mql.addEventListener("change", syncTheme);
    return () => mql.removeEventListener("change", syncTheme);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: {
      title: string;
      description?: string;
      variant?: ToastVariant;
      durationMs?: number;
    }) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const variant = input.variant ?? "default";
      const durationMs = input.durationMs ?? 3600;

      if (variant === "success" || variant === "warning" || variant === "error") {
        triggerHapticNotification(variant);
      }

      setToasts((prev) => [
        ...prev.slice(-3),
        {
          id,
          title: input.title,
          description: input.description,
          variant,
          durationMs,
        },
      ]);

      window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);

      return id;
    },
    [dismissToast]
  );

  const requestGyroPermission = useCallback(async () => {
    if (!engineRef.current) return "unsupported";
    return engineRef.current.requestGyroPermission();
  }, []);

  const subscribeLightAngles = useCallback(
    (fn: (angles: ComputedLightAngles) => void) => {
      if (!engineRef.current) return () => {};
      return engineRef.current.subscribe(fn);
    },
    []
  );

  const getLightAngles = useCallback(() => {
    return engineRef.current?.getCurrentAngles() ?? { angle: 132, angleAlt: 224 };
  }, []);

  const value = useMemo<DesignSystemContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      reducedMotion: prefersReduced,
      requestGyroPermission,
      subscribeLightAngles,
      getLightAngles,
      toasts,
      toast,
      dismissToast,
    }),
    [
      theme,
      resolvedTheme,
      setTheme,
      prefersReduced,
      requestGyroPermission,
      subscribeLightAngles,
      getLightAngles,
      toasts,
      toast,
      dismissToast,
    ]
  );

  return (
    <MotionConfig reducedMotion="user">
      <DesignSystemContext.Provider value={value}>
        {children}
      </DesignSystemContext.Provider>
    </MotionConfig>
  );
}

export function useDesignSystem(): DesignSystemContextValue {
  const ctx = useContext(DesignSystemContext);
  if (!ctx) {
    throw new Error("useDesignSystem must be used inside DesignSystemProvider");
  }
  return ctx;
}
