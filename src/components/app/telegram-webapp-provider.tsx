"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { triggerHapticSelection, useDesignSystem } from "@/design-system";
import {
  extractLinkTokenFromStartParam,
  getTelegramWebApp,
  type TelegramWebAppInstance,
} from "@/lib/telegram-sdk";

interface TelegramMiniAppContextValue {
  isTma: boolean;
  initData: string | null;
  startParam: string | null;
  pendingLinkToken: string | null;
  clearPendingLinkToken: () => void;
  webApp: TelegramWebAppInstance | null;
}

const TelegramMiniAppContext =
  createContext<TelegramMiniAppContextValue | null>(null);

export function TelegramWebAppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useDesignSystem();

  const [webApp, setWebApp] = useState<TelegramWebAppInstance | null>(null);
  const [initData, setInitData] = useState<string | null>(null);
  const [startParam, setStartParam] = useState<string | null>(null);
  const [pendingLinkToken, setPendingLinkToken] = useState<string | null>(null);

  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg || !tg.initData) {
      return;
    }

    setWebApp(tg);
    setInitData(tg.initData);

    const sp = tg.initDataUnsafe?.start_param ?? null;
    setStartParam(sp);
    setPendingLinkToken(extractLinkTokenFromStartParam(sp));

    document.documentElement.setAttribute("data-tma", "true");

    try {
      tg.ready();
      tg.expand();
    } catch {
      // Ignore partial WebView implementations
    }

    const syncViewportAndSafeArea = () => {
      const root = document.documentElement;
      if (tg.viewportHeight) {
        root.style.setProperty("--tg-viewport-height", `${tg.viewportHeight}px`);
      }
      if (tg.viewportStableHeight) {
        root.style.setProperty(
          "--tg-viewport-stable-height",
          `${tg.viewportStableHeight}px`
        );
      }
      const safeTop =
        (tg.safeAreaInset?.top ?? 0) + (tg.contentSafeAreaInset?.top ?? 0);
      const safeBottom =
        (tg.safeAreaInset?.bottom ?? 0) +
        (tg.contentSafeAreaInset?.bottom ?? 0);
      root.style.setProperty("--tg-safe-top", `${safeTop}px`);
      root.style.setProperty("--tg-safe-bottom", `${safeBottom}px`);
    };

    const syncThemeFromTelegram = () => {
      if (tg.colorScheme === "light" || tg.colorScheme === "dark") {
        setTheme(tg.colorScheme);
      }
    };

    syncViewportAndSafeArea();
    syncThemeFromTelegram();

    tg.onEvent?.("viewportChanged", syncViewportAndSafeArea);
    tg.onEvent?.("safeAreaChanged", syncViewportAndSafeArea);
    tg.onEvent?.("contentSafeAreaChanged", syncViewportAndSafeArea);
    tg.onEvent?.("themeChanged", syncThemeFromTelegram);

    return () => {
      document.documentElement.removeAttribute("data-tma");
      tg.offEvent?.("viewportChanged", syncViewportAndSafeArea);
      tg.offEvent?.("safeAreaChanged", syncViewportAndSafeArea);
      tg.offEvent?.("contentSafeAreaChanged", syncViewportAndSafeArea);
      tg.offEvent?.("themeChanged", syncThemeFromTelegram);
    };
  }, [setTheme]);

  // Match Telegram native top bar & background to OLED Matte / Pearl Light
  useEffect(() => {
    if (!webApp) return;
    const bgHex = resolvedTheme === "light" ? "#e4e6eb" : "#060709";
    try {
      webApp.setHeaderColor?.(bgHex);
      webApp.setBackgroundColor?.(bgHex);
    } catch {
      // Ignore older Telegram clients
    }
  }, [webApp, resolvedTheme]);

  // Keep Telegram native BackButton hidden because Avero provides its own bottom dock & in-app back navigation
  useEffect(() => {
    const backBtn = webApp?.BackButton;
    if (!backBtn) return;
    try {
      backBtn.hide();
    } catch {
      // Ignore partial WebView implementations
    }
  }, [webApp, pathname]);

  const value = useMemo<TelegramMiniAppContextValue>(
    () => ({
      isTma: Boolean(initData),
      initData,
      startParam,
      pendingLinkToken,
      clearPendingLinkToken: () => setPendingLinkToken(null),
      webApp,
    }),
    [initData, startParam, pendingLinkToken, webApp]
  );

  return (
    <TelegramMiniAppContext.Provider value={value}>
      {children}
    </TelegramMiniAppContext.Provider>
  );
}

export function useTelegramMiniApp(): TelegramMiniAppContextValue {
  const ctx = useContext(TelegramMiniAppContext);
  if (!ctx) {
    return {
      isTma: false,
      initData: null,
      startParam: null,
      pendingLinkToken: null,
      clearPendingLinkToken: () => {},
      webApp: null,
    };
  }
  return ctx;
}

export function useTelegramMainButton(config: {
  text: string;
  visible: boolean;
  enabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}): void {
  const { isTma, webApp } = useTelegramMiniApp();
  const callbackRef = useRef(config.onClick);
  callbackRef.current = config.onClick;

  useEffect(() => {
    const mainBtn = webApp?.MainButton;
    if (!isTma || !mainBtn) return;

    const handler = () => {
      triggerHapticSelection();
      callbackRef.current();
    };

    mainBtn.setText(config.text);
    if (config.visible) {
      mainBtn.show();
    } else {
      mainBtn.hide();
    }

    if (config.enabled === false) {
      mainBtn.disable();
    } else {
      mainBtn.enable();
    }

    if (config.loading) {
      mainBtn.showProgress(false);
    } else {
      mainBtn.hideProgress();
    }

    mainBtn.onClick(handler);

    return () => {
      mainBtn.offClick(handler);
      mainBtn.hideProgress();
      mainBtn.hide();
    };
  }, [
    isTma,
    webApp,
    config.text,
    config.visible,
    config.enabled,
    config.loading,
  ]);
}
