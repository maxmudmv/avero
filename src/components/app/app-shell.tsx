"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Bookmark,
  Eye,
  EyeOff,
  Feather,
  HelpCircle,
  Home,
  KeyRound,
  LayoutGrid,
  LogIn,
  LogOut,
  MessageSquare,
  Search,
  Send,
  Settings,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import {
  GlassAvatar,
  GlassButton,
  GlassInput,
  GlassModal,
  GlassTextarea,
  LIQUID_BUTTON_SPRING,
  LIQUID_BUTTON_TAP,
  LIQUID_SHEET_SPRING,
  LIQUID_TAB_SPRING,
  cn,
  triggerHapticImpact,
  triggerHapticSelection,
  useDesignSystem,
} from "@/design-system";
import { apiClient, setTmaSessionToken } from "@/lib/api-client";
import { getPublicEnv } from "@/lib/env";
import { useAppState } from "./app-state-provider";
import { useTelegramMiniApp } from "./telegram-webapp-provider";

interface AppShellProps {
  title?: string;
  topAction?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ title = "Avero", topAction, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { reducedMotion, toast } = useDesignSystem();
  const { isTma, pendingLinkToken, webApp } = useTelegramMiniApp();
  const {
    auth,
    authLoading,
    t,
    refreshAuth,
    loginWithTelegramNow,
    logoutNow,
    unreadCount,
    menuOpen,
    setMenuOpen,
    linkingTelegram,
    confirmPendingTelegramLink,
    dismissPendingTelegramLink,
  } = useAppState();

  const [mounted, setMounted] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [telegramSigningIn, setTelegramSigningIn] = useState(false);

  // Username + Password Login form state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [passwordLoggingIn, setPasswordLoggingIn] = useState(false);

  // Post-Google Account Setup (Onboarding) Modal state
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [setupUsername, setSetupUsername] = useState("");
  const [setupDisplayName, setSetupDisplayName] = useState("");
  const [setupBio, setSetupBio] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState("");
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [setupSuggestions, setSetupSuggestions] = useState<string[]>([]);
  const [savingSetup, setSavingSetup] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Automatically open Account Setup modal after Google sign-in if username+password not yet set
  useEffect(() => {
    if (!auth?.user || !auth.profile) {
      setSetupModalOpen(false);
      return;
    }
    const needsSetup =
      auth.user.onboardingCompleted === false || auth.user.hasPassword === false;
    if (needsSetup && !setupDismissed) {
      setSetupUsername((prev) => prev || auth.profile!.username);
      setSetupDisplayName((prev) => prev || auth.profile!.displayName);
      setSetupBio((prev) => prev || auth.profile!.bio || "");
      setSetupModalOpen(true);
    }
  }, [auth, setupDismissed]);

  // Show a friendly toast when redirected from OAuth login/error
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const authStatus = url.searchParams.get("auth");
    const authError = url.searchParams.get("auth_error");
    if (!authStatus && !authError) return;

    if (authStatus === "setup") {
      setSetupDismissed(false);
      void refreshAuth();
      toast({
        title: "Google bilan kirdingiz! Endi username va parol o‘rnating",
        variant: "success",
      });
    } else if (authStatus === "success") {
      void refreshAuth();
      toast({
        title: "Google hisobingiz bilan tizimga kirdingiz",
        variant: "success",
      });
    } else if (authError === "google_not_configured") {
      toast({
        title: "Google orqali kirish hali ulanmagan",
        description: "Hozircha Telegram orqali kirishingiz mumkin.",
        variant: "warning",
      });
    } else if (authError === "oauth_denied") {
      toast({
        title: "Google orqali kirish bekor qilindi",
        variant: "warning",
      });
    } else if (authError) {
      toast({
        title: "Kirishda xatolik yuz berdi",
        variant: "error",
      });
    }

    url.searchParams.delete("auth");
    url.searchParams.delete("auth_error");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [toast, refreshAuth]);

  const handleGoogleSignIn = () => {
    const startUrl = `${window.location.origin}/api/v1/auth/google/start`;
    // Inside Telegram Mini App, open Google OAuth in the system browser so the native Google account chooser works
    if (isTma && webApp?.openLink) {
      webApp.openLink(startUrl);
      return;
    }
    window.location.href = startUrl;
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = loginUsername.trim();
    const p = loginPassword;
    if (!u || !p) {
      toast({ title: "Username va parolni kiriting", variant: "warning" });
      return;
    }
    setPasswordLoggingIn(true);
    try {
      const res = await apiClient.loginWithPassword(u, p);
      if (res.ok) {
        if (isTma && res.data.sessionToken) {
          setTmaSessionToken(res.data.sessionToken);
        }
        setLoginUsername("");
        setLoginPassword("");
        setLoginModalOpen(false);
        setMenuOpen(false);
        await refreshAuth();
        toast({ title: "Tizimga muvaffaqiyatli kirdingiz", variant: "success" });
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setPasswordLoggingIn(false);
    }
  };

  const handleLoadSetupSuggestions = async () => {
    const seed = setupUsername.trim() || setupDisplayName.trim() || "avero";
    const res = await apiClient.getUsernameSuggestions(seed);
    if (res.ok) {
      setSetupSuggestions(res.data.suggestions);
    }
  };

  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupPassword.length < 6) {
      toast({
        title: "Parol kamida 6 ta belgidan iborat bo‘lishi kerak",
        variant: "warning",
      });
      return;
    }
    if (setupPassword !== setupPasswordConfirm) {
      toast({ title: "Parollar mos kelmadi", variant: "warning" });
      return;
    }

    setSavingSetup(true);
    try {
      const res = await apiClient.completeAccountSetup({
        username: setupUsername,
        displayName: setupDisplayName,
        password: setupPassword,
        bio: setupBio,
      });
      if (res.ok) {
        setSetupPassword("");
        setSetupPasswordConfirm("");
        setSetupModalOpen(false);
        setSetupDismissed(true);
        await refreshAuth();
        toast({
          title: "Hisobingiz sozlandi!",
          description: "Endi username va parol bilan ham kira olasiz.",
          variant: "success",
        });
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setSavingSetup(false);
    }
  };

  const openSetupManually = () => {
    if (auth?.profile) {
      setSetupUsername(auth.profile.username);
      setSetupDisplayName(auth.profile.displayName);
      setSetupBio(auth.profile.bio || "");
    }
    setSetupDismissed(false);
    setMenuOpen(false);
    setSetupModalOpen(true);
  };

  const publicEnv = getPublicEnv();
  const telegramBotUsername =
    publicEnv.TELEGRAM_BOT_USERNAME || "averoappbot";
  const telegramAppShortName =
    publicEnv.TELEGRAM_APP_SHORT_NAME || "app";
  const telegramAppUrl = `https://t.me/${telegramBotUsername}/${telegramAppShortName}`;

  const activeDockId = menuOpen
    ? "menu"
    : pathname === "/search"
      ? "search"
      : pathname === "/messages"
        ? "messages"
        : pathname === "/"
          ? "feed"
          : "menu";

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, setMenuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, setMenuOpen]);

  const handleTelegramSignIn = async () => {
    setTelegramSigningIn(true);
    try {
      const res = await loginWithTelegramNow();
      if (res.ok) {
        setLoginModalOpen(false);
        setMenuOpen(false);
        toast({ title: "Telegram orqali tizimga kirdingiz", variant: "success" });
      } else {
        toast({
          title: res.error ?? "Telegram orqali kirishda xatolik",
          variant: "error",
        });
      }
    } finally {
      setTelegramSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutNow();
    setMenuOpen(false);
    toast({ title: "Hisobdan chiqdingiz", variant: "success" });
  };

  const dockTabs = [
    {
      id: "feed",
      label: t.nav.feed,
      icon: Home,
      onPress: () => {
        setMenuOpen(false);
        router.push("/");
      },
    },
    {
      id: "search",
      label: t.nav.search,
      icon: Search,
      onPress: () => {
        setMenuOpen(false);
        router.push("/search");
      },
    },
    {
      id: "messages",
      label: t.menu.messages,
      icon: MessageSquare,
      onPress: () => {
        setMenuOpen(false);
        router.push("/messages");
      },
    },
    {
      id: "menu",
      label: t.nav.menu,
      icon: LayoutGrid,
      onPress: () => {
        triggerHapticImpact("light");
        setMenuOpen((prev) => !prev);
      },
    },
  ] as const;

  const isStaff = Boolean(
    auth?.user &&
      (auth.user.role === "moderator" ||
        auth.user.role === "admin" ||
        auth.user.role === "super_admin")
  );

  const menuItems: Array<{
    href: string;
    label: string;
    description: string;
    icon: typeof User;
    badge?: number;
  }> = [
    {
      href: "/profile",
      label: t.menu.profile,
      description: auth?.profile ? `@${auth.profile.username}` : t.menu.profileDesc,
      icon: User,
    },
    {
      href: "/notifications",
      label: t.menu.notifications,
      description:
        unreadCount > 0
          ? t.menu.notificationsNew(unreadCount)
          : t.menu.notificationsAllRead,
      icon: Bell,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    {
      href: "/bookmarks",
      label: t.menu.bookmarks,
      description: t.menu.bookmarksDesc,
      icon: Bookmark,
    },
    {
      href: "/compose",
      label: t.nav.compose,
      description: t.compose.newPost,
      icon: Feather,
    },
    {
      href: "/settings",
      label: t.menu.settings,
      description: t.menu.settingsDesc,
      icon: Settings,
    },
    ...(isStaff
      ? [
          {
            href: "/admin",
            label: t.menu.admin,
            description: auth?.user?.role ?? "staff",
            icon: ShieldCheck,
          },
        ]
      : []),
    {
      href: "/help",
      label: t.menu.help,
      description: t.menu.helpDesc,
      icon: HelpCircle,
    },
  ];

  return (
    <div className="relative min-h-screen pb-32">
      {/* Top Bar: Web header OR compact TMA action/login bar */}
      {!isTma ? (
        <header className="sticky top-0 z-30 border-b border-[var(--border-matte)] bg-[var(--bg-canvas)]/82 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
            <Link
              href="/"
              className="glass-focus-ring flex items-center gap-2.5 rounded-xl px-1 py-1"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border-matte-hover)] bg-[var(--surface-matte)] text-[13px] font-bold tracking-tight text-[var(--text-primary)]">
                A
              </span>
              <span
                style={{ fontFamily: "var(--font-display)" }}
                className="text-[17px] font-bold tracking-[-0.02em] text-[var(--text-primary)]"
              >
                {title}
              </span>
            </Link>

            <div className="flex items-center gap-2">
              {topAction}
              {authLoading ? (
                <span
                  aria-hidden="true"
                  className="h-9 w-9 animate-pulse rounded-full bg-white/[0.06]"
                />
              ) : auth?.profile ? (
                <Link
                  href="/profile"
                  aria-label="Profilga o‘tish"
                  className="glass-focus-ring rounded-full"
                >
                  <GlassAvatar
                    name={auth.profile.displayName}
                    seed={auth.profile.username}
                    avatarId={auth.profile.avatarId}
                    size="sm"
                  />
                </Link>
              ) : (
                <GlassButton
                  size="sm"
                  variant="glass"
                  onClick={() => setLoginModalOpen(true)}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {t.auth.signIn}
                </GlassButton>
              )}
            </div>
          </div>
        </header>
      ) : topAction || (!auth?.user && !authLoading) ? (
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-3 pt-2.5 sm:px-4">
          {!auth?.user && !authLoading ? (
            <GlassButton
              size="sm"
              variant="glass"
              onClick={() => setLoginModalOpen(true)}
            >
              <LogIn className="h-3.5 w-3.5" />
              {t.auth.signIn}
            </GlassButton>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">{topAction}</div>
        </div>
      ) : null}

      {/* Main Content Column */}
      <main className="mx-auto max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
        {children}
      </main>

      {/* Unified Sign In Modal (Username + Password, Google, Telegram) */}
      <GlassModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        title={t.auth.signInTitle}
        description={t.auth.signInDesc}
        size="sm"
      >
        <div className="space-y-4">
          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <GlassInput
              label={t.auth.usernameLabel}
              placeholder="@username"
              autoComplete="username"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
            />
            <GlassInput
              label={t.auth.passwordLabel}
              type={showLoginPassword ? "text" : "password"}
              placeholder={t.auth.passwordPlaceholder}
              autoComplete="current-password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              trailingSlot={
                <button
                  type="button"
                  aria-label="Toggle password"
                  onClick={() => setShowLoginPassword((v) => !v)}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {showLoginPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              }
            />
            <GlassButton
              type="submit"
              variant="glass"
              size="lg"
              loading={passwordLoggingIn}
              className="w-full"
            >
              <KeyRound className="h-4 w-4" />
              {t.auth.loginWithUsername}
            </GlassButton>
          </form>

          <div className="flex items-center gap-3 text-[11.5px] text-[var(--text-muted)]">
            <span className="h-px flex-1 bg-[var(--border-matte)]" />
            <span>{t.auth.or}</span>
            <span className="h-px flex-1 bg-[var(--border-matte)]" />
          </div>

          <div className="space-y-2.5">
            <GlassButton
              variant="glass"
              size="lg"
              onClick={handleGoogleSignIn}
              className="w-full"
            >
              <LogIn className="h-4 w-4" />
              {t.auth.loginWithGoogle}
            </GlassButton>

            {isTma ? (
              <GlassButton
                variant="glass"
                size="lg"
                loading={telegramSigningIn}
                onClick={() => void handleTelegramSignIn()}
                className="w-full"
              >
                <Send className="h-4 w-4 text-sky-400" />
                {t.auth.loginWithTelegram}
              </GlassButton>
            ) : (
              <a
                href={telegramAppUrl}
                target="_blank"
                rel="noreferrer"
                className="liquid-glass liquid-glass-glare glass-focus-ring inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full px-6 text-[15px] font-medium text-[var(--text-primary)]"
              >
                <Send className="relative z-10 h-4 w-4 text-sky-400" />
                <span className="relative z-10">{t.auth.loginWithTelegram}</span>
              </a>
            )}
          </div>
        </div>
      </GlassModal>

      {/* Post-Google Initial Account Setup Modal (Username + Password + Display Name + Bio) */}
      <GlassModal
        open={setupModalOpen}
        onClose={() => {
          setSetupDismissed(true);
          setSetupModalOpen(false);
        }}
        title={t.auth.setupTitle}
        description={t.auth.setupDesc}
        size="sm"
        footer={
          <>
            <GlassButton
              variant="ghost"
              onClick={() => {
                setSetupDismissed(true);
                setSetupModalOpen(false);
              }}
            >
              {t.auth.later}
            </GlassButton>
            <GlassButton
              variant="glass"
              loading={savingSetup}
              onClick={(e) => void handleCompleteSetup(e)}
            >
              {t.auth.save}
            </GlassButton>
          </>
        }
      >
        <form onSubmit={handleCompleteSetup} className="space-y-3.5">
          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <GlassInput
                label="Username (5–20 belgi: a-z, 0-9, ., _)"
                placeholder="masalan: maxmud_01"
                value={setupUsername}
                onChange={(e) => setSetupUsername(e.target.value)}
                maxLength={20}
              />
              <GlassButton
                type="button"
                variant="subtle"
                size="md"
                onClick={() => void handleLoadSetupSuggestions()}
                className="shrink-0"
              >
                Takliflar
              </GlassButton>
            </div>

            {setupSuggestions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {setupSuggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setSetupUsername(sug)}
                    className="rounded-full border border-[var(--border-matte)] px-2.5 py-0.5 font-mono text-[11.5px] text-sky-400 hover:bg-[var(--glass-fill-subtle)] cursor-pointer"
                  >
                    @{sug}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <GlassInput
            label="Ko‘rinadigan ism (1–40 belgi)"
            placeholder="Ismingiz"
            value={setupDisplayName}
            onChange={(e) => setSetupDisplayName(e.target.value)}
            maxLength={40}
          />

          <GlassInput
            label="Parol (kamida 6 ta belgi)"
            type={showSetupPassword ? "text" : "password"}
            placeholder="Yangi parol yarating"
            autoComplete="new-password"
            value={setupPassword}
            onChange={(e) => setSetupPassword(e.target.value)}
            maxLength={72}
            trailingSlot={
              <button
                type="button"
                aria-label="Parolni ko‘rsatish"
                onClick={() => setShowSetupPassword((v) => !v)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {showSetupPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            }
          />

          <GlassInput
            label="Parolni tasdiqlang"
            type={showSetupPassword ? "text" : "password"}
            placeholder="Parolni qayta kiriting"
            autoComplete="new-password"
            value={setupPasswordConfirm}
            onChange={(e) => setSetupPasswordConfirm(e.target.value)}
            maxLength={72}
          />

          <GlassTextarea
            label="Bio (ixtiyoriy, maksimum 150 belgi)"
            placeholder="O‘zingiz haqingizda qisqacha..."
            value={setupBio}
            onChange={(e) => setSetupBio(e.target.value)}
            maxLength={150}
            rows={2}
          />
        </form>
      </GlassModal>

      {/* Explicit-Consent Telegram Account Linking Confirmation Modal (TMA startapp=link_*) */}
      <GlassModal
        open={Boolean(isTma && pendingLinkToken)}
        onClose={dismissPendingTelegramLink}
        title="Telegram akkauntini bog‘lash"
        description="Google orqali yaratilgan Avero profilingizga joriy Telegram akkauntingizni bog‘lashga rozimisiz?"
        footer={
          <>
            <GlassButton variant="subtle" onClick={dismissPendingTelegramLink}>
              Bekor qilish
            </GlassButton>
            <GlassButton
              variant="glass"
              loading={linkingTelegram}
              onClick={async () => {
                const res = await confirmPendingTelegramLink();
                if (res.ok) {
                  toast({
                    title: "Telegram akkaunti muvaffaqiyatli bog‘landi",
                    variant: "success",
                  });
                } else {
                  toast({
                    title: res.error ?? "Bog‘lashda xatolik",
                    variant: "error",
                  });
                }
              }}
            >
              Ha, tasdiqlayman
            </GlassButton>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
          Tasdiqlaganingizdan so‘ng Web va Telegram Mini App bitta profil, bitta postlar va bitta bildirishnomalar tizimi bilan ishlaydi. Akkauntlar hech qachon roziliksiz birlashtirilmaydi.
        </p>
      </GlassModal>

      {/* Portaled Bottom Menu Sheet (always cleanly positioned above floating dock) */}
      {mounted
        ? createPortal(
            <AnimatePresence>
              {menuOpen ? (
                <>
                  <motion.div
                    aria-hidden="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.16 }}
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-40 bg-[var(--surface-backdrop)] backdrop-blur-sm"
                  />

                  <motion.section
                    role="dialog"
                    aria-modal="true"
                    aria-label="Asosiy menyu"
                    initial={
                      reducedMotion
                        ? { opacity: 1 }
                        : { opacity: 0, y: 24, scale: 0.97 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={
                      reducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: 20, scale: 0.97 }
                    }
                    transition={LIQUID_SHEET_SPRING}
                    style={{
                      bottom:
                        "calc(5.25rem + max(env(safe-area-inset-bottom, 0px), var(--tg-safe-bottom, 0px)))",
                    }}
                    className="liquid-glass-quiet fixed inset-x-3 z-[55] mx-auto max-h-[72dvh] max-w-lg overflow-y-auto rounded-[28px] p-4"
                  >
                    <div className="mb-3 flex items-center justify-between px-1">
                      <span
                        style={{ fontFamily: "var(--font-display)" }}
                        className="text-[15.5px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
                      >
                        {t.menu.title}
                      </span>
                      <GlassButton
                        size="icon"
                        variant="subtle"
                        aria-label="Close"
                        onClick={() => setMenuOpen(false)}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </GlassButton>
                    </div>

                    {/* Account / Sign-in Header (flat inside Menu container, no nested box) */}
                    <div className="mb-3 border-b border-[var(--border-matte)] pb-3.5">
                      {auth?.profile ? (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setMenuOpen(false);
                                router.push("/profile");
                              }}
                              className="flex min-w-0 items-center gap-2.5 text-left cursor-pointer"
                            >
                              <GlassAvatar
                                name={auth.profile.displayName}
                                seed={auth.profile.username}
                                avatarId={auth.profile.avatarId}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div className="truncate text-[13.5px] font-semibold text-[var(--text-primary)]">
                                  {auth.profile.displayName}
                                </div>
                                <div className="truncate font-mono text-[11.5px] text-[var(--text-muted)]">
                                  @{auth.profile.username}
                                </div>
                              </div>
                            </button>
                            <GlassButton
                              size="sm"
                              variant="subtle"
                              onClick={() => void handleLogout()}
                              className="h-8 shrink-0 px-3 text-[12px]"
                            >
                              <LogOut className="h-3.5 w-3.5" />
                              {t.menu.logout}
                            </GlassButton>
                          </div>

                          {!auth.user?.hasPassword ? (
                            <GlassButton
                              size="sm"
                              variant="glass"
                              onClick={openSetupManually}
                              className="w-full"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              {t.menu.setupPasswordBtn}
                            </GlassButton>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          <div className="text-[12.5px] text-[var(--text-secondary)]">
                            {t.menu.signInPrompt}
                          </div>
                          <GlassButton
                            size="sm"
                            variant="glass"
                            onClick={() => {
                              setMenuOpen(false);
                              setLoginModalOpen(true);
                            }}
                            className="w-full"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            {t.menu.signInPasswordBtn}
                          </GlassButton>
                          <div className="grid grid-cols-2 gap-2">
                            {isTma ? (
                              <GlassButton
                                size="sm"
                                variant="glass"
                                loading={telegramSigningIn}
                                onClick={() => void handleTelegramSignIn()}
                                className="w-full"
                              >
                                <Send className="h-3.5 w-3.5 text-sky-400" />
                                Telegram
                              </GlassButton>
                            ) : (
                              <a
                                href={telegramAppUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="liquid-glass liquid-glass-glare glass-focus-ring inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[var(--text-primary)]"
                              >
                                <Send className="relative z-10 h-3.5 w-3.5 text-sky-400" />
                                <span className="relative z-10">Telegram</span>
                              </a>
                            )}
                            <GlassButton
                              size="sm"
                              variant="glass"
                              onClick={handleGoogleSignIn}
                              className="w-full"
                            >
                              <LogIn className="h-3.5 w-3.5" />
                              Google
                            </GlassButton>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isCurrent = pathname === item.href;
                        return (
                          <motion.button
                            key={item.href}
                            type="button"
                            whileTap={
                              reducedMotion ? undefined : LIQUID_BUTTON_TAP
                            }
                            transition={LIQUID_BUTTON_SPRING}
                            onClick={() => {
                              triggerHapticSelection();
                              setMenuOpen(false);
                              router.push(item.href);
                            }}
                            className={cn(
                              "glass-focus-ring relative flex flex-col items-start gap-2 rounded-2xl p-3 text-left transition-colors cursor-pointer",
                              isCurrent
                                ? "bg-white/[0.08] text-[var(--text-primary)]"
                                : "text-[var(--text-primary)] hover:bg-white/[0.04]"
                            )}
                          >
                            <div className="relative z-10 flex w-full items-center justify-between">
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--glass-fill-subtle)] text-[var(--text-primary)]">
                                <Icon className="h-4 w-4" />
                              </span>
                              {item.badge ? (
                                <span className="rounded-full bg-sky-400/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-400">
                                  {item.badge}
                                </span>
                              ) : null}
                            </div>
                            <div className="relative z-10 min-w-0">
                              <div className="text-[13.5px] font-semibold leading-tight">
                                {item.label}
                              </div>
                              <div className="mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">
                                {item.description}
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.section>
                </>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}

      {/* Bottom Floating Liquid Glass Dock — grid-cols-4 (living prismatic rim) */}
      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-lg pb-[env(safe-area-inset-bottom)]">
        <nav
          aria-label="Asosiy navigatsiya"
          className="liquid-glass pointer-events-auto grid grid-cols-4 gap-1 rounded-[28px] p-1.5"
        >
          {dockTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeDockId === tab.id;
            return (
              <motion.button
                key={tab.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                aria-expanded={tab.id === "menu" ? menuOpen : undefined}
                whileTap={reducedMotion ? undefined : LIQUID_BUTTON_TAP}
                transition={LIQUID_BUTTON_SPRING}
                onClick={() => {
                  triggerHapticSelection();
                  tab.onPress();
                }}
                className={cn(
                  "glass-focus-ring relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-[22px] text-[11px] font-medium transition-colors duration-150 cursor-pointer",
                  isActive
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {isActive ? (
                  <motion.span
                    layoutId="avero-bottom-dock-capsule"
                    transition={LIQUID_TAB_SPRING}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[22px] border border-white/[0.08] bg-white/[0.08]"
                  />
                ) : null}
                <Icon
                  aria-hidden="true"
                  className="relative z-10 h-[18px] w-[18px]"
                />
                <span className="relative z-10 leading-none">{tab.label}</span>
                {tab.id === "menu" && unreadCount > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-4 top-2 z-20 h-1.5 w-1.5 rounded-full bg-sky-400"
                  />
                ) : null}
              </motion.button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
