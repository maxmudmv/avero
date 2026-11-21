"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Bookmark,
  Feather,
  HelpCircle,
  Home,
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
  GlassModal,
  LIQUID_BUTTON_SPRING,
  LIQUID_BUTTON_TAP,
  LIQUID_SHEET_SPRING,
  LIQUID_TAB_SPRING,
  cn,
  triggerHapticImpact,
  triggerHapticSelection,
  useDesignSystem,
} from "@/design-system";
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
  const { isTma, pendingLinkToken } = useTelegramMiniApp();
  const {
    auth,
    authLoading,
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

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show a friendly toast when redirected from an unconfigured/failed OAuth flow
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const authError = url.searchParams.get("auth_error");
    if (!authError) return;
    if (authError === "google_not_configured") {
      toast({
        title: "Google orqali kirish hali ulanmagan",
        description: "Hozircha Telegram orqali kirishingiz mumkin.",
        variant: "warning",
      });
    } else {
      toast({
        title: "Kirishda xatolik yuz berdi",
        variant: "error",
      });
    }
    url.searchParams.delete("auth_error");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [toast]);

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
      : pathname === "/compose"
        ? "compose"
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
      label: "Lenta",
      icon: Home,
      onPress: () => {
        setMenuOpen(false);
        router.push("/");
      },
    },
    {
      id: "search",
      label: "Qidiruv",
      icon: Search,
      onPress: () => {
        setMenuOpen(false);
        router.push("/search");
      },
    },
    {
      id: "compose",
      label: "Yozish",
      icon: Feather,
      onPress: () => {
        setMenuOpen(false);
        router.push("/compose");
      },
    },
    {
      id: "menu",
      label: "Menyu",
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
      label: "Profil",
      description: auth?.profile ? `@${auth.profile.username}` : "Shaxsiy sahifa",
      icon: User,
    },
    {
      href: "/notifications",
      label: "Bildirishnomalar",
      description: unreadCount > 0 ? `${unreadCount} ta yangi` : "Hammasi o‘qilgan",
      icon: Bell,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    {
      href: "/bookmarks",
      label: "Saqlanganlar",
      description: "Saqlab qo‘yilgan matnlar",
      icon: Bookmark,
    },
    {
      href: "/messages",
      label: "Xabarlar",
      description: "Shaxsiy yozishmalar",
      icon: MessageSquare,
    },
    {
      href: "/settings",
      label: "Sozlamalar",
      description: "Til, mavzu, maxfiylik",
      icon: Settings,
    },
    ...(isStaff
      ? [
          {
            href: "/admin",
            label: "Boshqaruv",
            description:
              auth?.user?.role === "super_admin"
                ? "Super Admin paneli"
                : auth?.user?.role === "admin"
                  ? "Admin paneli"
                  : "Moderatsiya",
            icon: ShieldCheck,
          },
        ]
      : []),
    {
      href: "/help",
      label: "Yordam",
      description: "Qo‘llanma va tizim holati",
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
              {auth?.profile ? (
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
                  Kirish
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
              Kirish
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

      {/* Sign In Modal (Telegram + Google) */}
      <GlassModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        title="Avero’ga kirish"
        description="Post yozish, izoh qoldirish, saqlash va xabar almashish uchun hisobingizga kiring."
        size="sm"
      >
        <div className="space-y-3">
          {isTma ? (
            <GlassButton
              variant="glass"
              size="lg"
              loading={telegramSigningIn}
              onClick={() => void handleTelegramSignIn()}
              className="w-full"
            >
              <Send className="h-4 w-4 text-sky-400" />
              Telegram orqali kirish
            </GlassButton>
          ) : (
            <a
              href={telegramAppUrl}
              target="_blank"
              rel="noreferrer"
              className="liquid-glass liquid-glass-glare glass-focus-ring inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full px-6 text-[15px] font-medium text-[var(--text-primary)]"
            >
              <Send className="relative z-10 h-4 w-4 text-sky-400" />
              <span className="relative z-10">Telegram orqali kirish</span>
            </a>
          )}

          {/* Full-page navigation required for Google OAuth 302 redirect */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/v1/auth/google/start"
            className="liquid-glass liquid-glass-glare glass-focus-ring inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full px-6 text-[15px] font-medium text-[var(--text-primary)]"
          >
            <LogIn className="relative z-10 h-4 w-4" />
            <span className="relative z-10">Google bilan kirish</span>
          </a>

          <p className="pt-1 text-center text-[12px] leading-relaxed text-[var(--text-muted)]">
            Kirish orqali siz Avero xavfsizlik va hamjamiyat qoidalariga rozilik bildirasiz.
          </p>
        </div>
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
                        Menyu
                      </span>
                      <GlassButton
                        size="icon"
                        variant="subtle"
                        aria-label="Menyuni yopish"
                        onClick={() => setMenuOpen(false)}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </GlassButton>
                    </div>

                    {/* Account / Sign-in Card right inside Menu */}
                    <div className="mb-3 rounded-2xl border border-[var(--border-matte)] bg-[var(--surface-input)]/75 p-3">
                      {auth?.profile ? (
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
                            Chiqish
                          </GlassButton>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          <div className="text-[12.5px] text-[var(--text-secondary)]">
                            Shaxsiy profil, postlar va bildirishnomalar uchun tizimga kiring
                          </div>
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
                            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                            <a
                              href="/api/v1/auth/google/start"
                              className="liquid-glass liquid-glass-glare glass-focus-ring inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[var(--text-primary)]"
                            >
                              <LogIn className="relative z-10 h-3.5 w-3.5" />
                              <span className="relative z-10">Google</span>
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                              "glass-focus-ring relative flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer",
                              isCurrent
                                ? "border-[var(--border-matte-hover)] bg-white/[0.08] text-[var(--text-primary)]"
                                : "border-[var(--border-matte)] bg-[var(--surface-matte)]/75 text-[var(--text-primary)] hover:bg-[var(--surface-matte)]"
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
