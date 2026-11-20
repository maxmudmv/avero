"use client";

import React, { useEffect } from "react";
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
  MessageSquare,
  Search,
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
    unreadCount,
    menuOpen,
    setMenuOpen,
    linkingTelegram,
    confirmPendingTelegramLink,
    dismissPendingTelegramLink,
  } = useAppState();

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
    <div className="relative min-h-screen pb-28">
      {/* Top Bar: Web only (hidden inside Telegram Mini App to avoid duplicate native headers) */}
      {!isTma ? (
        <header className="sticky top-0 z-30 border-b border-[var(--border-matte)] bg-[var(--bg-canvas)]/82 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
            <Link
              href="/"
              className="glass-focus-ring flex items-center gap-2.5 rounded-xl px-1 py-1"
            >
              <span className="liquid-glass inline-flex h-8 w-8 items-center justify-center rounded-xl text-[13px] font-bold tracking-tight text-[var(--text-primary)]">
                <span className="relative z-10">A</span>
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
                /* Full-page navigation required for Google OAuth 302 redirect */
                /* eslint-disable-next-line @next/next/no-html-link-for-pages */
                <a
                  href="/api/v1/auth/google/start"
                  className="liquid-glass glass-focus-ring inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-[var(--text-primary)]"
                >
                  <LogIn className="relative z-10 h-3.5 w-3.5" />
                  <span className="relative z-10">Kirish</span>
                </a>
              )}
            </div>
          </div>
        </header>
      ) : topAction ? (
        <div className="mx-auto flex max-w-2xl items-center justify-end px-3 pt-2 sm:px-4">
          {topAction}
        </div>
      ) : null}

      {/* Main Content Column */}
      <main className="mx-auto max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
        {children}
      </main>

      {/* Explicit-Consent Telegram Account Linking Confirmation Modal (TMA startapp=link_*) */}
      <GlassModal
        open={Boolean(isTma && pendingLinkToken)}
        onClose={dismissPendingTelegramLink}
        title="Telegram akkauntini bog‘lash"
        description="Google orqali yaratilgan Avero profilingizga joriy Telegram akkauntingizni bog‘lashga rozimisiz?"
        footer={
          <>
            <GlassButton variant="ghost" onClick={dismissPendingTelegramLink}>
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
              Ha, bog‘lashni tasdiqlayman
            </GlassButton>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
          Tasdiqlaganingizdan so‘ng Web va Telegram Mini App bitta profil, bitta postlar va bitta bildirishnomalar tizimi bilan ishlaydi. Akkauntlar hech qachon roziliksiz birlashtirilmaydi.
        </p>
      </GlassModal>

      {/* Centered Bottom Liquid Glass Menu Panel */}
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
                  : { opacity: 0, y: 28, scale: 0.96 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                reducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 24, scale: 0.96 }
              }
              transition={LIQUID_SHEET_SPRING}
              className="liquid-glass fixed inset-x-3 bottom-24 z-50 mx-auto max-w-lg rounded-[28px] p-3.5 sm:p-4"
            >
              <div className="relative z-10">
                <div className="mb-3 flex items-center justify-between px-1.5">
                  <span
                    style={{ fontFamily: "var(--font-display)" }}
                    className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
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
                            ? "liquid-glass border-transparent text-[var(--text-primary)]"
                            : "border-[var(--border-matte)] bg-[var(--surface-matte)]/75 text-[var(--text-primary)] hover:bg-[var(--surface-matte)]"
                        )}
                      >
                        <div className="relative z-10 flex w-full items-center justify-between">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--glass-fill)] text-[var(--text-primary)]">
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
              </div>
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>

      {/* Bottom Floating Liquid Glass Dock — grid-cols-4 */}
      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg pb-[env(safe-area-inset-bottom)]">
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
                    className="liquid-glass absolute inset-0 rounded-[22px]"
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
